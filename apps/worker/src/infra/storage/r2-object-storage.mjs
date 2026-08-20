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
      const verified = await createStorageObject(object);
      const customMetadata = {
        workspace_id: verified.metadata.workspaceId,
        asset_id: verified.metadata.assetId,
        kind: verified.kind,
        content_type: verified.contentType,
        checksum_sha256: verified.checksumSha256
      };
      if (verified.metadata.reservationId !== undefined) customMetadata.reservation_id = verified.metadata.reservationId;
      if (verified.metadata.fencingToken !== undefined) customMetadata.fencing_token = verified.metadata.fencingToken;
      await bucket(verified.area).put(verified.key, verified.body, {
        httpMetadata: { contentType: verified.contentType },
        customMetadata
      });
      return { status: "stored" };
    },
    async get({ area, key }) {
      const result = await bucket(area).get(key);
      if (!result) return null;
      const body = new Uint8Array(await result.arrayBuffer());
      const metadata = result.customMetadata ?? {};
      const keySegments = key.split("/");
      const generationId = keySegments.length === 5 ? keySegments[3] : undefined;
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
          resourceId: keySegments[2],
          generationId,
          reservationId: metadata.reservation_id,
          fencingToken: metadata.fencing_token,
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
