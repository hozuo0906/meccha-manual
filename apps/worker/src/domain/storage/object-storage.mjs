export const STORAGE_AREAS = Object.freeze({
  CAPTURE_ASSETS: "capture-assets",
  MANUAL_ASSETS: "manual-assets",
  EXPORTS: "exports",
  AVATARS: "avatars"
});

export const STORAGE_KINDS = Object.freeze({
  CAPTURE_SCREENSHOT: "capture_screenshot",
  MANUAL_IMAGE: "manual_image",
  PDF_EXPORT: "pdf_export",
  HTML_EXPORT: "html_export",
  MARKDOWN_EXPORT: "markdown_export",
  USER_AVATAR: "user_avatar",
  WORKSPACE_AVATAR: "workspace_avatar"
});

const RESOURCE_TYPE_BY_AREA = Object.freeze({
  [STORAGE_AREAS.CAPTURE_ASSETS]: "captures",
  [STORAGE_AREAS.MANUAL_ASSETS]: "manuals",
  [STORAGE_AREAS.EXPORTS]: "exports",
  [STORAGE_AREAS.AVATARS]: "avatars"
});
const KINDS_BY_AREA = Object.freeze({
  [STORAGE_AREAS.CAPTURE_ASSETS]: [STORAGE_KINDS.CAPTURE_SCREENSHOT],
  [STORAGE_AREAS.MANUAL_ASSETS]: [STORAGE_KINDS.MANUAL_IMAGE],
  [STORAGE_AREAS.EXPORTS]: [STORAGE_KINDS.PDF_EXPORT, STORAGE_KINDS.HTML_EXPORT, STORAGE_KINDS.MARKDOWN_EXPORT],
  [STORAGE_AREAS.AVATARS]: [STORAGE_KINDS.USER_AVATAR, STORAGE_KINDS.WORKSPACE_AVATAR]
});

const SAFE_IDENTIFIER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_EXTENSION = /^[a-z0-9]{1,10}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function requireSafeIdentifier(name, value) {
  if (typeof value !== "string" || !SAFE_IDENTIFIER.test(value)) {
    throw new TypeError(`${name} must be an opaque lowercase identifier.`);
  }
  return value;
}

export function createObjectKey({ area, workspaceId, resourceId, assetId, extension }) {
  const resourceType = RESOURCE_TYPE_BY_AREA[area];
  if (!resourceType) throw new TypeError("Unknown storage area.");
  if (!SAFE_EXTENSION.test(extension ?? "")) throw new TypeError("Invalid file extension.");

  return [
    requireSafeIdentifier("workspaceId", workspaceId),
    resourceType,
    requireSafeIdentifier("resourceId", resourceId),
    `${requireSafeIdentifier("assetId", assetId)}.${extension}`
  ].join("/");
}

export function createStorageObject({ area, key, kind, body, contentType, sizeBytes, checksumSha256, metadata }) {
  if (!Object.values(STORAGE_AREAS).includes(area)) throw new TypeError("Unknown storage area.");
  if (!KINDS_BY_AREA[area].includes(kind)) throw new TypeError("Storage kind does not match its area.");
  if (!(body instanceof Uint8Array)) throw new TypeError("body must be a Uint8Array.");
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0 || body.byteLength !== sizeBytes) {
    throw new TypeError("sizeBytes must match the body length.");
  }
  if (typeof contentType !== "string" || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(contentType)) {
    throw new TypeError("Invalid content type.");
  }
  if (!SHA256.test(checksumSha256 ?? "")) throw new TypeError("Invalid SHA-256 checksum.");

  const allowedMetadata = new Set(["workspaceId", "assetId", "manualId", "stepId"]);
  if (!metadata || Object.keys(metadata).some((name) => !allowedMetadata.has(name))) {
    throw new TypeError("Metadata contains a prohibited field.");
  }
  const safeMetadata = {
    workspaceId: requireSafeIdentifier("workspaceId", metadata?.workspaceId),
    assetId: requireSafeIdentifier("assetId", metadata?.assetId)
  };
  if (metadata?.manualId !== undefined) safeMetadata.manualId = requireSafeIdentifier("manualId", metadata.manualId);
  if (metadata?.stepId !== undefined) safeMetadata.stepId = requireSafeIdentifier("stepId", metadata.stepId);
  const expectedPrefix = `${safeMetadata.workspaceId}/${RESOURCE_TYPE_BY_AREA[area]}/`;
  if (typeof key !== "string" || !key.startsWith(expectedPrefix) || !/^[a-z0-9/-]+\.[a-z0-9]{1,10}$/.test(key)) {
    throw new TypeError("Object key does not match its storage metadata.");
  }

  return Object.freeze({ area, key, kind, body, contentType, sizeBytes, checksumSha256, metadata: Object.freeze(safeMetadata) });
}

/**
 * Server-side storage port. Implementations must provide put/get/delete methods
 * and must never log object keys, bodies, checksums, metadata values, URLs, or secrets.
 */
export function assertObjectStorage(storage) {
  for (const operation of ["put", "get", "delete"]) {
    if (typeof storage?.[operation] !== "function") throw new TypeError(`Storage port is missing ${operation}.`);
  }
  return storage;
}
