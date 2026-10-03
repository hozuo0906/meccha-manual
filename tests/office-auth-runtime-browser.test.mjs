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
import cloudWorker from "../apps/worker/src/index.ts";

const STAGING_ORIGIN = "https://meccha-manual-staging.meccha-iiyatsu.com";
const GOOGLE_AUTH_ORIGIN = "https://accounts.google.com";
const CHATGPT_AUTH_ORIGIN = "https://auth.openai.com";
const extensionRoot = resolve(fileURLToPath(new URL("../apps/extension/", import.meta.url)));
const migrations = [
  "0001_d1_identity_workspace.sql", "0002_d1_personal_workspace.sql", "0003_d1_onboarding_bootstrap.sql",
  "0004_d1_cloud_manual_claim.sql", "0005_d1_share_links.sql", "0006_d1_manual_editor_branding.sql", "0007_d1_retained_save_recovery.sql", "0008_product_auth_sessions.sql"
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

async function createFixture(provider) {
  const database = new DatabaseSync(":memory:");
  for (const name of migrations) database.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicJwk = { ...await exportJWK(publicKey), kid: "office-auth-runtime", alg: "RS256", use: "sig" };
  let nonce = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    const target = String(input);
    if (target === "https://oauth2.googleapis.com/token") {
      const token = await new SignJWT({ sub: "synthetic-office-user", email: "synthetic@example.test", email_verified: true, nonce })
        .setProtectedHeader({ alg: "RS256", kid: publicJwk.kid }).setIssuer("https://accounts.google.com").setAudience("office-auth-google")
        .setIssuedAt().setExpirationTime("5m").sign(privateKey);
      return Response.json({ id_token: token });
    }
    if (target === "https://www.googleapis.com/oauth2/v3/certs") return Response.json({ keys: [publicJwk] });
    if (target === "https://auth.openai.com/api/accounts/oauth/token") {
      const token = await new SignJWT({ sub: "synthetic-office-siwc", name: "Synthetic Office User", nonce })
        .setProtectedHeader({ alg: "RS256", kid: publicJwk.kid }).setIssuer("https://auth.openai.com").setAudience("office-auth-chatgpt")
        .setIssuedAt().setExpirationTime("5m").sign(privateKey);
      return Response.json({ id_token: token });
    }
    if (target === "https://auth.openai.com/.well-known/jwks.json") return Response.json({ keys: [publicJwk] });
    return originalFetch(input, options);
  };
  const google = provider === "google";
  return {
    database,
    env: { APP_ENV: "staging", APP_BASE_URL: STAGING_ORIGIN,
      GOOGLE_OIDC_CLIENT_ID: google ? "office-auth-google" : "", GOOGLE_OIDC_CLIENT_SECRET: google ? "synthetic-secret" : "",
      OPENAI_SIWC_CLIENT_ID: google ? "" : "office-auth-chatgpt", OPENAI_SIWC_CLIENT_SECRET: google ? "" : "synthetic-secret", OPENAI_SIWC_ENABLED: google ? "false" : "true",
      DB: new LocalD1(database), MANUAL_ASSETS: new MemoryR2(), ONBOARDING_RATE_LIMITER: { limit: async () => ({ success: true }) } },
    setNonce(value) { nonce = value; },
    restoreFetch() { globalThis.fetch = originalFetch; database.close(); }
  };
}

function browserRequest(request) {
  const headers = new Headers(request.headers());
  headers.set("CF-Connecting-IP", "198.51.100.10");
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

async function getAllStorage(worker) {
  return worker.evaluate(() => new Promise((resolve, reject) => {
    chrome.storage.local.get(null, (result) => { const error = chrome.runtime.lastError; if (error) reject(new Error(error.message)); else resolve(result || {}); });
  }));
}

function officeIntentStorageKey(draftId) {
  return `meccha-manual:office-intent:${draftId}`;
}

async function watchOfficeReturnReceipt(worker, handoffId) {
  await worker.evaluate((id) => {
    globalThis.__officeReturnReceiptEvents = [];
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      const value = changes[`meccha-manual:handoff:${id}`]?.newValue;
      if (value?.officeReturnReceipt) globalThis.__officeReturnReceiptEvents.push(value.officeReturnReceipt);
    });
  }, handoffId);
}

