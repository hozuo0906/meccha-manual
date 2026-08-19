import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createObjectKey, createStorageObject, STORAGE_AREAS, STORAGE_KINDS } from "../apps/worker/src/domain/storage/object-storage.mjs";
import { createMemoryObjectStorage } from "../apps/worker/src/infra/storage/memory-object-storage.mjs";
import { createR2ObjectStorage } from "../apps/worker/src/infra/storage/r2-object-storage.mjs";

const body = new TextEncoder().encode("synthetic fixture");
const checksumSha256 = createHash("sha256").update(body).digest("hex");
const key = createObjectKey({
  area: STORAGE_AREAS.MANUAL_ASSETS,
  workspaceId: "workspace-001",
  resourceId: "manual-001",
  assetId: "asset-001",
  extension: "png"
});
const object = await createStorageObject({
  area: STORAGE_AREAS.MANUAL_ASSETS,
  key,
  kind: STORAGE_KINDS.MANUAL_IMAGE,
  body,
  contentType: "image/png",
  sizeBytes: body.byteLength,
  checksumSha256,
  metadata: { workspaceId: "workspace-001", resourceId: "manual-001", manualId: "manual-001", stepId: "step-001", assetId: "asset-001" }
});
body.fill(0);
assert.notEqual(object.body[0], 0, "validated object must not retain the caller-owned byte buffer");
assert.equal(createHash("sha256").update(object.body).digest("hex"), checksumSha256);
const storage = createMemoryObjectStorage();
const expectedRead = {
  area: object.area,
  key: object.key,
  kind: object.kind,
  body: object.body,
  contentType: object.contentType,
  sizeBytes: object.sizeBytes,
  checksumSha256: object.checksumSha256,
  metadata: {
    workspaceId: object.metadata.workspaceId,
    resourceId: object.metadata.resourceId,
    assetId: object.metadata.assetId
  }
};

assert.deepEqual(await storage.put(object), { status: "stored" });
assert.deepEqual(await storage.get({ area: object.area, key }), expectedRead);
const retrieved = await storage.get({ area: object.area, key });
retrieved.body[0] = 0;
assert.notEqual((await storage.get({ area: object.area, key })).body[0], 0, "stub must isolate stored bytes");
assert.deepEqual(await storage.delete({ area: object.area, key }), { status: "deleted" });
assert.equal(await storage.get({ area: object.area, key }), null);
assert.deepEqual(await storage.delete({ area: object.area, key }), { status: "not_found" });

