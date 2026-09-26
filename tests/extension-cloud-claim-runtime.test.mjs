import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import test from "node:test";
import { chromium } from "@playwright/test";
import { fingerprintDraft, handoffStorageKey } from "../apps/extension/editor/handoff.js";

const STAGING_ORIGIN = "https://meccha-manual-staging.meccha-iiyatsu.com";
const STAGING_URL = `${STAGING_ORIGIN}/onboarding/continue?runtime-test=1`;
const WRONG_ORIGIN_URL = "https://evil.example.test/onboarding/continue?runtime-test=1";
const extensionRoot = resolve(fileURLToPath(new URL("../apps/extension/", import.meta.url)));

function externalPageHtml() {
  return "<!doctype html><meta charset='utf-8'><title>synthetic staging sender</title>";
}

async function createSyntheticPage(context, url) {
  const page = await context.newPage();
  await page.route("**/*", async (route) => {
    if (route.request().url() === url) {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: externalPageHtml()
      });
      return;
    }
    await route.abort();
  });
  await page.goto(url, { waitUntil: "commit" });
  return page;
}

async function createStagingPage(context) {
  return createSyntheticPage(context, STAGING_URL);
}

async function sendExternal(page, extensionId, message) {
  return page.evaluate(({ extensionId: id, message: payload }) => {
    if (typeof chrome?.runtime?.sendMessage !== "function") return { ok: false, error: "RUNTIME_ERROR", detail: "chrome.runtime.sendMessage unavailable" };
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(id, payload, (response) => {
          const runtimeError = chrome.runtime.lastError;
          resolve(runtimeError ? { ok: false, error: "RUNTIME_ERROR", detail: runtimeError.message } : response);
        });
      } catch (error) {
        reject(error);
      }
    });
  }, { extensionId, message });
}

async function openExtensionContext(userDataDir) {
  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      ignoreHTTPSErrors: true,
      args: [`--disable-extensions-except=${extensionRoot}`, `--load-extension=${extensionRoot}`]
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 15_000 });
    const extensionId = new URL(worker.url()).hostname;
    assert.match(extensionId, /^[a-p]{32}$/);
    return { context, worker, extensionId };
  } catch (error) {
    await closeContext(context);
    throw error;
  }
}