async function sendExternalMessage(page, extensionId, message) {
  return page.evaluate(async ({ id, payload }) => chrome.runtime.sendMessage(id, payload), { id: extensionId, payload: message });
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

function sessionCookieFromResponse(raw, hostname) {
  const match = String(raw || "").match(/(?:^|,\s*)(__Host-mm_product=[^,]+)/u);
  assert.ok(match, "product auth callback must issue the first-party session cookie");
  const parts = match[1].split(";").map((part) => part.trim());
  const pair = parts.shift();
  const separator = pair.indexOf("=");
  const attributes = new Map(parts.map((part) => { const index = part.indexOf("="); return [part.slice(0, index < 0 ? part.length : index).toLowerCase(), index < 0 ? true : part.slice(index + 1)]; }));
  const cookie = {
    name: pair.slice(0, separator), value: decodeURIComponent(pair.slice(separator + 1)), domain: hostname, path: String(attributes.get("path") || "/"),
    secure: attributes.has("secure"), httpOnly: attributes.has("httponly"), sameSite: String(attributes.get("samesite") || "").toLowerCase() === "strict" ? "Strict" : String(attributes.get("samesite") || "").toLowerCase() === "none" ? "None" : "Lax"
  };
  assert.equal(cookie.name, "__Host-mm_product");
  assert.equal(cookie.path, "/");
  assert.equal(cookie.secure, true);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, "Lax");
  return cookie;
}

async function installStagingRoutes(context, fixture, provider) {
  const providerConfig = provider === "google"
    ? { origin: GOOGLE_AUTH_ORIGIN, authorizationPath: "/o/oauth2/v2/auth", callbackPath: "/api/auth/google/callback" }
    : { origin: CHATGPT_AUTH_ORIGIN, authorizationPath: "/api/accounts/authorize", callbackPath: "/api/auth/chatgpt/callback" };
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === providerConfig.origin && url.pathname === providerConfig.authorizationPath) {
      fixture.setNonce(url.searchParams.get("nonce") || "");
      const callback = new URL(`${STAGING_ORIGIN}${providerConfig.callbackPath}`);
      callback.searchParams.set("code", "synthetic-office-code"); callback.searchParams.set("state", url.searchParams.get("state") || "");
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: `<!doctype html><script>location.replace(${JSON.stringify(callback.toString())})</script>` }); return;
    }
    if (url.origin !== STAGING_ORIGIN && url.protocol !== "chrome-extension:" && !["about:", "data:"].includes(url.protocol)) { await route.abort(); return; }
    if (url.origin !== STAGING_ORIGIN) { await route.continue(); return; }
    const request = route.request();
    const response = url.pathname === "/onboarding/continue"
      ? await cloudWorker.fetch(new Request(url, { headers: { cookie: request.headers().cookie || "" } }), fixture.env, {})
      : await cloudWorker.fetch(browserRequest(request), fixture.env, {});
    if (url.pathname === "/onboarding/continue" && response.status !== 200) console.error("generated-onboarding-response", response.status, response.headers.has("location"));
    if (url.pathname === providerConfig.callbackPath && response.status === 302) {
      const returnLocation = response.headers.get("location"); assert.ok(returnLocation);
      assert.equal(new URL(returnLocation, STAGING_ORIGIN).origin, STAGING_ORIGIN, "product auth callback must return to the staging onboarding origin");
      const cookieHeader = response.headers.get("set-cookie");
      const cookie = sessionCookieFromResponse(cookieHeader, url.hostname);
      await context.addCookies([cookie]);
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: `<!doctype html><script>location.replace(${JSON.stringify(new URL(returnLocation, STAGING_ORIGIN).toString())})</script>`
      }); return;
    }
    const headers = Object.fromEntries(response.headers.entries()); delete headers.location;
    if (url.pathname === `/api/auth/${provider}/start` && response.status === 302) {
      const location = response.headers.get("location"); assert.ok(location);
      await route.fulfill({ status: 200, headers, contentType: "text/html; charset=utf-8", body: `<!doctype html><script>location.replace(${JSON.stringify(location)})</script>` }); return;
    }
    await route.fulfill({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) });
  });
}

async function createStagingPage(context, fixture, provider) {
  await installStagingRoutes(context, fixture, provider);
  return context.newPage();
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
    const summary = latest && typeof latest === "object" ? {
      status: latest.status || null,
      outputAction: latest.outputAction || null,
      officeFormat: latest.officeFormat || null,
      hasOperationId: typeof latest.operationId === "string",
      operationIdLength: typeof latest.operationId === "string" ? latest.operationId.length : 0,
      hasClaimIntentId: typeof latest.claimIntentId === "string",
      hasDraftFingerprint: typeof latest.draftFingerprint === "string",
      hasCloudRef: Boolean(latest.cloudRef)
    } : null;
    throw new Error(`handoff did not reach completed: ${JSON.stringify(summary)}`);
  }, key);
}

