const HANDOFF_BYTES = 32;
const HANDOFF_TTL_MS = 15 * 60 * 1000;
const HANDOFF_KEY_PREFIX = "meccha-manual:handoff:";

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function createHandoffId(random = crypto.getRandomValues(new Uint8Array(HANDOFF_BYTES))) {
  if (!(random instanceof Uint8Array) || random.byteLength !== HANDOFF_BYTES) throw new TypeError("handoff id must be 256 bits");
  return toBase64Url(random);
}

export function createHandoffMetadata(draftId, outputAction = "save", now = Date.now()) {
  if (typeof draftId !== "string" || !draftId) throw new TypeError("draft id is required");
  if (outputAction !== "save") throw new TypeError("unsupported output action");
  const handoffId = createHandoffId();
  return {
    handoffId,
    draftId,
    outputAction,
    expiresAt: new Date(now + HANDOFF_TTL_MS).toISOString()
  };
}

export function handoffStorageKey(handoffId) {
  if (typeof handoffId !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(handoffId)) throw new TypeError("invalid handoff id");
  return `${HANDOFF_KEY_PREFIX}${handoffId}`;
}

export async function saveHandoffMetadata(metadata, storage = globalThis.chrome?.storage?.local) {
  if (!storage?.set) throw new Error("HANDOFF_STORAGE_UNAVAILABLE");
  await storage.set({ [handoffStorageKey(metadata.handoffId)]: metadata });
}

export async function pruneExpiredHandoffs(storage = globalThis.chrome?.storage?.local, now = Date.now()) {
  if (!storage?.get || !storage?.remove) return;
  const entries = await storage.get(null);
  const expired = Object.entries(entries || {})
    .filter(([key, value]) => key.startsWith(HANDOFF_KEY_PREFIX) && Date.parse(value?.expiresAt || "") <= now)
    .map(([key]) => key);
  if (expired.length > 0) await storage.remove(expired);
}

export function buildContinueUrl(origin, handoffId) {
  if (origin !== "https://meccha-manual.meccha-iiyatsu.com") throw new Error("ONBOARDING_ORIGIN_NOT_ALLOWED");
  if (!/^[A-Za-z0-9_-]{43}$/.test(handoffId)) throw new Error("INVALID_HANDOFF_ID");
  return `${origin}/onboarding/continue#handoff=${encodeURIComponent(handoffId)}`;
}

export const HANDOFF_TTL_MINUTES = HANDOFF_TTL_MS / 60000;
