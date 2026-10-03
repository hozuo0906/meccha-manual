import { STAGING_ONBOARDING_ORIGIN } from "../onboarding-config.js";
import { draftStore } from "../storage/draft-store.js";
import { fingerprintDraft, handoffReadyStorageKey, handoffStorageKey, legacyFingerprintDraft, validOfficeFormat, validOutputAction } from "../editor/handoff.js";
import { normalizeAnnotations } from "../editor/image-annotations.js";
import { drawScreenshot, cloudImageLayers } from "../editor/image-renderer.js";

export const CLOUD_CLAIM_SCHEMA = "meccha-manual/cloud-claim-v1";
export const CLOUD_CLAIM_CHUNK_BYTES = 192 * 1024;
export const CLOUD_CLAIM_MAX_ASSET_BYTES = 10 * 1024 * 1024;
export const CLOUD_CLAIM_MAX_TOTAL_BYTES = 100 * 1024 * 1024;
export const CLOUD_CLAIM_MAX_ASSETS = 100;
const HANDOFF_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const DRAFT_FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;
const OPERATION_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const CLAIM_INTENT_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const TRANSFER_TTL_MS = 10 * 60 * 1000;
const transfers = new Map();
const snapshots = new Map();
const finalizeLocks = new Map();
const completionDraftLocks = new Map();
const beginLocks = new Map();
const assetStartLocks = new Map();
let transferBytesTotal = 0;
let transferBytesReserved = 0;
let snapshotBytesTotal = 0;
const MAX_MESSAGE_BYTES = 32 * 1024;
function reject(code) {
  return { ok: false, error: code };
}

function validHandoffId(value) {
  return typeof value === "string" && HANDOFF_PATTERN.test(value);
}

function validSchema(message) {
  return message?.schema === CLOUD_CLAIM_SCHEMA;
}

export function safeMessage(message, type) {
  let size;
  try { size = new TextEncoder().encode(JSON.stringify(message)).byteLength; } catch { return false; }
  if (size > MAX_MESSAGE_BYTES || Object.keys(message || {}).some((key) => /authorization|cookie|password|token|credential/i.test(key))) return false;
  const allowed = {
    "handoff.begin": ["schema", "type", "handoffId", "action", "officeFormat", "launchId"],
    "handoff.prepare": ["schema", "type", "handoffId", "action", "officeFormat", "launchId"],
    "handoff.logo.start": ["schema", "type", "handoffId", "action", "officeFormat", "launchId"],
    "handoff.logo.chunk": ["schema", "type", "handoffId", "action", "officeFormat", "launchId", "sequence"],
    "handoff.asset.start": ["schema", "type", "handoffId", "action", "officeFormat", "launchId", "assetSlot"],
    "handoff.asset.chunk": ["schema", "type", "handoffId", "action", "officeFormat", "launchId", "assetSlot", "sequence"],
    "handoff.recovery": ["schema", "type", "handoffId", "action", "officeFormat", "launchId"],
    "handoff.finalize-pending": ["schema", "type", "handoffId", "action", "officeFormat", "launchId", "operationId", "claimIntentId", "draftFingerprint", "cloudRef"],
    "handoff.expired": ["schema", "type", "handoffId", "action", "officeFormat", "launchId", "operationId", "claimIntentId", "draftFingerprint", "claimResult"],
    "handoff.completed": ["schema", "type", "handoffId", "action", "officeFormat", "launchId", "manualId", "operationId", "claimIntentId", "draftFingerprint", "cloudRef"]
  }[type];
  return Boolean(allowed && Object.keys(message || {}).every((key) => allowed.includes(key)));
}

function exactSenderOrigin(sender) {
  try {
    const url = new URL(sender?.url || "");
    return url.origin === STAGING_ONBOARDING_ORIGIN && url.pathname === "/onboarding/continue" && !url.username && !url.password && (sender?.frameId === undefined || sender.frameId === 0);
  } catch {
    return false;
  }
}

function validRequest(message, sender, type) {
  return exactSenderOrigin(sender) && safeMessage(message, type) && validSchema(message) && message?.type === type && validHandoffId(message?.handoffId) && validOutputAction(message?.action) && (message.action === "office" ? validOfficeFormat(message.officeFormat) : message.officeFormat === undefined && message.launchId === undefined);
}

function sameIntent(metadata, message) {
  return metadata?.outputAction === message?.action && (message.action === "office" ? metadata.officeFormat === message.officeFormat : metadata.officeFormat === undefined && message.officeFormat === undefined);
}

async function validOfficeCoordinator(metadata, message, sender) {
  if (message.action !== "office") return true;
  if (!/^[A-Za-z0-9_-]{43}$/.test(message.launchId || "") || !Number.isInteger(sender?.tab?.id)) return false;
  const ready = (await chrome.storage.local.get(handoffReadyStorageKey(message.handoffId, message.launchId)))?.[handoffReadyStorageKey(message.handoffId, message.launchId)];
  return ready?.handoffId === message.handoffId && ready.launchId === message.launchId && ready.tabId === sender.tab.id && ready.activationPolicy !== "cancelled" && ready.expiresAt === metadata.expiresAt;
}

function isFresh(metadata, now = Date.now()) {
  const expiresAt = Date.parse(metadata?.expiresAt || "");
  return Number.isFinite(expiresAt) && expiresAt >= now;
}

