import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "../apps/worker/src/index.ts";
import { chromium } from "./support/test-browser.mjs";

const STAGING_ORIGIN = "https://meccha-manual-staging.meccha-iiyatsu.com";
const GOOGLE_AUTH_ORIGIN = "https://accounts.google.com";
const CHATGPT_AUTH_ORIGIN = "https://auth.openai.com";
const migrations = [
  "0001_d1_identity_workspace.sql", "0002_d1_personal_workspace.sql", "0003_d1_onboarding_bootstrap.sql",
  "0004_d1_cloud_manual_claim.sql", "0005_d1_share_links.sql", "0006_d1_manual_editor_branding.sql",
  "0007_d1_retained_save_recovery.sql", "0008_product_auth_sessions.sql"
];

class D1Adapter {
  constructor(database) { this.database = database; }
  prepare(sql) {
    const database = this.database;
    return { bind(...values) {
      return {
        async run() {
          const result = database.prepare(sql).run(...values);
          return { success: true, meta: { changes: Number(result.changes ?? 0), last_row_id: Number(result.lastInsertRowid ?? 0) } };
        },
        async first() { return database.prepare(sql).get(...values) ?? null; },
        async all() { return { results: database.prepare(sql).all(...values) }; }
      };
    } };
  }
  async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
}

async function createFixture(provider = "google") {
  const database = new DatabaseSync(":memory:");
  for (const name of migrations) database.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = { ...await exportJWK(publicKey), kid: "product-auth-browser-test", alg: "RS256", use: "sig" };
  const noncesByCode = new Map();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const target = String(input);
    const code = new URLSearchParams(init.body).get("code") ?? "synthetic-browser-code";
    const nonce = noncesByCode.get(code) ?? "";
    if (target === "https://oauth2.googleapis.com/token") {
      const token = await new SignJWT({ sub: "synthetic-browser-subject", email: "synthetic@example.test", email_verified: true, name: "Synthetic Browser User", nonce })
        .setProtectedHeader({ alg: "RS256", kid: "product-auth-browser-test" })
        .setIssuer("https://accounts.google.com")
        .setAudience("google-browser-test-client")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
      return Response.json({ id_token: token });
    }
    if (target === "https://www.googleapis.com/oauth2/v3/certs") return Response.json({ keys: [publicJwk] });
    if (target === "https://auth.openai.com/api/accounts/oauth/token") {
      const token = await new SignJWT({ sub: "synthetic-siwc-subject", name: "Synthetic SIWC User", nonce })
        .setProtectedHeader({ alg: "RS256", kid: "product-auth-browser-test" })
        .setIssuer("https://auth.openai.com")
        .setAudience("synthetic-siwc-client")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
      return Response.json({ id_token: token });
    }
    if (target === "https://auth.openai.com/.well-known/jwks.json") return Response.json({ keys: [publicJwk] });
    throw new Error(`unexpected external request: ${target}`);
  };
  const isGoogle = provider === "google";
  return {
    database,
    env: {
      APP_ENV: "staging",
      APP_BASE_URL: STAGING_ORIGIN,
      GOOGLE_OIDC_CLIENT_ID: isGoogle ? "google-browser-test-client" : "",
      GOOGLE_OIDC_CLIENT_SECRET: isGoogle ? "synthetic-client-secret" : "",
      OPENAI_SIWC_CLIENT_ID: isGoogle ? "unregistered-siwc-client" : "synthetic-siwc-client",
      OPENAI_SIWC_CLIENT_SECRET: isGoogle ? "" : "synthetic-siwc-secret",
      OPENAI_SIWC_ENABLED: isGoogle ? "false" : "true",
      DB: new D1Adapter(database),
      ONBOARDING_RATE_LIMITER: { limit: async () => ({ success: true }) }
    },
    setNonce(value, code = "synthetic-browser-code") { noncesByCode.set(code, value); },
    restoreFetch() { globalThis.fetch = originalFetch; database.close(); }
  };
}

