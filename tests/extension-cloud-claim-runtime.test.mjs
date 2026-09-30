import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import test from "node:test";
import { chromium } from "@playwright/test";
import { fingerprintDraft, handoffReadyStorageKey, handoffStorageKey } from "../apps/extension/editor/handoff.js";
import { ONBOARDING_JS, renderOnboardingContinuePage } from "../apps/worker/src/onboarding-assets.ts";

const STAGING_ORIGIN = "https://meccha-manual-staging.meccha-iiyatsu.com";
const STAGING_URL = `${STAGING_ORIGIN}/onboarding/continue?runtime-test=1`;
const ACCESS_AUTH_ORIGIN = "https://meccha-manual-access-login.example.test";
const ACCESS_AUTH_URL = `${ACCESS_AUTH_ORIGIN}/cdn-cgi/access/login?runtime-test=1`;
const WRONG_ORIGIN_URL = "https://evil.example.test/onboarding/continue?runtime-test=1";
const extensionRoot = resolve(fileURLToPath(new URL("../apps/extension/", import.meta.url)));

function externalPageHtml(extensionId = null) {
  const readyScript = extensionId ? `<script defer>
(() => {
  const id = ${JSON.stringify(extensionId)};
  let sent = false;
  const sendReady = async () => {
    if (sent || typeof globalThis.chrome?.runtime?.sendMessage !== "function") return;
    const fragment = new URLSearchParams(location.hash.slice(1));
    const handoffId = fragment.get("handoff");
    const launchId = fragment.get("launchId");
    const action = fragment.get("action") || "save";
    if (!handoffId || !launchId) return;
    sent = true;
    try {
      await chrome.runtime.sendMessage(id, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.page-ready", handoffId, launchId, action });
    } catch {
      sent = false;
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sendReady, { once: true });
  else void sendReady();
})();
</script>` : "";
  return `<!doctype html><meta charset='utf-8'><title>synthetic staging sender</title>${readyScript}`;
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

async function createStagingPage(context, url = STAGING_URL) {
  return createSyntheticPage(context, url);
}

async function createRealStagingPage(context, url = STAGING_URL, { bootstrapEnabled = false } = {}) {
  const page = await context.newPage();
  await page.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== STAGING_ORIGIN) {
      await route.abort();
      return;
    }
    if (requestUrl.pathname === "/onboarding/continue") {
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: renderOnboardingContinuePage({ bootstrapEnabled }) });
      return;
    }
    if (requestUrl.pathname === "/assets/onboarding.js") {
      await route.fulfill({ status: 200, contentType: "application/javascript; charset=utf-8", body: ONBOARDING_JS });
      return;
    }
    if (requestUrl.pathname === "/api/onboarding/bootstrap") {
      await route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify({ status: "ready", workspaceId: "runtime-workspace" }) });
      return;
    }
    if (requestUrl.pathname === "/api/onboarding/claim-intents") {
      await route.fulfill({ status: 201, contentType: "application/json; charset=utf-8", body: JSON.stringify({ claimIntentId: "12345678-1234-4234-8234-123456789012" }) });
      return;
    }
    if (requestUrl.pathname.includes("/assets/")) {
      await route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify({ status: "staged" }) });
      return;
    }
    if (requestUrl.pathname.startsWith("/api/onboarding/claims/")) {
      await route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify({ status: "claimed", manualId: "runtime-manual-1" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: "" });
  });
  await page.goto(url, { waitUntil: "commit" });
  return page;
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