async function readHandoff(handoffId) {
  const key = handoffStorageKey(handoffId);
  const result = await chrome.storage.local.get(key);
  const metadata = result?.[key];
  if (!metadata || metadata.handoffId !== handoffId || !validOutputAction(metadata.outputAction) || (metadata.outputAction === "office" ? !validOfficeFormat(metadata.officeFormat) : metadata.officeFormat !== undefined) || ["superseded", "expired"].includes(metadata.status) || !isFresh(metadata)) return null;
  return metadata;
}

function validRecoveryIdentity(message) {
  return OPERATION_ID_PATTERN.test(message?.operationId || "") && CLAIM_INTENT_ID_PATTERN.test(message?.claimIntentId || "") && DRAFT_FINGERPRINT_PATTERN.test(message?.draftFingerprint || "");
}

function createOperationId() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function validCloudRef(value, manualId = value?.manualId) {
  return value && typeof value === "object" && Object.keys(value).every((key) => ["workspaceId", "manualId", "revisionId", "updatedAt", "contentVersion", "savedFingerprint"].includes(key))
    && [value.workspaceId, value.manualId, value.revisionId].every((id) => typeof id === "string" && CLAIM_INTENT_ID_PATTERN.test(id))
    && value.manualId === manualId && typeof value.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt))
    && /^[a-f0-9]{32}$/.test(value.contentVersion || "")
    && (value.savedFingerprint === undefined || DRAFT_FINGERPRINT_PATTERN.test(value.savedFingerprint));
}
function cloudRefStorageKey(draftId) { return "meccha-manual:cloud-ref:" + draftId; }
function cloudRefIdentity(value) {
  if (!validCloudRef(value)) return null;
  return JSON.stringify([value.workspaceId, value.manualId, value.revisionId, value.updatedAt, value.contentVersion]);
}
async function currentCloudReceipt(draftId) {
  const key = cloudRefStorageKey(draftId);
  return (await chrome.storage.local.get(key))?.[key] || (await draftStore.get(draftId))?.cloudRef || null;
}
async function hasOtherPendingClaim(draftId, handoffId) {
  const entries = await chrome.storage.local.get(null);
  return Object.entries(entries || {}).some(([key, value]) => key.startsWith("meccha-manual:handoff:")
    && value?.draftId === draftId && value.handoffId !== handoffId
    && ["finalize-pending", "completion-pending"].includes(value.status));
}
async function withDraftCloudStateLock(draftId, callback) {
  const previous = completionDraftLocks.get(draftId) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  completionDraftLocks.set(draftId, queued);
  await previous;
  try { return await callback(); }
  finally {
    release();
    if (completionDraftLocks.get(draftId) === queued) completionDraftLocks.delete(draftId);
  }
}


function cleanStep(step) {
  if (!step || typeof step !== "object" || typeof step.id !== "string" || !step.id || !Number.isInteger(step.order) || step.order < 1 || typeof step.instruction !== "string" || Array.from(step.instruction).length > 500) return null;
  if (step.privacyReview?.reviewRequired === true) return null;
  // Image preparation/review is an output precondition, not optional metadata.
  // Preserve legacy drafts, but never silently drop a known unfinished image.
  if (step.imageState !== undefined) {
    const state = step.imageState;
    if (!state || typeof state !== "object" || !["ready", "none"].includes(state.status)) return null;
    if (state.status === "ready" && typeof step.screenshotId !== "string") return null;
    if (state.status === "none" && step.screenshotId !== undefined) return null;
  }
  const clean = {
    id: step.id,
    order: step.order,
    instruction: step.instruction,
    ...(typeof step.screenshotId === "string" ? { screenshotId: step.screenshotId } : {})
  };
  return clean;
}

function cleanBranding(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !["themeColor", "logoDataUrl"].includes(key))) return null;
  const themeColor = value.themeColor ?? "#087f7a";
  if (typeof themeColor !== "string" || !/^#[0-9a-f]{6}$/i.test(themeColor)) return null;
  if (value.logoDataUrl !== undefined && (typeof value.logoDataUrl !== "string" || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value.logoDataUrl) || value.logoDataUrl.length > Math.ceil(CLOUD_CLAIM_MAX_ASSET_BYTES / 3) * 4 + 40)) return null;
  return { themeColor: themeColor.toLowerCase(), hasLogo: value.logoDataUrl !== undefined };
}

