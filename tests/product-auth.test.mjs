import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { inspectAccessConfig, inspectProductAuthConfig } from "../apps/worker/src/server-config.ts";
import worker from "../apps/worker/src/index.ts";

const migrationNames = [
  "0001_d1_identity_workspace.sql", "0002_d1_personal_workspace.sql", "0003_d1_onboarding_bootstrap.sql",
  "0004_d1_cloud_manual_claim.sql", "0005_d1_share_links.sql", "0006_d1_manual_editor_branding.sql",
  "0007_d1_retained_save_recovery.sql", "0008_product_auth_sessions.sql"
];

test("product auth configuration is fail-closed and never exposes secret values", () => {
  const unset = inspectProductAuthConfig({});
  assert.equal(unset.google.configured, false);
  assert.equal(unset.chatgpt.configured, false);
  assert.deepEqual(Object.keys(unset.google).sort(), ["configured", "enabled", "hasClientId", "hasClientSecret"]);
  const google = inspectProductAuthConfig({ GOOGLE_OIDC_CLIENT_ID: "client", GOOGLE_OIDC_CLIENT_SECRET: "secret" });
  assert.equal(google.google.configured, true);
  assert.deepEqual(google.google, { configured: true, hasClientId: true, hasClientSecret: true, enabled: true });
  const disabledChatgpt = inspectProductAuthConfig({ OPENAI_SIWC_CLIENT_ID: "client", OPENAI_SIWC_CLIENT_SECRET: "secret", OPENAI_SIWC_ENABLED: "false" });
  assert.equal(disabledChatgpt.chatgpt.configured, false);
  const unapprovedChatgpt = inspectProductAuthConfig({ OPENAI_SIWC_CLIENT_ID: "client", OPENAI_SIWC_CLIENT_SECRET: "secret" });
  assert.equal(unapprovedChatgpt.chatgpt.enabled, false);
  assert.equal(unapprovedChatgpt.chatgpt.configured, false);
});

test("D1 product auth migration stores only hashes and enforces one-use transaction fields", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    for (const name of migrationNames) database.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
    assert.ok(tables.includes("auth_sessions"));
    assert.ok(tables.includes("oauth_transactions"));
    const columns = database.prepare("PRAGMA table_info(oauth_transactions)").all().map((row) => row.name);
    assert.ok(columns.includes("verifier_hash"));
    assert.ok(!columns.includes("verifier"));
    database.prepare("INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES ('auth-user', 'https://accounts.google.com', 'subject', 'active', '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z')").run();
    database.prepare("INSERT INTO auth_sessions(id, application_id, token_hash, auth_method, issued_at, expires_at) VALUES ('session', 'auth-user', ?, 'google', ?, ?)").run("a".repeat(64), "2026-10-03T00:00:00.000Z", "2026-10-04T00:00:00.000Z");
    assert.throws(() => database.prepare("INSERT INTO auth_sessions(id, application_id, token_hash, auth_method, issued_at, expires_at) VALUES ('session-2', 'auth-user', ?, 'access', ?, ?)").run("b".repeat(64), "2026-10-03T00:00:00.000Z", "2026-10-04T00:00:00.000Z"));
  } finally {
    database.close();
  }
});

test("OIDC provider endpoints and cookie binding stay fixed and raw verifier is not persisted", async () => {
  const source = await readFile(new URL("../apps/worker/src/product-auth.ts", import.meta.url), "utf8");
  assert.match(source, /api\/accounts\/authorize/u);
  assert.match(source, /api\/accounts\/oauth\/token/u);
  assert.match(source, /SameSite=Lax/u);
  assert.match(source, /cookie\(`\$\{OAUTH_COOKIE_PREFIX\}\$\{provider\}`,[^\n]*\)/u);
  assert.match(source, /verifier_hash/u);
});

class D1Adapter {
  constructor(database) { this.database = database; }
  prepare(sql) {
    const database = this.database;
    return { bind(...values) {
      return {
        async run() { const result = database.prepare(sql).run(...values); return { success: true, meta: { changes: Number(result.changes ?? 0), last_row_id: Number(result.lastInsertRowid ?? 0) } }; },
        async first() { return database.prepare(sql).get(...values) ?? null; },
        async all() { return { results: database.prepare(sql).all(...values) }; }
      };
    } };
  }
  async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
}

