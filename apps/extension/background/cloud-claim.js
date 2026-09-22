import { STAGING_ONBOARDING_ORIGIN } from "../onboarding-config.js";
import { draftStore } from "../storage/draft-store.js";
import { canonicalDraftJson, fingerprintDraft, handoffStorageKey } from "../editor/handoff.js";

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
    "handoff.begin": ["schema", "type", "handoffId", "action"],
    "handoff.prepare": ["schema", "type", "handoffId", "action"],
    "handoff.asset.start": ["schema", "type", "handoffId", "action", "assetSlot"],
    "handoff.asset.chunk": ["schema", "type", "handoffId", "action", "assetSlot", "sequence"],
    "handoff.recovery": ["schema", "type", "handoffId", "action"],
    "handoff.finalize-pending": ["schema", "type", "handoffId", "action", "operationId", "claimIntentId", "draftFingerprint"],
    "handoff.completed": ["schema", "type", "handoffId", "action", "manualId", "operationId", "claimIntentId", "draftFingerprint"]
  }[type];
  return Boolean(allowed && Object.keys(message || {}).every((key) => allowed.includes(key)));
}

function exactSenderOrigin(sender) {
  try {
    const url = new URL(sender?.url || "");
    return url.origin === STAGING_ONBOARDING_ORIGIN && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validRequest(message, sender, type) {
  return exactSenderOrigin(sender) && safeMessage(message, type) && validSchema(message) && message?.type === type && validHandoffId(message?.handoffId) && message?.action === "save";
}

function isFresh(metadata, now = Date.now()) {
  const expiresAt = Date.parse(metadata?.expiresAt || "");
  return Number.isFinite(expiresAt) && expiresAt >= now;
}

async function readHandoff(handoffId) {
  const key = handoffStorageKey(handoffId);
  const result = await chrome.storage.local.get(key);
  const metadata = result?.[key];
  if (!metadata || metadata.handoffId !== handoffId || metadata.outputAction !== "save" || !isFresh(metadata)) return null;
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

function cleanStep(step) {
  if (!step || typeof step !== "object" || typeof step.id !== "string" || !step.id || !Number.isInteger(step.order) || step.order < 1 || typeof step.instruction !== "string" || Array.from(step.instruction).length > 500) return null;
  const clean = {
    id: step.id,
    order: step.order,
    instruction: step.instruction,
    ...(typeof step.screenshotId === "string" ? { screenshotId: step.screenshotId } : {})
  };
  return clean;
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
    return { id: screenshot.id, masks };
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
  return { title, description, steps, screenshots };
}

function base64ToBytes(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!match) throw new TypeError("unsupported screenshot");
  const binary = atob(match[2]);
  if (binary.length > CLOUD_CLAIM_MAX_ASSET_BYTES * 2) throw new RangeError("screenshot is too large");
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
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: false });
    if (!context) throw new Error("MASK_RENDER_UNAVAILABLE");
    context.drawImage(bitmap, 0, 0);
    context.fillStyle = "#111827";
    for (const mask of screenshot.masks || []) {
      const values = [mask.x, mask.y, mask.width, mask.height].map(Number);
      if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) throw new TypeError("invalid mask");
      const [x, y, width, height] = values;
      if (!width || !height || x + width > 1 || y + height > 1) throw new TypeError("invalid mask");
      const left = Math.floor(x * bitmap.width);
      const top = Math.floor(y * bitmap.height);
      const right = Math.ceil((x + width) * bitmap.width);
      const bottom = Math.ceil((y + height) * bitmap.height);
      context.fillRect(left, top, right - left, bottom - top);
    }
    const blob = await canvas.convertToBlob({ type: "image/png" });
    if (blob.size > CLOUD_CLAIM_MAX_ASSET_BYTES) throw new RangeError("screenshot is too large");
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap.close?.();
  }
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

function transferFor(handoffId, assetSlot) {
  const key = `${handoffId}:${assetSlot}`;
  const transfer = transfers.get(key);
  if (transfer && transfer.expiresAt > Date.now()) return transfer;
  transfers.delete(key);
  return null;
}

function cleanupTransfers() {
  for (const [key, value] of transfers) if (value.expiresAt <= Date.now()) { transferBytesTotal = Math.max(0, transferBytesTotal - value.bytes.byteLength); transfers.delete(key); }
  for (const [key, value] of snapshots) if (value.expiresAt <= Date.now()) { snapshotBytesTotal = Math.max(0, snapshotBytesTotal - value.estimatedBytes); snapshots.delete(key); }
}