export function cleanDraft(draft) {
  if (!draft || typeof draft !== "object" || !Array.isArray(draft.steps) || !Array.isArray(draft.screenshots)) return null;
  if (typeof draft.title !== "string" || typeof draft.description !== "string" || draft.steps.length > 200 || draft.screenshots.length > CLOUD_CLAIM_MAX_ASSETS) return null;
  const title = draft.title.trim();
  const description = draft.description;
  const steps = draft.steps.map(cleanStep);
  const screenshots = draft.screenshots.map((screenshot) => {
    if (typeof screenshot?.id !== "string" || !screenshot.id || !Array.isArray(screenshot.masks)) return null;
    const masks = screenshot.masks.map((mask) => ({
      x: Number(mask?.x), y: Number(mask?.y), width: Number(mask?.width), height: Number(mask?.height)
    }));
    if (masks.some((mask) => [mask.x, mask.y, mask.width, mask.height].some((value) => !Number.isFinite(value) || value < 0 || value > 1) || !mask.width || !mask.height || mask.x + mask.width > 1 || mask.y + mask.height > 1)) return null;
    const annotations = normalizeAnnotations(screenshot.annotations);
    if (annotations === null) return null;
    const exportAnnotations = cloudImageLayers({ annotations, masks }).annotations;
    return { id: screenshot.id, masks, ...(exportAnnotations.length ? { annotations: exportAnnotations } : {}) };
  });
  const screenshotIds = new Set();
  for (const screenshot of screenshots) {
    if (!screenshot || screenshotIds.has(screenshot.id)) return null;
    screenshotIds.add(screenshot.id);
  }
  const stepIds = new Set();
  for (const step of steps) {
    if (!step || stepIds.has(step.id)) return null;
    stepIds.add(step.id);
    if (step.screenshotId !== undefined && !screenshotIds.has(step.screenshotId)) return null;
  }
  if (!title || Array.from(title).length > 64 || Array.from(description).length > 10000 || steps.some((step) => !step) || screenshots.some((screenshot) => !screenshot)) return null;
  const referenced = new Set(steps.map((step) => step.screenshotId).filter(Boolean));
  if (draft.screenshots.some((screenshot) => referenced.has(screenshot.id) && screenshot.privacyReview?.reviewRequired === true)) return null;
  const screenshotById = new Map(screenshots.map((screenshot) => [screenshot.id, screenshot]));
  const cloudSteps = steps.map((step) => {
    const annotations = screenshotById.get(step.screenshotId)?.annotations || [];
    return { ...step, ...(annotations.length ? { annotations } : {}) };
  });
  const branding = draft.branding === undefined ? undefined : cleanBranding(draft.branding);
  if (branding === null) return null;
  return { title, description, steps: cloudSteps, screenshots: screenshots.filter((screenshot) => referenced.has(screenshot.id)), ...(branding ? { branding } : {}) };
}

function base64ToBytes(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!match) throw new TypeError("unsupported screenshot");
  const binary = atob(match[2]);
  if (binary.length > CLOUD_CLAIM_MAX_ASSET_BYTES * 2) throw new Error("ASSET_TOO_LARGE");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { bytes, type: match[1] };
}

async function maskAndEncode(screenshot) {
  if (typeof OffscreenCanvas !== "function" || typeof createImageBitmap !== "function" || typeof Blob !== "function") throw new Error("MASK_RENDER_UNAVAILABLE");
  const { bytes: original, type: originalType } = base64ToBytes(screenshot.dataUrl);
  const bitmap = await createImageBitmap(new Blob([original], { type: originalType }));
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { alpha: true, willReadFrequently: originalType !== "image/jpeg" });
    if (!context) throw new Error("MASK_RENDER_UNAVAILABLE");
    const annotations = normalizeAnnotations(screenshot.annotations);
    if (annotations === null) throw new TypeError("invalid annotations");
    // PNG and WebP may contain transparent pixels. Inspect the source before
    // drawing annotations/masks so an oversized transparent asset cannot be
    // silently flattened through the JPEG fallback.
    context.clearRect(0, 0, bitmap.width, bitmap.height);
    context.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);
    let hasTransparency = false;
    if (originalType !== "image/jpeg") {
      const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] !== 255) {
          hasTransparency = true;
          break;
        }
      }
    }
    const layers = cloudImageLayers(screenshot);
    // Annotations covered by a redaction never survive as metadata or reappear
    // over the burned mask. Preserve annotations → masks painter order.
    drawScreenshot(context, bitmap, { annotations: layers.baseAnnotations, masks: layers.masks });
    const png = await canvas.convertToBlob({ type: "image/png" });
    if (png.size <= CLOUD_CLAIM_MAX_ASSET_BYTES) return { bytes: new Uint8Array(await png.arrayBuffer()), contentType: "image/png" };
    if (hasTransparency) throw new Error("ASSET_TOO_LARGE");
    for (const quality of [0.92, 0.8, 0.65, 0.5, 0.35]) {
      const jpeg = await canvas.convertToBlob({ type: "image/jpeg", quality });
      if (jpeg.size <= CLOUD_CLAIM_MAX_ASSET_BYTES) return { bytes: new Uint8Array(await jpeg.arrayBuffer()), contentType: "image/jpeg" };
    }
    throw new Error("ASSET_TOO_LARGE");
  } finally {
    bitmap.close?.();
  }
}

async function encodeLogo(dataUrl) {
  if (typeof OffscreenCanvas !== "function" || typeof createImageBitmap !== "function") throw new Error("MASK_RENDER_UNAVAILABLE");
  const { bytes, type } = base64ToBytes(dataUrl);
  if (bytes.length > CLOUD_CLAIM_MAX_ASSET_BYTES) throw new Error("ASSET_TOO_LARGE");
  const bitmap = await createImageBitmap(new Blob([bytes], { type }));
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width > 16384 || bitmap.height > 16384 || bitmap.width * bitmap.height > 40_000_000) throw new Error("ASSET_TOO_LARGE");
    const scale = Math.min(1, 2048 / bitmap.width, 2048 / bitmap.height, Math.sqrt(4_000_000 / (bitmap.width * bitmap.height)));
    const canvas = new OffscreenCanvas(Math.max(1, Math.floor(bitmap.width * scale)), Math.max(1, Math.floor(bitmap.height * scale)));
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("MASK_RENDER_UNAVAILABLE");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const format of [{ type: "image/png" }, ...[.92, .8, .65, .5, .35].map((quality) => ({ type: "image/webp", quality }))]) {
      const blob = await canvas.convertToBlob(format);
      if (blob.size <= 1024 * 1024 && ["image/png", "image/webp"].includes(blob.type)) return { bytes: new Uint8Array(await blob.arrayBuffer()), contentType: blob.type };
    }
    throw new Error("ASSET_TOO_LARGE");
  } finally { bitmap.close?.(); }
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function removeTransfer(key, transfer) {
  if (transfers.get(key) !== transfer) return false;
  transfers.delete(key);
  transferBytesTotal = Math.max(0, transferBytesTotal - transfer.bytes.byteLength);
  return true;
}