test("actual MV3 Office claims use product-auth Google and ChatGPT sessions", { timeout: 360_000 }, async () => {
  for (const provider of ["google", "chatgpt"]) {
    const fixture = await createFixture(provider);
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
        await setStorage(worker, officeIntentStorageKey(draft.id), { draftId: draft.id, handoffId, officeFormat, draftFingerprint, expiresAt });
        const originalEditor = await context.newPage();
        await originalEditor.goto(`chrome-extension://${extensionId}/editor/editor.html#${draft.id}`, { waitUntil: "domcontentloaded" });
        await originalEditor.locator("#editor-heading").waitFor({ state: "visible", timeout: 15_000 });
        await originalEditor.locator(".header-office-actions > summary").click();
        const formatButton = originalEditor.locator(officeFormat === "docx" ? "#exportWord" : "#exportPowerPoint");
        await formatButton.click();
        await originalEditor.locator("#outputGate").waitFor({ state: "visible", timeout: 10_000 });
        assert.match(await originalEditor.locator("#outputGateTitle").textContent(), officeFormat === "docx" ? /Word/u : /PowerPoint/u);
        await originalEditor.locator("#cancelOutput").click();
        await originalEditor.close();
        const page = await createStagingPage(context, fixture, provider);
        const providerSelector = `#product-auth-buttons a[href^="/api/auth/${provider}/start"]`;
        await page.goto(`${STAGING_ORIGIN}/?return=${encodeURIComponent("/onboarding/continue")}`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(providerSelector, { timeout: 15_000 });
        await page.locator(providerSelector).click();
        await page.waitForURL(`${STAGING_ORIGIN}/onboarding/continue`, { timeout: 15_000 });
        assert.ok((await page.context().cookies(STAGING_ORIGIN)).some((cookie) => cookie.name === "__Host-mm_product"));
        const productCookie = (await page.context().cookies(STAGING_ORIGIN)).find((cookie) => cookie.name === "__Host-mm_product");
        assert.equal(productCookie?.path, "/");
        assert.equal(productCookie?.secure, true);
        assert.equal(productCookie?.httpOnly, true);
        assert.equal(productCookie?.sameSite, "Lax");
        assert.equal(await page.evaluate(() => document.cookie.includes("__Host-mm_product")), false, "product session token must remain HttpOnly");
        const session = await page.evaluate(async () => { const response = await fetch("/api/session", { credentials: "same-origin" }); return { status: response.status, body: await response.json() }; });
        assert.equal(session.status, 200);
        assert.ok(session.body.user?.id && session.body.workspaces?.length === 1, "product session must resolve its workspace");
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
        await watchOfficeReturnReceipt(worker, handoffId);
        const wrongFormat = officeFormat === "docx" ? "pptx" : "docx";
        const wrongFormatReply = await sendExternalMessage(page, extensionId, {
          schema: "meccha-manual/cloud-claim-v1",
          type: "handoff.office-return",
          handoffId,
          launchId,
          officeFormat: wrongFormat
        });
        assert.deepEqual(wrongFormatReply, { ok: false, error: "OFFICE_RETURN_REJECTED" }, "a return for another Office format must be rejected");
        const wrongLaunchReply = await sendExternalMessage(page, extensionId, {
          schema: "meccha-manual/cloud-claim-v1",
          type: "handoff.office-return",
          handoffId,
          launchId: "Z".repeat(43),
          officeFormat
        });
        assert.deepEqual(wrongLaunchReply, { ok: false, error: "OFFICE_RETURN_REJECTED" }, "a return for another launch must be rejected");
        assert.deepEqual(await worker.evaluate(() => globalThis.__officeReturnReceiptEvents || []), [], "rejected returns must not issue an Office receipt");
        assert.equal((await getStorage(worker, handoffStorageKey(handoffId)))?.officeReturnReceipt, undefined, "rejected returns must not persist an Office receipt");
        let resolveDownload;
        const downloadPromise = new Promise((resolve) => { resolveDownload = resolve; });
        const downloadListener = (candidate) => resolveDownload(candidate);
        const pageListener = (candidate) => candidate.on("download", downloadListener);
        context.on("page", pageListener);
        try {
          const editorPagePromise = context.waitForEvent("page", { timeout: 15_000 });
          await page.waitForFunction(() => document.querySelector("#bootstrap")?.disabled === false, null, { timeout: 10_000 });
          await page.locator("#bootstrap").click();
          const editorPage = await editorPagePromise;
          await editorPage.waitForLoadState("domcontentloaded");
          assert.match(editorPage.url(), new RegExp(`^chrome-extension://${extensionId}/editor/editor\\.html#${draft.id}$`));
          const download = await Promise.race([
            downloadPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error("Office download did not start")), 30_000))
          ]);
          const filePath = await download.path();
          assert.ok(filePath, "Office download must expose a file path");
          const bytes = await readFile(filePath);
          assert.deepEqual([...bytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04], "Office output must be a ZIP package");
          assert.match(await download.suggestedFilename(), new RegExp(`\\.${officeFormat}$`));
          const receipts = await worker.evaluate(() => globalThis.__officeReturnReceiptEvents || []);
          assert.ok(receipts.some((receipt) => receipt.handoffId === handoffId && receipt.launchId === launchId && receipt.officeFormat === officeFormat && receipt.draftFingerprint === draftFingerprint), "editor return must use a real SW-issued Office receipt");
          assert.equal(await getStorage(worker, officeIntentStorageKey(draft.id)), null, "Office intent must be consumed after the download");
          assert.equal((await getStorage(worker, handoffStorageKey(handoffId)))?.officeReturnReceipt, undefined, "Office return receipt must be consumed by the resumed editor");
          let duplicateDownloads = 0;
          editorPage.on("download", () => { duplicateDownloads += 1; });
          const duplicateReply = await editorPage.evaluate(async ({ hid, lid, format, fingerprint }) => chrome.runtime.sendMessage({
            schema: "meccha-manual/cloud-claim-v1",
            type: "handoff.office-return-consume",
            handoffId: hid,
            launchId: lid,
            officeFormat: format,
            draftFingerprint: fingerprint
          }), { hid: handoffId, lid: launchId, format: officeFormat, fingerprint: draftFingerprint });
          assert.deepEqual(duplicateReply, { ok: true, value: { ok: false, error: "OFFICE_RETURN_CONSUME_REJECTED" } }, "a consumed receipt must reject a second editor return");
          assert.equal(duplicateDownloads, 0, "a rejected second editor return must not download again");
        } finally {
          context.off("page", pageListener);
        }
      } finally {
        await closeContext(context);
        await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined);
      }
    }
  } finally {
    fixture.restoreFetch();
    }
  }
});

