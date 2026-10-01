import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { generateKeyPairSync } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createHttpsServer } from "node:https";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import test from "node:test";
import { chromium } from "@playwright/test";
import { exportJWK, SignJWT } from "jose";
import { buildContinueUrl, fingerprintDraft, handoffReadyStorageKey, handoffStorageKey } from "../apps/extension/editor/handoff.js";
import { ONBOARDING_JS, renderOnboardingContinuePage } from "../apps/worker/src/onboarding-assets.ts";
import cloudWorker from "../apps/worker/src/index.ts";

const STAGING_ORIGIN = "https://meccha-manual-staging.meccha-iiyatsu.com";
const STAGING_URL = `${STAGING_ORIGIN}/onboarding/continue?runtime-test=1`;
const ACCESS_AUTH_ORIGIN = "https://meccha-manual-access-login.example.test";
const ACCESS_AUTH_URL = `${ACCESS_AUTH_ORIGIN}/cdn-cgi/access/login?runtime-test=1`;
const WRONG_ORIGIN_URL = "https://evil.example.test/onboarding/continue?runtime-test=1";
const ACCESS_ISSUER = "https://access.example.invalid";
const ACCESS_AUDIENCE = "meccha-manual-staging";
const ACCESS_JWKS_URL = `${ACCESS_ISSUER}/.well-known/jwks.json`;
const extensionRoot = resolve(fileURLToPath(new URL("../apps/extension/", import.meta.url)));
const require = createRequire(import.meta.url);
const playwrightUtils = require(join(dirname(require.resolve("playwright-core")), "lib", "coreBundle.js")).utils;

class LocalStatement {
  constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; }
  bind(...values) { return new LocalStatement(this.database, this.sql, values); }
  async run() { const result = this.database.prepare(this.sql).run(...this.values); return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; }
  async first() { return this.database.prepare(this.sql).get(...this.values) ?? null; }
  async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.values) }; }
}

class LocalD1 {
  constructor(database) { this.database = database; this.tail = Promise.resolve(); }
  prepare(sql) { return new LocalStatement(this.database, sql); }
  batch(statements) {
    const task = this.tail.then(async () => {
      this.database.exec("BEGIN IMMEDIATE");
      try { const results = []; for (const statement of statements) results.push(await statement.run()); this.database.exec("COMMIT"); return results; }
      catch (error) { this.database.exec("ROLLBACK"); throw error; }
    });
    this.tail = task.catch(() => undefined);
    return task;
  }
}

class MemoryR2 {
  constructor() { this.objects = new Map(); }
  async put(key, body, options = {}) {
    if (options.onlyIf?.etagDoesNotMatch === "*" && this.objects.has(key)) return null;
    const bytes = body instanceof Uint8Array ? body.slice() : new Uint8Array(await new Response(body).arrayBuffer());
    this.objects.set(key, { body: bytes, size: bytes.byteLength, httpMetadata: { ...(options.httpMetadata ?? {}) }, customMetadata: { ...(options.customMetadata ?? {}) } });
    return { etag: `local-${this.objects.size}` };
  }
  async head(key) { const object = this.objects.get(key); return object ? { size: object.size, httpMetadata: { ...object.httpMetadata }, customMetadata: { ...object.customMetadata } } : null; }
  async get(key) { const object = this.objects.get(key); return object ? { body: new Response(object.body).body, size: object.size, httpMetadata: { ...object.httpMetadata }, customMetadata: { ...object.customMetadata } } : null; }
  async delete(key) { this.objects.delete(key); }
}

const localWorkerMigrations = ["0001_d1_identity_workspace.sql", "0002_d1_personal_workspace.sql", "0003_d1_onboarding_bootstrap.sql", "0004_d1_cloud_manual_claim.sql", "0005_d1_share_links.sql"];

async function createLocalWorkerFixture() {
  const database = new DatabaseSync(":memory:");
  for (const name of localWorkerMigrations) database.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicJwk = { ...await exportJWK(publicKey), kid: "extension-runtime-local", alg: "RS256", use: "sig" };
  const token = await new SignJWT({ type: "app", sub: "extension-runtime-local-user" })
    .setProtectedHeader({ alg: "RS256", kid: publicJwk.kid }).setIssuer(ACCESS_ISSUER).setAudience(ACCESS_AUDIENCE)
    .setIssuedAt().setExpirationTime("5m").sign(privateKey);
  const env = {
    APP_ENV: "staging", APP_BASE_URL: STAGING_ORIGIN, ACCESS_ISSUER, ACCESS_AUDIENCE, ACCESS_JWKS_URL,
    DB: new LocalD1(database), MANUAL_ASSETS: new MemoryR2(), ONBOARDING_RATE_LIMITER: { limit: async () => ({ success: true }) }
  };
  return { database, env, token, publicJwk };
}