function transferFor(handoffId, assetSlot) {
  const key = `${handoffId}:${assetSlot}`;
  const transfer = transfers.get(key);
  if (transfer && transfer.expiresAt > Date.now()) return transfer;
  if (transfer) removeTransfer(key, transfer);
  return null;
}

function cleanupTransfers() {
  for (const [key, value] of transfers) if (value.expiresAt <= Date.now()) removeTransfer(key, value);
  for (const [key, value] of snapshots) if (value.expiresAt <= Date.now()) { snapshotBytesTotal = Math.max(0, snapshotBytesTotal - value.estimatedBytes); snapshots.delete(key); }
}

function clearClaimRuntime(handoffId) {
  for (const [key, value] of transfers) {
    if (!key.startsWith(`${handoffId}:`)) continue;
    removeTransfer(key, value);
  }
  const snapshot = snapshots.get(handoffId);
  if (snapshot) {
    snapshotBytesTotal = Math.max(0, snapshotBytesTotal - snapshot.estimatedBytes);
    snapshots.delete(handoffId);
  }
}

async function prepare(message, sender) {
  if (!validRequest(message, sender, "handoff.prepare")) return reject("HANDOFF_REQUEST_REJECTED");
  const metadata = await readHandoff(message.handoffId);
  if (!metadata || !sameIntent(metadata, message)) return reject("HANDOFF_EXPIRED_OR_UNKNOWN");
  if (!await validOfficeCoordinator(metadata, message, sender)) return reject("HANDOFF_EXPIRED_OR_UNKNOWN");
  if (!DRAFT_FINGERPRINT_PATTERN.test(metadata.draftFingerprint || "")) return reject("DRAFT_FINGERPRINT_REQUIRED");
  if (await hasOtherPendingClaim(metadata.draftId, metadata.handoffId)) return reject("DRAFT_CLAIM_PENDING");
  const draft = await draftStore.get(metadata.draftId);
  if (!draft) return reject("DRAFT_CHANGED");
  const contentFingerprint = await fingerprintDraft(draft);
  if (metadata.draftFingerprint !== contentFingerprint) {
    const legacyFingerprint = await legacyFingerprintDraft(draft);
    if (metadata.draftFingerprint !== legacyFingerprint) return reject("DRAFT_CHANGED");
  }
  const draftFingerprint = metadata.draftFingerprint;
  const stored = await chrome.storage.local.get(cloudRefStorageKey(metadata.draftId));
  const cloudRef = stored?.[cloudRefStorageKey(metadata.draftId)] || draft.cloudRef || null;
  // Old clients may have a confirmed manual but no revision receipt. Never duplicate it.
  if (cloudRef && !validCloudRef(cloudRef)) return reject("CLOUD_REFERENCE_INCOMPLETE");
  const clean = cleanDraft(draft);
  if (!clean) return reject("DRAFT_INVALID");
  const sourceById = new Map(draft.screenshots.map((screenshot) => [screenshot.id, screenshot]));
  const referencedScreenshots = clean.screenshots.map((screenshot) => structuredClone(sourceById.get(screenshot.id)));
  const logoDataUrl = clean.branding?.hasLogo ? draft.branding.logoDataUrl : null;
  const estimatedBytes = referencedScreenshots.reduce((total, screenshot) => total + Math.ceil(String(screenshot?.dataUrl || "").length * 0.75), Math.ceil((logoDataUrl?.length || 0) * 0.75));
  cleanupTransfers();
  if (estimatedBytes > CLOUD_CLAIM_MAX_TOTAL_BYTES) return reject("CLAIM_TOO_LARGE");
  const previous = snapshots.get(message.handoffId);
  const previousBytes = previous?.estimatedBytes || 0;
  if (snapshotBytesTotal - previousBytes + estimatedBytes > CLOUD_CLAIM_MAX_TOTAL_BYTES) return reject("CLAIM_TOO_LARGE");
  if (previous) snapshotBytesTotal = Math.max(0, snapshotBytesTotal - previousBytes);
  const assets = clean.screenshots.map((screenshot, assetSlot) => ({ assetSlot, screenshotId: screenshot.id }));
  snapshots.set(message.handoffId, { draftId: metadata.draftId, draftUpdatedAt: draft.updatedAt, draftFingerprint, draft: clean, screenshots: referencedScreenshots, logoDataUrl, estimatedBytes, expiresAt: Date.now() + TRANSFER_TTL_MS });
  snapshotBytesTotal += estimatedBytes;
  return { ok: true, status: "ready", draft: { title: clean.title, description: clean.description, steps: clean.steps, ...(clean.branding ? { branding: clean.branding } : {}) }, assets, draftUpdatedAt: draft.updatedAt, draftFingerprint, ...(cloudRef ? { cloudRef } : {}) };
}