async function sendExternalFromFrame(frame, extensionId, message) {
  return frame.evaluate(({ extensionId: id, message: payload }) => {
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

async function tabIdForPage(worker, page) {
  const pageUrl = page.url();
  return worker.evaluate((url) => new Promise((resolve, reject) => {
    chrome.tabs.query({}, (tabs) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(tabs.find((tab) => tab.url === url)?.id ?? null);
    });
  }), pageUrl);
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

async function decodePixelRegion(page, base64, x, y, width, height) {
  return page.evaluate(async ({ encoded, x, y, width, height }) => {
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      return Array.from(context.getImageData(x, y, width, height).data).reduce((pixels, value, index) => {
        const pixel = Math.floor(index / 4);
        if (index % 4 === 0) pixels.push([value, 0, 0, 0]);
        else pixels[pixel][index % 4] = value;
        return pixels;
      }, []);
    } finally {
      bitmap.close();
    }
  }, { encoded: base64, x, y, width, height });
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
      screenshots: [
        {
          id: "asset-1",
          dataUrl,
          masks: [{ x: 0.25, y: 0.25, width: 0.25, height: 0.25 }],
          annotations: [
            { id: "annotation-rectangle", type: "rectangle", x: 0.05, y: 0.05, width: 0.15, height: 0.15, color: "#dc2626", strokeWidth: 4 },
            { id: "annotation-text", type: "text", x: 0.5, y: 0.5, width: 0.2, height: 0.2, text: "A", color: "#087f7a", strokeWidth: 2, fontSize: 24 }
          ]
        },
        {
          id: "asset-2",
          dataUrl,
          masks: [{ x: 0.7, y: 0.7, width: 0.2, height: 0.2 }],
          annotations: [
            { id: "annotation-ellipse", type: "ellipse", x: 0.5, y: 0.05, width: 0.25, height: 0.25, color: "#2563eb", strokeWidth: 4 },
            { id: "annotation-arrow", type: "arrow", x1: 0.1, y1: 0.85, x2: 0.4, y2: 0.6, color: "#dc2626", strokeWidth: 4 }
          ]
        }
      ]
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
    const sameContentDraft = { ...draft, updatedAt: "2026-09-23T00:01:00.000Z" };
    await putDraft(worker, sameContentDraft);
    const prepared = await sendExternal(page, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.prepare", handoffId, action: "save" });
    assert.equal(prepared.ok, true);
    assert.equal(prepared.status, "ready");
    assert.equal(prepared.draftFingerprint, draftFingerprint);
    assert.equal(prepared.assets[0].assetSlot, 0);
    assert.deepEqual(await getDraft(worker, draft.id), sameContentDraft, "prepare must retain the local original");
    assert.equal((await readMetadata(worker, storageKey)).draftUpdatedAt, updatedAt, "prepare must retain the handoff timestamp while allowing unchanged content");

    const started = await sendExternal(page, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.asset.start", handoffId, action: "save", assetSlot: 0 });
    assert.equal(started.ok, true, JSON.stringify(started));
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
    const sourceEncoded = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const sourceRectanglePixels = await decodePixelRegion(page, sourceEncoded, 12, 12, 80, 80);
    const rectanglePixels = await decodePixelRegion(page, encoded, 12, 12, 80, 80);
    assert.ok(rectanglePixels.some(([red, green, blue]) => red === 220 && green === 38 && blue === 38), "cloud asset must contain the rectangle annotation pixels");
    assert.ok(rectanglePixels.some((pixel, index) => pixel.join(",") !== sourceRectanglePixels[index].join(",")), "rectangle pixels must differ from the source region");
    const sourceTextPixels = await decodePixelRegion(page, sourceEncoded, 192, 192, 80, 70);
    const textPixels = await decodePixelRegion(page, encoded, 192, 192, 80, 70);
    assert.ok(textPixels.some(([red, green, blue]) => green > red * 1.5 && green > blue * 1.2), "cloud asset must contain the text annotation pixels");
    assert.ok(textPixels.some((pixel, index) => pixel.join(",") !== sourceTextPixels[index].join(",")), "text pixels must differ from the source region");

    const secondStarted = await sendExternal(page, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.asset.start", handoffId, action: "save", assetSlot: 1 });
    assert.equal(secondStarted.ok, true);
    const secondChunks = [];
    for (let sequence = 0; sequence < secondStarted.totalChunks; sequence += 1) {
      const result = await sendExternal(page, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.asset.chunk", handoffId, action: "save", assetSlot: 1, sequence });
      assert.equal(result.ok, true);
      secondChunks.push(result.chunk);
    }
    const secondEncoded = Buffer.concat(secondChunks.map((chunk) => Buffer.from(chunk, "base64"))).toString("base64");
    const sourceEllipsePixels = await decodePixelRegion(page, sourceEncoded, 180, 0, 130, 130);
    const ellipsePixels = await decodePixelRegion(page, secondEncoded, 180, 0, 130, 130);
    assert.ok(ellipsePixels.some(([red, green, blue]) => blue > 180 && red < 100 && green < 150), "cloud asset must contain the ellipse annotation pixels");
    assert.ok(ellipsePixels.some((pixel, index) => pixel.join(",") !== sourceEllipsePixels[index].join(",")), "ellipse pixels must differ from the source region");
    const sourceArrowPixels = await decodePixelRegion(page, sourceEncoded, 24, 210, 160, 130);
    const arrowPixels = await decodePixelRegion(page, secondEncoded, 24, 210, 160, 130);
    assert.ok(arrowPixels.some(([red, green, blue]) => red === 220 && green === 38 && blue === 38), "cloud asset must contain the arrow annotation pixels");
    assert.ok(arrowPixels.some((pixel, index) => pixel.join(",") !== sourceArrowPixels[index].join(",")), "arrow pixels must differ from the source region");
    const artifactPath = resolve(".artifacts/editor-image-workspace/annotated-export-draft.json");
    await mkdir(resolve(".artifacts/editor-image-workspace"), { recursive: true });
    await writeFile(artifactPath, JSON.stringify({
      title: draft.title,
      description: draft.description,
      steps: [
        { id: "step-1", order: 1, instruction: "注釈付き画像1", screenshotId: "asset-1" },
        { id: "step-2", order: 2, instruction: "注釈付き画像2", screenshotId: "asset-2" }
      ],
      screenshots: [
        { id: "asset-1", dataUrl: `data:image/png;base64,${encoded}`, masks: [] },
        { id: "asset-2", dataUrl: `data:image/png;base64,${secondEncoded}`, masks: [] }
      ]
    }, null, 2), "utf8");

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

test("two MV3 editor tabs converge on one fresh handoff and operation", { timeout: 90_000 }, async () => {
  const userDataDir = assertRuntimeProfilePath(await mkdtemp(join(tmpdir(), "meccha-manual-extension-runtime-")));
  let context;
  try {
    let openedRegistrationPages = [];
    let worker;
    let extensionId;
    ({ context, worker, extensionId } = await openExtensionContext(userDataDir));
    await context.route(`${STAGING_ORIGIN}/**`, async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: externalPageHtml(extensionId) });
    });
    const draft = {
      id: "runtime-editor-canonical-draft",
      title: "同一内容の下書き",
      description: "2つのeditorから保存する",
      updatedAt: "2026-09-26T00:00:00.000Z",
      steps: [{ id: "step-1", order: 1, instruction: "保存する", screenshotId: "asset-1" }],
      screenshots: [{ id: "asset-1", dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", masks: [] }]
    };
    await putDraft(worker, draft);
    const editorUrl = `chrome-extension://${extensionId}/editor/editor.html#${encodeURIComponent(draft.id)}`;
    const editors = await Promise.all([context.newPage(), context.newPage()]);
    await Promise.all(editors.map((page) => page.goto(editorUrl, { waitUntil: "domcontentloaded" })));
    await Promise.all(editors.map((page) => page.locator("#save").click()));
    await Promise.all(editors.map((page) => page.locator("#startRegistration").waitFor({ state: "visible" })));
    await Promise.all(editors.map((page) => page.locator("#startRegistration").click()));
    const canonicalGateStatus = "保存先の準備画面を表示しました。ログインが必要な場合は、表示された画面で続けてください。";
    const manualGateStatus = "保存先の準備画面を確認できませんでした。ログインや接続が必要な場合があります。『準備画面を表示』を押すと画面を表示できます。手順書はこの端末に残っています。";
    const activatedGateStatus = "保存先を表示しています。";
    await Promise.all(editors.map((page) => page.waitForFunction(({ canonical, manual }) => {
      const status = document.querySelector("#gateStatus")?.textContent;
      const activate = document.querySelector("#activateHandoff");
      return status === canonical || (status === manual && activate && !activate.hidden);
    }, { canonical: canonicalGateStatus, manual: manualGateStatus }, { timeout: 30_000 })));
    const editorOutcomes = await Promise.all(editors.map(async (page) => {
      const manual = await page.locator("#gateStatus").textContent() === manualGateStatus;
      if (manual) {
        await page.locator("#activateHandoff").click();
      }
      await page.waitForFunction(({ canonical, activated, manual: manualFallback }) => {
        const status = document.querySelector("#gateStatus")?.textContent;
        const gate = document.querySelector("#outputGate");
        const activate = document.querySelector("#activateHandoff");
        const expected = manualFallback ? activated : canonical;
        return status === expected && gate && !gate.open && activate?.hidden;
      }, { canonical: canonicalGateStatus, activated: activatedGateStatus, manual }, { timeout: 30_000 });
      assert.equal(await page.locator("#outputGate").evaluate((element) => element.open), false, "canonical activation must close the output gate");
      assert.equal(await page.locator("#activateHandoff").isHidden(), true, "canonical activation must hide manual fallback");
      assert.equal(await page.locator("#gateStatus").textContent(), manual ? activatedGateStatus : canonicalGateStatus, "canonical activation must show the destination state");
      return { manual };
    }));
    const allMetadata = await worker.evaluate(() => new Promise((resolve, reject) => chrome.storage.local.get(null, (result) => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(result))));
    const handoffs = Object.values(allMetadata).filter((value) => value?.draftId === "runtime-editor-canonical-draft");
    assert.equal(handoffs.length, 1, "same draft editors must persist one metadata record");
    const readyRecords = Object.values(allMetadata).filter((value) => value?.handoffId === handoffs[0].handoffId && value?.launchId);
    assert.equal(readyRecords.length, 2, "each editor must persist one ready record for the canonical handoff");
    assert.equal(readyRecords.every((value) => typeof value.activatedAt === "string"), true, "each editor must activate its prepared tab");
    assert.deepEqual(new Set(readyRecords.map((value) => value.activationPolicy)), new Set(editorOutcomes.map(({ manual }) => manual ? "manual" : "auto")), "ready records must preserve the observed activation paths");
    openedRegistrationPages = await Promise.all([createStagingPage(context), createStagingPage(context)]);
    const beginResults = await Promise.all(openedRegistrationPages.map((page) => sendExternal(page, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.begin", handoffId: handoffs[0].handoffId, action: "save" })));
    assert.deepEqual(beginResults[1], beginResults[0], "same canonical handoff must return one operation");
    const prepared = await sendExternal(openedRegistrationPages[0], extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.prepare", handoffId: handoffs[0].handoffId, action: "save" });
    assert.equal(prepared.ok, true);
    const started = await sendExternal(openedRegistrationPages[0], extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.asset.start", handoffId: handoffs[0].handoffId, action: "save", assetSlot: 0 });
    assert.equal(started.ok, true, "canonical handoff must reach asset start");
  } finally {
    await closeContext(context);
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined);
  }
});

test("MV3 page-ready uses launch and tab state without changing claim identity", { timeout: 60_000 }, async () => {
  const userDataDir = assertRuntimeProfilePath(await mkdtemp(join(tmpdir(), "meccha-manual-extension-runtime-")));
  let context;
  try {
    let worker;
    let extensionId;
    ({ context, worker, extensionId } = await openExtensionContext(userDataDir));
    const positiveUrl = `${STAGING_ORIGIN}/onboarding/continue?runtime-test=ready-positive`;
    const page = await createStagingPage(context, positiveUrl);
    const tabId = await tabIdForPage(worker, page);
    assert.equal(Number.isInteger(tabId), true, "the real MV3 sender tab must be discoverable");
    const foregroundTabId = await worker.evaluate(() => new Promise((resolve, reject) => {
      chrome.tabs.create({ url: "about:blank", active: true }, (tab) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(tab?.id ?? null);
      });
    }));
    assert.equal(Number.isInteger(foregroundTabId), true, "the separate foreground tab must be discoverable");
    const activeTabIds = await worker.evaluate(() => new Promise((resolve, reject) => {
      chrome.tabs.query({}, (tabs) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(tabs.filter((tab) => tab.active).map((tab) => tab.id));
      });
    }));
    assert.equal(activeTabIds.includes(foregroundTabId), true, "the unrelated foreground tab must be active before ready");
    assert.equal(activeTabIds.includes(tabId), false, "the ready sender must begin in the background");
    const draft = {
      id: "runtime-ready-flow-draft",
      title: "ready 通知の下書き",
      description: "claim metadata の identity を保持する",
      updatedAt: "2026-09-26T00:00:00.000Z",
      steps: [],
      screenshots: []
    };
    const draftFingerprint = await fingerprintDraft(draft);
    await putDraft(worker, draft);
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const handoffId = "R".repeat(43);
    const launchId = "L".repeat(43);
    const operationId = "O".repeat(43);
    const claimIntentId = "01234567-89ab-4cde-8fab-0123456789ab";
    const handoffKey = handoffStorageKey(handoffId);
    const handoffMetadata = {
      handoffId,
      draftId: draft.id,
      outputAction: "save",
      extensionId,
      createdAt: new Date().toISOString(),
      draftUpdatedAt: draft.updatedAt,
      draftFingerprint,
      expiresAt,
      status: "finalize-pending",
      operationId,
      claimIntentId
    };
    await setMetadata(worker, handoffKey, handoffMetadata);
    const readyKey = handoffReadyStorageKey(handoffId, launchId);
    const readyMetadata = {
      handoffId,
      launchId,
      tabId,
      expiresAt,
      activationPolicy: "auto",
      activationDeadlineAt: new Date(Date.now() + 8_000).toISOString(),
      pageReadyAt: null,
      activatedAt: null
    };
    await setMetadata(worker, readyKey, readyMetadata);
    const readyMessage = { schema: "meccha-manual/cloud-claim-v1", type: "handoff.page-ready", handoffId, launchId, action: "save" };

    assert.deepEqual(await sendExternal(page, extensionId, readyMessage), { ok: true, status: "ready" });
    const firstReady = await readMetadata(worker, readyKey);
    assert.equal(Number.isFinite(Date.parse(firstReady.pageReadyAt)), true);
    assert.equal(firstReady.activatedAt, null, "background ready notification must not activate the sender tab");
    const activeTabIdsAfterReady = await worker.evaluate(() => new Promise((resolve, reject) => {
      chrome.tabs.query({}, (tabs) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(tabs.filter((tab) => tab.active).map((tab) => tab.id));
      });
    }));
    assert.equal(activeTabIdsAfterReady.includes(foregroundTabId), true, "the unrelated foreground tab must remain active");
    assert.equal(activeTabIdsAfterReady.includes(tabId), false, "background ready must not foreground the sender tab");
    assert.deepEqual(await readMetadata(worker, handoffKey), handoffMetadata, "ready must not overwrite operation or claim identity");
    assert.deepEqual(await sendExternal(page, extensionId, readyMessage), { ok: true, status: "ready" }, "duplicate ready is idempotent");
    assert.deepEqual(await readMetadata(worker, readyKey), firstReady, "duplicate ready must preserve the first timestamps");

    assert.deepEqual(await sendExternal(page, extensionId, {
      ...readyMessage,
      launchId: "W".repeat(43)
    }), { ok: false, error: "HANDOFF_PAGE_READY_REJECTED" }, "an unknown launch must be rejected");

    const wrongTab = await createStagingPage(context, `${STAGING_ORIGIN}/onboarding/continue?runtime-test=ready-wrong-tab`);
    assert.notEqual(await tabIdForPage(worker, wrongTab), tabId);
    assert.deepEqual(await sendExternal(wrongTab, extensionId, readyMessage), { ok: false, error: "HANDOFF_PAGE_READY_REJECTED" }, "a different tab must be rejected");

    const wrongOrigin = await createSyntheticPage(context, WRONG_ORIGIN_URL);
    assert.deepEqual(await sendExternal(wrongOrigin, extensionId, readyMessage), { ok: false, error: "RUNTIME_ERROR", detail: "chrome.runtime.sendMessage unavailable" }, "the manifest must keep external messaging unavailable on a different origin");
    const wrongPath = await createSyntheticPage(context, `${STAGING_ORIGIN}/onboarding/wrong-path?runtime-test=ready-wrong-path`);
    assert.deepEqual(await sendExternal(wrongPath, extensionId, readyMessage), { ok: false, error: "HANDOFF_PAGE_READY_REJECTED" }, "the service worker must reject a staging sender on the wrong path");

    await page.evaluate(() => {
      const iframe = document.createElement("iframe");
      iframe.src = location.href;
      iframe.id = "ready-frame";
      document.body.append(iframe);
    });
    await page.waitForFunction(() => document.querySelector("#ready-frame")?.contentDocument?.readyState === "complete");
    const childFrame = page.frames().find((frame) => frame !== page.mainFrame());
    assert.ok(childFrame, "the real web frame must be available for frameId validation");
    assert.deepEqual(await sendExternalFromFrame(childFrame, extensionId, readyMessage), { ok: false, error: "HANDOFF_PAGE_READY_REJECTED" }, "a non-top-level frame must be rejected");

    async function installAttempt(attemptHandoffId, attemptLaunchId, activationPolicy, activationDeadlineAt, attemptOperationId) {
      const attemptExpiresAt = new Date(Date.now() + 60_000).toISOString();
      await setMetadata(worker, handoffStorageKey(attemptHandoffId), {
        ...handoffMetadata,
        handoffId: attemptHandoffId,
        expiresAt: attemptExpiresAt,
        operationId: attemptOperationId
      });
      await setMetadata(worker, handoffReadyStorageKey(attemptHandoffId, attemptLaunchId), {
        handoffId: attemptHandoffId,
        launchId: attemptLaunchId,
        tabId,
        expiresAt: attemptExpiresAt,
        activationPolicy,
        activationDeadlineAt,
        pageReadyAt: null,
        activatedAt: null
      });
    }

    const timedOutHandoffId = "T".repeat(43);
    const timedOutLaunchId = "U".repeat(43);
    await installAttempt(timedOutHandoffId, timedOutLaunchId, "auto", new Date(Date.now() - 1).toISOString(), "P".repeat(43));
    const timedOutReady = { ...readyMessage, handoffId: timedOutHandoffId, launchId: timedOutLaunchId };
    assert.deepEqual(await sendExternal(page, extensionId, timedOutReady), { ok: true, status: "manual" }, "a ready after the activation deadline must require manual activation");
    const timedOutStored = await readMetadata(worker, handoffReadyStorageKey(timedOutHandoffId, timedOutLaunchId));
    assert.equal(timedOutStored.pageReadyAt, null);
    assert.equal(timedOutStored.activatedAt, null);

    const manualHandoffId = "M".repeat(43);
    const manualLaunchId = "N".repeat(43);
    await installAttempt(manualHandoffId, manualLaunchId, "manual", new Date(Date.now() + 8_000).toISOString(), "Q".repeat(43));
    const manualReady = { ...readyMessage, handoffId: manualHandoffId, launchId: manualLaunchId };
    assert.deepEqual(await sendExternal(page, extensionId, manualReady), { ok: true, status: "manual" }, "manual policy must never auto activate on a late ready");
    const manualStored = await readMetadata(worker, handoffReadyStorageKey(manualHandoffId, manualLaunchId));
    assert.equal(manualStored.pageReadyAt, null);
    assert.equal(manualStored.activatedAt, null);

    const cancelledHandoffId = "C".repeat(43);
    const cancelledLaunchId = "D".repeat(43);
    await installAttempt(cancelledHandoffId, cancelledLaunchId, "cancelled", new Date(Date.now() + 8_000).toISOString(), "S".repeat(43));
    assert.deepEqual(await sendExternal(page, extensionId, { ...readyMessage, handoffId: cancelledHandoffId, launchId: cancelledLaunchId }), { ok: false, error: "HANDOFF_PAGE_READY_REJECTED" }, "a cancelled attempt must reject a late ready");
    const cancelledStored = await readMetadata(worker, handoffReadyStorageKey(cancelledHandoffId, cancelledLaunchId));
    assert.equal(cancelledStored.pageReadyAt, null);
    assert.equal(cancelledStored.activatedAt, null);
  } finally {
    await closeContext(context);
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined);
  }
});

test("MV3 Access hashless return restores the same activated handoff", { timeout: 60_000 }, async () => {
  const userDataDir = assertRuntimeProfilePath(await mkdtemp(join(tmpdir(), "meccha-manual-extension-runtime-")));
  let context;
  try {
    let worker;
    let extensionId;
    ({ context, worker, extensionId } = await openExtensionContext(userDataDir));
    const handoffId = "V".repeat(43);
    const launchId = "W".repeat(43);
    const hashlessUrl = `${STAGING_ORIGIN}/onboarding/continue`;
    const page = await createRealStagingPage(context, hashlessUrl, { bootstrapEnabled: true });
    await page.goto(`${hashlessUrl}#fixture`, { waitUntil: "commit" });
    await page.waitForFunction(() => location.hash === "");
    await page.route(`${ACCESS_AUTH_ORIGIN}/**`, (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: "<!doctype html><title>synthetic Access login</title>" }));
    const tabId = await tabIdForPage(worker, page);
    assert.equal(Number.isInteger(tabId), true);
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const draft = {
      id: "runtime-access-restore-draft",
      title: "Access復帰確認",
      description: "実MV3復元経路の保存確認",
      updatedAt: "2026-09-30T00:00:00.000Z",
      steps: [{ id: "runtime-access-step", order: 1, instruction: "保存する", screenshotId: "runtime-access-asset" }],
      screenshots: [{ id: "runtime-access-asset", dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", masks: [] }]
    };
    const draftFingerprint = await fingerprintDraft(draft);
    await putDraft(worker, draft);
    await setMetadata(worker, handoffStorageKey(handoffId), {
      handoffId,
      draftId: draft.id,
      outputAction: "save",
      extensionId,
      draftUpdatedAt: draft.updatedAt,
      draftFingerprint,
      expiresAt
    });
    await setMetadata(worker, handoffReadyStorageKey(handoffId, launchId), {
      handoffId,
      launchId,
      tabId,
      expiresAt,
      activationPolicy: "manual",
      pageReadyAt: new Date().toISOString(),
      activatedAt: new Date().toISOString()
    });
    await page.goto(`${hashlessUrl}#handoff=${handoffId}&extensionId=${extensionId}&launchId=${launchId}&action=save`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => location.hash === "");
    assert.equal((await readMetadata(worker, handoffReadyStorageKey(handoffId, launchId))).restoreAttempts, undefined, "a normal handoff page must not trigger Access recovery");
    await page.goto(ACCESS_AUTH_URL, { waitUntil: "commit" });
    assert.match(page.url(), new RegExp(`${ACCESS_AUTH_ORIGIN.replaceAll(".", "\\.")}/cdn-cgi/access/login`));
    await page.goto(hashlessUrl, { waitUntil: "commit" });
    const readyKey = handoffReadyStorageKey(handoffId, launchId);
    for (let attempt = 0; attempt < 30 && Number((await readMetadata(worker, readyKey))?.restoreAttempts || 0) !== 1; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal((await readMetadata(worker, readyKey)).restoreAttempts, 1, "a hashless return after Access must restore once");
    const tabState = await worker.evaluate((url) => new Promise((resolve) => chrome.tabs.query({}, (tabs) => resolve(tabs.find((tab) => tab.url === url) || null))), page.url());
    assert.equal(tabState?.active, true, "Access recovery must keep the already active tab in front");
    await page.waitForSelector("#bootstrap", { state: "visible" });
    await page.locator("#bootstrap").click();
    for (let attempt = 0; attempt < 40 && (await readMetadata(worker, handoffStorageKey(handoffId)))?.status !== "completed"; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 50));
    const completed = await readMetadata(worker, handoffStorageKey(handoffId));
    assert.equal(completed.status, "completed", "the real onboarding page must complete the restored handoff");
    assert.equal(completed.completedManualId, "runtime-manual-1");
    assert.equal(await getDraft(worker, draft.id), null, "completed workflow must clear the unchanged local draft");
    await page.reload({ waitUntil: "domcontentloaded" });
    const savedContext = await page.evaluate(() => JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation") || "null"));
    assert.equal(savedContext?.entries?.find((entry) => entry.handoffId === "V".repeat(43))?.claimStatus, "completed", "reopening the page must retain the completed claim context");
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