function localWorkerRequest(request, token) {
  const headers = new Headers(request.headers());
  headers.set("Cf-Access-Jwt-Assertion", token);
  headers.set("Cf-Connecting-IP", "198.51.100.10");
  // Playwright's intercepted fetch body is delivered without a transport
  // Content-Length. The product request already carries the signed byte
  // length, so the local edge adapter restores the header Cloudflare adds.
  if (!headers.has("content-length") && headers.has("x-asset-byte-length")) headers.set("content-length", headers.get("x-asset-byte-length"));
  const body = ["GET", "HEAD"].includes(request.method()) ? undefined : request.postDataBuffer() ?? undefined;
  const input = new Request(request.url(), { method: request.method(), headers, body });
  Object.defineProperty(input, "cf", { value: { colo: "NRT", asn: 64500 }, configurable: true });
  return input;
}

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

async function createLocalWorkerStagingPage(context, fixture, url = `${STAGING_ORIGIN}/onboarding/continue`, { redirectInitialAccess = false, networkServer = null } = {}) {
  const page = await context.newPage();
  let redirectPending = redirectInitialAccess;
  await page.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (networkServer) {
      if (requestUrl.pathname.startsWith("/api/") || requestUrl.pathname === "/manuals" || requestUrl.pathname.startsWith("/assets/cloud-manual.")) {
        const response = await cloudWorker.fetch(localWorkerRequest(route.request(), fixture.token), fixture.env, {});
        const body = Buffer.from(await response.arrayBuffer());
        await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers.entries()), body });
        return;
      }
      await route.continue();
      return;
    }
    if (requestUrl.origin === ACCESS_AUTH_ORIGIN) {
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: "<!doctype html><title>synthetic Access login</title>" });
      return;
    }
    if (requestUrl.origin !== STAGING_ORIGIN) { await route.abort(); return; }
    if (requestUrl.pathname === "/onboarding/continue") {
      if (redirectPending) {
        redirectPending = false;
        await route.fulfill({ status: 302, headers: { location: ACCESS_AUTH_URL } });
        return;
      }
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: renderOnboardingContinuePage({ bootstrapEnabled: true }) });
      return;
    }
    if (requestUrl.pathname === "/assets/onboarding.js") {
      await route.fulfill({ status: 200, contentType: "application/javascript; charset=utf-8", body: ONBOARDING_JS });
      return;
    }
    if (requestUrl.pathname.startsWith("/api/") || requestUrl.pathname === "/manuals" || requestUrl.pathname.startsWith("/assets/cloud-manual.")) {
      const response = await cloudWorker.fetch(localWorkerRequest(route.request(), fixture.token), fixture.env, {});
      const body = Buffer.from(await response.arrayBuffer());
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers.entries()), body });
      return;
    }
    await route.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: "" });
  });
  if (!networkServer) {
    try {
      await page.goto(url, { waitUntil: "commit" });
    } catch (error) {
      if (!redirectInitialAccess || !["ERR_ABORTED", "Timeout 30000ms"].some((marker) => String(error?.message || error).includes(marker))) throw error;
      assert.match(page.url(), new RegExp(`${ACCESS_AUTH_ORIGIN.replaceAll(".", "\\.")}/cdn-cgi/access/login`));
    }
  }
  return page;
}