function clearClaimRuntime(handoffId) {
  for (const [key, value] of transfers) {
    if (!key.startsWith(`${handoffId}:`)) continue;
    transferBytesTotal = Math.max(0, transferBytesTotal - value.bytes.byteLength);
    transfers.delete(key);
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
  if (!metadata) return reject("HANDOFF_EXPIRED_OR_UNKNOWN");
  if (!DRAFT_FINGERPRINT_PATTERN.test(metadata.draftFingerprint || "")) return reject("DRAFT_FINGERPRINT_REQUIRED");
  const draft = await draftStore.get(metadata.draftId);
  if (metadata.draftUpdatedAt !== draft?.updatedAt) return reject("DRAFT_CHANGED");
  const draftFingerprint = await fingerprintDraft(draft);
  if (metadata.draftFingerprint && metadata.draftFingerprint !== draftFingerprint) return reject("DRAFT_CHANGED");
  const clean = cleanDraft(draft);
  if (!clean) return reject("DRAFT_INVALID");
  const estimatedBytes = draft.screenshots.reduce((total, screenshot) => total + Math.ceil(String(screenshot?.dataUrl || "").length * 0.75), 0);
  cleanupTransfers();
  if (estimatedBytes > CLOUD_CLAIM_MAX_TOTAL_BYTES) return reject("CLAIM_TOO_LARGE");
  const previous = snapshots.get(message.handoffId);
  const previousBytes = previous?.estimatedBytes || 0;
  if (snapshotBytesTotal - previousBytes + estimatedBytes > CLOUD_CLAIM_MAX_TOTAL_BYTES) return reject("CLAIM_TOO_LARGE");
  if (previous) snapshotBytesTotal = Math.max(0, snapshotBytesTotal - previousBytes);
  const assets = clean.screenshots.map((screenshot, assetSlot) => ({ assetSlot, screenshotId: screenshot.id }));
  snapshots.set(message.handoffId, { draftId: metadata.draftId, draftUpdatedAt: draft.updatedAt, draftFingerprint, draft: clean, screenshots: draft.screenshots, estimatedBytes, expiresAt: Date.now() + TRANSFER_TTL_MS });
  snapshotBytesTotal += estimatedBytes;
  return { ok: true, status: "ready", draft: { title: clean.title, description: clean.description, steps: clean.steps }, assets, draftUpdatedAt: draft.updatedAt, draftFingerprint };
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
    if (!metadata || metadata.handoffId !== handoffId || metadata.outputAction !== "save" || !DRAFT_FINGERPRINT_PATTERN.test(metadata.draftFingerprint || "")) return reject("HANDOFF_EXPIRED_OR_UNKNOWN");
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
  if (!validRequest(message, sender, "handoff.asset.start") || !Number.isInteger(message.assetSlot) || message.assetSlot < 0 || message.assetSlot >= CLOUD_CLAIM_MAX_ASSETS) return reject("HANDOFF_REQUEST_REJECTED");
  const transferKey = `${message.handoffId}:${message.assetSlot}`;
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
    if (!metadata) return reject("HANDOFF_EXPIRED_OR_UNKNOWN");
    if (!DRAFT_FINGERPRINT_PATTERN.test(metadata.draftFingerprint || "")) return reject("DRAFT_FINGERPRINT_REQUIRED");
    const snapshot = snapshots.get(message.handoffId);
    if (!snapshot || snapshot.expiresAt <= Date.now() || snapshot.draftId !== metadata.draftId || snapshot.draftUpdatedAt !== metadata.draftUpdatedAt || (metadata.draftFingerprint && snapshot.draftFingerprint !== metadata.draftFingerprint)) return reject("DRAFT_CHANGED");
    const screenshot = snapshot.screenshots?.[message.assetSlot];
    if (!screenshot || !snapshot.draft.screenshots[message.assetSlot] || snapshot.draft.screenshots[message.assetSlot].id !== screenshot.id) return reject("DRAFT_INVALID");
    const bytes = await maskAndEncode(screenshot);
    const totalBytes = bytes.byteLength;
    if (totalBytes > CLOUD_CLAIM_MAX_ASSET_BYTES) return reject("ASSET_TOO_LARGE");
    const digest = await sha256(bytes);
    cleanupTransfers();
    const existing = transfers.get(transferKey);
    const existingBytes = existing?.bytes.byteLength || 0;
    if (transferBytesTotal - existingBytes + transferBytesReserved + totalBytes > CLOUD_CLAIM_MAX_TOTAL_BYTES) return reject("CLAIM_TOO_LARGE");
    reservedBytes = Math.max(0, totalBytes - existingBytes);
    transferBytesReserved += reservedBytes;
    if (existing) transferBytesTotal = Math.max(0, transferBytesTotal - existingBytes);
    transfers.set(transferKey, { bytes, digest, nextSequence: 0, expiresAt: Date.now() + TRANSFER_TTL_MS });
    transferBytesTotal += totalBytes;
    return { ok: true, status: "staged-source", assetSlot: message.assetSlot, contentType: "image/png", byteLength: totalBytes, sha256: digest, chunkSize: CLOUD_CLAIM_CHUNK_BYTES, totalChunks: Math.ceil(totalBytes / CLOUD_CLAIM_CHUNK_BYTES) };
  } finally {
    transferBytesReserved = Math.max(0, transferBytesReserved - reservedBytes);
    release();
    if (assetStartLocks.get(transferKey) === queued) assetStartLocks.delete(transferKey);
  }
}