assert.throws(() => createObjectKey({ ...object, resourceId: "user@example.com", assetId: "asset-001", extension: "png" }));
await assert.rejects(createStorageObject({ ...object, metadata: { ...object.metadata, secret: "fixture" } }), /./);
await assert.rejects(createStorageObject({ ...object, checksumSha256: "0".repeat(64) }), /checksum/i);
await assert.rejects(createStorageObject({
  ...object,
  key: createObjectKey({
    area: object.area,
    workspaceId: "workspace-001",
    resourceId: "manual-002",
    assetId: "asset-001",
    extension: "png"
  })
}), /metadata/i);
await assert.rejects(createStorageObject({
  ...object,
  key: createObjectKey({
    area: object.area,
    workspaceId: "workspace-001",
    resourceId: "manual-001",
    assetId: "asset-002",
    extension: "png"
  })
}), /metadata/i);
for (const area of Object.values(STORAGE_AREAS)) {
  assert.match(createObjectKey({ area, workspaceId: "workspace-001", resourceId: "resource-001", assetId: "asset-001", extension: "bin" }), /^workspace-001\//);
}

function createFakeR2Bucket() {
  const objects = new Map();
  return {
    async put(objectKey, bytes, options) {
      objects.set(objectKey, {
        bytes: bytes.slice(),
        httpMetadata: { ...options.httpMetadata },
        customMetadata: { ...options.customMetadata }
      });
    },
    async get(objectKey) {
      const stored = objects.get(objectKey);
      if (!stored) return null;
      return {
        size: stored.bytes.byteLength,
        httpMetadata: { ...stored.httpMetadata },
        customMetadata: { ...stored.customMetadata },
        async arrayBuffer() {
          return stored.bytes.slice().buffer;
        }
      };
    },
    async delete(objectKey) {
      objects.delete(objectKey);
    },
    inspect(objectKey) {
      return objects.get(objectKey);
    }
  };
}

const manualBucket = createFakeR2Bucket();
const r2Storage = createR2ObjectStorage({ MANUAL_ASSETS: manualBucket });
assert.deepEqual(await r2Storage.put(object), { status: "stored" });
assert.deepEqual(await r2Storage.get({ area: object.area, key: object.key }), expectedRead);
assert.equal(manualBucket.inspect(object.key).customMetadata.manual_id, undefined);
manualBucket.inspect(object.key).customMetadata.asset_id = "asset-999";
await assert.rejects(r2Storage.get({ area: object.area, key: object.key }), /key does not match/i);
manualBucket.inspect(object.key).customMetadata.asset_id = "asset-001";

const mutatedAfterValidation = await createStorageObject({ ...object, body: object.body.slice() });
mutatedAfterValidation.body[0] ^= 0xff;
await assert.rejects(storage.put(mutatedAfterValidation), /checksum does not match/i);
await assert.rejects(r2Storage.put(mutatedAfterValidation), /checksum does not match/i);
assert.equal(manualBucket.inspect(object.key).customMetadata.step_id, undefined);
assert.equal(manualBucket.inspect(object.key).customMetadata.resource_id, undefined);
assert.equal(manualBucket.inspect(object.key).customMetadata.manual_id, undefined);
assert.deepEqual(await r2Storage.delete({ area: object.area, key: object.key }), { status: "deleted" });
assert.equal(await r2Storage.get({ area: object.area, key: object.key }), null);

function createUsageReservationHarness(limitBytes, readObject, deleteObject, persistentState = { reservations: new Map(), currentBytes: 0 }) {
  const reservations = persistentState.reservations;
  const tupleOf = (request) => JSON.stringify([
    request.workspaceId,
    request.objectKey,
    request.plannedBytes,
    request.checksumSha256
  ]);
  return {
    reserve(request, lease) {
      const existing = reservations.get(request.operationKey);
      if (existing) {
        assert.equal(existing.tuple, tupleOf(request), "operation key reuse must preserve the full save tuple");
        return existing;
      }
      const reservedBytes = [...reservations.values()]
        .filter((item) => item.state === "reserved")
        .reduce((sum, item) => sum + item.plannedBytes, 0);
      if (persistentState.currentBytes + reservedBytes + request.plannedBytes > limitBytes) throw new Error("storage limit exceeded");
      const reservation = { ...request, tuple: tupleOf(request), state: "reserved", leaseOwner: lease.owner, leaseDeadline: lease.deadline, reservationId: `reservation-${request.operationKey}`, fencingToken: lease.fencingToken };
      reservations.set(request.operationKey, reservation);
      return reservation;
    },
    extendLease(operationKey, owner, expectedDeadline, nextDeadline) {
      const reservation = reservations.get(operationKey);
      assert.equal(reservation.leaseOwner, owner, "only the current lease owner may extend");
      assert.equal(reservation.leaseDeadline, expectedDeadline, "lease extension must compare the current deadline");
      assert.ok(nextDeadline > expectedDeadline, "lease extension must move forward");
      reservation.leaseDeadline = nextDeadline;
    },
    async reconcile(operationKey, now) {
      const reservation = reservations.get(operationKey);
      const stored = await readObject(reservation.objectKey);
      if (reservation.state === "released") {
        if (stored && stored.reservationId === reservation.reservationId && stored.fencingToken === reservation.fencingToken) {
          await deleteObject(reservation.objectKey);
          reservation.lateObjectDeleted = true;
        }
        return reservation;
      }
      if (reservation.state !== "reserved") return reservation;
      if (stored) {
        const sameGeneration = stored.reservationId === reservation.reservationId && stored.fencingToken === reservation.fencingToken;
        const matchesTuple = JSON.stringify([stored.workspaceId, stored.objectKey, stored.sizeBytes, stored.checksumSha256]) ===
          JSON.stringify([reservation.workspaceId, reservation.objectKey, reservation.plannedBytes, reservation.checksumSha256]);
        if (!sameGeneration || !matchesTuple) {
          if (now >= reservation.leaseDeadline && sameGeneration) {
            await deleteObject(reservation.objectKey);
            reservation.state = "released";
            reservation.mismatchedObjectDeleted = true;
            return reservation;
          }
          throw new Error("stored object must match the reserved generation and save tuple");
        }
        reservation.state = "committed";
        persistentState.currentBytes += reservation.plannedBytes;
      } else if (now >= reservation.leaseDeadline) {
        reservation.state = "released";
      } else {
        throw new Error("active lease cannot be reconciled without an object");
      }
      return reservation;
    },
    snapshot() {
      return { currentBytes: persistentState.currentBytes, reservations: [...reservations.values()].map((item) => ({ ...item })) };
    },
    async sweepReleased(now) {
      for (const reservation of reservations.values()) {
        if (reservation.state === "released") await this.reconcile(reservation.operationKey, now);
      }
    }
  };
}

const reservationBucket = createFakeR2Bucket();
const persistentReservationState = { reservations: new Map(), currentBytes: 0 };
const readReservationObject = async (objectKey) => {
  const stored = await reservationBucket.get(objectKey);
  if (!stored) return null;
  const body = new Uint8Array(await stored.arrayBuffer());
  return {
    workspaceId: stored.customMetadata.workspace_id,
    objectKey,
    sizeBytes: stored.size,
    checksumSha256: createHash("sha256").update(body).digest("hex"),
    reservationId: stored.customMetadata.reservation_id,
    fencingToken: stored.customMetadata.fencing_token
  };
};
const reservationHarness = createUsageReservationHarness(
  10,
  readReservationObject,
  (objectKey) => reservationBucket.delete(objectKey),
  persistentReservationState
);
const saveRequest = {
  operationKey: "operation-001",
  workspaceId: "workspace-001",
  objectKey: "workspace-001/manual/asset-001.png",
  plannedBytes: 6,
  checksumSha256: "a".repeat(64)
};
const initialLease = { owner: "worker-001", deadline: 100, fencingToken: "fence-001" };
const firstReservation = reservationHarness.reserve(saveRequest, initialLease);
assert.strictEqual(reservationHarness.reserve({ ...saveRequest }, initialLease), firstReservation, "lost response retry must reuse one reservation");
for (const mismatch of [
  { plannedBytes: 1 },
  { objectKey: "workspace-001/manual/asset-002.png" },
  { workspaceId: "workspace-002" },
  { checksumSha256: "b".repeat(64) }
]) assert.throws(() => reservationHarness.reserve({ ...saveRequest, ...mismatch }, initialLease), /full save tuple/);
assert.throws(() => reservationHarness.reserve({ ...saveRequest, operationKey: "operation-002", plannedBytes: 5 }, initialLease), /limit exceeded/);
await assert.rejects(reservationHarness.reconcile(saveRequest.operationKey, 99), /active lease/);
assert.throws(() => reservationHarness.extendLease(saveRequest.operationKey, "stale-worker", 100, 120), /current lease owner/);
const saveBody = new TextEncoder().encode("stored");
saveRequest.plannedBytes = saveBody.byteLength;
saveRequest.checksumSha256 = createHash("sha256").update(saveBody).digest("hex");
firstReservation.plannedBytes = saveRequest.plannedBytes;
firstReservation.checksumSha256 = saveRequest.checksumSha256;
firstReservation.tuple = JSON.stringify([saveRequest.workspaceId, saveRequest.objectKey, saveRequest.plannedBytes, saveRequest.checksumSha256]);
await reservationBucket.put(saveRequest.objectKey, saveBody, {
  httpMetadata: { contentType: "image/png" },
  customMetadata: { workspace_id: saveRequest.workspaceId, checksum_sha256: saveRequest.checksumSha256, reservation_id: firstReservation.reservationId, fencing_token: firstReservation.fencingToken }
});
assert.equal((await reservationHarness.reconcile(saveRequest.operationKey, 99)).state, "committed", "post-write worker stop must reconcile a matching fake R2 object to committed");
assert.equal((await reservationHarness.reconcile(saveRequest.operationKey, 101)).state, "committed", "reconciliation must be idempotent");
assert.equal(reservationHarness.snapshot().currentBytes, 6, "committed bytes must not be counted twice");
const abandoned = { ...saveRequest, operationKey: "operation-003", objectKey: "workspace-001/manual/asset-003.png", plannedBytes: 4 };
const abandonedReservation = reservationHarness.reserve(abandoned, { owner: "worker-003", deadline: 200, fencingToken: "fence-003" });
await assert.rejects(reservationHarness.reconcile(abandoned.operationKey, 199), /active lease/);
assert.equal((await reservationHarness.reconcile(abandoned.operationKey, 200)).state, "released", "expired reservation without object must release");
assert.equal(reservationHarness.snapshot().currentBytes, 6, "released reservation must not consume capacity");
await reservationBucket.put(abandoned.objectKey, new Uint8Array(abandoned.plannedBytes), {
  httpMetadata: { contentType: "image/png" },
  customMetadata: { workspace_id: abandoned.workspaceId, checksum_sha256: abandoned.checksumSha256, reservation_id: abandonedReservation.reservationId, fencing_token: abandonedReservation.fencingToken }
});
const restartedReservationHarness = createUsageReservationHarness(10, readReservationObject, (objectKey) => reservationBucket.delete(objectKey), persistentReservationState);
await restartedReservationHarness.sweepReleased(201);
assert.equal(restartedReservationHarness.snapshot().reservations.find((item) => item.operationKey === abandoned.operationKey).lateObjectDeleted, true, "restarted scheduled sweep must reload persistent released reservations and delete a late object");
assert.equal(await reservationBucket.get(abandoned.objectKey), null);
const newGenerationKey = "workspace-001/manual/reservation-new-generation/asset-003.png";
await reservationBucket.put(newGenerationKey, new Uint8Array(abandoned.plannedBytes), {
  httpMetadata: { contentType: "image/png" },
  customMetadata: { workspace_id: abandoned.workspaceId, checksum_sha256: abandoned.checksumSha256, reservation_id: "reservation-new-generation", fencing_token: "fence-new" }
});
await reservationHarness.sweepReleased(202);
assert.notEqual(await reservationBucket.get(newGenerationKey), null, "generation-specific object keys prevent old reservation deletion from racing with a newer object");
await reservationBucket.delete(newGenerationKey);
for (const mismatch of [
  { workspaceId: "workspace-999" },
  { objectKey: "workspace-001/manual/wrong.png" },
  { sizeBytes: 3 },
  { checksumSha256: "c".repeat(64) }
]) {
  const operationKey = `mismatch-${Object.keys(mismatch)[0]}`;
  const request = { ...abandoned, operationKey, objectKey: `workspace-001/manual/${operationKey}.png`, plannedBytes: 4 };
  const mismatchReservation = reservationHarness.reserve(request, { owner: operationKey, deadline: 300, fencingToken: `fence-${operationKey}` });
  const stored = {
    workspaceId: request.workspaceId,
    objectKey: request.objectKey,
    sizeBytes: request.plannedBytes,
    checksumSha256: request.checksumSha256,
    ...mismatch
  };
  const storedKey = mismatch.objectKey ?? request.objectKey;
  await reservationBucket.put(storedKey, new Uint8Array(stored.sizeBytes), {
    httpMetadata: { contentType: "image/png" },
    customMetadata: { workspace_id: stored.workspaceId, checksum_sha256: stored.checksumSha256, reservation_id: mismatchReservation.reservationId, fencing_token: mismatchReservation.fencingToken }
  });
  if (mismatch.objectKey) {
    assert.equal((await reservationHarness.reconcile(operationKey, 300)).state, "released");
    await reservationBucket.delete(storedKey);
  } else {
    const recovered = await reservationHarness.reconcile(operationKey, 300);
    assert.equal(recovered.state, "released");
    assert.equal(recovered.mismatchedObjectDeleted, true, "expired same-generation mismatch must be deleted by reconciliation");
    assert.equal(await reservationBucket.get(request.objectKey), null);
  }
}

console.log("R2 storage stub contract OK.");
