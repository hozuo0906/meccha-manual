import { assertObjectStorage, createStorageObject, createStorageReadResult } from "../../domain/storage/object-storage.mjs";

const BINDING_BY_AREA = Object.freeze({
  "capture-assets": "CAPTURE_ASSETS",
  "manual-assets": "MANUAL_ASSETS",
  exports: "EXPORTS",
  avatars: "AVATARS"
});

export function createR2ObjectStorage(bindings) {
  function bucket(area) {
    const binding = BINDING_BY_AREA[area];
    const value = binding && bindings[binding];
    if (!value) throw new Error("R2 storage binding is not configured.");
    return value;
  }

  return assertObjectStorage({
    async put(object) {
      await bucket(object.area).put(object.key, object.body, {
        httpMetadata: { contentType: object.contentType },
        customMetadata: {
          workspace_id: object.metadata.workspaceId,
          resource_id: object.metadata.resourceId,
          asset_id: object.metadata.assetId,
          kind: object.kind,
          content_type: object.contentType,
          checksum_sha256: object.checksumSha256
        }
      });
      return { status: "stored" };
    },
    async get({ area, key }) {
      const result = await bucket(area).get(key);
      if (!result) return null;
      const body = new Uint8Array(await result.arrayBuffer());
      const metadata = result.customMetadata ?? {};
      const object = await createStorageObject({
        area,
        key,
        kind: metadata.kind,
        body,
        contentType: result.httpMetadata?.contentType ?? metadata.content_type,
        sizeBytes: result.size ?? body.byteLength,
        checksumSha256: metadata.checksum_sha256,
        metadata: {
          workspaceId: metadata.workspace_id,
          resourceId: metadata.resource_id,
          assetId: metadata.asset_id
        }
      });
      return createStorageReadResult(object);
    },
    async delete({ area, key }) {
      await bucket(area).delete(key);
      return { status: "deleted" };
    }
  });
}