async function begin(message, sender) {
  if (!validRequest(message, sender, "handoff.begin")) return reject("HANDOFF_REQUEST_REJECTED");
  const handoffId = message.handoffId;
  const previous = beginLocks.get(handoffId) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  beginLocks.set(handoffId, queued);
  await previous;
  try {
    const key = handoffStorageKey(handoffId);
    const result = await chrome.storage.local.get(key);
    const metadata = result?.[key];
    if (!metadata || metadata.handoffId !== handoffId || !sameIntent(metadata, message) || !DRAFT_FINGERPRINT_PATTERN.test(metadata.draftFingerprint || "") || !await validOfficeCoordinator(metadata, message, sender)) return reject("HANDOFF_EXPIRED_OR_UNKNOWN");
    if (metadata.status === "superseded") return reject("DRAFT_CLOUD_CHANGED");
    if (metadata.status === "expired") return reject("HANDOFF_EXPIRED_OR_UNKNOWN");
    const expiresAt = Date.parse(metadata.expiresAt || "");
    if (!Number.isFinite(expiresAt)) return reject("HANDOFF_EXPIRED_OR_UNKNOWN");
    if (OPERATION_ID_PATTERN.test(metadata.operationId || "")) {
      return { ok: true, status: expiresAt >= Date.now() ? "active" : "expired", operationId: metadata.operationId, expiresAt: metadata.expiresAt };
    }
    if (expiresAt < Date.now()) return reject("HANDOFF_EXPIRED_OR_UNKNOWN");
    const operationId = createOperationId();
    await chrome.storage.local.set({ [key]: { ...metadata, operationId } });
    return { ok: true, status: "active", operationId, expiresAt: metadata.expiresAt };
  } finally {
    release();
    if (beginLocks.get(handoffId) === queued) beginLocks.delete(handoffId);
  }
}

async function startAsset(message, sender) {
  const isLogo = message.type === "handoff.logo.start";
  if (!validRequest(message, sender, isLogo ? "handoff.logo.start" : "handoff.asset.start") || (!isLogo && (!Number.isInteger(message.assetSlot) || message.assetSlot < 0 || message.assetSlot >= CLOUD_CLAIM_MAX_ASSETS))) return reject("HANDOFF_REQUEST_REJECTED");
  const assetSlot = isLogo ? "logo" : message.assetSlot;
  const transferKey = `${message.handoffId}:${assetSlot}`;
  const previous = assetStartLocks.get(transferKey) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  assetStartLocks.set(transferKey, queued);
  await previous;
  let reservedBytes = 0;
  try {
    cleanupTransfers();
    const metadata = await readHandoff(message.handoffId);
    if (!metadata || !sameIntent(metadata, message) || !await validOfficeCoordinator(metadata, message, sender)) return reject("HANDOFF_EXPIRED_OR_UNKNOWN");
    if (!DRAFT_FINGERPRINT_PATTERN.test(metadata.draftFingerprint || "")) return reject("DRAFT_FINGERPRINT_REQUIRED");
    const snapshot = snapshots.get(message.handoffId);
    if (!snapshot || snapshot.expiresAt <= Date.now() || snapshot.draftId !== metadata.draftId || (metadata.draftFingerprint && snapshot.draftFingerprint !== metadata.draftFingerprint)) return reject("DRAFT_CHANGED");
    const screenshot = snapshot.screenshots?.[message.assetSlot];
    if (isLogo ? !snapshot.logoDataUrl : (!screenshot || !snapshot.draft.screenshots[message.assetSlot] || snapshot.draft.screenshots[message.assetSlot].id !== screenshot.id)) return reject("DRAFT_INVALID");
    const encoded = isLogo ? await encodeLogo(snapshot.logoDataUrl) : await maskAndEncode(screenshot);
    const { bytes, contentType } = encoded;
    const totalBytes = bytes.byteLength;
    if (totalBytes > CLOUD_CLAIM_MAX_ASSET_BYTES) return reject("ASSET_TOO_LARGE");
    const digest = await sha256(bytes);
    cleanupTransfers();
    const existing = transfers.get(transferKey);
    const existingBytes = existing?.bytes.byteLength || 0;
    if (transferBytesTotal - existingBytes + transferBytesReserved + totalBytes > CLOUD_CLAIM_MAX_TOTAL_BYTES) return reject("CLAIM_TOO_LARGE");
    reservedBytes = Math.max(0, totalBytes - existingBytes);
    transferBytesReserved += reservedBytes;
    if (existing) removeTransfer(transferKey, existing);
    transfers.set(transferKey, { bytes, digest, contentType, nextSequence: 0, expiresAt: Date.now() + TRANSFER_TTL_MS });
    transferBytesTotal += totalBytes;
    return { ok: true, status: "staged-source", ...(isLogo ? {} : { assetSlot: message.assetSlot }), contentType, byteLength: totalBytes, sha256: digest, chunkSize: CLOUD_CLAIM_CHUNK_BYTES, totalChunks: Math.ceil(totalBytes / CLOUD_CLAIM_CHUNK_BYTES) };
  } finally {
    transferBytesReserved = Math.max(0, transferBytesReserved - reservedBytes);
    release();
    if (assetStartLocks.get(transferKey) === queued) assetStartLocks.delete(transferKey);
  }
}