async function assetChunk(message, sender) {
  cleanupTransfers();
  if (!validRequest(message, sender, "handoff.asset.chunk") || !Number.isInteger(message.assetSlot) || !Number.isInteger(message.sequence) || message.sequence < 0) return reject("HANDOFF_REQUEST_REJECTED");
  const transfer = transferFor(message.handoffId, message.assetSlot);
  if (!transfer || message.sequence !== transfer.nextSequence) return reject("CHUNK_SEQUENCE_INVALID");
  const metadata = await readHandoff(message.handoffId);
  if (!metadata || metadata.status === "completed") return reject("HANDOFF_EXPIRED_OR_UNKNOWN");
  const totalChunks = Math.ceil(transfer.bytes.byteLength / CLOUD_CLAIM_CHUNK_BYTES);
  if (message.sequence >= totalChunks) return reject("CHUNK_SEQUENCE_INVALID");
  const start = message.sequence * CLOUD_CLAIM_CHUNK_BYTES;
  const chunk = transfer.bytes.slice(start, start + CLOUD_CLAIM_CHUNK_BYTES);
  transfer.nextSequence += 1;
  const done = start + chunk.byteLength === transfer.bytes.byteLength;
  const result = { ok: true, assetSlot: message.assetSlot, sequence: message.sequence, totalChunks, chunk: bytesToBase64(chunk), done };
  if (done) { transferBytesTotal -= transfer.bytes.byteLength; transfers.delete(`${message.handoffId}:${message.assetSlot}`); }
  return result;
}

async function finalizePending(message, sender) {
  if (!validRequest(message, sender, "handoff.finalize-pending") || !validRecoveryIdentity(message)) return reject("HANDOFF_REQUEST_REJECTED");
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
    if (!metadata || metadata.handoffId !== handoffId || metadata.outputAction !== "save" || !DRAFT_FINGERPRINT_PATTERN.test(metadata.draftFingerprint || "")) return reject("HANDOFF_EXPIRED_OR_UNKNOWN");
    if (metadata.draftFingerprint !== message.draftFingerprint) return reject("DRAFT_CHANGED");
    if (metadata.status === "finalize-pending" || metadata.status === "completion-pending" || metadata.status === "completed") {
      if (metadata.operationId !== message.operationId || metadata.claimIntentId !== message.claimIntentId) return reject("RECOVERY_MISMATCH");
      return { ok: true, status: metadata.status };
    }
    if (!isFresh(metadata)) return reject("HANDOFF_EXPIRED_OR_UNKNOWN");
    await chrome.storage.local.set({
      [key]: {
        ...metadata,
        status: "finalize-pending",
        operationId: message.operationId,
        claimIntentId: message.claimIntentId,
        draftFingerprint: message.draftFingerprint,
        finalizePendingAt: new Date().toISOString()
      }
    });
    return { ok: true, status: "finalize-pending" };
  } finally {
    release();
    if (finalizeLocks.get(handoffId) === queued) finalizeLocks.delete(handoffId);
  }
}