test("editor startRegistration creates the real Office handoff for both synthetic providers", { timeout: 600_000 }, async () => {
  for (const provider of ["google", "chatgpt"]) {
    const fixture = await createFixture(provider);
    try {
      for (const [index, officeFormat] of ["docx", "pptx"].entries()) {
        const profile = profilePath(await mkdtemp(join(tmpdir(), "meccha-manual-office-runtime-")));
        let context;
        try {
          ({ context } = await openExtension(profile));
          await installStagingRoutes(context, fixture, provider);
          const worker = context.serviceWorkers()[0];
          const extensionId = new URL(worker.url()).hostname;
          const draftId = `office-generated-${provider}-${officeFormat}`;
          const draft = {
            id: draftId, title: `Generated Office ${officeFormat}`, description: "real editor handoff fixture",
            updatedAt: "2026-10-03T00:00:00.000Z",
            steps: [{ id: `generated-step-${officeFormat}`, order: 1, instruction: "生成されたOffice出力を確認する", screenshotId: `generated-image-${officeFormat}`, imageState: { status: "ready", reason: null, attempts: 1, version: 1 }, privacyReview: { replacementCount: 0, protectedRegionCount: 0, reviewRequired: false, reasonCodes: ["manual_image_review"], replacements: [] } }],
            screenshots: [{ id: `generated-image-${officeFormat}`, dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", masks: [], privacyReview: { replacementCount: 0, protectedRegionCount: 0, reviewRequired: false, reasonCodes: ["manual_image_review"], replacements: [] } }]
          };
          await putDraft(worker, draft);
          const editor = await context.newPage();
          await editor.goto(`chrome-extension://${extensionId}/editor/editor.html#${draftId}`, { waitUntil: "domcontentloaded" });
          await editor.locator("#editor-heading").waitFor({ state: "visible", timeout: 15_000 });
          await editor.locator(".header-office-actions > summary").click();
          await editor.locator(officeFormat === "docx" ? "#exportWord" : "#exportPowerPoint").click();
          await editor.locator("#outputGate").waitFor({ state: "visible", timeout: 10_000 });
          await editor.locator("#startRegistration:not([disabled])").waitFor({ timeout: 15_000 });

          const stagingPagePromise = (async () => {
            const deadline = Date.now() + 30_000;
            while (Date.now() < deadline) {
              const page = context.pages().find((candidate) => candidate.url().startsWith(`${STAGING_ORIGIN}/onboarding/continue`));
              if (page) return page;
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
            throw new Error(`generated staging page did not open for ${provider}/${officeFormat}`);
          })();
          const registrationClick = editor.locator("#startRegistration").click();
          const stagingPage = await stagingPagePromise;
          await stagingPage.waitForSelector("#bootstrap", { timeout: 20_000 });
          const intent = await (async () => {
            const deadline = Date.now() + 10_000;
            while (Date.now() < deadline) {
              const values = await getAllStorage(worker);
              const candidate = Object.values(values).find((value) => value?.draftId === draftId && value?.officeFormat === officeFormat && typeof value.handoffId === "string");
              if (candidate) return candidate;
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
            throw new Error(`editor did not persist Office intent for ${provider}/${officeFormat}`);
          })();
          assert.equal(intent.draftId, draftId);
          const handoffId = intent.handoffId;
          const allBeforeAuth = await getAllStorage(worker);
          const readyEntry = Object.entries(allBeforeAuth).find(([key, value]) => key.includes(`:handoff-ready:${handoffId}:`) && value?.requestedAction === "office");
          assert.ok(readyEntry, "startRegistration must create a matching handoff-ready record");
          const launchId = readyEntry[1].launchId;
          assert.equal(readyEntry[1].requestedOfficeFormat, officeFormat);
          assert.equal(readyEntry[1].tabId, await tabIdForPage(worker, stagingPage));

          await stagingPage.locator("#bootstrap").click();
          const providerSelector = `#product-auth-buttons a[href^="/api/auth/${provider}/start"]`;
          await stagingPage.waitForSelector(providerSelector, { timeout: 15_000 });
          const preProviderState = await stagingPage.evaluate(() => {
            let saved = null;
            try { saved = JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation") || "null"); } catch {}
            return {
              pathname: location.pathname,
              hasHash: Boolean(location.hash),
              hasLoginReturn: sessionStorage.getItem("meccha-manual:product-login-return") !== null,
              activeEntries: Array.isArray(saved?.entries) ? saved.entries.filter((entry) => entry?.state === "active").length : 0
            };
          });
          assert.equal(preProviderState.hasLoginReturn, true, "initial unauthenticated bootstrap must preserve the generated return context");
          assert.ok(preProviderState.activeEntries >= 1, "generated handoff must remain active through product login");
          const fragmentReturnPromise = stagingPage.waitForURL((url) => url.pathname === "/onboarding/continue" && url.hash.includes("handoff="), { timeout: 30_000 });
          await stagingPage.locator(providerSelector).click();
          await stagingPage.waitForURL(`${STAGING_ORIGIN}/onboarding/continue`, { waitUntil: "commit", timeout: 15_000 });
          await fragmentReturnPromise;
          try {
            await stagingPage.waitForFunction(() => !sessionStorage.getItem("meccha-manual:product-login-return"), null, { timeout: 15_000 });
          } catch (error) {
            const diagnostic = await stagingPage.evaluate(() => {
              let saved = null;
              try { saved = JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation") || "null"); } catch {}
              return {
                pathname: location.pathname,
                hasHash: Boolean(location.hash),
                bootstrapText: document.querySelector("#bootstrap")?.textContent || "",
                statusText: document.querySelector("#status")?.textContent || "",
                hasLoginReturn: sessionStorage.getItem("meccha-manual:product-login-return") !== null,
                activeHandoffIdPresent: typeof saved?.activeHandoffId === "string",
                activeHandoffMatchesEntry: Array.isArray(saved?.entries) && saved.entries.some((entry) => entry?.handoffId === saved?.activeHandoffId),
                operationStates: Array.isArray(saved?.entries) ? saved.entries.map((entry) => ({ version: saved?.version, state: entry?.state || null, handoffIdLength: typeof entry?.handoffId === "string" ? entry.handoffId.length : 0, operationIdLength: typeof entry?.operationId === "string" ? entry.operationId.length : 0, ageMs: typeof entry?.createdAt === "string" ? Date.now() - Date.parse(entry.createdAt) : null, outputAction: entry?.outputAction, officeFormat: entry?.officeFormat, requestedAction: entry?.requestedAction, requestedOfficeFormat: entry?.requestedOfficeFormat, extensionIdLength: typeof entry?.extensionId === "string" ? entry.extensionId.length : 0, launchIdLength: typeof entry?.launchId === "string" ? entry.launchId.length : 0, hasExpiresAt: typeof entry?.expiresAt === "string" })) : []
              };
            });
            console.error("generated-return-diagnostic", diagnostic);
            throw error;
          }
          const restoredState = await stagingPage.evaluate(() => ({
            pathname: location.pathname,
            hasHash: Boolean(location.hash),
            hasLoginReturn: sessionStorage.getItem("meccha-manual:product-login-return") !== null,
            bootstrapText: document.querySelector("#bootstrap")?.textContent || "",
            statusText: document.querySelector("#status")?.textContent || ""
          }));
          assert.equal(restoredState.pathname, "/onboarding/continue");
          assert.equal(restoredState.hasHash, false, "product-auth return must scrub the handoff fragment");
          assert.equal(restoredState.hasLoginReturn, false, "product-auth return context must be consumed once");
          const bootstrapButton = stagingPage.locator("#bootstrap");
          await bootstrapButton.waitFor({ state: "visible", timeout: 15_000 });
          await stagingPage.locator("#bootstrap:not([disabled])").waitFor({ state: "visible", timeout: 15_000 });
          const initialBootstrapText = (await bootstrapButton.textContent())?.trim() || "";
          const downloadPromise = editor.waitForEvent("download", { timeout: 0 });
          await bootstrapButton.click();
          if (initialBootstrapText !== "保存先を準備する") {
            await stagingPage.waitForFunction((previousText) => {
              const button = document.querySelector("#bootstrap");
              return button && !button.disabled && button.textContent?.trim() !== previousText;
            }, initialBootstrapText, { timeout: 15_000 });
            await bootstrapButton.click();
          }
          await registrationClick;
          await waitForCompleted(worker, handoffStorageKey(handoffId));
          const completed = await getStorage(worker, handoffStorageKey(handoffId));
          assert.equal(completed.outputAction, "office");
          assert.equal(completed.officeFormat, officeFormat);
          assert.equal(completed.draftFingerprint, intent.draftFingerprint);
          assert.ok(completed.claimIntentId && completed.cloudRef?.workspaceId && completed.cloudRef?.manualId && completed.cloudRef?.revisionId);
          assert.equal(fixture.database.prepare("SELECT status FROM claim_intents ORDER BY created_at DESC LIMIT 1").get().status, "completed");
          assert.equal(fixture.database.prepare("SELECT COUNT(*) AS count FROM manuals").get().count, index + 1);
          assert.equal([...fixture.env.MANUAL_ASSETS.objects.values()].filter((object) => object.httpMetadata.contentType === "image/png").length, index + 1);

          const download = await Promise.race([
            downloadPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error("Office download did not start while the editor remained open")), 30_000))
          ]);
          const downloadedPath = await download.path();
          assert.ok(downloadedPath);
          assert.deepEqual([...(await readFile(downloadedPath)).subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
          assert.match(await download.suggestedFilename(), new RegExp(`\\.${officeFormat}$`));

          const wrongFormat = officeFormat === "docx" ? "pptx" : "docx";
          assert.deepEqual(await sendExternalMessage(stagingPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.office-return", handoffId, launchId, officeFormat: wrongFormat }), { ok: false, error: "OFFICE_RETURN_REJECTED" });
          assert.deepEqual(await sendExternalMessage(stagingPage, extensionId, { schema: "meccha-manual/cloud-claim-v1", type: "handoff.office-return", handoffId, launchId: "Z".repeat(43), officeFormat }), { ok: false, error: "OFFICE_RETURN_REJECTED" });
          assert.equal((await getStorage(worker, handoffStorageKey(handoffId))).officeReturnReceipt, undefined);
          assert.equal(await getStorage(worker, officeIntentStorageKey(draftId)), null);
          assert.equal((await getStorage(worker, handoffStorageKey(handoffId))).officeReturnReceipt, undefined);
        } finally {
          await closeContext(context);
          await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined);
        }
      }
    } finally {
      fixture.restoreFetch();
    }
  }
});