async function authDatabase() {
  const database = new DatabaseSync(":memory:");
  for (const name of migrationNames) database.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  return { database, binding: new D1Adapter(database) };
}

test("Google OIDC start→callback→D1 session→logout uses the product session boundary", async () => {
  const { database, binding } = await authDatabase();
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = { ...await exportJWK(publicKey), kid: "product-auth-test", alg: "RS256", use: "sig" };
  const originalFetch = globalThis.fetch;
  let nonce;
  let expectedChallenge;
  let tokenSubject = "google-subject";
  globalThis.fetch = async (input, init = {}) => {
    const target = String(input);
    if (target === "https://oauth2.googleapis.com/token") {
      const params = new URLSearchParams(init.body);
      assert.equal(params.get("client_id"), "google-test-client");
      assert.equal(params.get("redirect_uri"), `${env.APP_BASE_URL}/api/auth/google/callback`);
      assert.ok(params.get("code_verifier"));
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(params.get("code_verifier")));
      assert.equal(Buffer.from(digest).toString("base64url"), expectedChallenge);
      const token = await new SignJWT({ sub: tokenSubject, email: "person@example.test", email_verified: true, name: "Test User", nonce })
        .setProtectedHeader({ alg: "RS256", kid: "product-auth-test" }).setIssuer("https://accounts.google.com").setAudience("google-test-client").setIssuedAt().setExpirationTime("5m").sign(privateKey);
      return Response.json({ id_token: token });
    }
    if (target === "https://www.googleapis.com/oauth2/v3/certs") return Response.json({ keys: [publicJwk] });
    if (target === "https://access.example/jwks") return Response.json({ keys: [publicJwk] });
    throw new Error(`unexpected external request: ${target}`);
  };
  const env = { APP_ENV: "staging", APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com", GOOGLE_OIDC_CLIENT_ID: "google-test-client", GOOGLE_OIDC_CLIENT_SECRET: "secret-not-logged", ONBOARDING_RATE_LIMITER: { limit: async () => ({ success: true }) }, DB: binding };
  try {
    const start = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/start?return=%2F`), env, {});
    assert.equal(start.status, 302);
    const redirect = new URL(start.headers.get("location"));
    nonce = redirect.searchParams.get("nonce");
    expectedChallenge = redirect.searchParams.get("code_challenge");
    const setCookie = start.headers.get("set-cookie");
    assert.match(setCookie, /Path=\//u);
    assert.match(setCookie, /HttpOnly/u);
    const callback = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/callback?code=valid-code&state=${encodeURIComponent(redirect.searchParams.get("state"))}`, { headers: { cookie: setCookie.split(";")[0] } }), env, {});
    assert.equal(callback.status, 302);
    const replay = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/callback?code=valid-code&state=${encodeURIComponent(redirect.searchParams.get("state"))}`, { headers: { cookie: setCookie.split(";")[0] } }), env, {});
    assert.equal(replay.status, 401);
    const secondStart = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/start?return=%2F`), env, {});
    const secondRedirect = new URL(secondStart.headers.get("location"));
    nonce = secondRedirect.searchParams.get("nonce");
    expectedChallenge = secondRedirect.searchParams.get("code_challenge");
    tokenSubject = "google-subject-2";
    const secondCallback = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/callback?code=second-code&state=${encodeURIComponent(secondRedirect.searchParams.get("state"))}`, { headers: { cookie: secondStart.headers.get("set-cookie").split(";")[0] } }), env, {});
    assert.equal(secondCallback.status, 302);
    tokenSubject = "google-subject";
    assert.equal(database.prepare("SELECT count(*) AS total FROM identities WHERE issuer = 'https://accounts.google.com'").get().total, 2, "same email claim must not auto-link distinct provider subjects");
    database.prepare("INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES ('other-tenant-user', 'https://other.example', 'other-subject', 'active', '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z')").run();
    database.prepare("INSERT INTO workspaces(id, name, slug, status, created_by, created_at, updated_at, workspace_kind) VALUES ('other-workspace', 'Other workspace', 'other-workspace', 'active', 'other-tenant-user', '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z', 'standard')").run();
    database.prepare("INSERT INTO workspace_members(workspace_id, application_id, role, status, joined_at, updated_at) VALUES ('other-workspace', 'other-tenant-user', 'owner', 'active', '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z')").run();
    const sessionCookie = callback.headers.get("set-cookie").split(";")[0];
    const session = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/session`, { headers: { cookie: sessionCookie } }), env, {});
    assert.equal(session.status, 200);
    const sessionBody = await session.json();
    assert.equal(sessionBody.user.id, database.prepare("SELECT application_id FROM identities WHERE subject='google-subject'").get().application_id);
    assert.equal(sessionBody.workspaces.length, 1);
    const accessConfigured = { ...env, ACCESS_ISSUER: "https://access.example", ACCESS_AUDIENCE: "audience", ACCESS_JWKS_URL: "https://access.example/jwks" };
    assert.equal(inspectAccessConfig(accessConfigured).configured, true);
    assert.equal(inspectProductAuthConfig(accessConfigured).google.configured, true);
    const productLoginWithAccessConfig = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/session`), accessConfigured, {});
    assert.equal(productLoginWithAccessConfig.status, 401);
    assert.equal((await productLoginWithAccessConfig.json()).code, "SESSION_REQUIRED");
    database.prepare("INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES ('access-user', 'https://access.example', 'access-subject', 'active', '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z')").run();
    const accessAssertion = await new SignJWT({ type: "app", sub: "access-subject" }).setProtectedHeader({ alg: "RS256", kid: "product-auth-test" }).setIssuer("https://access.example").setAudience("audience").setIssuedAt().setExpirationTime("5m").sign(privateKey);
    const malformedWithAccess = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/session`, { headers: { cookie: "__Host-mm_product=%zz", "Cf-Access-Jwt-Assertion": accessAssertion } }), accessConfigured, {});
    assert.equal(malformedWithAccess.status, 401);
    const healthWithProductCookie = await worker.fetch(new Request(`${env.APP_BASE_URL}/health/config`, { headers: { cookie: sessionCookie } }), accessConfigured, {});
    assert.equal(healthWithProductCookie.status, 401, "product session must not authorize the Access health route");
    const foreignOrigin = await worker.fetch(new Request("https://other.example/api/session", { headers: { cookie: sessionCookie } }), env, {});
    assert.equal(foreignOrigin.status, 401);
    const invalidCookie = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/session`, { headers: { cookie: "__Host-mm_product=malformed" } }), env, {});
    assert.equal(invalidCookie.status, 401);
    const malformedCookie = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/session`, { headers: { cookie: "__Host-mm_product=%zz" } }), env, {});
    assert.equal(malformedCookie.status, 401);
    const misleadingCookie = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/session`, { headers: { cookie: "x__Host-mm_product=other", authorization: "Bearer invalid" } }), accessConfigured, {});
    assert.equal(misleadingCookie.status, 401);
    delete env.GOOGLE_OIDC_CLIENT_ID;
    delete env.GOOGLE_OIDC_CLIENT_SECRET;
    const providerDisabledSession = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/session`, { headers: { cookie: sessionCookie } }), env, {});
    assert.equal(providerDisabledSession.status, 200);
    database.prepare("INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES ('disabled-user', 'https://accounts.google.com', 'disabled-subject', 'disabled', '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z')").run();
    const disabledToken = "disabled-session-token";
    const disabledDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(disabledToken));
    const disabledHash = Array.from(new Uint8Array(disabledDigest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    database.prepare("INSERT INTO auth_sessions(id, application_id, token_hash, auth_method, issued_at, expires_at) VALUES ('disabled-session', 'disabled-user', ?, 'google', ?, ?)").run(disabledHash, new Date().toISOString(), new Date(Date.now() + 60_000).toISOString());
    const disabled = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/session`, { headers: { cookie: `__Host-mm_product=${disabledToken}` } }), env, {});
    assert.equal(disabled.status, 401);
    const logout = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/logout`, { method: "POST", headers: { origin: env.APP_BASE_URL, cookie: sessionCookie, "content-type": "application/json" }, body: "{}" }), env, {});
    assert.equal(logout.status, 204);
    const afterLogout = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/session`, { headers: { cookie: sessionCookie } }), env, {});
    assert.equal(afterLogout.status, 401);
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("Google callback rejects state, PKCE, and signed claim boundary violations in the Worker", async () => {
  const scenarios = [
    { name: "state", state: "wrong-state" },
    { name: "pkce", verifier: "wrong-verifier" },
    { name: "issuer", issuer: "https://attacker.example" },
    { name: "audience", audience: "wrong-client" },
    { name: "signature", signature: true },
    { name: "nonce", nonce: "wrong-nonce", status: 403 },
    { name: "expiry", expired: true },
    { name: "email", emailVerified: false, status: 403 }
  ];
  for (const scenario of scenarios) {
    const { database, binding } = await authDatabase();
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const { privateKey: wrongPrivateKey } = await generateKeyPair("RS256");
    const publicJwk = { ...await exportJWK(publicKey), kid: "product-auth-negative", alg: "RS256", use: "sig" };
    const originalFetch = globalThis.fetch;
    let nonce = "";
    let tokenRequests = 0;
    const env = {
      APP_ENV: "staging",
      APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com",
      GOOGLE_OIDC_CLIENT_ID: "google-negative-client",
      GOOGLE_OIDC_CLIENT_SECRET: "synthetic-secret",
      ONBOARDING_RATE_LIMITER: { limit: async () => ({ success: true }) },
      DB: binding
    };
    globalThis.fetch = async (input, init = {}) => {
      const target = String(input);
      if (target === "https://oauth2.googleapis.com/token") {
        tokenRequests += 1;
        const params = new URLSearchParams(init.body);
        assert.equal(params.get("redirect_uri"), `${env.APP_BASE_URL}/api/auth/google/callback`);
        const tokenClaims = { sub: "negative-subject", email: "negative@example.test", email_verified: scenario.emailVerified ?? true, nonce: scenario.nonce ?? nonce };
        const signer = scenario.signature ? wrongPrivateKey : privateKey;
        const builder = new SignJWT(tokenClaims)
          .setProtectedHeader({ alg: "RS256", kid: "product-auth-negative" })
          .setIssuer(scenario.issuer ?? "https://accounts.google.com")
          .setAudience(scenario.audience ?? env.GOOGLE_OIDC_CLIENT_ID)
          .setIssuedAt();
        const token = await builder.setExpirationTime(scenario.expired ? Math.floor(Date.now() / 1_000) - 60 : "5m").sign(signer);
        return Response.json({ id_token: token });
      }
      if (target === "https://www.googleapis.com/oauth2/v3/certs") return Response.json({ keys: [publicJwk] });
      throw new Error(`unexpected external request: ${target}`);
    };
    try {
      const start = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/start?return=%2F`), env, {});
      assert.equal(start.status, 302, scenario.name);
      const redirect = new URL(start.headers.get("location"));
      nonce = redirect.searchParams.get("nonce");
      const rawCookie = start.headers.get("set-cookie").split(";")[0];
      const [cookieName, cookieValue] = rawCookie.split("=");
      const cookieParts = cookieValue.split(".");
      assert.equal(cookieParts.length, 3);
      if (scenario.verifier) cookieParts[1] = scenario.verifier;
      const callbackCookie = `${cookieName}=${cookieParts.join(".")}`;
      const callbackState = scenario.state ?? redirect.searchParams.get("state");
      const callback = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/callback?code=negative-code&state=${encodeURIComponent(callbackState)}`, { headers: { cookie: callbackCookie } }), env, {});
      assert.equal(callback.status, scenario.status ?? 401, scenario.name);
      assert.equal(database.prepare("SELECT count(*) AS total FROM auth_sessions").get().total, 0, `${scenario.name} must not create a session`);
      if (scenario.state || scenario.verifier) assert.equal(tokenRequests, 0, `${scenario.name} must fail before token exchange`);
      else assert.equal(tokenRequests, 1, `${scenario.name} must reach token verification`);
    } finally {
      globalThis.fetch = originalFetch;
      database.close();
    }
  }
});

test("ChatGPT SIWC uses confidential client_secret_basic and scopes the provider subject", async () => {
  const { database, binding } = await authDatabase();
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = { ...await exportJWK(publicKey), kid: "siwc-auth-test", alg: "RS256", use: "sig" };
  const originalFetch = globalThis.fetch;
  let nonce;
  let expectedChallenge;
  let tokenRequest;
  globalThis.fetch = async (input, init = {}) => {
    const target = String(input);
    if (target === "https://auth.openai.com/api/accounts/oauth/token") {
      tokenRequest = { headers: new Headers(init.headers), body: String(init.body) };
      const params = new URLSearchParams(tokenRequest.body);
      assert.equal(params.get("client_id"), env.OPENAI_SIWC_CLIENT_ID);
      assert.equal(params.get("redirect_uri"), `${env.APP_BASE_URL}/api/auth/chatgpt/callback`);
      assert.ok(params.get("code_verifier"));
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(params.get("code_verifier")));
      assert.equal(Buffer.from(digest).toString("base64url"), expectedChallenge);
      const token = await new SignJWT({ sub: "siwc-subject", nonce, name: "SIWC User" })
        .setProtectedHeader({ alg: "RS256", kid: "siwc-auth-test" }).setIssuer("https://auth.openai.com").setAudience(env.OPENAI_SIWC_CLIENT_ID).setIssuedAt().setExpirationTime("5m").sign(privateKey);
      return Response.json({ id_token: token });
    }
    if (target === "https://auth.openai.com/.well-known/jwks.json") return Response.json({ keys: [publicJwk] });
    throw new Error(`unexpected external request: ${target}`);
  };
  const env = { APP_ENV: "staging", APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com", OPENAI_SIWC_CLIENT_ID: "siwc client:+", OPENAI_SIWC_CLIENT_SECRET: "secret value:+/=!", OPENAI_SIWC_ENABLED: "true", ONBOARDING_RATE_LIMITER: { limit: async () => ({ success: true }) }, DB: binding };
  try {
    const start = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/chatgpt/start`), env, {});
    assert.equal(start.status, 302);
    const redirect = new URL(start.headers.get("location"));
    nonce = redirect.searchParams.get("nonce");
    expectedChallenge = redirect.searchParams.get("code_challenge");
    const callback = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/chatgpt/callback?code=valid-code&state=${encodeURIComponent(redirect.searchParams.get("state"))}`, { headers: { cookie: start.headers.get("set-cookie").split(";")[0] } }), env, {});
    assert.equal(callback.status, 302);
    assert.match(tokenRequest.headers.get("authorization"), /^Basic [A-Za-z0-9+/]+=*$/u);
    assert.equal(Buffer.from(tokenRequest.headers.get("authorization").slice("Basic ".length), "base64").toString(), "siwc+client%3A%2B:secret+value%3A%2B%2F%3D%21");
    assert.doesNotMatch(tokenRequest.body, /client_secret/u);
    const identity = database.prepare("SELECT subject FROM identities WHERE issuer='https://auth.openai.com'").get();
    assert.match(identity?.subject ?? "", /^siwc:[0-9a-f]{64}$/u);
    assert.notEqual(identity?.subject, "siwc-subject");
    const firstSubject = identity.subject;
    env.OPENAI_SIWC_CLIENT_ID = "siwc-other-client";
    const secondStart = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/chatgpt/start`), env, {});
    const secondRedirect = new URL(secondStart.headers.get("location"));
    nonce = secondRedirect.searchParams.get("nonce");
    expectedChallenge = secondRedirect.searchParams.get("code_challenge");
    const secondCallback = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/chatgpt/callback?code=second-code&state=${encodeURIComponent(secondRedirect.searchParams.get("state"))}`, { headers: { cookie: secondStart.headers.get("set-cookie").split(";")[0] } }), env, {});
    assert.equal(secondCallback.status, 302);
    const subjects = database.prepare("SELECT subject FROM identities WHERE issuer='https://auth.openai.com' ORDER BY subject").all().map((row) => row.subject);
    assert.equal(subjects.length, 2);
    assert.notEqual(subjects[0], subjects[1]);
    assert.ok(subjects.includes(firstSubject));
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("未設定providerは開始前に拒否し、OAuth transactionを作成しない", async () => {
  const { database, binding } = await authDatabase();
  try {
    const response = await worker.fetch(new Request("https://meccha-manual-staging.meccha-iiyatsu.com/api/auth/chatgpt/start"), { APP_ENV: "staging", APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com", DB: binding }, {});
    assert.equal(response.status, 503);
    assert.equal(database.prepare("SELECT count(*) AS count FROM oauth_transactions").get().count, 0);
  } finally { database.close(); }
});

test("configured product provider without the onboarding limiter fails closed before creating a transaction", async () => {
  const { database, binding } = await authDatabase();
  try {
    const response = await worker.fetch(new Request("https://meccha-manual-staging.meccha-iiyatsu.com/api/auth/google/start"), {
      APP_ENV: "staging",
      APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com",
      GOOGLE_OIDC_CLIENT_ID: "google-test-client",
      GOOGLE_OIDC_CLIENT_SECRET: "secret-not-logged",
      DB: binding
    }, {});
    assert.equal(response.status, 503);
    assert.equal(database.prepare("SELECT count(*) AS count FROM oauth_transactions").get().count, 0);
  } finally { database.close(); }
});

test("invalid transaction and session timestamps fail closed", async () => {
  const { database, binding } = await authDatabase();
  const env = {
    APP_ENV: "staging",
    APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com",
    GOOGLE_OIDC_CLIENT_ID: "google-test-client",
    GOOGLE_OIDC_CLIENT_SECRET: "secret-not-logged",
    ONBOARDING_RATE_LIMITER: { limit: async () => ({ success: true }) },
    DB: binding
  };
  try {
    const start = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/start`), env, {});
    const redirect = new URL(start.headers.get("location"));
    const transactionId = database.prepare("SELECT id FROM oauth_transactions").get().id;
    database.prepare("UPDATE oauth_transactions SET expires_at='invalid-future' WHERE id=?").run(transactionId);
    const expired = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/callback?code=x&state=${encodeURIComponent(redirect.searchParams.get("state"))}`, { headers: { cookie: start.headers.get("set-cookie").split(";")[0] } }), env, {});
    assert.equal(expired.status, 401);
    assert.match(expired.headers.get("set-cookie") ?? "", /__Host-mm_oauth_google=; Max-Age=0; Path=\//u);

    database.prepare("INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES ('timestamp-user', 'https://accounts.google.com', 'timestamp-subject', 'active', '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z')").run();
    const token = "timestamp-session";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const tokenHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    database.prepare("INSERT INTO auth_sessions(id, application_id, token_hash, auth_method, issued_at, expires_at) VALUES ('timestamp-session', 'timestamp-user', ?, 'google', 'aaa', 'zzz')").run(tokenHash);
    const invalidSession = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/session`, { headers: { cookie: `__Host-mm_product=${token}` } }), env, {});
    assert.equal(invalidSession.status, 401);
  } finally { database.close(); }
});