async function closeContext(context) {
  if (!context) return;
  let timeout;
  try {
    await Promise.race([
      Promise.resolve().then(() => context.close()).catch(() => undefined),
      new Promise((resolve) => { timeout = setTimeout(resolve, 5_000); })
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function assertRuntimeProfilePath(userDataDir) {
  const resolved = resolve(userDataDir);
  const tempRoot = resolve(tmpdir());
  const relativePath = relative(tempRoot, resolved);
  assert.ok(isAbsolute(resolved), "runtime profile path must be absolute");
  assert.ok(relativePath && relativePath !== ".." && !relativePath.startsWith(`..${sep}`), "runtime profile must stay below the OS temp directory");
  assert.match(basename(resolved), /^meccha-manual-extension-runtime-/);
  return resolved;
}

async function putDraft(worker, draft) {
  await worker.evaluate(async (value) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("meccha-manual-guest", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("drafts", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("drafts", "readwrite");
      transaction.objectStore("drafts").put(structuredClone(value));
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  }, draft);
}

async function getDraft(worker, id) {
  return worker.evaluate(async (draftId) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("meccha-manual-guest", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const result = await new Promise((resolve, reject) => {
      const request = db.transaction("drafts", "readonly").objectStore("drafts").get(draftId);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return result;
  }, id);
}

async function setMetadata(worker, key, metadata) {
  await worker.evaluate(({ storageKey, value }) => new Promise((resolve, reject) => {
    chrome.storage.local.set({ [storageKey]: value }, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message)); else resolve();
    });
  }), { storageKey: key, value: metadata });
}

async function readMetadata(worker, key) {
  return worker.evaluate((storageKey) => new Promise((resolve, reject) => {
    chrome.storage.local.get(storageKey, (result) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message)); else resolve(result?.[storageKey] ?? null);
    });
  }), key);
}

async function failStorageSetOnCall(worker, failureCall = 1) {
  return worker.evaluate((failureCall) => {
    const storage = chrome.storage.local;
    const original = storage.set;
    let calls = 0;
    storage.set = function (...args) {
      calls += 1;
      if (calls === failureCall) {
        storage.set = original;
        return Promise.reject(new Error("INJECTED_STORAGE_FAILURE"));
      }
      return original.apply(storage, args);
    };
    return true;
  }, failureCall);
}

async function failNextStorageSet(worker) {
  return failStorageSetOnCall(worker, 1);
}

async function failNextDraftDeleteTransaction(worker) {
  return worker.evaluate(() => {
    const prototype = IDBObjectStore.prototype;
    if (globalThis.__originalDraftStoreGet) return true;
    const original = prototype.get;
    globalThis.__originalDraftStoreGet = original;
    prototype.get = function (...args) {
      const request = original.apply(this, args);
      const transaction = this.transaction;
      if (this.name === "drafts" && transaction?.mode === "readwrite") queueMicrotask(() => { try { transaction.abort(); } catch {} });
      return request;
    };
    return true;
  });
}

async function restoreDraftDeleteTransaction(worker) {
  return worker.evaluate(() => {
    if (globalThis.__originalDraftStoreGet) {
      IDBObjectStore.prototype.get = globalThis.__originalDraftStoreGet;
      delete globalThis.__originalDraftStoreGet;
    }
    return true;
  });
}

async function createNoisePng(page, width = 384, height = 384) {
  return page.evaluate(({ width, height }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    const image = context.createImageData(width, height);
    let state = 0x9e3779b9;
    for (let index = 0; index < image.data.length; index += 4) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      image.data[index] = state & 0xff;
      image.data[index + 1] = (state >>> 8) & 0xff;
      image.data[index + 2] = (state >>> 16) & 0xff;
      image.data[index + 3] = 255;
    }
    // Values on both sides of the normalized mask are fixed for exact boundary assertions.
    for (const [x, y, red, green, blue] of [[95, 96, 240, 1, 2], [96, 95, 3, 240, 4], [192, 96, 5, 6, 240], [96, 192, 7, 8, 240]]) {
      const offset = (y * width + x) * 4;
      image.data[offset] = red;
      image.data[offset + 1] = green;
      image.data[offset + 2] = blue;
    }
    context.putImageData(image, 0, 0);
    return { dataUrl: canvas.toDataURL("image/png"), width, height };
  }, { width, height });
}

async function decodeSelectedPixels(page, base64) {
  return page.evaluate(async (encoded) => {
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      return {
        size: [bitmap.width, bitmap.height],
        pixels: [[95, 96], [96, 96], [192, 96], [96, 192]].map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data))
      };
    } finally {
      bitmap.close();
    }
  }, base64);
}