async function assetChunk(message, sender) {
  const isLogo = message.type === "handoff.logo.chunk";
  if (!validRequest(message, sender, isLogo ? "handoff.logo.chunk" : "handoff.asset.chunk") || (!isLogo && !Number.isInteger(message.assetSlot)) || !Number.isInteger(message.sequence) || message.sequence < 0) return reject("HANDOFF_REQUEST_REJECTED");
  const assetSlot = isLogo ? "logo" : message.assetSlot;
  const transferKey = `${message.handoffId}:${assetSlot}`;
  const previous = assetStartLocks.get(transferKey) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  assetStartLocks.set(transferKey, queued);
  await previous;
  try {
    cleanupTransfers();
    const transfer = transferFor(message.handoffId, assetSlot);
    if (!transfer || message.sequence !== transfer.nextSequence) return reject("CHUNK_SEQUENCE_INVALID");
    const metadata = await readHandoff(message.handoffId);
    if (!metadata || !sameIntent(metadata, message) || metadata.status === "completed" || !await validOfficeCoordinator(metadata, message, sender)) return reject("HANDOFF_EXPIRED_OR_UNKNOWN");
    if (transferFor(message.handoffId, assetSlot) !== transfer || message.sequence !== transfer.nextSequence) return reject("CHUNK_SEQUENCE_INVALID");
    const totalChunks = Math.ceil(transfer.bytes.byteLength / CLOUD_CLAIM_CHUNK_BYTES);
    if (message.sequence >= totalChunks) return reject("CHUNK_SEQUENCE_INVALID");
    const start = message.sequence * CLOUD_CLAIM_CHUNK_BYTES;
    const chunk = transfer.bytes.slice(start, start + CLOUD_CLAIM_CHUNK_BYTES);
    transfer.nextSequence += 1;
    const done = start + chunk.byteLength === transfer.bytes.byteLength;
    const result = { ok: true, ...(isLogo ? {} : { assetSlot: message.assetSlot }), sequence: message.sequence, totalChunks, chunk: bytesToBase64(chunk), done };
    if (done) removeTransfer(transferKey, transfer);
    return result;
  } finally {
    release();
    if (assetStartLocks.get(transferKey) === queued) assetStartLocks.delete(transferKey);
  }
}

async function finalizePending(message, sender) {
  if (!validRequest(message, sender, "handoff.finalize-pending") || !validRecoveryIdentity(message) || (message.cloudRef !== undefined && message.cloudRef !== null && !validCloudRef(message.cloudRef))) return reject("HANDOFF_REQUEST_REJECTED");
  const handoffId = message.handoffId;
  const previous = finalizeLocks.get(handoffId) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  finalizeLocks.set(handoffId, queued);
  await previous;
  const identityPrevious = beginLocks.get(handoffId) || Promise.resolve();
  let identityRelease;
  const identityCurrent = new Promise((resolve) => { identityRelease = resolve; });
  const identityQueued = identityPrevious.then(() => identityCurrent);
  beginLocks.set(handoffId, identityQueued);
  await identityPrevious;
  try {
    const key = handoffStorageKey(handoffId);
    const result = await chrome.storage.local.get(key);
    const metadata = result?.[key];
    if (!metadata || metadata.handoffId !== handoffId || !sameIntent(metadata, message) || !DRAFT_FINGERPRINT_PATTERN.test(metadata.draftFingerprint || "") || !await validOfficeCoordinator(metadata, message, sender)) return reject("HANDOFF_EXPIRED_OR_UNKNOWN");
    if (metadata.status === "superseded") return reject("DRAFT_CLOUD_CHANGED");
    if (metadata.status === "expired") return reject("HANDOFF_EXPIRED_OR_UNKNOWN");
    if (metadata.draftFingerprint !== message.draftFingerprint) return reject("DRAFT_CHANGED");
    if (metadata.operationId && metadata.operationId !== message.operationId) return reject("RECOVERY_MISMATCH");
    if (metadata.status === "finalize-pending" || metadata.status === "completion-pending" || metadata.status === "completed") {
      if (metadata.operationId !== message.operationId || metadata.claimIntentId !== message.claimIntentId) return reject("RECOVERY_MISMATCH");
      if (metadata.status === "finalize-pending") return await withDraftCloudStateLock(metadata.draftId, async () => {
        if (await hasOtherPendingClaim(metadata.draftId, metadata.handoffId)) return reject("DRAFT_CLAIM_PENDING");
        const currentReceipt = await currentCloudReceipt(metadata.draftId);
        if (currentReceipt && !validCloudRef(currentReceipt)) return reject("CLOUD_REFERENCE_INCOMPLETE");
        if (cloudRefIdentity(currentReceipt) !== cloudRefIdentity(metadata.sourceCloudRef) || cloudRefIdentity(message.cloudRef) !== cloudRefIdentity(metadata.sourceCloudRef)) return reject("DRAFT_CLOUD_CHANGED");
        return { ok: true, status: metadata.status };
      });
      return { ok: true, status: metadata.status };
    }
    if (!isFresh(metadata)) return reject("HANDOFF_EXPIRED_OR_UNKNOWN");
    return await withDraftCloudStateLock(metadata.draftId, async () => {
      const supersede = async (code) => {
        await chrome.storage.local.set({ [key]: { ...metadata, status: "superseded" } });
        return reject(code);
      };
      if (await hasOtherPendingClaim(metadata.draftId, metadata.handoffId)) return supersede("DRAFT_CLAIM_PENDING");
      const currentReceipt = await currentCloudReceipt(metadata.draftId);
      if (currentReceipt && !validCloudRef(currentReceipt)) return reject("CLOUD_REFERENCE_INCOMPLETE");
      // A stale tab may have prepared a brand-new claim before another handoff
      // completed. It must re-prepare against that receipt instead of finalizing.
      if (cloudRefIdentity(currentReceipt) !== cloudRefIdentity(message.cloudRef)) return supersede("DRAFT_CLOUD_CHANGED");
      await chrome.storage.local.set({
        [key]: {
          ...metadata,
          status: "finalize-pending",
          operationId: message.operationId,
          claimIntentId: message.claimIntentId,
          draftFingerprint: message.draftFingerprint,
          sourceCloudRef: currentReceipt,
          finalizePendingAt: new Date().toISOString()
        }
      });
      return { ok: true, status: "finalize-pending" };
    });
  } finally {
    identityRelease();
    if (beginLocks.get(handoffId) === identityQueued) beginLocks.delete(handoffId);
    release();
    if (finalizeLocks.get(handoffId) === queued) finalizeLocks.delete(handoffId);
  }
}