test("logout does not report success when session revocation storage fails", async () => {
  const { database, binding } = await authDatabase();
  const failingDb = {
    prepare(sql) {
      const statement = binding.prepare(sql);
      return {
        bind(...values) {
          const bound = statement.bind(...values);
          return {
            run: async () => sql.startsWith("UPDATE auth_sessions") ? { success: false, meta: { changes: 0 } } : bound.run(),
            first: (...args) => bound.first(...args),
            all: (...args) => bound.all(...args)
          };
        }
      };
    }
  };
  try {
    const response = await worker.fetch(new Request("https://meccha-manual-staging.meccha-iiyatsu.com/api/auth/logout", { method: "POST", headers: { origin: "https://meccha-manual-staging.meccha-iiyatsu.com", cookie: "__Host-mm_product=known-session", "content-type": "application/json" }, body: "{}" }), { APP_ENV: "staging", APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com", DB: failingDb }, {});
    assert.equal(response.status, 503);
  } finally { database.close(); }
});

test("provider response bodies over the bounded limit fail closed", async () => {
  const { database, binding } = await authDatabase();
  const originalFetch = globalThis.fetch;
  const env = {
    APP_ENV: "staging",
    APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com",
    GOOGLE_OIDC_CLIENT_ID: "google-test-client",
    GOOGLE_OIDC_CLIENT_SECRET: "secret-not-logged",
    ONBOARDING_RATE_LIMITER: { limit: async () => ({ success: true }) },
    DB: binding
  };
  globalThis.fetch = async (input) => {
    if (String(input) === "https://oauth2.googleapis.com/token") {
      const oversized = new Uint8Array(256 * 1024 + 1);
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(oversized); controller.close(); } }), { status: 200 });
    }
    throw new Error(`unexpected external request: ${input}`);
  };
  try {
    const start = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/start`), env, {});
    const redirect = new URL(start.headers.get("location"));
    const response = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/callback?code=x&state=${encodeURIComponent(redirect.searchParams.get("state"))}`, { headers: { cookie: start.headers.get("set-cookie").split(";")[0] } }), env, {});
    assert.equal(response.status, 502);
    assert.match(response.headers.get("set-cookie") ?? "", /__Host-mm_oauth_google=; Max-Age=0/u);
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});
