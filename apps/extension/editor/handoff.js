import { STAGING_ONBOARDING_ORIGIN } from "../onboarding-config.js";
import { normalizeAnnotations } from "./image-annotations.js";

const HANDOFF_BYTES = 32;
const HANDOFF_TTL_MS = 15 * 60 * 1000;
const HANDOFF_KEY_PREFIX = "meccha-manual:handoff:";
const HANDOFF_READY_KEY_PREFIX = "meccha-manual:handoff-ready:";
const EXTENSION_ID_PATTERN = /^[a-p]{32}$/;
const CLAIM_INTENT_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const OUTPUT_ACTIONS = new Set(["save", "share", "office"]);
const OFFICE_FORMATS = new Set(["docx", "pptx"]);

export function validOutputAction(value) {
  return OUTPUT_ACTIONS.has(value);
}

export function validOfficeFormat(value) {
  return OFFICE_FORMATS.has(value);
}

function validateActionFormat(outputAction, officeFormat) {
  if (!validOutputAction(outputAction)) throw new TypeError("unsupported output action");
  if (outputAction === "office" && !validOfficeFormat(officeFormat)) throw new TypeError("office format is required");
  if (outputAction !== "office" && officeFormat !== undefined && officeFormat !== null) throw new TypeError("office format is unsupported");
}

function canonicalScreenshot(screenshot) {
  if (screenshot && Object.prototype.hasOwnProperty.call(screenshot, "annotations") && !Array.isArray(screenshot.annotations)) throw new TypeError("invalid annotations");
  const annotations = Array.isArray(screenshot?.annotations) && screenshot.annotations.length > 0 ? normalizeAnnotations(screenshot.annotations) : [];
  if (annotations === null) throw new TypeError("invalid annotations");
  return {
    id: screenshot?.id ?? null,
    dataUrl: screenshot?.dataUrl ?? "",
    masks: Array.isArray(screenshot?.masks) ? screenshot.masks.map((mask) => ({ x: mask?.x ?? null, y: mask?.y ?? null, width: mask?.width ?? null, height: mask?.height ?? null })) : [],
    ...(annotations.length > 0 ? { annotations } : {})
  };
}

function canonicalDraftJsonInternal(draft) {
  if (!draft || typeof draft !== "object") throw new TypeError("draft is required");
  return JSON.stringify({
    id: draft.id ?? null,
    title: draft.title ?? "",
    description: draft.description ?? "",
    updatedAt: draft.updatedAt ?? null,
    steps: Array.isArray(draft.steps) ? draft.steps.map((step) => ({
      id: step?.id ?? null,
      order: step?.order ?? null,
      instruction: step?.instruction ?? "",
      screenshotId: step?.screenshotId ?? null,
      ...(step?.imageState ? { imageState: {
        status: step.imageState.status ?? null,
        version: step.imageState.version ?? null
      } } : {})
    })) : [],
    screenshots: Array.isArray(draft.screenshots) ? draft.screenshots.map(canonicalScreenshot) : [],
    ...(draft.branding !== undefined ? { branding: { themeColor: draft.branding?.themeColor ?? "#087f7a", logoDataUrl: draft.branding?.logoDataUrl ?? null } } : {})
  });
}

export function canonicalDraftJson(draft) {
  if (!draft || typeof draft !== "object") throw new TypeError("draft is required");
  return canonicalDraftJsonInternal(draft);
}

function canonicalDraftContentJson(draft) {
  const parsed = JSON.parse(canonicalDraftJson(draft));
  delete parsed.updatedAt;
  return JSON.stringify(parsed);
}

export async function fingerprintDraft(draft) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalDraftContentJson(draft)));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function legacyFingerprintDraft(draft) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalDraftJsonInternal(draft)));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function createHandoffId(random = crypto.getRandomValues(new Uint8Array(HANDOFF_BYTES))) {
  if (!(random instanceof Uint8Array) || random.byteLength !== HANDOFF_BYTES) throw new TypeError("handoff id must be 256 bits");
  return toBase64Url(random);
}

export function validateExtensionId(extensionId) {
  if (typeof extensionId !== "string" || !EXTENSION_ID_PATTERN.test(extensionId)) throw new TypeError("invalid extension id");
  return extensionId;
}