async function recovery(message, sender) {
  if (!validRequest(message, sender, "handoff.recovery")) return reject("HANDOFF_REQUEST_REJECTED");
  const key = handoffStorageKey(message.handoffId);
  const result = await chrome.storage.local.get(key);
  const metadata = result?.[key];
  if (!metadata || metadata.handoffId !== message.handoffId || !sameIntent(metadata, message) || !["finalize-pending", "completion-pending", "completed", "expired"].includes(metadata.status) || !validRecoveryIdentity(metadata)) return reject("RECOVERY_NOT_FOUND");
  return {
    ok: true,
    status: metadata.status,
    operationId: metadata.operationId,
    claimIntentId: metadata.claimIntentId,
    draftFingerprint: metadata.draftFingerprint,
    expiresAt: metadata.expiresAt,
    ...(metadata.completedManualId ? { manualId: metadata.completedManualId } : {})
  };
}

async function expired(message, sender) {
  if (!validRequest(message, sender, "handoff.expired") || !validRecoveryIdentity(message)) return reject("HANDOFF_REQUEST_REJECTED");
  const handoffId = message.handoffId;
  const previous = finalizeLocks.get(handoffId) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  finalizeLocks.set(handoffId, queued);
  await previous;
  try {
    const key = handoffStorageKey(handoffId);
    const metadata = (await chrome.storage.local.get(key))?.[key];
    if (!metadata || metadata.handoffId !== handoffId || !sameIntent(metadata, message) || !["finalize-pending", "expired"].includes(metadata.status)) return reject("RECOVERY_NOT_FOUND");
    if (!validRecoveryIdentity(metadata) || metadata.operationId !== message.operationId || metadata.claimIntentId !== message.claimIntentId || metadata.draftFingerprint !== message.draftFingerprint) return reject("RECOVERY_MISMATCH");
    // As with completion, only the trusted Web/Access coordinator transports
    // the authenticated server result. The extension never fetches credentials
    // or cloud APIs, and local expiry alone cannot release an unknown outcome.
    const result = message.claimResult;
    if (!result || typeof result !== "object" || Array.isArray(result)
      || Object.keys(result).some((key) => !["status", "claimIntentId", "operationId", "workspaceId", "expiresAt"].includes(key))
      || result.status !== "expired" || result.claimIntentId !== metadata.claimIntentId || result.operationId !== metadata.operationId
      || !CLAIM_INTENT_ID_PATTERN.test(result.workspaceId || "") || !Number.isFinite(Date.parse(result.expiresAt || ""))
      || (metadata.sourceCloudRef && result.workspaceId !== metadata.sourceCloudRef.workspaceId)) return reject("RECOVERY_UNCONFIRMED");
    return await withDraftCloudStateLock(metadata.draftId, async () => {
      await chrome.storage.local.set({ [key]: { ...metadata, status: "expired" } });
      clearClaimRuntime(handoffId);
      return { ok: true, status: "expired" };
    });
  } finally {
    release();
    if (finalizeLocks.get(handoffId) === queued) finalizeLocks.delete(handoffId);
  }
}