async function createLocalWorkerHttpsServer({ redirectInitialAccess = false } = {}) {
  const { cert, key } = playwrightUtils.generateSelfSignedCertificate();
  let redirectPending = redirectInitialAccess;
  const requests = [];
  const server = createHttpsServer({ cert, key }, (request, response) => {
    const requestUrl = new URL(request.url || "/", `https://${request.headers.host || "localhost"}`);
    requests.push({ host: requestUrl.hostname, pathname: requestUrl.pathname });
    if (requestUrl.hostname === ACCESS_AUTH_ORIGIN.replace("https://", "")) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<!doctype html><title>synthetic Access login</title>");
      return;
    }
    if (requestUrl.hostname !== STAGING_ORIGIN.replace("https://", "")) {
      response.writeHead(404);
      response.end();
      return;
    }
    if (requestUrl.pathname === "/onboarding/continue" && redirectPending) {
      redirectPending = false;
      response.writeHead(302, { Location: ACCESS_AUTH_URL });
      response.end();
      return;
    }
    if (requestUrl.pathname === "/onboarding/continue") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(renderOnboardingContinuePage({ bootstrapEnabled: true }));
      return;
    }
    if (requestUrl.pathname === "/assets/onboarding.js") {
      response.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
      response.end(ONBOARDING_JS);
      return;
    }
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("");
  });
  await new Promise((resolveServer, rejectServer) => {
    server.once("error", rejectServer);
    server.listen(0, "127.0.0.1", () => resolveServer());
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.ok(Number.isInteger(address.port));
  return { server, port: address.port, requests };
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

async function openExtensionContext(userDataDir, extraArgs = []) {
  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      ignoreHTTPSErrors: true,
      args: [`--disable-extensions-except=${extensionRoot}`, `--load-extension=${extensionRoot}`, ...extraArgs]
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
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const pageUrl = page.url();
    const tabId = await worker.evaluate((url) => new Promise((resolve, reject) => {
      chrome.tabs.query({}, (tabs) => {
        const error = chrome.runtime.lastError;
        if (error) { reject(new Error(error.message)); return; }
        resolve(tabs.find((tab) => tab.url === url)?.id ?? null);
      });
    }), pageUrl);
    if (Number.isInteger(tabId)) return tabId;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
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

test("first Access before onboarding JS runs", { timeout: 90_000 }, async () => {
  const userDataDir = assertRuntimeProfilePath(await mkdtemp(join(tmpdir(), "meccha-manual-extension-runtime-")));
  const fixture = await createLocalWorkerFixture();
  const networkServer = await createLocalWorkerHttpsServer({ redirectInitialAccess: true });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => String(url) === ACCESS_JWKS_URL
    ? Response.json({ keys: [fixture.publicJwk] })
    : originalFetch(url, options);
  let context;
  try {
    let worker;
    let extensionId;
    const hostResolverRules = `--host-resolver-rules=MAP meccha-manual-staging.meccha-iiyatsu.com 127.0.0.1:${networkServer.port},MAP meccha-manual-access-login.example.test 127.0.0.1:${networkServer.port}`;
    ({ context, worker, extensionId } = await openExtensionContext(userDataDir, [hostResolverRules]));
    const handoffId = "L".repeat(43);
    const launchId = "M".repeat(43);
    const hashlessUrl = `${STAGING_ORIGIN}/onboarding/continue`;
    const page = await createLocalWorkerStagingPage(context, fixture, hashlessUrl, { networkServer });
    await page.goto(`${hashlessUrl}#fixture`, { waitUntil: "commit" });
    assert.match(page.url(), new RegExp(`${ACCESS_AUTH_ORIGIN.replaceAll(".", "\\.")}/cdn-cgi/access/login`));
    assert.equal(networkServer.requests.some(({ pathname }) => pathname === "/assets/onboarding.js"), false, "the initial native Access redirect must happen before onboarding JS is requested");
    const tabId = await tabIdForPage(worker, page);
    assert.equal(Number.isInteger(tabId), true);
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const draft = {
      id: "runtime-local-worker-draft",
      title: "実Worker保存確認",
      description: "実ブラウザ経由で保存して再閲覧するfixture",
      updatedAt: "2026-09-30T00:00:00.000Z",
      steps: [{ id: "runtime-local-worker-step", order: 1, instruction: "設定を確認する", screenshotId: "runtime-local-worker-asset" }],
      screenshots: [{ id: "runtime-local-worker-asset", dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", masks: [] }]
    };
    await putDraft(worker, draft);
    await setMetadata(worker, handoffStorageKey(handoffId), {
      handoffId, draftId: draft.id, outputAction: "save", extensionId,
      draftUpdatedAt: draft.updatedAt, draftFingerprint: await fingerprintDraft(draft), expiresAt
    });
    await setMetadata(worker, handoffReadyStorageKey(handoffId, launchId), {
      handoffId, launchId, tabId, expiresAt, activationPolicy: "auto",
      pageReadyAt: null, activatedAt: null
    });

    const restoredUrl = buildContinueUrl(STAGING_ORIGIN, handoffId, extensionId, null, "save", launchId);
    const restoredNavigation = page.waitForURL(restoredUrl, { waitUntil: "commit" });
    await page.goto(hashlessUrl, { waitUntil: "commit" });
    await restoredNavigation;
    const readyKey = handoffReadyStorageKey(handoffId, launchId);
    for (let attempt = 0; attempt < 40 && Number((await readMetadata(worker, readyKey))?.restoreAttempts || 0) !== 1; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 50));
    const restoredReady = await readMetadata(worker, readyKey);
    assert.equal(restoredReady.restoreAttempts, 1, "the first hashless return must restore the bound handoff before onboarding JS has context");
    assert.equal(restoredReady.tabId, tabId);
    for (let attempt = 0; attempt < 40 && typeof (await readMetadata(worker, readyKey))?.pageReadyAt !== "string"; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 50));
    const pageReady = await readMetadata(worker, readyKey);
    assert.equal(typeof pageReady.pageReadyAt, "string", "the restored fragment page must notify the extension after its listener is installed");
    await page.waitForFunction(() => location.hash === "" && document.readyState !== "loading");
    await page.waitForSelector("#bootstrap", { state: "visible" });
    await page.locator("#bootstrap").click();
    for (let attempt = 0; attempt < 80 && (await readMetadata(worker, handoffStorageKey(handoffId)))?.status !== "completed"; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 100));
    const completed = await readMetadata(worker, handoffStorageKey(handoffId));
    assert.equal(completed.status, "completed", `実Workerへの保存が完了する: ${JSON.stringify({ completed, status: await page.locator("#status").textContent().catch(() => ""), databaseClaims: fixture.database.prepare("SELECT status, manual_id FROM claim_intents").all() })}`);
    assert.equal(await getDraft(worker, draft.id), null, "保存完了後はローカル下書きを消費する");

    const workspaceId = fixture.database.prepare("SELECT id FROM workspaces WHERE workspace_kind = 'personal'").get()?.id;
    const manual = fixture.database.prepare("SELECT id, title FROM manuals ORDER BY created_at DESC LIMIT 1").get();
    const step = fixture.database.prepare("SELECT asset_id, instruction FROM manual_steps WHERE revision_id = (SELECT current_draft_revision_id FROM manuals WHERE id = ?)").get(manual.id);
    assert.ok(workspaceId && manual?.id && step?.asset_id, "D1に手順書と画像参照が作成される");
    const reopened = await page.evaluate(async ({ detailUrl, assetUrl }) => {
      const detailResponse = await fetch(detailUrl, { credentials: "same-origin" });
      const detail = await detailResponse.json();
      const assetResponse = await fetch(assetUrl, { credentials: "same-origin" });
      const assetBody = [...new Uint8Array(await assetResponse.arrayBuffer())];
      return { detailStatus: detailResponse.status, title: detail?.draft?.title, instruction: detail?.steps?.[0]?.instruction, assetStatus: assetResponse.status, assetType: assetResponse.headers.get("content-type"), assetBody };
    }, { detailUrl: `/api/workspaces/${workspaceId}/manuals/${manual.id}`, assetUrl: `/api/workspaces/${workspaceId}/manuals/${manual.id}/assets/${step.asset_id}` });
    const storedImages = [...fixture.env.MANUAL_ASSETS.objects.values()].filter((object) => object.httpMetadata.contentType === "image/png");
    assert.equal(storedImages.length, 1);
    assert.deepEqual(reopened, { detailStatus: 200, title: draft.title, instruction: draft.steps[0].instruction, assetStatus: 200, assetType: "image/png", assetBody: [...storedImages[0].body] }, "保存した画像の全byteと本文を再取得できる");
    await page.goto(`${STAGING_ORIGIN}/manuals`, { waitUntil: "domcontentloaded" });
    await page.locator("#cloud-list button").filter({ hasText: draft.title }).click();
    await page.getByText("手順書を表示しています。", { exact: true }).waitFor();
    assert.equal(await page.locator("#cloud-detail .cloud-field input").inputValue(), draft.title);
    assert.equal(await page.getByRole("textbox", { name: "手順 1の説明", exact: true }).inputValue(), draft.steps[0].instruction);
    await page.waitForFunction(() => { const image = document.querySelector("img.cloud-step-image"); return image && !image.hidden && image.complete && image.naturalWidth === 1; });
    assert.equal(fixture.database.prepare("SELECT status FROM claim_intents ORDER BY created_at DESC LIMIT 1").get()?.status, "completed");
  } finally {
    await closeContext(context);
    await new Promise((resolveServer) => networkServer.server.close(() => resolveServer()));
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined);
    globalThis.fetch = originalFetch;
    fixture.database.close();
  }
});