test("MV3 cloud claim survives worker restart and TTL recovery while preserving masks/CAS/chunk boundaries", { timeout: 90_000 }, async () => {
  const userDataDir = assertRuntimeProfilePath(await mkdtemp(join(tmpdir(), "meccha-manual-extension-runtime-")));
  let context;
  let worker;
  let extensionId;
  try {
    ({ context, worker, extensionId } = await openExtensionContext(userDataDir));
    const page = await createStagingPage(context);
    const { dataUrl, width, height } = await createNoisePng(page);
    const updatedAt = "2026-09-23T00:00:00.000Z";
    const draft = {
      id: "runtime-claim-draft",
      title: "隔離ランタイム検証",
      description: "合成データのみ",
      updatedAt,
      steps: [{ id: "step-1", order: 1, instruction: "合成操作", screenshotId: "asset-1" }],
      screenshots: [{ id: "asset-1", dataUrl, masks: [{ x: 0.25, y: 0.25, width: 0.25, height: 0.25 }] }]
    };
    const draftFingerprint = await fingerprintDraft(draft);
    const handoffId = "A".repeat(43);
    const storageKey = handoffStorageKey(handoffId);
    let identities;
    const createdAt = "2026-09-23T00:00:00.000Z";
    const originalExpiresAt = new Date(Date.now() + 9 * 60 * 1000).toISOString();
    const metadata = {
      handoffId,
      draftId: draft.id,
      outputAction: "save",
      extensionId,
      createdAt,
      draftUpdatedAt: updatedAt,
      draftFingerprint,
      expiresAt: originalExpiresAt
    };
    await putDraft(worker, draft);
    await setMetadata(worker, storageKey, metadata);

    const secondTab = await createStagingPage(context);
    const beginResults = await Promise.all([
      sendExternal(page, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.begin", handoffId, action: "save" }),
      sendExternal(secondTab, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.begin", handoffId, action: "save" })
    ]);
    assert.equal(beginResults[0].ok, true);
    assert.deepEqual(beginResults[1], beginResults[0], "same handoff tabs must receive one durable operation identity");
    const begunMetadata = await readMetadata(worker, storageKey);
    assert.equal(begunMetadata.operationId, beginResults[0].operationId);
    assert.equal(begunMetadata.expiresAt, originalExpiresAt, "begin must preserve the original TTL");
    const prepared = await sendExternal(page, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.prepare", handoffId, action: "save" });
    assert.equal(prepared.ok, true);
    assert.equal(prepared.status, "ready");
    assert.equal(prepared.draftFingerprint, draftFingerprint);
    assert.equal(prepared.assets[0].assetSlot, 0);
    assert.deepEqual(await getDraft(worker, draft.id), draft, "prepare must retain the local original");

    const started = await sendExternal(page, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.asset.start", handoffId, action: "save", assetSlot: 0 });
    assert.equal(started.ok, true);
    assert.equal(started.contentType, "image/png");
    assert.ok(started.totalChunks >= 2, "synthetic noisy PNG must exercise chunking");
    assert.match(started.sha256, /^[a-f0-9]{64}$/);

    const outOfOrder = await sendExternal(page, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.asset.chunk", handoffId, action: "save", assetSlot: 0, sequence: 1 });
    assert.deepEqual(outOfOrder, { ok: false, error: "CHUNK_SEQUENCE_INVALID" });
    const chunkPages = [page, secondTab];
    const concurrentFirstChunks = await Promise.all(chunkPages.map((chunkPage) => sendExternal(chunkPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.asset.chunk", handoffId, action: "save", assetSlot: 0, sequence: 0 })));
    assert.equal(concurrentFirstChunks.filter((result) => result.ok).length, 1, "parallel tabs must consume one sequence exactly once");
    assert.deepEqual(concurrentFirstChunks.filter((result) => !result.ok), [{ ok: false, error: "CHUNK_SEQUENCE_INVALID" }]);
    const winningChunkPage = chunkPages[concurrentFirstChunks.findIndex((result) => result.ok)];
    const chunks = [];
    chunks.push(concurrentFirstChunks.find((result) => result.ok).chunk);
    for (let sequence = 1; sequence < started.totalChunks; sequence += 1) {
      const result = await sendExternal(winningChunkPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.asset.chunk", handoffId, action: "save", assetSlot: 0, sequence });
      assert.equal(result.ok, true);
      assert.equal(result.sequence, sequence);
      assert.equal(result.done, sequence === started.totalChunks - 1);
      chunks.push(result.chunk);
    }
    await secondTab.close();
    const encoded = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk, "base64"))).toString("base64");
    assert.equal(Buffer.from(encoded, "base64").byteLength, started.byteLength);
    const pixels = await decodeSelectedPixels(page, encoded);
    assert.deepEqual(pixels.size, [width, height]);
    assert.deepEqual(pixels.pixels[0], [240, 1, 2, 255]);
    assert.deepEqual(pixels.pixels[1], [17, 24, 39, 255], "mask begins at floor(x * width), floor(y * height)");
    assert.deepEqual(pixels.pixels[2], [5, 6, 240, 255], "mask ends before ceil((x + width) * imageWidth)");
    assert.deepEqual(pixels.pixels[3], [7, 8, 240, 255], "mask end boundary is exclusive");

    const parallelStarts = await Promise.all(Array.from({ length: 220 }, () => sendExternal(page, extensionId, {
      schema: "meccha-manual/cloud-claim-v1",
      type: "handoff.asset.start",
      handoffId,
      action: "save",
      assetSlot: 0
    })));
    assert.equal(parallelStarts.every((result) => result.ok), true, "same-slot starts must replace one transfer instead of consuming 100MiB repeatedly");
    assert.equal(new Set(parallelStarts.map((result) => result.byteLength)).size, 1);
    const clearStart = parallelStarts[parallelStarts.length - 1];
    for (let sequence = 0; sequence < clearStart.totalChunks; sequence += 1) {
      const result = await sendExternal(page, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.asset.chunk", handoffId, action: "save", assetSlot: 0, sequence });
      assert.equal(result.ok, true);
    }
    const afterClear = await sendExternal(page, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.asset.start", handoffId, action: "save", assetSlot: 0 });
    assert.equal(afterClear.ok, true, "clearing a transfer must restore capacity for the next start");

    identities = [
      { operationId: beginResults[0].operationId, claimIntentId: "00000000-0000-4000-8000-000000000000" },
      { operationId: "P".repeat(43), claimIntentId: "11111111-1111-4111-8111-111111111111" }
    ];
    const finalizePendingResults = await Promise.all(identities.map(({ operationId, claimIntentId }) => sendExternal(page, extensionId, {
      schema: "meccha-manual/cloud-claim-v1",
      type: "handoff.finalize-pending",
      handoffId,
      action: "save",
      operationId,
      claimIntentId,
      draftFingerprint
    })));
    const successfulFinalizePending = finalizePendingResults.filter((result) => result.ok);
    const rejectedFinalizePending = finalizePendingResults.filter((result) => !result.ok);
    assert.equal(successfulFinalizePending.length, 1, "concurrent finalize-pending must commit one identity");
    assert.deepEqual(rejectedFinalizePending, [{ ok: false, error: "RECOVERY_MISMATCH" }]);
    const winningIdentity = identities[finalizePendingResults.findIndex((result) => result.ok)];
    const { operationId, claimIntentId } = winningIdentity;
    const storedFinalizePending = await readMetadata(worker, storageKey);
    assert.equal(storedFinalizePending.status, "finalize-pending");
    assert.equal(storedFinalizePending.operationId, operationId);
    assert.equal(storedFinalizePending.claimIntentId, claimIntentId);
    assert.equal(storedFinalizePending.draftFingerprint, draftFingerprint);

    const rejectedFinalize = await sendExternal(page, extensionId, {
      schema: "meccha-manual/cloud-claim-v1",
      type: "handoff.finalize-pending",
      handoffId,
      action: "save",
      operationId: "Q".repeat(43),
      claimIntentId: "22222222-2222-4222-8222-222222222222",
      draftFingerprint
    });
    assert.deepEqual(rejectedFinalize, { ok: false, error: "RECOVERY_MISMATCH" });
    assert.deepEqual(await readMetadata(worker, storageKey), storedFinalizePending, "mismatched finalize must not overwrite canonical identity");

    const wrongOperation = await sendExternal(page, extensionId, {
      schema: "meccha-manual/cloud-claim-v1",
      type: "handoff.completed",
      handoffId,
      action: "save",
      manualId: "manual-cas-1",
      operationId: identities.find((identity) => identity.operationId !== operationId).operationId,
      claimIntentId,
      draftFingerprint
    });
    assert.deepEqual(wrongOperation, { ok: false, error: "RECOVERY_MISMATCH" });
    const wrongClaimIntent = await sendExternal(page, extensionId, {
      schema: "meccha-manual/cloud-claim-v1",
      type: "handoff.completed",
      handoffId,
      action: "save",
      manualId: "manual-cas-1",
      operationId,
      claimIntentId: identities.find((identity) => identity.claimIntentId !== claimIntentId).claimIntentId,
      draftFingerprint
    });
    assert.deepEqual(wrongClaimIntent, { ok: false, error: "RECOVERY_MISMATCH" });
    const wrongSchema = await sendExternal(page, extensionId, { schema: "wrong/schema", type: "handoff.prepare", handoffId, action: "save" });
    assert.deepEqual(wrongSchema, { ok: false, error: "HANDOFF_REQUEST_REJECTED" });
    const legacyMetadata = { ...metadata };
    delete legacyMetadata.draftFingerprint;
    await setMetadata(worker, storageKey, legacyMetadata);
    const missingFingerprint = await sendExternal(page, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.prepare", handoffId, action: "save" });
    assert.deepEqual(missingFingerprint, { ok: false, error: "DRAFT_FINGERPRINT_REQUIRED" });
    await setMetadata(worker, storageKey, metadata);
    const extensionPage = await context.newPage();
    await extensionPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    const wrongSender = await extensionPage.evaluate(async ({ message }) => {
      const module = await import(chrome.runtime.getURL("background/cloud-claim.js"));
      return module.handleExternalCloudClaimMessage(message, { url: "https://evil.example.test/onboarding/continue" });
    }, { message: { schema: "meccha-manual/cloud-claim-v1", type: "handoff.prepare", handoffId, action: "save" } });
    assert.deepEqual(wrongSender, { ok: false, error: "HANDOFF_REQUEST_REJECTED" });
    const wrongRecoverySender = await extensionPage.evaluate(async ({ message }) => {
      const module = await import(chrome.runtime.getURL("background/cloud-claim.js"));
      return module.handleExternalCloudClaimMessage(message, { url: "https://evil.example.test/onboarding/continue" });
    }, { message: { schema: "meccha-manual/cloud-claim-v1", type: "handoff.recovery", handoffId, action: "save" } });
    assert.deepEqual(wrongRecoverySender, { ok: false, error: "HANDOFF_REQUEST_REJECTED" });
    await extensionPage.close();
    const wrongOriginPage = await createSyntheticPage(context, WRONG_ORIGIN_URL);
    const wrongOriginExternal = await sendExternal(wrongOriginPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.prepare", handoffId, action: "save" });
    assert.equal(wrongOriginExternal.ok, false);
    assert.equal(wrongOriginExternal.error, "RUNTIME_ERROR");
    assert.equal(typeof wrongOriginExternal.detail, "string");
    const retryStarted = await sendExternal(page, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.asset.start", handoffId, action: "save", assetSlot: 0 });
    assert.equal(retryStarted.ok, true, "asset retry is allowed before the handoff expires");
    const expiredAt = new Date(Date.now() - 1).toISOString();
    await setMetadata(worker, storageKey, {
      ...metadata,
      status: "finalize-pending",
      operationId,
      claimIntentId,
      expiresAt: expiredAt,
      finalizePendingAt: new Date(Date.now() - 30_000).toISOString()
    });
    const expired = await sendExternal(page, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.prepare", handoffId, action: "save" });
    assert.deepEqual(expired, { ok: false, error: "HANDOFF_EXPIRED_OR_UNKNOWN" });
    const expiredAsset = await sendExternal(page, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.asset.start", handoffId, action: "save", assetSlot: 0 });
    assert.deepEqual(expiredAsset, { ok: false, error: "HANDOFF_EXPIRED_OR_UNKNOWN" });
    const expiredAssetChunk = await sendExternal(page, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.asset.chunk", handoffId, action: "save", assetSlot: 0, sequence: 0 });
    assert.deepEqual(expiredAssetChunk, { ok: false, error: "HANDOFF_EXPIRED_OR_UNKNOWN" });

    await closeContext(context);
    ({ context, worker, extensionId } = await openExtensionContext(userDataDir));
    const restartedPage = await createStagingPage(context);
    const restartedExpiredPrepare = await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.prepare", handoffId, action: "save" });
    assert.deepEqual(restartedExpiredPrepare, { ok: false, error: "HANDOFF_EXPIRED_OR_UNKNOWN" });
    const restartedExpiredAsset = await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.asset.start", handoffId, action: "save", assetSlot: 0 });
    assert.deepEqual(restartedExpiredAsset, { ok: false, error: "HANDOFF_EXPIRED_OR_UNKNOWN" });
    const recovered = await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.recovery", handoffId, action: "save" });
    assert.deepEqual(recovered, {
      ok: true,
      status: "finalize-pending",
      operationId,
      claimIntentId,
      draftFingerprint,
      expiresAt: expiredAt
    }, "recovery must return the original identity and TTL without extending it");

    const changedDraft = { ...draft, title: "同一ms更新" };
    await putDraft(worker, changedDraft);
    const changedCompletion = await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.completed", handoffId, action: "save", manualId: "manual-cas-1", operationId, claimIntentId, draftFingerprint });
    assert.deepEqual(changedCompletion, { ok: true, status: "completed" });
    assert.equal((await getDraft(worker, draft.id)).title, changedDraft.title, "CAS mismatch must retain the changed local draft");
    assert.equal((await readMetadata(worker, storageKey)).status, "completed", "the confirmed claim must be durably completed after a CAS mismatch");

    const resumedDraft = { ...changedDraft, title: "同一ms再編集" };
    await putDraft(worker, resumedDraft);
    await setMetadata(worker, storageKey, { ...(await readMetadata(worker, storageKey)), status: "completion-pending", completedManualId: "manual-cas-1" });
    const resumedCompletion = await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.completed", handoffId, action: "save", manualId: "manual-cas-1", operationId, claimIntentId, draftFingerprint });
    assert.deepEqual(resumedCompletion, { ok: true, status: "completed" }, "completion-pending retry must complete after retaining an edited draft");
    assert.equal((await getDraft(worker, draft.id)).title, resumedDraft.title, "completion-pending CAS mismatch must retain the edited draft");

    const nextHandoffId = "B".repeat(43);
    const nextStorageKey = handoffStorageKey(nextHandoffId);
    const nextDraftFingerprint = await fingerprintDraft(resumedDraft);
    await worker.evaluate(async ({ key, value }) => chrome.storage.local.set({ [key]: value }), {
        key: nextStorageKey,
        value: {
          handoffId: nextHandoffId,
          draftId: draft.id,
          outputAction: "save",
          draftUpdatedAt: resumedDraft.updatedAt,
          draftFingerprint: nextDraftFingerprint,
          expiresAt: new Date(Date.now() + 60_000).toISOString()
        }
    });
    const nextBegin = await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.begin", handoffId: nextHandoffId, action: "save" });
    assert.equal(nextBegin.ok, true, "a changed draft must be available for a new handoff after the prior claim completes");
    const nextPrepared = await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.prepare", handoffId: nextHandoffId, action: "save" });
    assert.equal(nextPrepared.ok, true);
    const nextClaimIntentId = "33333333-3333-4333-8333-333333333333";
    const nextFinalize = await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.finalize-pending", handoffId: nextHandoffId, action: "save", operationId: nextBegin.operationId, claimIntentId: nextClaimIntentId, draftFingerprint: nextDraftFingerprint });
    assert.deepEqual(nextFinalize, { ok: true, status: "finalize-pending" });
    await failNextStorageSet(worker);
    const storageFailed = await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.completed", handoffId: nextHandoffId, action: "save", manualId: "manual-cas-2", operationId: nextBegin.operationId, claimIntentId: nextClaimIntentId, draftFingerprint: nextDraftFingerprint });
    assert.deepEqual(storageFailed, { ok: false, error: "HANDOFF_FAILED" }, "metadata storage failure must remain a technical failure");
    assert.equal((await readMetadata(worker, nextStorageKey)).status, "finalize-pending");
    assert.equal((await getDraft(worker, draft.id)).title, resumedDraft.title, "metadata storage failure must not delete the local draft");
    const nextCompleted = await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.completed", handoffId: nextHandoffId, action: "save", manualId: "manual-cas-2", operationId: nextBegin.operationId, claimIntentId: nextClaimIntentId, draftFingerprint: nextDraftFingerprint });
    assert.deepEqual(nextCompleted, { ok: true, status: "completed" });
    assert.equal(await getDraft(worker, draft.id), null, "an unchanged draft is removed only after its own claim completes");

    const finalSetDraft = { ...draft, title: "完了保存失敗後の回収" };
    await putDraft(worker, finalSetDraft);
    const finalSetHandoffId = "D".repeat(43);
    const finalSetStorageKey = handoffStorageKey(finalSetHandoffId);
    const finalSetDraftFingerprint = await fingerprintDraft(finalSetDraft);
    await worker.evaluate(async ({ key, value }) => chrome.storage.local.set({ [key]: value }), {
      key: finalSetStorageKey,
      value: { handoffId: finalSetHandoffId, draftId: draft.id, outputAction: "save", draftUpdatedAt: finalSetDraft.updatedAt, draftFingerprint: finalSetDraftFingerprint, expiresAt: new Date(Date.now() + 60_000).toISOString() }
    });
    const finalSetBegin = await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.begin", handoffId: finalSetHandoffId, action: "save" });
    const finalSetClaimIntentId = "55555555-5555-4555-8555-555555555555";
    const finalSetFinalize = await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.finalize-pending", handoffId: finalSetHandoffId, action: "save", operationId: finalSetBegin.operationId, claimIntentId: finalSetClaimIntentId, draftFingerprint: finalSetDraftFingerprint });
    assert.deepEqual(finalSetFinalize, { ok: true, status: "finalize-pending" });
    await failStorageSetOnCall(worker, 2);
    const finalSetFailed = await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.completed", handoffId: finalSetHandoffId, action: "save", manualId: "manual-cas-4", operationId: finalSetBegin.operationId, claimIntentId: finalSetClaimIntentId, draftFingerprint: finalSetDraftFingerprint });
    assert.deepEqual(finalSetFailed, { ok: false, error: "HANDOFF_FAILED" }, "final completed metadata failure must remain retryable");
    assert.equal((await readMetadata(worker, finalSetStorageKey)).status, "completion-pending");
    assert.equal(await getDraft(worker, draft.id), null, "the completed metadata failure occurs after local deletion");
    const finalSetRecovered = await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.completed", handoffId: finalSetHandoffId, action: "save", manualId: "manual-cas-4", operationId: finalSetBegin.operationId, claimIntentId: finalSetClaimIntentId, draftFingerprint: finalSetDraftFingerprint });
    assert.deepEqual(finalSetRecovered, { ok: true, status: "completed" }, "completion-pending retry must accept an already missing original");
    assert.equal((await readMetadata(worker, finalSetStorageKey)).status, "completed");

    const idbDraft = { ...draft, title: "IDB技術障害後の再試行" };
    await putDraft(worker, idbDraft);
    const idbHandoffId = "C".repeat(43);
    const idbStorageKey = handoffStorageKey(idbHandoffId);
    const idbDraftFingerprint = await fingerprintDraft(idbDraft);
    await worker.evaluate(async ({ key, value }) => chrome.storage.local.set({ [key]: value }), {
      key: idbStorageKey,
      value: { handoffId: idbHandoffId, draftId: draft.id, outputAction: "save", draftUpdatedAt: idbDraft.updatedAt, draftFingerprint: idbDraftFingerprint, expiresAt: new Date(Date.now() + 60_000).toISOString() }
    });
    const idbBegin = await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.begin", handoffId: idbHandoffId, action: "save" });
    const idbClaimIntentId = "44444444-4444-4444-8444-444444444444";
    const idbFinalize = await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.finalize-pending", handoffId: idbHandoffId, action: "save", operationId: idbBegin.operationId, claimIntentId: idbClaimIntentId, draftFingerprint: idbDraftFingerprint });
    assert.deepEqual(idbFinalize, { ok: true, status: "finalize-pending" });
    await failNextDraftDeleteTransaction(worker);
    const idbFailed = await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.completed", handoffId: idbHandoffId, action: "save", manualId: "manual-cas-3", operationId: idbBegin.operationId, claimIntentId: idbClaimIntentId, draftFingerprint: idbDraftFingerprint });
    assert.deepEqual(idbFailed, { ok: false, error: "HANDOFF_FAILED" }, "an IndexedDB technical abort must not be classified as a changed draft");
    assert.equal((await readMetadata(worker, idbStorageKey)).status, "completion-pending");
    assert.equal((await getDraft(worker, draft.id)).title, idbDraft.title);
    await restoreDraftDeleteTransaction(worker);
    const idbCompleted = await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.completed", handoffId: idbHandoffId, action: "save", manualId: "manual-cas-3", operationId: idbBegin.operationId, claimIntentId: idbClaimIntentId, draftFingerprint: idbDraftFingerprint });
    assert.deepEqual(idbCompleted, { ok: true, status: "completed" });
    assert.equal(await getDraft(worker, draft.id), null);
    assert.deepEqual(await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.recovery", handoffId, action: "save" }), {
      ok: true,
      status: "completed",
      operationId,
      claimIntentId,
      draftFingerprint,
      manualId: "manual-cas-1",
      expiresAt: expiredAt
    });
    assert.deepEqual(await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.completed", handoffId, action: "save", manualId: "manual-cas-1", operationId, claimIntentId, draftFingerprint }), { ok: true, status: "completed" });
    assert.deepEqual(await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.completed", handoffId, action: "save", manualId: "manual-other", operationId, claimIntentId, draftFingerprint }), { ok: false, error: "COMPLETION_MISMATCH" });
    assert.deepEqual(await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.completed", handoffId, action: "save", manualId: "different-manual", operationId, claimIntentId, draftFingerprint }), { ok: false, error: "COMPLETION_MISMATCH" });
  } finally {
    await closeContext(context);
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined);
  }
});

test("MV3 expired in-flight transfer releases capacity exactly once", { timeout: 120_000 }, async () => {
  const userDataDir = assertRuntimeProfilePath(await mkdtemp(join(tmpdir(), "meccha-manual-extension-runtime-")));
  let context;
  let worker;
  let extensionId;
  try {
    ({ context, worker, extensionId } = await openExtensionContext(userDataDir));
    const page = await createStagingPage(context);
    const { dataUrl } = await createNoisePng(page, 1450, 1450);
    const updatedAt = "2026-09-23T00:00:00.000Z";
    const draft = {
      id: "runtime-transfer-expiry-draft",
      title: "転送期限会計検証",
      description: "合成データのみ",
      updatedAt,
      steps: [],
      screenshots: [{ id: "asset-0", dataUrl, masks: [] }]
    };
    const draftFingerprint = await fingerprintDraft(draft);
    const handoffId = "B".repeat(43);
    const storageKey = handoffStorageKey(handoffId);
    await putDraft(worker, draft);
    await setMetadata(worker, storageKey, {
      handoffId,
      draftId: draft.id,
      outputAction: "save",
      extensionId,
      createdAt: "2026-09-23T00:00:00.000Z",
      draftUpdatedAt: updatedAt,
      draftFingerprint,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
    });
    assert.equal((await sendExternal(page, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.begin", handoffId, action: "save" })).ok, true);
    const prepared = await sendExternal(page, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.prepare", handoffId, action: "save" });
    assert.equal(prepared.ok, true);

    for (let attempt = 0; attempt < 16; attempt += 1) {
      const started = await sendExternal(page, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.asset.start", handoffId, action: "save", assetSlot: 0 });
      assert.equal(started.ok, true);
      assert.ok(started.byteLength > 6 * 1024 * 1024, "fixture must make the total transfer limit observable");
      await worker.evaluate(() => {
        const originalDateNow = Date.now;
        const base = originalDateNow();
        let calls = 0;
        globalThis.__cloudClaimTestOriginalDateNow = originalDateNow;
        // cleanupTransfers and the first transfer lookup stay before expiry; readHandoff then crosses it before the second lookup.
        Date.now = () => (calls++ < 3 ? base : base + 11 * 60 * 1000);
      });
      const expiredChunk = await sendExternal(page, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.asset.chunk", handoffId, action: "save", assetSlot: 0, sequence: 0 });
      assert.deepEqual(expiredChunk, { ok: false, error: "CHUNK_SEQUENCE_INVALID" }, "expiry after the first lookup must remove the in-flight transfer");
      await worker.evaluate(() => {
        Date.now = globalThis.__cloudClaimTestOriginalDateNow;
        delete globalThis.__cloudClaimTestOriginalDateNow;
      });
    }

    const restartedStart = await sendExternal(page, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.asset.start", handoffId, action: "save", assetSlot: 0 });
    assert.equal(restartedStart.ok, true, "capacity must recover after every expired transfer is removed");
  } finally {
    await closeContext(context);
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined);
  }
});
