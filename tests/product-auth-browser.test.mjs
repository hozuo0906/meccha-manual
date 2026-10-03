import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "../apps/worker/src/index.ts";
import { chromium } from "./support/test-browser.mjs";

const STAGING_ORIGIN = "https://meccha-manual-staging.meccha-iiyatsu.com";
const GOOGLE_AUTH_ORIGIN = "https://accounts.google.com";
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

async function createFixture() {
  const database = new DatabaseSync(":memory:");
  for (const name of migrations) database.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = { ...await exportJWK(publicKey), kid: "product-auth-browser-test", alg: "RS256", use: "sig" };
  let nonce = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const target = String(input);
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
    throw new Error(`unexpected external request: ${target}`);
  };
  return {
    database,
    env: {
      APP_ENV: "staging",
      APP_BASE_URL: STAGING_ORIGIN,
      GOOGLE_OIDC_CLIENT_ID: "google-browser-test-client",
      GOOGLE_OIDC_CLIENT_SECRET: "synthetic-client-secret",
      OPENAI_SIWC_CLIENT_ID: "unregistered-siwc-client",
      OPENAI_SIWC_CLIENT_SECRET: "",
      OPENAI_SIWC_ENABLED: "false",
      DB: new D1Adapter(database),
      ONBOARDING_RATE_LIMITER: { limit: async () => ({ success: true }) }
    },
    setNonce(value) { nonce = value; },
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

test("product auth browser uses a synthetic OIDC callback, a first-party HttpOnly session, and no unregistered SIWC action", { timeout: 60_000 }, async () => {
  const fixture = await createFixture();
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
    if (requestUrl.origin === GOOGLE_AUTH_ORIGIN && requestUrl.pathname === "/o/oauth2/v2/auth") {
      browserExternalRequests.push({ origin: requestUrl.origin, pathname: requestUrl.pathname, synthetic: true });
      fixture.setNonce(requestUrl.searchParams.get("nonce") ?? "");
      const callback = new URL(`${STAGING_ORIGIN}/api/auth/google/callback`);
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
      if (requestUrl.pathname === "/api/auth/google/start" && response.status === 302) {
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
      if (requestUrl.pathname === "/api/auth/google/callback" && response.status === 302) {
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
    await page.waitForSelector("#product-auth-buttons a[href^=\"/api/auth/google/start\"]", { timeout: 10_000 });
    assert.equal(await page.locator("#login-form").getAttribute("aria-hidden"), "true");
    assert.equal(await page.locator("#product-auth-buttons a[href^=\"/api/auth/chatgpt/start\"]").count(), 0, "unregistered SIWC must not expose a login action");
    const googleStartHref = await page.locator("#product-auth-buttons a[href^=\"/api/auth/google/start\"]").getAttribute("href");
    assert.equal(new URL(googleStartHref, STAGING_ORIGIN).searchParams.get("return"), "/onboarding/continue");
    await page.locator("#product-auth-buttons a[href^=\"/api/auth/google/start\"]").click();
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
    assert.deepEqual(await page.evaluate(async () => (await fetch("/api/auth/providers", { credentials: "same-origin" })).json()), { providers: { google: true, chatgpt: false }, password: false });

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
    const identity = fixture.database.prepare("SELECT application_id, issuer, subject FROM identities WHERE issuer = ? AND subject = ?").get("https://accounts.google.com", "synthetic-browser-subject");
    assert.equal(sessionResponse.body.user.id, identity.application_id);
    assert.equal(identity.issuer, "https://accounts.google.com");
    assert.equal(identity.subject, "synthetic-browser-subject");
    assert.equal(sessionResponse.body.workspaces.length, 1);
    assert.equal(await page.evaluate(() => location.pathname), "/onboarding/continue");
    assert.deepEqual(browserExternalRequests, [{ origin: GOOGLE_AUTH_ORIGIN, pathname: "/o/oauth2/v2/auth", synthetic: true }]);
  } finally {
    await page.close();
    await context.close();
    fixture.restoreFetch();
  }
});