async function recovery(message, sender) {
  if (!validRequest(message, sender, "handoff.recovery")) return reject("HANDOFF_REQUEST_REJECTED");
  const key = handoffStorageKey(message.handoffId);
  const result = await chrome.storage.local.get(key);
  const metadata = result?.[key];
  if (!metadata || metadata.handoffId !== message.handoffId || metadata.outputAction !== "save" || !["finalize-pending", "completion-pending", "completed"].includes(metadata.status) || !validRecoveryIdentity(metadata)) return reject("RECOVERY_NOT_FOUND");
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

async function completed(message, sender) {
  if (!validRequest(message, sender, "handoff.completed") || typeof message.manualId !== "string" || message.manualId.length < 1 || message.manualId.length > 128) return reject("HANDOFF_REQUEST_REJECTED");
  const key = handoffStorageKey(message.handoffId);
  const result = await chrome.storage.local.get(key);
  const metadata = result?.[key];
  if (!metadata || metadata.handoffId !== message.handoffId || metadata.outputAction !== "save") return reject("HANDOFF_EXPIRED_OR_UNKNOWN");
  if (!DRAFT_FINGERPRINT_PATTERN.test(metadata.draftFingerprint || "")) return reject("DRAFT_FINGERPRINT_REQUIRED");
  if (metadata.status === "completed") {
    if (metadata.operationId || metadata.claimIntentId) {
      if (!validRecoveryIdentity(message) || metadata.operationId !== message.operationId || metadata.claimIntentId !== message.claimIntentId || metadata.draftFingerprint !== message.draftFingerprint) return reject("RECOVERY_MISMATCH");
    }
    return metadata.completedManualId === message.manualId ? { ok: true, status: "completed" } : reject("COMPLETION_MISMATCH");
  }
  const recovery = metadata.status === "finalize-pending";
  if (recovery) {
    if (!validRecoveryIdentity(message) || metadata.operationId !== message.operationId || metadata.claimIntentId !== message.claimIntentId || metadata.draftFingerprint !== message.draftFingerprint) return reject("RECOVERY_MISMATCH");
  } else if (message.operationId || message.claimIntentId || message.draftFingerprint) {
    if (!validRecoveryIdentity(message) || (metadata.operationId && metadata.operationId !== message.operationId) || (metadata.claimIntentId && metadata.claimIntentId !== message.claimIntentId) || metadata.draftFingerprint !== message.draftFingerprint) return reject("RECOVERY_MISMATCH");
  }
  if (metadata.status === "completion-pending") {
    if (metadata.completedManualId !== message.manualId) return reject("COMPLETION_MISMATCH");
    try {
      const expected = await draftDeleteExpectation(metadata);
      await transactDraftDelete(metadata.draftId, metadata.draftUpdatedAt, expected.canonical);
    } catch (error) { if (error?.message !== "DRAFT_MISSING") throw error; }
    await chrome.storage.local.set({ [key]: { ...metadata, status: "completed" } });
    clearClaimRuntime(message.handoffId);
    return { ok: true, status: "completed" };
  }
  if (!recovery && !isFresh(metadata)) return reject("HANDOFF_EXPIRED_OR_UNKNOWN");
  if (!metadata.draftUpdatedAt) return reject("DRAFT_CHANGED");
  const expected = await draftDeleteExpectation(metadata);
  await chrome.storage.local.set({ [key]: { ...metadata, status: "completion-pending", completedManualId: message.manualId, completedAt: new Date().toISOString() } });
  await transactDraftDelete(metadata.draftId, metadata.draftUpdatedAt, expected.canonical);
  await chrome.storage.local.set({ [key]: { ...metadata, status: "completed", completedManualId: message.manualId, completedAt: new Date().toISOString() } });
  clearClaimRuntime(message.handoffId);
  return { ok: true, status: "completed" };
}

async function draftDeleteExpectation(metadata) {
  const draft = await draftStore.get(metadata.draftId);
  if (!draft) throw new Error("DRAFT_MISSING");
  if (draft.updatedAt !== metadata.draftUpdatedAt) throw new Error("DRAFT_CHANGED");
  const fingerprint = await fingerprintDraft(draft);
  if (metadata.draftFingerprint && metadata.draftFingerprint !== fingerprint) throw new Error("DRAFT_CHANGED");
  return { canonical: canonicalDraftJson(draft), fingerprint };
}

async function transactDraftDelete(id, expectedUpdatedAt, expectedCanonical) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("meccha-manual-guest", 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("drafts", "readwrite");
      const store = transaction.objectStore("drafts");
      let abortReason = "DRAFT_MISSING";
      const request = store.get(id);
      request.onsuccess = () => {
        if (!request.result) { transaction.abort(); return; }
        if (request.result.updatedAt !== expectedUpdatedAt || canonicalDraftJson(request.result) !== expectedCanonical) { abortReason = "DRAFT_CHANGED"; transaction.abort(); return; }
        store.delete(id);
      };
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error(abortReason));
    });
  } finally {
    db.close();
  }
}

export async function handleExternalCloudClaimMessage(message, sender) {
  try {
    if (message?.type === "handoff.begin") return await begin(message, sender);
    if (message?.type === "handoff.prepare") return await prepare(message, sender);
    if (message?.type === "handoff.asset.start") return await startAsset(message, sender);
    if (message?.type === "handoff.asset.chunk") return await assetChunk(message, sender);
    if (message?.type === "handoff.recovery") return await recovery(message, sender);
    if (message?.type === "handoff.finalize-pending") return await finalizePending(message, sender);
    if (message?.type === "handoff.completed") return await completed(message, sender);
    return reject("UNKNOWN_MESSAGE");
  } catch (error) {
    const safeErrors = new Set(["DRAFT_CHANGED", "DRAFT_FINGERPRINT_REQUIRED", "DRAFT_INVALID", "HANDOFF_EXPIRED_OR_UNKNOWN", "MASK_RENDER_UNAVAILABLE", "CLAIM_TOO_LARGE", "ASSET_TOO_LARGE", "CHUNK_SEQUENCE_INVALID"]);
    return reject(safeErrors.has(error?.message) ? error.message : "HANDOFF_FAILED");
  }
}