function browserRequest(route) {
  const request = route.request();
  const headers = request.headers();
  const method = request.method();
  return new Request(request.url(), {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : request.postDataBuffer() ?? undefined
  });
}

async function seedProductBrowserSession(fixture, { expired }) {
  const token = expired ? "expired-product-browser-token" : "active-product-browser-token";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const now = new Date();
  const issuedAt = new Date(now.getTime() - (expired ? 120_000 : 0));
  const expiresAt = expired ? new Date(now.getTime() - 60_000) : new Date(now.getTime() + 60 * 60_000);
  fixture.database.prepare("INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES ('browser-product-user', 'https://accounts.google.com', 'browser-product-subject', 'active', ?, ?)").run(issuedAt.toISOString(), issuedAt.toISOString());
  fixture.database.prepare("INSERT INTO profiles(application_id, display_name, locale, timezone, created_at, updated_at) VALUES ('browser-product-user', 'ブラウザ試験利用者', 'ja-JP', 'Asia/Tokyo', ?, ?)").run(issuedAt.toISOString(), issuedAt.toISOString());
  fixture.database.prepare("INSERT INTO workspaces(id, name, slug, status, created_by, created_at, updated_at, workspace_kind) VALUES ('00000000-0000-4000-8000-000000000201', 'ブラウザ試験ワークスペース', 'browser-product', 'active', 'browser-product-user', ?, ?, 'standard')").run(issuedAt.toISOString(), issuedAt.toISOString());
  fixture.database.prepare("INSERT INTO workspace_members(workspace_id, application_id, role, status, joined_at, updated_at) VALUES ('00000000-0000-4000-8000-000000000201', 'browser-product-user', 'owner', 'active', ?, ?)").run(issuedAt.toISOString(), issuedAt.toISOString());
  fixture.database.prepare("INSERT INTO auth_sessions(id, application_id, token_hash, auth_method, issued_at, expires_at) VALUES ('browser-product-session', 'browser-product-user', ?, 'google', ?, ?)").run(tokenHash, issuedAt.toISOString(), expiresAt.toISOString());
  return token;
}

async function runProductSessionBrowser({ expired }) {
  const fixture = await createFixture("google");
  const token = await seedProductBrowserSession(fixture, { expired });
  const context = await chromium.launchPersistentContext("", {
    channel: process.platform === "win32" ? "chrome" : "chromium",
    headless: true,
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();
  await context.addCookies([{
    name: "__Host-mm_product",
    value: token,
    domain: new URL(STAGING_ORIGIN).hostname,
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "Lax"
  }]);
  const routeTrace = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== STAGING_ORIGIN) {
      await route.abort();
      return;
    }
    try {
      const response = await worker.fetch(browserRequest(route), fixture.env, {});
      routeTrace.push(`${route.request().method()} ${url.pathname} ${response.status}`);
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: Buffer.from(await response.arrayBuffer())
      });
    } catch (error) {
      await route.abort("failed");
      throw error;
    }
  });
  try {
    await page.goto(`${STAGING_ORIGIN}/`, { waitUntil: "networkidle", timeout: 15_000 });
    if (expired) {
      await page.waitForSelector("#login-form", { state: "attached", timeout: 10_000 });
      await page.waitForSelector('#product-auth-buttons a[href^="/api/auth/google/start"]', { timeout: 10_000 });
      assert.equal(await page.locator("#login-form").evaluate((element) => getComputedStyle(element).display), "none");
      assert.equal(await page.locator("#logout-button").count(), 0);
      assert.ok(routeTrace.some((entry) => entry.endsWith("/api/session 401")), routeTrace.join(" | "));
      assert.equal(fixture.database.prepare("SELECT revoked_at FROM auth_sessions WHERE id = 'browser-product-session'").get().revoked_at, null);
    } else {
      await page.waitForSelector("#logout-button", { timeout: 10_000 });
      await page.locator("#logout-button").click();
      await page.waitForSelector("#login-form", { state: "attached", timeout: 10_000 });
      await page.waitForSelector('#product-auth-buttons a[href^="/api/auth/google/start"]', { timeout: 10_000 });
      assert.equal(await page.locator("#login-form").evaluate((element) => getComputedStyle(element).display), "none");
      for (let attempt = 0; attempt < 100 && !routeTrace.some((entry) => entry.endsWith("/api/auth/logout 200")); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.equal(fixture.database.prepare("SELECT revoked_at IS NOT NULL AS revoked FROM auth_sessions WHERE id = 'browser-product-session'").get().revoked, 1, routeTrace.join(" | "));
      assert.ok(routeTrace.some((entry) => entry.endsWith("/api/auth/logout 200")), routeTrace.join(" | "));
    }
  } finally {
    await page.close();
    await context.close();
    fixture.restoreFetch();
  }
}

