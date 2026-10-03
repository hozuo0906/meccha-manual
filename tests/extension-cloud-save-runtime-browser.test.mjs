import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { generateKeyPairSync } from "node:crypto";
import { readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { resolve, join, relative, sep, basename } from "node:path";
import test from "node:test";
import { chromium } from "./support/test-browser.mjs";
import { exportJWK, SignJWT } from "jose";
import { fingerprintDraft, handoffReadyStorageKey, handoffStorageKey } from "../apps/extension/editor/handoff.js";
import { ONBOARDING_JS, renderOnboardingContinuePage } from "../apps/worker/src/onboarding-assets.ts";
import cloudWorker from "../apps/worker/src/index.ts";

const STAGING_ORIGIN = "https://meccha-manual-staging.meccha-iiyatsu.com";
const ACCESS_ISSUER = "https://access.example.invalid";
const ACCESS_AUDIENCE = "meccha-manual-staging";
const ACCESS_JWKS_URL = `${ACCESS_ISSUER}/.well-known/jwks.json`;
const extensionRoot = resolve(fileURLToPath(new URL("../apps/extension/", import.meta.url)));
const migrations = [
  "0001_d1_identity_workspace.sql", "0002_d1_personal_workspace.sql", "0003_d1_onboarding_bootstrap.sql",
  "0004_d1_cloud_manual_claim.sql", "0005_d1_share_links.sql", "0006_d1_manual_editor_branding.sql", "0007_d1_retained_save_recovery.sql"
];

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
      try { const result = []; for (const statement of statements) result.push(await statement.run()); this.database.exec("COMMIT"); return result; }
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

async function createFixture() {
  const database = new DatabaseSync(":memory:");
  for (const name of migrations) database.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicJwk = { ...await exportJWK(publicKey), kid: "office-runtime-local", alg: "RS256", use: "sig" };
  const token = await new SignJWT({ type: "app", sub: "office-runtime-local-user" })
    .setProtectedHeader({ alg: "RS256", kid: publicJwk.kid }).setIssuer(ACCESS_ISSUER).setAudience(ACCESS_AUDIENCE)
    .setIssuedAt().setExpirationTime("5m").sign(privateKey);
  return {
    database,
    token,
    publicJwk,
    env: { APP_ENV: "staging", APP_BASE_URL: STAGING_ORIGIN, ACCESS_ISSUER, ACCESS_AUDIENCE, ACCESS_JWKS_URL, DB: new LocalD1(database), MANUAL_ASSETS: new MemoryR2(), ONBOARDING_RATE_LIMITER: { limit: async () => ({ success: true }) } }
  };
}

function workerRequest(request, token) {
  const headers = new Headers(request.headers());
  headers.set("Cf-Access-Jwt-Assertion", token);
  headers.set("Cf-Connecting-IP", "198.51.100.10");
  if (!headers.has("content-length") && headers.has("x-asset-byte-length")) headers.set("content-length", headers.get("x-asset-byte-length"));
  const body = ["GET", "HEAD"].includes(request.method()) ? undefined : request.postDataBuffer() ?? undefined;
  const input = new Request(request.url(), { method: request.method(), headers, body });
  Object.defineProperty(input, "cf", { value: { colo: "NRT", asn: 64500 }, configurable: true });
  return input;
}

function profilePath(path) {
  const resolved = resolve(path);
  const temp = resolve(tmpdir());
  const rel = relative(temp, resolved);
  assert.ok(rel && rel !== ".." && !rel.startsWith(`..${sep}`), "isolated profile must stay below the OS temp directory");
  assert.match(basename(resolved), /^meccha-manual-office-runtime-/);
  return resolved;
}

async function openExtension(profile) {
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    ignoreHTTPSErrors: true,
    args: [`--disable-extensions-except=${extensionRoot}`, `--load-extension=${extensionRoot}`]
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 15_000 });
  const extensionId = new URL(worker.url()).hostname;
  assert.match(extensionId, /^[a-p]{32}$/);
  return { context, worker, extensionId };
}

async function closeContext(context) {
  if (!context) return;
  await Promise.race([Promise.resolve().then(() => context.close()).catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 5_000))]);
}

async function putDraft(worker, draft) {
  await worker.evaluate(async (value) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("meccha-manual-guest", 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("drafts")) request.result.createObjectStore("drafts", { keyPath: "id" }); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("drafts", "readwrite"); transaction.objectStore("drafts").put(structuredClone(value));
      transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  }, draft);
}

async function setStorage(worker, key, value) {
  await worker.evaluate(({ key: storageKey, value: storageValue }) => new Promise((resolve, reject) => {
    chrome.storage.local.set({ [storageKey]: storageValue }, () => { const error = chrome.runtime.lastError; if (error) reject(new Error(error.message)); else resolve(); });
  }), { key, value });
}

async function getStorage(worker, key) {
  return worker.evaluate((storageKey) => new Promise((resolve, reject) => {
    chrome.storage.local.get(storageKey, (result) => { const error = chrome.runtime.lastError; if (error) reject(new Error(error.message)); else resolve(result?.[storageKey] ?? null); });
  }), key);
}

async function tabIdForPage(worker, page) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const id = await worker.evaluate((url) => new Promise((resolve, reject) => {
      chrome.tabs.query({}, (tabs) => { const error = chrome.runtime.lastError; if (error) reject(new Error(error.message)); else resolve(tabs.find((tab) => tab.url === url)?.id ?? null); });
    }), page.url());
    if (Number.isInteger(id)) return id;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
}

