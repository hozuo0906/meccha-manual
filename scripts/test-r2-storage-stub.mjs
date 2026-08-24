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
    inspect(objectKey) {
      return objects.get(objectKey);
    }
  };
}

const manualBucket = createFakeR2Bucket();
const r2Storage = createR2ObjectStorage({ MANUAL_ASSETS: manualBucket });
assert.deepEqual(await r2Storage.put(object), { status: "stored" });
assert.deepEqual(await r2Storage.get({ area: object.area, key: object.key }), expectedRead);
assert.deepEqual(await storage.put(reservedObject), { status: "stored" });
assert.equal((await storage.get({ area: reservedObject.area, key: reservedObject.key })).metadata.generationId, "reservation-operation-001");
assert.deepEqual(await r2Storage.put(reservedObject), { status: "stored" });
assert.equal((await r2Storage.get({ area: reservedObject.area, key: reservedObject.key })).metadata.generationId, "reservation-operation-001");
assert.equal(manualBucket.inspect(reservedObject.key).customMetadata.reservation_id, "reservation-operation-001");
assert.equal(manualBucket.inspect(reservedObject.key).customMetadata.fencing_token, "fence-operation-001");
await r2Storage.delete({ area: reservedObject.area, key: reservedObject.key });
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

console.log("R2 storage stub contract OK.");