async function runProviderBrowser(provider) {
  const fixture = await createFixture(provider);
  const providerConfig = provider === "google"
    ? { origin: GOOGLE_AUTH_ORIGIN, authorizationPath: "/o/oauth2/v2/auth", callbackPath: "/api/auth/google/callback", clientId: "google-browser-test-client", subject: "synthetic-browser-subject", issuer: "https://accounts.google.com" }
    : { origin: CHATGPT_AUTH_ORIGIN, authorizationPath: "/api/accounts/authorize", callbackPath: "/api/auth/chatgpt/callback", clientId: "synthetic-siwc-client", subject: "synthetic-siwc-subject", issuer: "https://auth.openai.com" };
  const context = await chromium.launchPersistentContext("", {
    channel: process.platform === "win32" ? "chrome" : "chromium",
    headless: true,
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();
  const browserExternalRequests = [];
  const routeTrace = [];
  await page.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    routeTrace.push(`${route.request().method()} ${requestUrl.origin}${requestUrl.pathname}`);
    if (requestUrl.origin === providerConfig.origin && requestUrl.pathname === providerConfig.authorizationPath) {
      browserExternalRequests.push({ origin: requestUrl.origin, pathname: requestUrl.pathname, synthetic: true });
      fixture.setNonce(requestUrl.searchParams.get("nonce") ?? "");
      const callback = new URL(`${STAGING_ORIGIN}${providerConfig.callbackPath}`);
      callback.searchParams.set("code", "synthetic-browser-code");
      callback.searchParams.set("state", requestUrl.searchParams.get("state") ?? "");
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: `<!doctype html><script>location.replace(${JSON.stringify(callback.toString())})</script>`
      });
      return;
    }
    if (requestUrl.origin !== STAGING_ORIGIN) {
      browserExternalRequests.push({ origin: requestUrl.origin, pathname: requestUrl.pathname, synthetic: false });
      await route.abort();
      return;
    }
    try {
      routeTrace.push("worker-start");
      const response = await worker.fetch(browserRequest(route), fixture.env, {});
      routeTrace.push(`worker-done-${response.status}`);
      const body = Buffer.from(await response.arrayBuffer());
      routeTrace.push(`body-${body.length}`);
      if (requestUrl.pathname === `/api/auth/${provider}/start` && response.status === 302) {
        const providerLocation = response.headers.get("location");
        assert.ok(providerLocation);
        const headers = Object.fromEntries(response.headers.entries());
        delete headers.location;
        await route.fulfill({
          status: 200,
          headers,
          contentType: "text/html; charset=utf-8",
          body: `<!doctype html><script>location.replace(${JSON.stringify(providerLocation)})</script>`
        });
        routeTrace.push("start-as-provider-page");
        return;
      }
      if (requestUrl.pathname === providerConfig.callbackPath && response.status === 302) {
        assert.equal(response.headers.get("referrer-policy"), "no-referrer", "successful callback must prevent callback URL referrer leakage");
        const returnLocation = response.headers.get("location");
        assert.ok(returnLocation);
        const setCookie = response.headers.get("set-cookie") ?? "";
        const sessionCookieMatch = setCookie.match(/__Host-mm_product=([^;]+)/u);
        assert.ok(sessionCookieMatch, "callback must return the first-party session cookie");
        assert.match(setCookie, /__Host-mm_product=[^;]+; Max-Age=\d+; Path=\/; HttpOnly; Secure; SameSite=Lax/u);
        // Playwright's route.fulfill does not populate its cookie jar from a
        // synthetic response. Materialize the exact Worker Set-Cookie value so
        // subsequent browser fetches exercise the real HttpOnly session path.
        await context.addCookies([{
          name: "__Host-mm_product",
          value: decodeURIComponent(sessionCookieMatch[1]),
          domain: new URL(STAGING_ORIGIN).hostname,
          path: "/",
          secure: true,
          httpOnly: true,
          sameSite: "Lax"
        }]);
        const onboarding = await worker.fetch(new Request(returnLocation), fixture.env, {});
        const onboardingBody = Buffer.from(await onboarding.arrayBuffer()).toString("utf8");
        const headers = Object.fromEntries(response.headers.entries());
        delete headers.location;
        await route.fulfill({
          status: 200,
          headers: { ...headers, "content-type": "text/html; charset=utf-8" },
          body: `<script>history.replaceState(null, "", ${JSON.stringify(new URL(returnLocation).pathname)})</script>${onboardingBody}`
        });
        routeTrace.push("callback-as-return-page");
        return;
      }
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers.entries()), body });
      routeTrace.push("fulfilled");
    } catch (error) {
      await route.abort("failed");
      throw error;
    }
  });

  try {
    const handoff = "A".repeat(43);
    const requestedAction = "save";
    await page.goto(`${STAGING_ORIGIN}/onboarding/continue#handoff=${handoff}&action=${requestedAction}&requestedAction=${requestedAction}`, { waitUntil: "commit", timeout: 10_000 }).catch((error) => {
      throw new Error(`${error.message}; routeTrace=${routeTrace.join(" | ")}`);
    });
    await page.waitForSelector("#bootstrap", { timeout: 10_000 });
    assert.notEqual((await page.locator("#status").textContent())?.trim(), "", "initial onboarding page must expose a status notice");
    await page.locator("#bootstrap").click();
    const providerSelector = `#product-auth-buttons a[href^="/api/auth/${provider}/start"]`;
    const otherProvider = provider === "google" ? "chatgpt" : "google";
    const otherProviderSelector = `#product-auth-buttons a[href^="/api/auth/${otherProvider}/start"]`;
    await page.waitForSelector(providerSelector, { timeout: 10_000 });
    assert.equal(await page.locator("#login-form").getAttribute("aria-hidden"), "true");
    assert.equal(await page.locator("#login-form").evaluate((element) => getComputedStyle(element).display), "none", "provider-only login must hide the password form in the rendered UI");
    assert.equal(await page.locator(".auth-divider").count(), 0, "a single provider must not show an orphaned separator");
    assert.equal((await page.locator(".panel-heading p").textContent())?.trim(), `${provider === "google" ? "Google" : "ChatGPT"}でログインしてください。`);
    assert.equal(await page.locator(otherProviderSelector).count(), 0, `${otherProvider} must not expose an unconfigured login action`);
    const providerStartHref = await page.locator(providerSelector).getAttribute("href");
    assert.equal(new URL(providerStartHref, STAGING_ORIGIN).searchParams.get("return"), "/onboarding/continue");
    await page.locator(providerSelector).click();
    await page.waitForURL(`${STAGING_ORIGIN}/onboarding/continue`, { timeout: 10_000 }).catch((error) => {
      throw new Error(`${error.message}; routeTrace=${routeTrace.join(" | ")}`);
    });
    await page.waitForFunction((expected) => {
      const raw = sessionStorage.getItem("meccha-manual:onboarding-operation");
      try { return JSON.parse(raw || "null")?.activeHandoffId === expected; } catch { return false; }
    }, handoff, { timeout: 10_000 }).catch(async (error) => {
      throw new Error(`${error.message}; url=${page.url()}; operation=${await page.evaluate(() => sessionStorage.getItem("meccha-manual:onboarding-operation"))}; loginReturn=${await page.evaluate(() => sessionStorage.getItem("meccha-manual:product-login-return"))}; routeTrace=${routeTrace.join(" | ")}`);
    });
    const restored = await page.evaluate(() => ({
      operation: sessionStorage.getItem("meccha-manual:onboarding-operation"),
      loginReturn: sessionStorage.getItem("meccha-manual:product-login-return"),
      hash: location.hash,
      status: document.querySelector("#status")?.textContent?.trim() || ""
    }));
    const operation = JSON.parse(restored.operation || "null");
    assert.equal(restored.loginReturn, null, "login return marker is one-shot and must be consumed after restoration");
    assert.equal(restored.hash, "", "handoff fragment must be scrubbed after it is copied into sessionStorage");
    assert.notEqual(restored.status, "", "restored onboarding page must expose a status notice");
    assert.equal(operation?.version, 2);
    assert.equal(operation?.activeHandoffId, handoff);
    assert.equal(operation?.entries?.length, 1);
    assert.equal(operation.entries[0].handoffId, handoff);
    assert.equal(operation.entries[0].outputAction, requestedAction);
    assert.equal(operation.entries[0].requestedAction, requestedAction);
    assert.equal(operation.entries[0].state, "active");
    assert.match(operation.entries[0].operationId, /^[A-Za-z0-9_-]{43}$/u);
    assert.ok(Number.isFinite(Date.parse(operation.entries[0].createdAt)));
    assert.deepEqual(await page.evaluate(async () => (await fetch("/api/auth/providers", { credentials: "same-origin" })).json()), {
      providers: { google: provider === "google", chatgpt: provider === "chatgpt" },
      password: false
    });

    const cookies = await context.cookies(STAGING_ORIGIN);
    const sessionCookie = cookies.find((cookie) => cookie.name === "__Host-mm_product");
    assert.ok(sessionCookie, `Worker callback must establish the browser session cookie; browser cookies=${cookies.map((cookie) => cookie.name).join(",")}; routeTrace=${routeTrace.join(" | ")}`);
    assert.equal(sessionCookie.path, "/");
    assert.equal(sessionCookie.secure, true);
    assert.equal(sessionCookie.httpOnly, true);
    assert.equal(sessionCookie.sameSite, "Lax");
    assert.equal(await page.evaluate(() => document.cookie.includes("__Host-mm_product")), false, "session token must stay out of JavaScript");

    const sessionResponse = await page.evaluate(async () => {
      const response = await fetch("/api/session", { credentials: "same-origin" });
      return { status: response.status, body: await response.json() };
    });
    assert.equal(sessionResponse.status, 200);
    const identity = fixture.database.prepare("SELECT application_id, issuer, subject FROM identities WHERE issuer = ?").get(providerConfig.issuer);
    assert.equal(sessionResponse.body.user.id, identity.application_id);
    assert.equal(identity.issuer, providerConfig.issuer);
    if (provider === "google") assert.equal(identity.subject, providerConfig.subject);
    else assert.match(identity.subject, /^siwc:[0-9a-f]{64}$/u);
    assert.equal(fixture.database.prepare("SELECT auth_method FROM auth_sessions WHERE application_id = ?").get(identity.application_id).auth_method, provider);
    assert.equal(sessionResponse.body.workspaces.length, 1);
    assert.equal(await page.evaluate(() => location.pathname), "/onboarding/continue");
    assert.deepEqual(browserExternalRequests, [{ origin: providerConfig.origin, pathname: providerConfig.authorizationPath, synthetic: true }]);
  } finally {
    await page.close();
    await context.close();
    fixture.restoreFetch();
  }
}