export function createHandoffMetadata(draftId, outputAction = "save", now = Date.now(), extensionId = globalThis.chrome?.runtime?.id, draftUpdatedAt = undefined, draftFingerprint = undefined, officeFormat = undefined) {
  if (typeof draftId !== "string" || !draftId) throw new TypeError("draft id is required");
  validateActionFormat(outputAction, officeFormat);
  validateExtensionId(extensionId);
  const handoffId = createHandoffId();
  return {
    handoffId,
    draftId,
    outputAction,
    extensionId,
    ...(typeof draftUpdatedAt === "string" ? { draftUpdatedAt } : {}),
    ...(typeof draftFingerprint === "string" && /^[a-f0-9]{64}$/.test(draftFingerprint) ? { draftFingerprint } : {}),
    ...(outputAction === "office" ? { officeFormat } : {}),
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
    .filter(([key, value]) => (key.startsWith(HANDOFF_KEY_PREFIX) || key.startsWith(HANDOFF_READY_KEY_PREFIX)) && value?.status !== "completion-pending" && value?.status !== "finalize-pending" && Date.parse(value?.expiresAt || "") <= now)
    .map(([key]) => key);
  if (expired.length > 0) await storage.remove(expired);
}

export async function findRecoverableHandoff(draftId, draftFingerprint, storage = globalThis.chrome?.storage?.local, outputAction = "save", officeFormat = undefined) {
  if (typeof draftId !== "string" || !draftId || !/^[a-f0-9]{64}$/.test(draftFingerprint || "") || !storage?.get) return null;
  try { validateActionFormat(outputAction, officeFormat); } catch { return null; }
  const entries = await storage.get(null);
  const handoffs = Object.values(entries || {}).filter((value) =>
    validOutputAction(value?.outputAction) &&
    value?.draftId === draftId &&
    /^[A-Za-z0-9_-]{43}$/.test(value?.handoffId || "") &&
    /^[a-f0-9]{64}$/.test(value?.draftFingerprint || "")
  );
  const pending = handoffs.filter((value) =>
    (value.status === "finalize-pending" || value.status === "completion-pending") &&
    /^[A-Za-z0-9_-]{16,128}$/.test(value.operationId || "") &&
    CLAIM_INTENT_ID_PATTERN.test(value.claimIntentId || "")
  );
  if (pending.length > 0) {
    const matchingIntent = pending.find((value) => value.draftFingerprint === draftFingerprint && value.outputAction === outputAction && (outputAction !== "office" ? value.officeFormat === undefined : value.officeFormat === officeFormat));
    // An Office request must never adopt a pending save/share claim. That
    // would return metadata with the wrong intent and could resume the wrong
    // output after authentication. Existing save/share recovery keeps its
    // historical fallback behavior.
    if (matchingIntent || outputAction === "office") return matchingIntent || null;
    return pending.find((value) => value.draftFingerprint === draftFingerprint) || pending[0];
  }
  return handoffs.find((value) =>
    value.outputAction === outputAction &&
    (outputAction !== "office" ? value.officeFormat === undefined : value.officeFormat === officeFormat) &&
    value.status === undefined &&
    value.draftFingerprint === draftFingerprint &&
    Number.isFinite(Date.parse(value.expiresAt || "")) &&
    Date.parse(value.expiresAt) >= Date.now()
  ) || null;
}

export async function withHandoffDraftLock(draftId, callback, navigatorLike = globalThis.navigator) {
  if (typeof draftId !== "string" || !draftId || typeof callback !== "function") throw new TypeError("draft lock arguments are invalid");
  const locks = navigatorLike?.locks;
  if (!locks || typeof locks.request !== "function") throw new Error("HANDOFF_LOCK_UNAVAILABLE");
  return locks.request(`meccha-manual:handoff:draft:${draftId}`, async (lock) => {
    if (!lock) throw new Error("HANDOFF_LOCK_UNAVAILABLE");
    return callback();
  });
}

export function buildContinueUrl(origin, handoffId, extensionId = globalThis.chrome?.runtime?.id, recovery = null, outputAction = "save", launchId = null, officeFormat = undefined) {
  if (origin !== STAGING_ONBOARDING_ORIGIN) throw new Error("ONBOARDING_ORIGIN_NOT_ALLOWED");
  if (!/^[A-Za-z0-9_-]{43}$/.test(handoffId)) throw new Error("INVALID_HANDOFF_ID");
  validateExtensionId(extensionId);
  try { validateActionFormat(outputAction, officeFormat); } catch { throw new Error(outputAction === "office" ? "INVALID_OFFICE_FORMAT" : "UNSUPPORTED_OUTPUT_ACTION"); }
  if (launchId !== null && !/^[A-Za-z0-9_-]{43}$/.test(launchId)) throw new Error("INVALID_LAUNCH_ID");
  const recoveryParams = recovery && /^[A-Za-z0-9_-]{16,128}$/.test(recovery.operationId || "") &&
    CLAIM_INTENT_ID_PATTERN.test(recovery.claimIntentId || "") &&
    /^[a-f0-9]{64}$/.test(recovery.draftFingerprint || "")
    ? `&operationId=${encodeURIComponent(recovery.operationId)}&claimIntentId=${encodeURIComponent(recovery.claimIntentId)}&draftFingerprint=${encodeURIComponent(recovery.draftFingerprint)}`
    : "";
  // Claim authorization uses the original action. A different requested destination
  // is UI intent only; it must never create a second in-flight claim.
  const claimAction = validOutputAction(recovery?.outputAction) ? recovery.outputAction : outputAction;
  const claimOfficeFormat = claimAction === "office" ? (validOfficeFormat(recovery?.officeFormat) ? recovery.officeFormat : officeFormat) : undefined;
  try { validateActionFormat(claimAction, claimOfficeFormat); } catch { throw new Error("INVALID_OFFICE_FORMAT"); }
  if (outputAction === "office" && (claimAction !== "office" || claimOfficeFormat !== officeFormat)) throw new Error("INVALID_OFFICE_FORMAT");
  const actionParam = claimAction === "share" ? "&action=share" : claimAction === "office" ? `&action=office&officeFormat=${encodeURIComponent(claimOfficeFormat)}` : "";
  const requestedActionParam = outputAction !== claimAction ? `&requestedAction=${outputAction}` : "";
  const requestedOfficeFormatParam = outputAction === "office" && claimAction === "office" && officeFormat !== claimOfficeFormat ? `&requestedOfficeFormat=${encodeURIComponent(officeFormat)}` : "";
  const launchParam = launchId ? `&launchId=${encodeURIComponent(launchId)}` : "";
  return `${origin}/onboarding/continue#handoff=${encodeURIComponent(handoffId)}&extensionId=${encodeURIComponent(extensionId)}${actionParam}${requestedActionParam}${requestedOfficeFormatParam}${recoveryParams}${launchParam}`;
}

export async function withHandoffReadyLock(handoffId, callback, navigatorLike = globalThis.navigator) {
  if (typeof handoffId !== "string" || !handoffId || typeof callback !== "function") throw new TypeError("ready lock arguments are invalid");
  const locks = navigatorLike?.locks;
  if (!locks || typeof locks.request !== "function") throw new Error("HANDOFF_LOCK_UNAVAILABLE");
  return locks.request(`meccha-manual:handoff:ready:${handoffId}`, async (lock) => {
    if (!lock) throw new Error("HANDOFF_LOCK_UNAVAILABLE");
    return callback();
  });
}

export function handoffReadyStorageKey(handoffId, launchId = null) {
  if (typeof handoffId !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(handoffId)) throw new TypeError("invalid handoff id");
  if (launchId !== null && (typeof launchId !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(launchId))) throw new TypeError("invalid launch id");
  return `${HANDOFF_READY_KEY_PREFIX}${handoffId}${launchId === null ? "" : `:${launchId}`}`;
}

export function createHandoffAttemptId(random = crypto.getRandomValues(new Uint8Array(HANDOFF_BYTES))) {
  return createHandoffId(random);
}

export const HANDOFF_TTL_MINUTES = HANDOFF_TTL_MS / 60000;