async function createStagingPage(context, fixture) {
  const page = await context.newPage();
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== STAGING_ORIGIN) { await route.abort(); return; }
    if (url.pathname === "/onboarding/continue") {
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: renderOnboardingContinuePage({ bootstrapEnabled: true }) }); return;
    }
    if (url.pathname === "/assets/onboarding.js") {
      await route.fulfill({ status: 200, contentType: "application/javascript; charset=utf-8", body: ONBOARDING_JS }); return;
    }
    if (url.pathname.startsWith("/api/") || url.pathname === "/manuals" || url.pathname.startsWith("/assets/cloud-manual.")) {
      const response = await cloudWorker.fetch(workerRequest(route.request(), fixture.token), fixture.env, {});
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers.entries()), body: Buffer.from(await response.arrayBuffer()) }); return;
    }
    await route.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: "" });
  });
  return page;
}

async function waitForCompleted(worker, key) {
  await worker.evaluate(async (storageKey) => {
    const deadline = Date.now() + 40_000;
    while (Date.now() < deadline) {
      const value = await new Promise((resolve, reject) => chrome.storage.local.get(storageKey, (result) => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(result?.[storageKey])));
      if (value?.status === "completed") return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const latest = await new Promise((resolve, reject) => chrome.storage.local.get(storageKey, (result) => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(result?.[storageKey] ?? null)));
    throw new Error(`handoff did not reach completed: ${JSON.stringify(latest)}`);
  }, key);
}

test("actual MV3 coordinator completes authenticated Office docx and pptx claims", { timeout: 180_000 }, async () => {
  const originalFetch = globalThis.fetch;
  const fixture = await createFixture();
  globalThis.fetch = async (url, options) => String(url) === ACCESS_JWKS_URL ? Response.json({ keys: [fixture.publicJwk] }) : originalFetch(url, options);
  try {
    for (const [index, officeFormat] of ["docx", "pptx"].entries()) {
      const profile = profilePath(await mkdtemp(join(tmpdir(), "meccha-manual-office-runtime-")));
      let context;
      try {
        let worker; let extensionId;
        ({ context, worker, extensionId } = await openExtension(profile));
        const handoffId = String.fromCharCode(76 + index).repeat(43);
        const launchId = String.fromCharCode(78 + index).repeat(43);
        const draft = {
          id: `office-runtime-draft-${officeFormat}`,
          title: `Office runtime ${officeFormat}`,
          description: "authenticated coordinator fixture",
          updatedAt: "2026-10-03T00:00:00.000Z",
          steps: [{ id: `office-runtime-step-${officeFormat}`, order: 1, instruction: "設定を確認する", screenshotId: `office-runtime-image-${officeFormat}` }],
          screenshots: [{ id: `office-runtime-image-${officeFormat}`, dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", masks: [] }]
        };
        await putDraft(worker, draft);
        const draftFingerprint = await fingerprintDraft(draft);
        const expiresAt = new Date(Date.now() + 120_000).toISOString();
        await setStorage(worker, handoffStorageKey(handoffId), { handoffId, draftId: draft.id, outputAction: "office", officeFormat, extensionId, draftUpdatedAt: draft.updatedAt, draftFingerprint, expiresAt });
        const page = await createStagingPage(context, fixture);
        await page.goto(`${STAGING_ORIGIN}/onboarding/continue`, { waitUntil: "domcontentloaded" });
        const tabId = await tabIdForPage(worker, page);
        assert.ok(Number.isInteger(tabId));
        await setStorage(worker, handoffReadyStorageKey(handoffId, launchId), { handoffId, launchId, tabId, requestedAction: "office", requestedOfficeFormat: officeFormat, expiresAt, activationPolicy: "manual", pageReadyAt: new Date().toISOString(), activatedAt: new Date().toISOString() });
        await page.goto(`${STAGING_ORIGIN}/onboarding/continue#handoff=${handoffId}&extensionId=${extensionId}&launchId=${launchId}&action=office&officeFormat=${officeFormat}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => location.hash === "");
        await page.waitForFunction(() => {
          try {
            const state = JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation") || "null");
            const entry = state?.entries?.find((item) => item?.handoffId === state?.activeHandoffId);
            return typeof entry?.draftFingerprint === "string" && typeof entry?.expiresAt === "string";
          } catch { return false; }
        }, null, { timeout: 10_000 });
        await page.locator("#bootstrap").click();
        await waitForCompleted(worker, handoffStorageKey(handoffId));
        const completed = await getStorage(worker, handoffStorageKey(handoffId));
        assert.equal(completed.outputAction, "office");
        assert.equal(completed.officeFormat, officeFormat);
        assert.equal(completed.draftFingerprint, draftFingerprint);
        assert.ok(completed.claimIntentId, "completion must carry the authenticated claim identity");
        assert.ok(completed.cloudRef?.workspaceId && completed.cloudRef?.manualId && completed.cloudRef?.revisionId, "completion must carry the server cloud reference");
        const claim = fixture.database.prepare("SELECT status, operation_id, manual_id FROM claim_intents ORDER BY created_at DESC LIMIT 1").get();
        assert.equal(claim.status, "completed");
        assert.equal(claim.operation_id, completed.operationId);
        assert.equal(claim.manual_id, completed.completedManualId);
        assert.equal(fixture.database.prepare("SELECT COUNT(*) AS count FROM manuals").get().count, index + 1);
        assert.equal([...fixture.env.MANUAL_ASSETS.objects.values()].filter((object) => object.httpMetadata.contentType === "image/png").length, index + 1);
      } finally {
        await closeContext(context);
        await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined);
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
    fixture.database.close();
  }
});
