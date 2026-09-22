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

async function createNoisePng(page) {
  return page.evaluate(() => {
    const width = 384;
    const height = 384;
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
  });
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

test("MV3 cloud claim survives worker restart, masks exact pixels, and enforces sender/CAS/chunk boundaries", { timeout: 90_000 }, async () => {
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
    const metadata = {
      handoffId,
      draftId: draft.id,
      outputAction: "save",
      extensionId,
      draftUpdatedAt: updatedAt,
      draftFingerprint,
      expiresAt: new Date(Date.now() + 9 * 60 * 1000).toISOString()
    };
    await putDraft(worker, draft);
    await setMetadata(worker, storageKey, metadata);

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
    const chunks = [];
    for (let sequence = 0; sequence < started.totalChunks; sequence += 1) {
      const result = await sendExternal(page, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.asset.chunk", handoffId, action: "save", assetSlot: 0, sequence });
      assert.equal(result.ok, true);
      assert.equal(result.sequence, sequence);
      assert.equal(result.done, sequence === started.totalChunks - 1);
      chunks.push(result.chunk);
    }
    const encoded = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk, "base64"))).toString("base64");
    assert.equal(Buffer.from(encoded, "base64").byteLength, started.byteLength);
    const pixels = await decodeSelectedPixels(page, encoded);
    assert.deepEqual(pixels.size, [width, height]);
    assert.deepEqual(pixels.pixels[0], [240, 1, 2, 255]);
    assert.deepEqual(pixels.pixels[1], [17, 24, 39, 255], "mask begins at floor(x * width), floor(y * height)");
    assert.deepEqual(pixels.pixels[2], [5, 6, 240, 255], "mask ends before ceil((x + width) * imageWidth)");
    assert.deepEqual(pixels.pixels[3], [7, 8, 240, 255], "mask end boundary is exclusive");

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
    await extensionPage.close();
    assert.deepEqual(wrongSender, { ok: false, error: "HANDOFF_REQUEST_REJECTED" });
    const wrongOriginPage = await createSyntheticPage(context, WRONG_ORIGIN_URL);
    const wrongOriginExternal = await sendExternal(wrongOriginPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.prepare", handoffId, action: "save" });
    assert.equal(wrongOriginExternal.ok, false);
    assert.equal(wrongOriginExternal.error, "RUNTIME_ERROR");
    assert.equal(typeof wrongOriginExternal.detail, "string");
    await setMetadata(worker, storageKey, { ...metadata, expiresAt: new Date(Date.now() - 1).toISOString() });
    const expired = await sendExternal(page, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.prepare", handoffId, action: "save" });
    assert.deepEqual(expired, { ok: false, error: "HANDOFF_EXPIRED_OR_UNKNOWN" });
    await setMetadata(worker, storageKey, metadata);

    await closeContext(context);
    ({ context, worker, extensionId } = await openExtensionContext(userDataDir));
    const restartedPage = await createStagingPage(context);
    const restartedPrepare = await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.prepare", handoffId, action: "save" });
    assert.equal(restartedPrepare.ok, true);
    assert.equal(restartedPrepare.draftFingerprint, draftFingerprint, "worker restart must reread the same fingerprint");

    const changedDraft = { ...draft, title: "同一ms更新" };
    await putDraft(worker, changedDraft);
    const changedCompletion = await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.completed", handoffId, action: "save", manualId: "manual-cas-1" });
    assert.deepEqual(changedCompletion, { ok: false, error: "DRAFT_CHANGED" });
    assert.equal((await getDraft(worker, draft.id)).title, changedDraft.title, "CAS mismatch must retain the changed local draft");

    await putDraft(worker, draft);
    const finalPrepare = await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.prepare", handoffId, action: "save" });
    assert.equal(finalPrepare.draftFingerprint, draftFingerprint);
    const completed = await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.completed", handoffId, action: "save", manualId: "manual-cas-1" });
    assert.deepEqual(completed, { ok: true, status: "completed" });
    assert.equal(await getDraft(worker, draft.id), null, "only completed claim may remove the local original");
    assert.equal((await readMetadata(worker, storageKey)).status, "completed");
    assert.deepEqual(await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.completed", handoffId, action: "save", manualId: "manual-cas-1" }), { ok: true, status: "completed" });
    assert.deepEqual(await sendExternal(restartedPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.completed", handoffId, action: "save", manualId: "different-manual" }), { ok: false, error: "COMPLETION_MISMATCH" });
  } finally {
    await closeContext(context);
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined);
  }
});