async function runParallelProviderBrowser(provider) {
  const fixture = await createFixture(provider);
  const providerConfig = provider === "google"
    ? { origin: GOOGLE_AUTH_ORIGIN, authorizationPath: "/o/oauth2/v2/auth", callbackPath: "/api/auth/google/callback" }
    : { origin: CHATGPT_AUTH_ORIGIN, authorizationPath: "/api/accounts/authorize", callbackPath: "/api/auth/chatgpt/callback" };
  const context = await chromium.launchPersistentContext("", {
    channel: process.platform === "win32" ? "chrome" : "chromium",
    headless: true,
    ignoreHTTPSErrors: true
  });
  const pages = [await context.newPage(), await context.newPage()];
  const pending = new WeakMap();
  const callbackStatuses = [];
  let sequence = 0;
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === providerConfig.origin && url.pathname === providerConfig.authorizationPath) {
      const page = route.request().frame().page();
      const state = url.searchParams.get("state") ?? "";
      const code = `parallel-browser-${provider}-${sequence++}`;
      fixture.setNonce(url.searchParams.get("nonce") ?? "", code);
      pending.set(page, { state, code });
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: "<!doctype html><title>provider fixture</title>" });
      return;
    }
    if (url.origin !== STAGING_ORIGIN) {
      await route.abort();
      return;
    }
    const response = await worker.fetch(browserRequest(route), fixture.env, {});
    const headers = Object.fromEntries(response.headers.entries());
    const setCookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
    for (const setCookie of setCookies) {
      const [nameValue, ...attributes] = setCookie.split(";");
      const separator = nameValue.indexOf("=");
      if (separator < 1) continue;
      const name = nameValue.slice(0, separator);
      const value = nameValue.slice(separator + 1);
      const maxAge = attributes.find((attribute) => /^\s*Max-Age=/iu.test(attribute))?.split("=")[1]?.trim();
      if (maxAge === "0") await context.clearCookies({ name });
      else await context.addCookies([{ name, value: decodeURIComponent(value), domain: new URL(STAGING_ORIGIN).hostname, path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
    }
    if (url.pathname === `/api/auth/${provider}/start` && response.status === 302) {
      const location = response.headers.get("location");
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: `<!doctype html><script>location.replace(${JSON.stringify(location ?? "")})</script>` });
      return;
    }
    if (url.pathname === providerConfig.callbackPath) {
      callbackStatuses.push({ code: url.searchParams.get("code"), error: url.searchParams.get("error"), status: response.status });
      if (response.status === 302) {
        const returnLocation = response.headers.get("location");
        const returned = returnLocation ? await worker.fetch(new Request(returnLocation), fixture.env, {}) : new Response(null, { status: 200 });
        const returnedHeaders = Object.fromEntries(returned.headers.entries());
        await route.fulfill({ status: 200, headers: returnedHeaders, body: Buffer.from(await returned.arrayBuffer()) });
        return;
      }
    }
    await route.fulfill({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) });
  });
  const start = async (page) => {
    await page.goto(`${STAGING_ORIGIN}/api/auth/${provider}/start?return=%2F`, { waitUntil: "domcontentloaded", timeout: 15_000 });
    const transaction = pending.get(page);
    assert.ok(transaction, `${provider} start must reach its provider fixture`);
    return transaction;
  };
  const callback = async (page, transaction, action) => {
    const query = action === "cancel" ? `error=access_denied&state=${encodeURIComponent(transaction.state)}` : `code=${encodeURIComponent(transaction.code)}&state=${encodeURIComponent(transaction.state)}`;
    await page.goto(`${STAGING_ORIGIN}${providerConfig.callbackPath}?${query}`, { waitUntil: "domcontentloaded", timeout: 15_000 });
    return callbackStatuses.at(-1);
  };
  try {
    for (const [firstAction, order] of [["success", [0, 1]], ["success", [1, 0]], ["cancel", [0, 1]], ["cancel", [1, 0]]]) {
      const first = await start(pages[0]);
      const second = await start(pages[1]);
      const transactions = [first, second];
      const firstResult = await callback(pages[order[0]], transactions[order[0]], firstAction === "cancel" && order[0] === 0 ? "cancel" : "success");
      assert.equal(firstResult.status, firstAction === "cancel" && order[0] === 0 ? 401 : 302, `${provider}/${firstAction}/${order.join(",")}`);
      const secondResult = await callback(pages[order[1]], transactions[order[1]], firstAction === "cancel" && order[1] === 0 ? "cancel" : "success");
      assert.equal(secondResult.status, firstAction === "cancel" && order[1] === 0 ? 401 : 302, `${provider}/${firstAction}/${order.join(",")}/second`);
      assert.equal((await context.cookies(STAGING_ORIGIN)).filter((cookie) => cookie.name.startsWith("__Host-mm_oauth_")).length, 0, `${provider} callbacks must clear only their completed transaction cookie`);
    }
    await context.addCookies([
      { name: "__Host-mm_access", value: "legacy-browser-access", domain: new URL(STAGING_ORIGIN).hostname, path: "/", secure: true, httpOnly: true, sameSite: "Lax" },
      { name: "__Host-mm_refresh", value: "legacy-browser-refresh", domain: new URL(STAGING_ORIGIN).hostname, path: "/", secure: true, httpOnly: true, sameSite: "Lax" }
    ]);
    const legacyFirst = await start(pages[0]);
    const legacySecond = await start(pages[1]);
    await callback(pages[0], legacyFirst, "success");
    const afterProductLogin = await context.cookies(STAGING_ORIGIN);
    assert.equal(afterProductLogin.some((cookie) => cookie.name === "__Host-mm_access"), false, `${provider} product success must clear legacy access cookie`);
    assert.equal(afterProductLogin.some((cookie) => cookie.name === "__Host-mm_refresh"), false, `${provider} product success must clear legacy refresh cookie`);
    const productCookie = afterProductLogin.find((cookie) => cookie.name === "__Host-mm_product");
    assert.ok(productCookie, `${provider} product success must issue product cookie`);
    const logout = await pages[0].evaluate(async () => (await fetch("/api/auth/logout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status);
    assert.equal(logout, 200);
    await pages[0].goto(`${STAGING_ORIGIN}/`, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await pages[0].waitForSelector("#login-form", { state: "attached", timeout: 10_000 });
    await pages[0].waitForSelector(`#product-auth-buttons a[href^="/api/auth/${provider}/start"]`, { timeout: 10_000 });
    assert.equal(await pages[0].locator("#login-form").evaluate((element) => getComputedStyle(element).display), "none", `${provider} logout must return to the provider-only login UI`);
    assert.equal(await pages[0].locator(".auth-divider").count(), 0, `${provider} logout must not show an orphaned separator`);
    assert.equal((await context.cookies(STAGING_ORIGIN)).some((cookie) => cookie.name === "__Host-mm_product"), false, `${provider} product logout must clear product cookie before reload`);
    await callback(pages[1], legacySecond, "success");
  } finally {
    await Promise.all(pages.map((page) => page.close()));
    await context.close();
    fixture.restoreFetch();
  }
}

test("product auth browser uses a synthetic Google callback, a first-party HttpOnly session, and preserves the handoff", { timeout: 60_000 }, async () => {
  await runProviderBrowser("google");
});

test("product auth browser keeps parallel transaction cookies and clears legacy credentials for Google and ChatGPT", { timeout: 120_000 }, async () => {
  await runParallelProviderBrowser("google");
  await runParallelProviderBrowser("chatgpt");
});

test("configured synthetic ChatGPT browser provider creates the same session and preserves the handoff", { timeout: 60_000 }, async () => {
  await runProviderBrowser("chatgpt");
});

test("browser product logout revokes the first-party session and returns to the password login UI", { timeout: 60_000 }, async () => {
  await runProductSessionBrowser({ expired: false });
});

test("expired browser product session receives 401 and renders the password login UI", { timeout: 60_000 }, async () => {
  await runProductSessionBrowser({ expired: true });
});