async function completed(message, sender) {
  if (!validRequest(message, sender, "handoff.completed") || typeof message.manualId !== "string" || message.manualId.length < 1 || message.manualId.length > 128) return reject("HANDOFF_REQUEST_REJECTED");
  if (message.cloudRef !== undefined && !validCloudRef(message.cloudRef, message.manualId)) return reject("HANDOFF_REQUEST_REJECTED");
  if (message.action === "office" && (!validRecoveryIdentity(message) || !validCloudRef(message.cloudRef, message.manualId))) return reject("RECOVERY_IDENTITY_REQUIRED");
  const handoffId = message.handoffId;
  const previous = finalizeLocks.get(handoffId) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  finalizeLocks.set(handoffId, queued);
  await previous;
  try {
    const key = handoffStorageKey(handoffId);
    const result = await chrome.storage.local.get(key);
    const metadata = result?.[key];
    if (!metadata || metadata.handoffId !== handoffId || !sameIntent(metadata, message) || !await validOfficeCoordinator(metadata, message, sender)) return reject("HANDOFF_EXPIRED_OR_UNKNOWN");
    if (metadata.status === "expired" || metadata.status === "superseded") return reject("HANDOFF_EXPIRED_OR_UNKNOWN");
    if (!DRAFT_FINGERPRINT_PATTERN.test(metadata.draftFingerprint || "")) return reject("DRAFT_FINGERPRINT_REQUIRED");
    if (message.action === "office" && !["finalize-pending", "completion-pending", "completed"].includes(metadata.status)) return reject("RECOVERY_MISMATCH");
    if (metadata.status === "completed") {
      if (message.action === "office" || metadata.operationId || metadata.claimIntentId) {
        if (!validRecoveryIdentity(message) || metadata.operationId !== message.operationId || metadata.claimIntentId !== message.claimIntentId || metadata.draftFingerprint !== message.draftFingerprint) return reject("RECOVERY_MISMATCH");
      }
      return metadata.completedManualId === message.manualId ? { ok: true, status: "completed" } : reject("COMPLETION_MISMATCH");
    }
    const recovery = metadata.status === "finalize-pending";
    if (recovery) {
      if (!validRecoveryIdentity(message) || metadata.operationId !== message.operationId || metadata.claimIntentId !== message.claimIntentId || metadata.draftFingerprint !== message.draftFingerprint) return reject("RECOVERY_MISMATCH");
    } else if (message.action === "office" || message.operationId || message.claimIntentId || message.draftFingerprint) {
      if (!validRecoveryIdentity(message) || (metadata.operationId && metadata.operationId !== message.operationId) || (metadata.claimIntentId && metadata.claimIntentId !== message.claimIntentId) || metadata.draftFingerprint !== message.draftFingerprint) return reject("RECOVERY_MISMATCH");
    }
    if (metadata.status === "completion-pending" && metadata.completedManualId !== message.manualId) return reject("COMPLETION_MISMATCH");
    if (!recovery && metadata.status !== "completion-pending" && !isFresh(metadata)) return reject("HANDOFF_EXPIRED_OR_UNKNOWN");
    if (!metadata.draftUpdatedAt) return reject("DRAFT_CHANGED");

    const completedAt = metadata.completedAt || new Date().toISOString();
    const pending = {
      ...metadata,
      status: "completion-pending",
      completedManualId: metadata.completedManualId || message.manualId,
      completedAt,
      cloudRef: message.cloudRef ? { ...message.cloudRef, savedFingerprint: metadata.draftFingerprint } : metadata.cloudRef || { manualId: message.manualId }
    };
    if (metadata.status !== "completion-pending") {
      // Persist the claim result before attaching the local cloud receipt. A storage failure
      // keeps the durable identity retryable and must not be treated as a draft edit.
      await chrome.storage.local.set({ [key]: pending });
    }

    await persistCloudReceipt(pending);
    await chrome.storage.local.set({ [key]: { ...pending, status: "completed" } });
    clearClaimRuntime(handoffId);
    return { ok: true, status: "completed" };
  } finally {
    release();
    if (finalizeLocks.get(handoffId) === queued) finalizeLocks.delete(handoffId);
  }
}

async function persistCloudReceipt(pending) {
  return withDraftCloudStateLock(pending.draftId, async () => {
    const cloudKey = cloudRefStorageKey(pending.draftId);
    const existingRef = (await chrome.storage.local.get(cloudKey))?.[cloudKey];
    if (existingRef?.manualId && existingRef.manualId !== pending.completedManualId) throw new Error("COMPLETION_MISMATCH");
    const cloudRef = validCloudRef(existingRef) && (!validCloudRef(pending.cloudRef) || Date.parse(existingRef.updatedAt) > Date.parse(pending.cloudRef.updatedAt)) ? existingRef : pending.cloudRef;
    // A separate durable receipt survives an editor's in-flight autosave of an older draft object.
    await chrome.storage.local.set({ [cloudKey]: cloudRef });
    await retainDraftWithCloudRef(pending.draftId, cloudRef);
  });
}

async function retainDraftWithCloudRef(id, cloudRef) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("meccha-manual-guest", 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("drafts", "readwrite");
      const store = transaction.objectStore("drafts");
      const request = store.get(id);
      request.onsuccess = () => {
        // Preserve concurrent edits, timestamps, annotations and selection. Only attach the receipt.
        if (request.result) store.put({ ...request.result, cloudRef: structuredClone(cloudRef) });
      };
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("DRAFT_SAVE_FAILED"));
    });
  } finally { db.close(); }
}

export async function handleExternalCloudClaimMessage(message, sender) {
  try {
    if (message?.type === "handoff.begin") return await begin(message, sender);
    if (message?.type === "handoff.prepare") return await prepare(message, sender);
    if (message?.type === "handoff.asset.start" || message?.type === "handoff.logo.start") return await startAsset(message, sender);
    if (message?.type === "handoff.asset.chunk" || message?.type === "handoff.logo.chunk") return await assetChunk(message, sender);
    if (message?.type === "handoff.recovery") return await recovery(message, sender);
    if (message?.type === "handoff.finalize-pending") return await finalizePending(message, sender);
    if (message?.type === "handoff.expired") return await expired(message, sender);
    if (message?.type === "handoff.completed") return await completed(message, sender);
    return reject("UNKNOWN_MESSAGE");
  } catch (error) {
    const safeErrors = new Set(["DRAFT_CHANGED", "DRAFT_FINGERPRINT_REQUIRED", "DRAFT_INVALID", "HANDOFF_EXPIRED_OR_UNKNOWN", "MASK_RENDER_UNAVAILABLE", "CLAIM_TOO_LARGE", "ASSET_TOO_LARGE", "CHUNK_SEQUENCE_INVALID", "CLOUD_REFERENCE_INCOMPLETE", "COMPLETION_MISMATCH", "DRAFT_CLAIM_PENDING", "DRAFT_CLOUD_CHANGED"]);
    return reject(safeErrors.has(error?.message) ? error.message : "HANDOFF_FAILED");
  }
}
