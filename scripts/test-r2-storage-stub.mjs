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
const reservedKey = createObjectKey({
  area: STORAGE_AREAS.MANUAL_ASSETS,
  workspaceId: "workspace-001",
  resourceId: "manual-001",
  generationId: "reservation-operation-001",
  assetId: "asset-001",
  extension: "png"
});
assert.equal(reservedKey, "workspace-001/manuals/manual-001/reservation-operation-001/asset-001.png");
const reservedObject = await createStorageObject({
  ...object,
  key: reservedKey,
  metadata: { ...object.metadata, generationId: "reservation-operation-001", reservationId: "reservation-operation-001", fencingToken: "fence-operation-001" }
});
assert.equal(reservedObject.metadata.generationId, "reservation-operation-001");
await assert.rejects(createStorageObject({
  ...object,
  key: reservedKey,
  metadata: { ...object.metadata, generationId: "reservation-operation-001" }
}), /present together/i);
await assert.rejects(createStorageObject({
  ...object,
  metadata: { ...object.metadata, reservationId: "reservation-operation-001", fencingToken: "fence-operation-001" }
}), /present together/i);
await assert.rejects(createStorageObject({
  ...reservedObject,
  metadata: { ...reservedObject.metadata, generationId: "reservation-operation-002" }
}), /metadata/i);

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
    async list({ prefix }) {
      return { objects: [...objects.keys()].filter((objectKey) => objectKey.startsWith(prefix)).map((key) => ({ key })) };
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
const reservedStorage = createMemoryObjectStorage();
assert.deepEqual(await reservedStorage.put(reservedObject), { status: "stored" });
assert.equal((await reservedStorage.get({ area: reservedObject.area, key: reservedObject.key })).metadata.generationId, "reservation-operation-001");
assert.deepEqual(await r2Storage.put(reservedObject), { status: "stored" });
assert.equal((await r2Storage.get({ area: reservedObject.area, key: reservedObject.key })).metadata.generationId, "reservation-operation-001");
assert.deepEqual(await r2Storage.delete({ area: reservedObject.area, key: reservedObject.key }), { status: "deleted" });
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

function createUsageReservationHarness(limitBytes, readObject, deleteObject, listGenerationObjects, persistentState = { reservations: new Map(), currentBytes: 0 }, readServerNow) {
  if (typeof readServerNow !== "function") throw new TypeError("server clock function is required");
  const reservations = persistentState.reservations;
  persistentState.version ??= 0;
  const MAX_LEASE_DURATION = 60;
  const absoluteDeadlineFor = (lease) => {
    const serverNow = readServerNow();
    if (!Number.isSafeInteger(serverNow) || serverNow < 0) throw new Error("server clock must return a non-negative safe integer");
    if (!Number.isSafeInteger(lease.deadline) || lease.deadline < serverNow) throw new Error("lease deadline must be a safe integer at or after the server clock");
    const absoluteDeadline = serverNow + MAX_LEASE_DURATION;
    if (lease.deadline > absoluteDeadline) throw new Error("lease deadline exceeds the server maximum duration");
    return absoluteDeadline;
  };
  const tupleOf = (request) => JSON.stringify([
    request.workspaceId,
    request.objectKey,
    request.generationId,
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
      const reservation = { ...request, tuple: tupleOf(request), state: "reserved", leaseOwner: lease.owner, leaseDeadline: lease.deadline, absoluteDeadline: absoluteDeadlineFor(lease), reservationId: `reservation-${request.operationKey}`, fencingToken: lease.fencingToken };
      reservations.set(request.operationKey, reservation);
      persistentState.version += 1;
      return reservation;
    },
    async reserveAfterObservedUsage(request, lease, afterRead) {
      const existing = reservations.get(request.operationKey);
      if (existing) {
        assert.equal(existing.tuple, tupleOf(request), "operation key reuse must preserve the full save tuple");
        return existing;
      }
      const observedBytes = persistentState.currentBytes + [...reservations.values()]
        .filter((item) => item.state === "reserved")
        .reduce((sum, item) => sum + item.plannedBytes, 0);
      const observedVersion = persistentState.version;
      await afterRead(observedBytes);
      const concurrentExisting = reservations.get(request.operationKey);
      if (concurrentExisting) {
        assert.equal(concurrentExisting.tuple, tupleOf(request), "concurrent operation key reuse must preserve the full save tuple");
        return concurrentExisting;
      }
      if (persistentState.version !== observedVersion) throw new Error("reservation serialization conflict");
      if (observedBytes + request.plannedBytes > limitBytes) throw new Error("storage limit exceeded");
      const reservation = { ...request, tuple: tupleOf(request), state: "reserved", leaseOwner: lease.owner, leaseDeadline: lease.deadline, absoluteDeadline: absoluteDeadlineFor(lease), reservationId: `reservation-${request.operationKey}`, fencingToken: lease.fencingToken };
      reservations.set(request.operationKey, reservation);
      persistentState.version += 1;
      return reservation;
    },
    extendLease(operationKey, owner, expectedDeadline, nextDeadline) {
      const reservation = reservations.get(operationKey);
      assert.equal(reservation.leaseOwner, owner, "only the current lease owner may extend");
      assert.equal(reservation.leaseDeadline, expectedDeadline, "lease extension must compare the current deadline");
      assert.ok(nextDeadline > expectedDeadline, "lease extension must move forward");
      assert.ok(nextDeadline <= reservation.absoluteDeadline, "lease extension must not exceed the fixed absolute deadline");
      reservation.leaseDeadline = nextDeadline;
    },
    async reconcile(operationKey, now) {
      const reservation = reservations.get(operationKey);
      const generationPrefix = `${reservation.objectKey.slice(0, reservation.objectKey.lastIndexOf("/") + 1)}`;
      const generationObjects = await listGenerationObjects(generationPrefix);
      const stored = await readObject(reservation.objectKey);
      if (reservation.state === "released") {
        if (generationObjects.length > 0) {
          for (const candidate of generationObjects) await deleteObject(candidate.objectKey);
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
          if (now >= reservation.leaseDeadline) {
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
        for (const candidate of generationObjects) await deleteObject(candidate.objectKey);
        reservation.state = "released";
        if (generationObjects.length > 0) reservation.mismatchedObjectDeleted = true;
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
        if (reservation.state === "released" || (reservation.state === "reserved" && now >= reservation.leaseDeadline)) {
          await this.reconcile(reservation.operationKey, now);
        }
      }
    }
  };
}

const reservationBucket = createFakeR2Bucket();
const reservationStorage = createR2ObjectStorage({ MANUAL_ASSETS: reservationBucket });
const persistentReservationState = { reservations: new Map(), currentBytes: 0 };
const reservationClock = { now: 60 };
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
const listReservationObjects = async (prefix) => {
  const listed = await reservationBucket.list({ prefix });
  return Promise.all(listed.objects.map(({ key: objectKey }) => readReservationObject(objectKey)));
};
async function putReservedThroughAdapter(request, reservation, bytes) {
  const assetId = request.objectKey.slice(request.objectKey.lastIndexOf("/") + 1, request.objectKey.lastIndexOf("."));
  const storageObject = await createStorageObject({
    area: STORAGE_AREAS.MANUAL_ASSETS,
    key: request.objectKey,
    kind: STORAGE_KINDS.MANUAL_IMAGE,
    body: bytes,
    contentType: "image/png",
    sizeBytes: bytes.byteLength,
    checksumSha256: request.checksumSha256,
    metadata: {
      workspaceId: request.workspaceId,
      resourceId: "manual-001",
      generationId: request.generationId,
      reservationId: reservation.reservationId,
      fencingToken: reservation.fencingToken,
      assetId
    }
  });
  await reservationStorage.put(storageObject);
}
const reservationHarness = createUsageReservationHarness(
  10,
  readReservationObject,
  (objectKey) => reservationBucket.delete(objectKey),
  listReservationObjects,
  persistentReservationState,
  () => reservationClock.now
);
const concurrentState = { reservations: new Map(), currentBytes: 0 };
const concurrentHarness = createUsageReservationHarness(10, async () => null, async () => {}, async () => [], concurrentState, () => 60);
let concurrentReaders = 0;
let releaseConcurrentReaders;
const bothReadersReady = new Promise((resolve) => { releaseConcurrentReaders = resolve; });
const observedConcurrentBytes = [];
const waitForBothReaders = async (observedBytes) => {
  observedConcurrentBytes.push(observedBytes);
  concurrentReaders += 1;
  if (concurrentReaders === 2) releaseConcurrentReaders();
  await bothReadersReady;
};
const parallelRequests = [
  { operationKey: "parallel-001", workspaceId: "workspace-001", generationId: "reservation-parallel-001", objectKey: "parallel-001", plannedBytes: 6, checksumSha256: "a".repeat(64) },
  { operationKey: "parallel-002", workspaceId: "workspace-001", generationId: "reservation-parallel-002", objectKey: "parallel-002", plannedBytes: 6, checksumSha256: "b".repeat(64) }
];
const parallelLeases = [
  { owner: "parallel-001", deadline: 100, fencingToken: "fence-parallel-001" },
  { owner: "parallel-002", deadline: 100, fencingToken: "fence-parallel-002" }
];
const concurrentResults = await Promise.allSettled(parallelRequests.map((request, index) =>
  concurrentHarness.reserveAfterObservedUsage(request, parallelLeases[index], waitForBothReaders)
));
assert.deepEqual(observedConcurrentBytes, [0, 0], "both concurrent reservations must read the same pre-reservation usage snapshot");
assert.equal(concurrentResults.filter((result) => result.status === "fulfilled").length, 1, "atomic reservation boundary must admit only one concurrent request");
assert.equal(concurrentResults.filter((result) => result.status === "rejected" && /serialization conflict/.test(result.reason?.message)).length, 1, "the competing reservation must fail its compare-and-swap");
const successfulParallelIndex = concurrentResults.findIndex((result) => result.status === "fulfilled");
const successfulParallelReservation = concurrentResults[successfulParallelIndex].value;
assert.strictEqual(
  await concurrentHarness.reserveAfterObservedUsage(parallelRequests[successfulParallelIndex], parallelLeases[successfulParallelIndex], async () => { throw new Error("idempotent retry must not re-enter the reservation race"); }),
  successfulParallelReservation,
  "lost response retry on the concurrent path must reuse the existing reservation"
);
const retryRaceState = { reservations: new Map(), currentBytes: 0 };
const retryRaceHarness = createUsageReservationHarness(10, async () => null, async () => {}, async () => [], retryRaceState, () => 60);
let retryRaceReaders = 0;
let releaseRetryRace;
const retryRaceReady = new Promise((resolve) => { releaseRetryRace = resolve; });
const sameOperationRequest = { operationKey: "same-operation", workspaceId: "workspace-001", generationId: "reservation-same-operation", objectKey: "same-operation", plannedBytes: 6, checksumSha256: "c".repeat(64) };
const sameOperationLease = { owner: "same-operation", deadline: 100, fencingToken: "fence-same-operation" };
const sameOperationResults = await Promise.all([
  retryRaceHarness.reserveAfterObservedUsage(sameOperationRequest, sameOperationLease, async () => { retryRaceReaders += 1; if (retryRaceReaders === 2) releaseRetryRace(); await retryRaceReady; }),
  retryRaceHarness.reserveAfterObservedUsage({ ...sameOperationRequest }, { ...sameOperationLease }, async () => { retryRaceReaders += 1; if (retryRaceReaders === 2) releaseRetryRace(); await retryRaceReady; })
]);
assert.strictEqual(sameOperationResults[0], sameOperationResults[1], "concurrent retries with one operation key must converge on one reservation");
assert.equal(retryRaceState.reservations.size, 1, "concurrent operation-key retry must reserve capacity once");
const saveBody = new TextEncoder().encode("stored");
const saveRequest = {
  operationKey: "operation-001",
  workspaceId: "workspace-001",
  generationId: "reservation-operation-001",
  objectKey: createObjectKey({ area: STORAGE_AREAS.MANUAL_ASSETS, workspaceId: "workspace-001", resourceId: "manual-001", generationId: "reservation-operation-001", assetId: "asset-001", extension: "png" }),
  plannedBytes: saveBody.byteLength,
  checksumSha256: createHash("sha256").update(saveBody).digest("hex")
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
assert.throws(() => reservationHarness.extendLease(saveRequest.operationKey, "worker-001", 100, 121), /absolute deadline/);
reservationHarness.extendLease(saveRequest.operationKey, "worker-001", 100, 120);
const excessiveLeaseHarness = createUsageReservationHarness(10, async () => null, async () => {}, async () => [], { reservations: new Map(), currentBytes: 0 }, () => 0);
assert.throws(() => excessiveLeaseHarness.reserve({ ...saveRequest, operationKey: "excessive-lease", plannedBytes: 1 }, { owner: "worker-x", deadline: Number.MAX_SAFE_INTEGER, fencingToken: "fence-x" }), /server maximum duration/);
assert.throws(() => createUsageReservationHarness(10, async () => null, async () => {}, async () => []), /server clock function/);
for (const deadline of [undefined, Number.NaN, -1]) {
  assert.throws(() => excessiveLeaseHarness.reserve({ ...saveRequest, operationKey: `invalid-deadline-${String(deadline)}`, plannedBytes: 1 }, { owner: "worker-x", deadline, fencingToken: "fence-x" }), /safe integer/);
}
const futureClockHarness = createUsageReservationHarness(10, async () => null, async () => {}, async () => [], { reservations: new Map(), currentBytes: 0 }, () => 10);
assert.throws(() => futureClockHarness.reserve({ ...saveRequest, operationKey: "past-deadline", plannedBytes: 1 }, { owner: "worker-x", deadline: 9, fencingToken: "fence-x" }), /at or after/);
await putReservedThroughAdapter(saveRequest, firstReservation, saveBody);
assert.equal(reservationBucket.inspect(saveRequest.objectKey).customMetadata.reservation_id, firstReservation.reservationId, "adapter must persist reservation metadata");
assert.equal(reservationBucket.inspect(saveRequest.objectKey).customMetadata.fencing_token, firstReservation.fencingToken, "adapter must persist fencing metadata");
assert.equal((await reservationHarness.reconcile(saveRequest.operationKey, 99)).state, "committed", "post-write worker stop must reconcile a matching fake R2 object to committed");
assert.equal((await reservationHarness.reconcile(saveRequest.operationKey, 101)).state, "committed", "reconciliation must be idempotent");
assert.equal(reservationHarness.snapshot().currentBytes, 6, "committed bytes must not be counted twice");
const abandoned = {
  ...saveRequest,
  operationKey: "operation-003",
  generationId: "reservation-operation-003",
  objectKey: createObjectKey({ area: STORAGE_AREAS.MANUAL_ASSETS, workspaceId: "workspace-001", resourceId: "manual-001", generationId: "reservation-operation-003", assetId: "asset-003", extension: "png" }),
  plannedBytes: 4,
  checksumSha256: createHash("sha256").update(new Uint8Array(4)).digest("hex")
};
reservationClock.now = 140;
const abandonedReservation = reservationHarness.reserve(abandoned, { owner: "worker-003", deadline: 200, fencingToken: "fence-003" });
await assert.rejects(reservationHarness.reconcile(abandoned.operationKey, 199), /active lease/);
assert.equal((await reservationHarness.reconcile(abandoned.operationKey, 200)).state, "released", "expired reservation without object must release");
assert.equal(reservationHarness.snapshot().currentBytes, 6, "released reservation must not consume capacity");
reservationClock.now = 150;
const sweepAbandoned = { ...abandoned, operationKey: "sweep-abandoned", generationId: "reservation-sweep-abandoned", objectKey: createObjectKey({ area: STORAGE_AREAS.MANUAL_ASSETS, workspaceId: "workspace-001", resourceId: "manual-001", generationId: "reservation-sweep-abandoned", assetId: "asset-sweep-abandoned", extension: "png" }) };
reservationHarness.reserve(sweepAbandoned, { owner: "worker-sweep", deadline: 210, fencingToken: "fence-sweep" });
const activeRestartHarness = createUsageReservationHarness(10, readReservationObject, (objectKey) => reservationBucket.delete(objectKey), listReservationObjects, persistentReservationState, () => reservationClock.now);
await activeRestartHarness.sweepReleased(210);
assert.equal(activeRestartHarness.snapshot().reservations.find((item) => item.operationKey === sweepAbandoned.operationKey).state, "released", "restarted scheduled sweep must enumerate and release expired active reservations");
await putReservedThroughAdapter(abandoned, abandonedReservation, new Uint8Array(abandoned.plannedBytes));
const restartedReservationHarness = createUsageReservationHarness(10, readReservationObject, (objectKey) => reservationBucket.delete(objectKey), listReservationObjects, persistentReservationState, () => reservationClock.now);
await restartedReservationHarness.sweepReleased(201);
assert.equal(restartedReservationHarness.snapshot().reservations.find((item) => item.operationKey === abandoned.operationKey).lateObjectDeleted, true, "restarted scheduled sweep must reload persistent released reservations and delete a late object");
assert.equal(await reservationBucket.get(abandoned.objectKey), null);
const newGenerationKey = createObjectKey({ area: STORAGE_AREAS.MANUAL_ASSETS, workspaceId: "workspace-001", resourceId: "manual-001", generationId: "reservation-new-generation", assetId: "asset-003", extension: "png" });
await reservationBucket.put(newGenerationKey, new Uint8Array(abandoned.plannedBytes), {
  httpMetadata: { contentType: "image/png" },
  customMetadata: { workspace_id: abandoned.workspaceId, checksum_sha256: abandoned.checksumSha256, reservation_id: "reservation-new-generation", fencing_token: "fence-new" }
});
await reservationHarness.sweepReleased(202);
assert.notEqual(await reservationBucket.get(newGenerationKey), null, "generation-specific object keys prevent old reservation deletion from racing with a newer object");
await reservationBucket.delete(newGenerationKey);
for (const [index, mismatch] of [
  { workspaceId: "workspace-999" },
  { objectKey: "wrong" },
  { sizeBytes: 3 },
  { checksumSha256: "c".repeat(64) },
  { reservationId: "reservation-wrong" },
  { fencingToken: "fence-wrong" }
].entries()) {
  reservationClock.now = 240;
  const operationKey = `mismatch-${index + 1}`;
  const generationId = `reservation-${operationKey}`;
  const request = {
    ...abandoned,
    operationKey,
    generationId,
    objectKey: createObjectKey({ area: STORAGE_AREAS.MANUAL_ASSETS, workspaceId: "workspace-001", resourceId: "manual-001", generationId, assetId: `asset-${index + 10}`, extension: "png" }),
    plannedBytes: 4
  };
  const mismatchReservation = reservationHarness.reserve(request, { owner: operationKey, deadline: 300, fencingToken: `fence-${operationKey}` });
  const stored = {
    workspaceId: request.workspaceId,
    objectKey: request.objectKey,
    sizeBytes: request.plannedBytes,
    checksumSha256: request.checksumSha256,
    ...mismatch
  };
  const storedKey = mismatch.objectKey
    ? createObjectKey({ area: STORAGE_AREAS.MANUAL_ASSETS, workspaceId: "workspace-001", resourceId: "manual-001", generationId, assetId: "wrong-asset", extension: "png" })
    : request.objectKey;
  const storedBody = mismatch.checksumSha256 ? new Uint8Array([1, 2, 3, 4]) : new Uint8Array(stored.sizeBytes);
  await reservationBucket.put(storedKey, storedBody, {
    httpMetadata: { contentType: "image/png" },
    customMetadata: { workspace_id: stored.workspaceId, checksum_sha256: stored.checksumSha256, reservation_id: stored.reservationId ?? mismatchReservation.reservationId, fencing_token: stored.fencingToken ?? mismatchReservation.fencingToken }
  });
  if (mismatch.objectKey) {
    const recovered = await reservationHarness.reconcile(operationKey, 300);
    assert.equal(recovered.state, "released");
    assert.equal(recovered.mismatchedObjectDeleted, true, "reconciler must delete same-generation objects written under the wrong asset key");
    assert.equal(await reservationBucket.get(storedKey), null);
  } else {
    const recovered = await reservationHarness.reconcile(operationKey, 300);
    assert.equal(recovered.state, "released");
    assert.equal(recovered.mismatchedObjectDeleted, true, "expired same-generation mismatch must be deleted by reconciliation");
    assert.equal(await reservationBucket.get(request.objectKey), null);
  }
}

console.log("R2 storage stub contract OK.");
