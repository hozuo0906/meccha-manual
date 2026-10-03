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
  assert.match(source, /oauthTransactionCookieName\(provider, await hash\(state\)\)/u);
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

function firstCookie(response) {
  return response.headers.get("set-cookie").split(";")[0];
}

function cookieName(cookie) {
  return cookie.slice(0, cookie.indexOf("="));
}

function rejectingBinding(binding, sqlPrefix, operation) {
  return {
    prepare(sql) {
      if (!sql.startsWith(sqlPrefix)) return binding.prepare(sql);
      if (operation === "prepare") throw new Error("synthetic storage rejection");
      const statement = binding.prepare(sql);
      return {
        bind(...values) {
          if (operation === "bind") throw new Error("synthetic storage rejection");
          const bound = statement.bind(...values);
          return {
            run: operation === "run" ? async () => { throw new Error("synthetic storage rejection"); } : operation === "run-false" ? async () => ({ success: false, meta: { changes: 0 } }) : bound.run,
            first: operation === "first" ? async () => { throw new Error("synthetic storage rejection"); } : bound.first,
            all: bound.all
          };
        }
      };
    }
  };
}

test("OAuth transaction storage rejections at prepare, bind, and run fail closed", async () => {
  for (const operation of ["prepare", "bind", "run"]) {
    const { database, binding } = await authDatabase();
    const env = {
      APP_ENV: "staging",
      APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com",
      GOOGLE_OIDC_CLIENT_ID: "google-storage-boundary-client",
      GOOGLE_OIDC_CLIENT_SECRET: "synthetic-secret",
      ONBOARDING_RATE_LIMITER: { limit: async () => ({ success: true }) },
      DB: rejectingBinding(binding, "INSERT INTO oauth_transactions", operation)
    };
    try {
      const response = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/start`), env, {});
      assert.equal(response.status, 503, operation);
      assert.equal((await response.json()).code, "AUTH_STORAGE_UNAVAILABLE", operation);
      assert.equal(response.headers.get("location"), null, operation);
      assert.equal(response.headers.get("set-cookie"), null, operation);
      assert.equal(database.prepare("SELECT count(*) AS count FROM oauth_transactions").get().count, 0, operation);
    } finally {
      database.close();
    }
  }
});

test("Google OIDC start→callback→D1 session→logout uses the product session boundary", async () => {
  const { database, binding } = await authDatabase();
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = { ...await exportJWK(publicKey), kid: "product-auth-test", alg: "RS256", use: "sig" };
  const originalFetch = globalThis.fetch;
  let nonce;
  let expectedChallenge;
  let tokenSubject = "google-subject";
  let accessJwksCalls = 0;
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
    if (target === "https://access.example/jwks") {
      accessJwksCalls += 1;
      return Response.json({ keys: [publicJwk] });
    }
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
    const callback = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/callback?code=valid-code&state=${encodeURIComponent(redirect.searchParams.get("state"))}`, { headers: { cookie: `${setCookie.split(";")[0]}; __Host-mm_access=legacy-access; __Host-mm_refresh=legacy-refresh` } }), env, {});
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get("referrer-policy"), "no-referrer");
    assert.match(callback.headers.get("set-cookie") ?? "", /__Host-mm_access=;[^\r\n]*Max-Age=0/u);
    assert.match(callback.headers.get("set-cookie") ?? "", /__Host-mm_refresh=;[^\r\n]*Max-Age=0/u);
    const replay = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/callback?code=valid-code&state=${encodeURIComponent(redirect.searchParams.get("state"))}`, { headers: { cookie: setCookie.split(";")[0] } }), env, {});
    assert.equal(replay.status, 401);
    assert.equal(replay.headers.get("referrer-policy"), "no-referrer");
    const secondStart = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/start?return=%2F`), env, {});
    const secondRedirect = new URL(secondStart.headers.get("location"));
    nonce = secondRedirect.searchParams.get("nonce");
    expectedChallenge = secondRedirect.searchParams.get("code_challenge");
    tokenSubject = "google-subject-2";
    const secondCallback = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/callback?code=second-code&state=${encodeURIComponent(secondRedirect.searchParams.get("state"))}`, { headers: { cookie: secondStart.headers.get("set-cookie").split(";")[0] } }), env, {});
    assert.equal(secondCallback.status, 302);
    tokenSubject = "google-subject";
    const thirdStart = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/start?return=%2F`), env, {});
    const thirdRedirect = new URL(thirdStart.headers.get("location"));
    nonce = thirdRedirect.searchParams.get("nonce");
    expectedChallenge = thirdRedirect.searchParams.get("code_challenge");
    const thirdCallback = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/callback?code=third-code&state=${encodeURIComponent(thirdRedirect.searchParams.get("state"))}`, { headers: { cookie: thirdStart.headers.get("set-cookie").split(";")[0] } }), env, {});
    assert.equal(thirdCallback.status, 302);
    assert.equal(database.prepare("SELECT count(*) AS total FROM identities WHERE issuer = 'https://accounts.google.com'").get().total, 2, "same email claim must not auto-link distinct provider subjects");
    assert.equal(database.prepare("SELECT count(*) AS total FROM audit_logs WHERE action = 'workspace.created'").get().total, 2, "re-login must not append a workspace.created audit");
    database.prepare("INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES ('other-tenant-user', 'https://other.example', 'other-subject', 'active', '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z')").run();
    const foreignWorkspace = "00000000-0000-4000-8000-000000000099";
    database.prepare("INSERT INTO workspaces(id, name, slug, status, created_by, created_at, updated_at, workspace_kind) VALUES (?, 'Other workspace', 'other-workspace', 'active', 'other-tenant-user', '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z', 'standard')").run(foreignWorkspace);
    database.prepare("INSERT INTO workspace_members(workspace_id, application_id, role, status, joined_at, updated_at) VALUES (?, 'other-tenant-user', 'owner', 'active', '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z')").run(foreignWorkspace);
    const sessionCookie = callback.headers.get("set-cookie").split(";")[0];
    const session = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/session`, { headers: { cookie: sessionCookie } }), env, {});
    assert.equal(session.status, 200);
    const sessionBody = await session.json();
    assert.equal(sessionBody.user.id, database.prepare("SELECT application_id FROM identities WHERE subject='google-subject'").get().application_id);
    assert.equal(sessionBody.workspaces.length, 1);
    const ownWorkspace = sessionBody.workspaces[0].id;
    const manualEnv = { ...env, MANUAL_ASSETS: {} };
    const ownManuals = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/workspaces/${ownWorkspace}/manuals`, { headers: { cookie: sessionCookie } }), manualEnv, {});
    assert.equal(ownManuals.status, 200, "product session must access its own workspace manuals");
    assert.ok(Array.isArray((await ownManuals.clone().json()).manuals));
    const foreignManuals = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/workspaces/${foreignWorkspace}/manuals`, { headers: { cookie: sessionCookie } }), manualEnv, {});
    assert.equal(foreignManuals.status, 403, "product session must not access a foreign workspace");
    assert.equal((await foreignManuals.json()).code, "ACCESS_FORBIDDEN");
    const accessConfigured = { ...env, ACCESS_ISSUER: "https://access.example", ACCESS_AUDIENCE: "audience", ACCESS_JWKS_URL: "https://access.example/jwks" };
    assert.equal(inspectAccessConfig(accessConfigured).configured, true);
    assert.equal(inspectProductAuthConfig(accessConfigured).google.configured, true);
    const productLoginWithAccessConfig = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/session`), accessConfigured, {});
    assert.equal(productLoginWithAccessConfig.status, 401);
    assert.equal((await productLoginWithAccessConfig.json()).code, "SESSION_REQUIRED");
    database.prepare("INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES ('access-user', 'https://access.example', 'access-subject', 'active', '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z')").run();
    const accessAssertion = await new SignJWT({ type: "app", sub: "access-subject" }).setProtectedHeader({ alg: "RS256", kid: "product-auth-test" }).setIssuer("https://access.example").setAudience("audience").setIssuedAt().setExpirationTime("5m").sign(privateKey);
    const accessControl = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/session`, { headers: { "Cf-Access-Jwt-Assertion": accessAssertion } }), accessConfigured, {});
    assert.equal(accessControl.status, 200, "valid Access assertion must remain on the Access route");
    assert.equal((await accessControl.json()).user.id, "access-user");
    assert.equal(accessJwksCalls, 1);
    const accessJwksCallsBeforeMalformed = accessJwksCalls;
    const malformedWithAccess = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/session`, { headers: { cookie: "__Host-mm_product=%zz", "Cf-Access-Jwt-Assertion": accessAssertion } }), accessConfigured, {});
    assert.equal(malformedWithAccess.status, 401);
    assert.equal((await malformedWithAccess.json()).code, "SESSION_REQUIRED");
    assert.equal(accessJwksCalls, accessJwksCallsBeforeMalformed, "malformed product cookie must be rejected before Access JWKS fallback");
    const healthWithProductCookie = await worker.fetch(new Request(`${env.APP_BASE_URL}/health/config`, { headers: { cookie: sessionCookie } }), accessConfigured, {});
    assert.equal(healthWithProductCookie.status, 401, "product session must not authorize the Access health route");
    assert.equal((await healthWithProductCookie.json()).code, "ACCESS_JWT_REQUIRED");
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
    assert.equal(logout.status, 200);
    assert.deepEqual(await logout.json(), { status: "ok" });
    const afterLogout = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/session`, { headers: { cookie: sessionCookie } }), env, {});
    assert.equal(afterLogout.status, 401);
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("provider route dispatch stays enabled without D1 and preserves storage/auth boundaries", async () => {
  const workspaceId = "00000000-0000-4000-8000-000000000001";
  const manualId = "00000000-0000-4000-8000-000000000002";
  const providerEnvs = [
    { GOOGLE_OIDC_CLIENT_ID: "google-dispatch-client", GOOGLE_OIDC_CLIENT_SECRET: "synthetic-secret" },
    { OPENAI_SIWC_CLIENT_ID: "chatgpt-dispatch-client", OPENAI_SIWC_CLIENT_SECRET: "synthetic-secret", OPENAI_SIWC_ENABLED: "true" }
  ];

  for (const provider of providerEnvs) {
    const base = {
      APP_ENV: "staging",
      APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com",
      MANUAL_ASSETS: {},
      ...provider
    };
    const manualPath = `/api/workspaces/${workspaceId}/manuals/${manualId}`;
    const sharePath = `${manualPath}/share-links`;
    const request = (path, headers = {}) => new Request(`${base.APP_BASE_URL}${path}`, { headers: { origin: base.APP_BASE_URL, ...headers } });

    const missingDbManual = await worker.fetch(request(manualPath), base, {});
    assert.equal(missingDbManual.status, 503);
    assert.equal((await missingDbManual.json()).code, "D1_UNAVAILABLE");
    const missingDbShare = await worker.fetch(request(sharePath), base, {});
    assert.equal(missingDbShare.status, 503);
    assert.equal((await missingDbShare.json()).code, "SHARE_MIGRATION_IN_PROGRESS");
    const missingDbProductCookie = await worker.fetch(request(manualPath, { cookie: "__Host-mm_product=expired-product-session" }), base, {});
    assert.equal(missingDbProductCookie.status, 503);
    assert.equal((await missingDbProductCookie.json()).code, "D1_UNAVAILABLE");
    const missingDbShareProductCookie = await worker.fetch(request(sharePath, { cookie: "__Host-mm_product=expired-product-session" }), base, {});
    assert.equal(missingDbShareProductCookie.status, 503);
    assert.equal((await missingDbShareProductCookie.json()).code, "SHARE_MIGRATION_IN_PROGRESS");
    for (const path of ["/api/session", "/api/workspaces"]) {
      const missingDbSession = await worker.fetch(request(path, { cookie: "__Host-mm_product=expired-product-session" }), base, {});
      assert.equal(missingDbSession.status, 503, path);
      assert.equal((await missingDbSession.json()).code, "AUTH_STORAGE_UNAVAILABLE", path);
      const missingDbUnauthenticated = await worker.fetch(request(path), base, {});
      assert.equal(missingDbUnauthenticated.status, 401, path);
      assert.equal((await missingDbUnauthenticated.json()).code, "SESSION_REQUIRED", path);
    }

    const { database, binding } = await authDatabase();
    try {
      const configured = { ...base, DB: binding };
      const unauthenticatedManual = await worker.fetch(request(manualPath), configured, {});
      assert.equal(unauthenticatedManual.status, 401);
      assert.equal((await unauthenticatedManual.json()).code, "SESSION_REQUIRED");
      const unauthenticatedShare = await worker.fetch(request(sharePath), configured, {});
      assert.equal(unauthenticatedShare.status, 401);
      assert.equal((await unauthenticatedShare.json()).code, "SESSION_REQUIRED");
      const expiredProductCookie = await worker.fetch(request(manualPath, { cookie: "__Host-mm_product=expired-product-session" }), configured, {});
      assert.equal(expiredProductCookie.status, 401);
      assert.equal((await expiredProductCookie.json()).code, "SESSION_REQUIRED");
    } finally {
      database.close();
    }
  }
});

test("providerごとのOAuth transaction cookieは並行開始とcallback順序を独立して保持する", async () => {
  for (const provider of ["google", "chatgpt"]) {
    for (const firstAction of ["success", "cancel"]) {
      for (const callbackOrder of [["first", "second"], ["second", "first"]]) {
        const { database, binding } = await authDatabase();
        const { privateKey, publicKey } = await generateKeyPair("RS256");
        const clientId = provider === "google" ? "parallel-google-client" : "parallel-chatgpt-client";
        const env = {
          APP_ENV: "staging",
          APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com",
          ...(provider === "google"
            ? { GOOGLE_OIDC_CLIENT_ID: clientId, GOOGLE_OIDC_CLIENT_SECRET: "synthetic-secret" }
            : { OPENAI_SIWC_CLIENT_ID: clientId, OPENAI_SIWC_CLIENT_SECRET: "synthetic-secret", OPENAI_SIWC_ENABLED: "true" }),
          ONBOARDING_RATE_LIMITER: { limit: async () => ({ success: true }) },
          DB: binding
        };
        const publicJwk = { ...await exportJWK(publicKey), kid: `parallel-${provider}`, alg: "RS256", use: "sig" };
        const nonces = new Map();
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (input, init = {}) => {
          const target = String(input);
          const tokenEndpoint = provider === "google" ? "https://oauth2.googleapis.com/token" : "https://auth.openai.com/api/accounts/oauth/token";
          const jwksEndpoint = provider === "google" ? "https://www.googleapis.com/oauth2/v3/certs" : "https://auth.openai.com/.well-known/jwks.json";
          if (target === tokenEndpoint) {
            const params = new URLSearchParams(init.body);
            const code = params.get("code");
            const nonce = nonces.get(code);
            assert.ok(nonce, `nonce for ${code}`);
            const claims = { sub: `parallel-${provider}-${code}`, nonce, ...(provider === "google" ? { email_verified: true, email: `${code}@example.test` } : {}) };
            const token = await new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: `parallel-${provider}` }).setIssuer(provider === "google" ? "https://accounts.google.com" : "https://auth.openai.com").setAudience(clientId).setIssuedAt().setExpirationTime("5m").sign(privateKey);
            return Response.json({ id_token: token });
          }
          if (target === jwksEndpoint) return Response.json({ keys: [publicJwk] });
          throw new Error(`unexpected external request: ${target}`);
        };
        try {
          const start = async (label) => {
            const response = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/${provider}/start`), env, {});
            assert.equal(response.status, 302);
            const redirect = new URL(response.headers.get("location"));
            nonces.set(label === "first" ? "first-code" : "second-code", redirect.searchParams.get("nonce"));
            return { state: redirect.searchParams.get("state"), cookie: firstCookie(response) };
          };
          const first = await start("first");
          const second = await start("second");
          const browserCookies = `${first.cookie}; ${second.cookie}`;
          const callback = async (entry, code, cookies = browserCookies) => worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/${provider}/callback?code=${code}&state=${encodeURIComponent(entry.state)}`, { headers: { cookie: cookies } }), env, {});
          const callbacks = { first: () => firstAction === "cancel" ? worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/${provider}/callback?error=access_denied&state=${encodeURIComponent(first.state)}`, { headers: { accept: "text/html", cookie: browserCookies } }), env, {}) : callback(first, "first-code"), second: () => callback(second, "second-code") };
          const firstResponse = await callbacks[callbackOrder[0]]();
          assert.equal(firstResponse.status, firstAction === "cancel" && callbackOrder[0] === "first" ? 401 : 302, `${provider}/${firstAction}/${callbackOrder.join(",")}`);
          const clearedName = callbackOrder[0] === "first" ? cookieName(first.cookie) : cookieName(second.cookie);
          const untouchedName = callbackOrder[0] === "first" ? cookieName(second.cookie) : cookieName(first.cookie);
          assert.match(firstResponse.headers.get("set-cookie") ?? "", new RegExp(`${clearedName}=; Max-Age=0`, "u"));
          assert.doesNotMatch(firstResponse.headers.get("set-cookie") ?? "", new RegExp(`${untouchedName}=; Max-Age=0`, "u"));
          const secondResponse = await callbacks[callbackOrder[1]]();
          assert.equal(secondResponse.status, firstAction === "cancel" && callbackOrder[1] === "first" ? 401 : 302, `${provider}/${firstAction}/${callbackOrder.join(",")}/second`);
          if (firstAction === "cancel") {
            const successResponse = callbackOrder[0] === "first" ? secondResponse : firstResponse;
            assert.equal(successResponse.status, 302);
          }
          assert.equal(database.prepare("SELECT count(*) AS total FROM auth_sessions").get().total, firstAction === "cancel" ? 1 : 2);
        } finally {
          globalThis.fetch = originalFetch;
          database.close();
        }
      }
    }
  }
});

test("未知stateや不正stateのcallbackは有効な並行transaction cookieを消去しない", async () => {
  for (const provider of ["google", "chatgpt"]) {
    const { database, binding } = await authDatabase();
    const env = {
      APP_ENV: "staging",
      APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com",
      ...(provider === "google"
        ? { GOOGLE_OIDC_CLIENT_ID: "unknown-state-google", GOOGLE_OIDC_CLIENT_SECRET: "synthetic-secret" }
        : { OPENAI_SIWC_CLIENT_ID: "unknown-state-chatgpt", OPENAI_SIWC_CLIENT_SECRET: "synthetic-secret", OPENAI_SIWC_ENABLED: "true" }),
      ONBOARDING_RATE_LIMITER: { limit: async () => ({ success: true }) },
      DB: binding
    };
    const originalFetch = globalThis.fetch;
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const clientId = provider === "google" ? env.GOOGLE_OIDC_CLIENT_ID : env.OPENAI_SIWC_CLIENT_ID;
    const nonces = new Map();
    globalThis.fetch = async (input, init = {}) => {
      const target = String(input);
      const tokenEndpoint = provider === "google" ? "https://oauth2.googleapis.com/token" : "https://auth.openai.com/api/accounts/oauth/token";
      const jwksEndpoint = provider === "google" ? "https://www.googleapis.com/oauth2/v3/certs" : "https://auth.openai.com/.well-known/jwks.json";
      if (target === tokenEndpoint) {
        const params = new URLSearchParams(init.body);
        const nonce = nonces.get(params.get("code"));
        const claims = { sub: `unknown-state-${provider}`, nonce, ...(provider === "google" ? { email_verified: true } : {}) };
        const token = await new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: `unknown-state-${provider}` }).setIssuer(provider === "google" ? "https://accounts.google.com" : "https://auth.openai.com").setAudience(clientId).setIssuedAt().setExpirationTime("5m").sign(privateKey);
        return Response.json({ id_token: token });
      }
      if (target === jwksEndpoint) return Response.json({ keys: [{ ...await exportJWK(publicKey), kid: `unknown-state-${provider}`, alg: "RS256", use: "sig" }] });
      throw new Error(`unexpected external request: ${target}`);
    };
    try {
      const begin = async (code) => {
        const response = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/${provider}/start`), env, {});
        const redirect = new URL(response.headers.get("location"));
        nonces.set(code, redirect.searchParams.get("nonce"));
        return { state: redirect.searchParams.get("state"), cookie: firstCookie(response) };
      };
      const first = await begin("first-code");
      const second = await begin("second-code");
      const browserCookies = `${first.cookie}; ${second.cookie}`;
      const unknown = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/${provider}/callback?state=${"x".repeat(43)}`, { headers: { cookie: browserCookies } }), env, {});
      assert.equal(unknown.status, 401);
      assert.doesNotMatch(unknown.headers.get("set-cookie") ?? "", new RegExp(`${cookieName(first.cookie)}=; Max-Age=0`, "u"));
      assert.doesNotMatch(unknown.headers.get("set-cookie") ?? "", new RegExp(`${cookieName(second.cookie)}=; Max-Age=0`, "u"));
      const invalid = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/${provider}/callback?state=bad`, { headers: { cookie: browserCookies } }), env, {});
      assert.equal(invalid.status, 401);
      assert.equal(invalid.headers.get("set-cookie"), null);
      const success = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/${provider}/callback?code=second-code&state=${encodeURIComponent(second.state)}`, { headers: { cookie: browserCookies } }), env, {});
      assert.equal(success.status, 302);
    } finally {
      globalThis.fetch = originalFetch;
      database.close();
    }
  }
});

test("configured Google provider keeps a valid password session on Supabase and rejects a mixed invalid product cookie", async () => {
  const { database, binding } = await authDatabase();
  const originalFetch = globalThis.fetch;
  const env = {
    APP_ENV: "staging",
    APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com",
    GOOGLE_OIDC_CLIENT_ID: "google-mixed-client",
    GOOGLE_OIDC_CLIENT_SECRET: "synthetic-secret",
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_ANON_KEY: "synthetic-anon-key",
    DB: binding
  };
  const calls = [];
  globalThis.fetch = async (input) => {
    const target = String(input);
    calls.push(target);
    if (target.endsWith("/auth/v1/user")) return Response.json({ id: "password-user", email: "password@example.test" });
    if (target.includes("/rest/v1/profiles?")) return Response.json([{ id: "password-user", display_name: "Password User", locale: "ja", timezone: "Asia/Tokyo" }]);
    if (target.includes("/rest/v1/workspaces?")) return new Response(JSON.stringify([]), { status: 200, headers: { "content-range": "*/0" } });
    throw new Error(`unexpected Supabase request: ${target}`);
  };
  try {
    const password = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/session`, {
      headers: { cookie: "__Host-mm_access=password-token" }
    }), env, {});
    assert.equal(password.status, 200);
    assert.equal((await password.json()).user.id, "password-user");
    assert.equal(calls.filter((target) => target.includes("supabase.example.test")).length, 3);

    const beforeInvalidProduct = calls.length;
    const mixedInvalid = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/session`, {
      headers: { cookie: "__Host-mm_product=invalid-product-token; __Host-mm_access=password-token" }
    }), env, {});
    assert.equal(mixedInvalid.status, 401);
    assert.equal((await mixedInvalid.json()).code, "SESSION_REQUIRED");
    assert.equal(calls.length, beforeInvalidProduct, "invalid product cookies must not fall back to Supabase password or Access");
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("password login revokes a competing product session and issues the new Supabase session", async () => {
  const { database, binding } = await authDatabase();
  const staleToken = "stale-product-session";
  const now = new Date();
  const issuedAt = new Date(now.getTime() - 120_000);
  const expiredAt = new Date(now.getTime() - 60_000);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(staleToken));
  const staleHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  database.prepare("INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES ('product-user', 'https://accounts.google.com', 'product-subject', 'active', ?, ?)").run(issuedAt.toISOString(), issuedAt.toISOString());
  database.prepare("INSERT INTO auth_sessions(id, application_id, token_hash, auth_method, issued_at, expires_at) VALUES ('stale-session', 'product-user', ?, 'google', ?, ?)").run(staleHash, issuedAt.toISOString(), expiredAt.toISOString());
  const originalFetch = globalThis.fetch;
  const env = {
    APP_ENV: "staging",
    APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com",
    GOOGLE_OIDC_CLIENT_ID: "google-login-transition-client",
    GOOGLE_OIDC_CLIENT_SECRET: "synthetic-secret",
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_ANON_KEY: "synthetic-anon-key",
    DB: binding
  };
  globalThis.fetch = async (input) => {
    const target = String(input);
    if (target.endsWith("/auth/v1/user")) return Response.json({ id: "password-user", email: "password@example.test" });
    if (target.includes("/rest/v1/profiles?")) return Response.json([{ id: "password-user", display_name: "Password User", locale: "ja", timezone: "Asia/Tokyo" }]);
    if (target.includes("/rest/v1/workspaces?")) return new Response(JSON.stringify([]), { status: 200, headers: { "content-range": "*/0" } });
    assert.equal(target, "https://supabase.example.test/auth/v1/token?grant_type=password");
    return Response.json({
      access_token: "new-password-access",
      refresh_token: "new-password-refresh",
      expires_in: 3600,
      user: { id: "password-user", email: "password@example.test" }
    });
  };
  try {
    const response = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        origin: env.APP_BASE_URL,
        "content-type": "application/json",
        cookie: `__Host-mm_product=${staleToken}`
      },
      body: JSON.stringify({ email: "password@example.test", password: "synthetic-password" })
    }), env, {});
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { user: { id: "password-user", email: "password@example.test" } });
    const setCookie = response.headers.get("set-cookie") || "";
    assert.match(setCookie, /__Host-mm_access=new-password-access/u);
    assert.match(setCookie, /__Host-mm_refresh=new-password-refresh/u);
    assert.match(setCookie, /__Host-mm_product=; Max-Age=0; Path=\/; HttpOnly; Secure; SameSite=Lax/u);
    assert.ok(database.prepare("SELECT revoked_at FROM auth_sessions WHERE id = 'stale-session'").get().revoked_at);
    const accessCookie = setCookie.match(/__Host-mm_access=([^;]+)/u)?.[1];
    assert.ok(accessCookie);
    delete env.GOOGLE_OIDC_CLIENT_ID;
    delete env.GOOGLE_OIDC_CLIENT_SECRET;
    const newSession = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/session`, { headers: { cookie: `__Host-mm_access=${accessCookie}` } }), env, {});
    assert.equal(newSession.status, 200);
    assert.equal((await newSession.json()).user.id, "password-user");
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("password login does not issue Supabase cookies when competing product-session revocation fails", async () => {
  const { database, binding } = await authDatabase();
  const staleToken = "product-session-revoke-failure";
  const now = new Date();
  const issuedAt = new Date(now.getTime() - 120_000);
  const expiresAt = new Date(now.getTime() + 60 * 60_000);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(staleToken));
  const staleHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  database.prepare("INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES ('product-user', 'https://accounts.google.com', 'product-subject', 'active', ?, ?)").run(issuedAt.toISOString(), issuedAt.toISOString());
  database.prepare("INSERT INTO auth_sessions(id, application_id, token_hash, auth_method, issued_at, expires_at) VALUES ('failure-session', 'product-user', ?, 'google', ?, ?)").run(staleHash, issuedAt.toISOString(), expiresAt.toISOString());
  const originalPrepare = binding.prepare.bind(binding);
  binding.prepare = (sql) => {
    if (sql.startsWith("UPDATE auth_sessions SET revoked_at")) {
      return { bind() { return { async run() { return { success: false }; } }; } };
    }
    return originalPrepare(sql);
  };
  const originalFetch = globalThis.fetch;
  const env = {
    APP_ENV: "staging",
    APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com",
    GOOGLE_OIDC_CLIENT_ID: "google-login-transition-client",
    GOOGLE_OIDC_CLIENT_SECRET: "synthetic-secret",
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_ANON_KEY: "synthetic-anon-key",
    DB: binding
  };
  globalThis.fetch = async () => Response.json({
    access_token: "must-not-be-issued",
    refresh_token: "must-not-be-issued",
    expires_in: 3600,
    user: { id: "password-user", email: "password@example.test" }
  });
  try {
    const response = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        origin: env.APP_BASE_URL,
        "content-type": "application/json",
        cookie: `__Host-mm_product=${staleToken}`
      },
      body: JSON.stringify({ email: "password@example.test", password: "synthetic-password" })
    }), env, {});
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "AUTH_STORAGE_UNAVAILABLE");
    assert.equal(response.headers.get("set-cookie"), null);
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("cancelled callback returns to the transaction return path and permits a fresh retry", async () => {
  const { database, binding } = await authDatabase();
  const env = {
    APP_ENV: "staging",
    APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com",
    GOOGLE_OIDC_CLIENT_ID: "google-cancel-client",
    GOOGLE_OIDC_CLIENT_SECRET: "synthetic-secret",
    ONBOARDING_RATE_LIMITER: { limit: async () => ({ success: true }) },
    DB: binding
  };
  try {
    const start = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/start?return=%2Fonboarding%2Fcontinue`), env, {});
    const redirect = new URL(start.headers.get("location"));
    const oauthCookie = start.headers.get("set-cookie").split(";")[0];
    const cancelled = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/callback?error=access_denied&state=${encodeURIComponent(redirect.searchParams.get("state"))}`, {
      headers: { accept: "text/html", cookie: `${oauthCookie}; __Host-mm_access=legacy-access; __Host-mm_refresh=legacy-refresh` }
    }), env, {});
    assert.equal(cancelled.status, 401);
    assert.equal(cancelled.headers.get("referrer-policy"), "no-referrer");
    assert.match(await cancelled.text(), /href="\/onboarding\/continue"/u);
    assert.match(cancelled.headers.get("set-cookie") ?? "", /__Host-mm_oauth_google_[0-9a-f]{64}=; Max-Age=0/u);
    assert.doesNotMatch(cancelled.headers.get("set-cookie") ?? "", /__Host-mm_access=;[^\r\n]*Max-Age=0/u);
    assert.doesNotMatch(cancelled.headers.get("set-cookie") ?? "", /__Host-mm_refresh=;[^\r\n]*Max-Age=0/u);
    const retry = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/start?return=%2Fonboarding%2Fcontinue`), env, {});
    assert.equal(retry.status, 302);
    assert.equal(new URL(retry.headers.get("location")).searchParams.get("return"), null);
    assert.equal(database.prepare("SELECT count(*) AS total FROM oauth_transactions").get().total, 2);
  } finally {
    database.close();
  }
});

test("callback transaction read and consume storage rejections return retryable errors without a session", async () => {
  for (const [sqlPrefix, operation] of [["SELECT id, provider", "first"], ["UPDATE oauth_transactions", "run"], ["UPDATE oauth_transactions", "run-false"]]) {
    const { database, binding } = await authDatabase();
    const baseEnv = {
      APP_ENV: "staging",
      APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com",
      GOOGLE_OIDC_CLIENT_ID: "google-callback-storage-client",
      GOOGLE_OIDC_CLIENT_SECRET: "synthetic-secret",
      ONBOARDING_RATE_LIMITER: { limit: async () => ({ success: true }) },
      DB: binding
    };
    try {
      const start = await worker.fetch(new Request(`${baseEnv.APP_BASE_URL}/api/auth/google/start`), baseEnv, {});
      const redirect = new URL(start.headers.get("location"));
      const response = await worker.fetch(new Request(`${baseEnv.APP_BASE_URL}/api/auth/google/callback?code=synthetic-code&state=${encodeURIComponent(redirect.searchParams.get("state"))}`, { headers: { cookie: start.headers.get("set-cookie").split(";")[0] } }), { ...baseEnv, DB: rejectingBinding(binding, sqlPrefix, operation) }, {});
      assert.equal(response.status, 503, `${sqlPrefix}/${operation}`);
      assert.equal((await response.json()).code, "AUTH_STORAGE_UNAVAILABLE", `${sqlPrefix}/${operation}`);
      assert.equal(response.headers.get("location"), null, `${sqlPrefix}/${operation}`);
      assert.equal(database.prepare("SELECT count(*) AS count FROM auth_sessions").get().count, 0, `${sqlPrefix}/${operation}`);
    } finally {
      database.close();
    }
  }
});

test("logout storage rejections at prepare, bind, and run do not return success", async () => {
  for (const operation of ["prepare", "bind", "run"]) {
    const { database, binding } = await authDatabase();
    const env = {
      APP_ENV: "staging",
      APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com",
      DB: rejectingBinding(binding, "UPDATE auth_sessions", operation)
    };
    try {
      const response = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/logout`, { method: "POST", headers: { origin: env.APP_BASE_URL, cookie: "__Host-mm_product=synthetic-session", "content-type": "application/json" }, body: "{}" }), env, {});
      assert.equal(response.status, 503, operation);
      assert.equal((await response.json()).code, "AUTH_STORAGE_UNAVAILABLE", operation);
      assert.equal(response.headers.get("set-cookie"), null, operation);
    } finally {
      database.close();
    }
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
    { name: "email", emailVerified: false, status: 403 },
    { name: "legacy Google issuer", issuer: "accounts.google.com", status: 302, validIssuer: true }
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
      assert.equal(database.prepare("SELECT count(*) AS total FROM auth_sessions").get().total, scenario.validIssuer ? 1 : 0, `${scenario.name} session count`);
      if (scenario.validIssuer) {
        assert.equal(database.prepare("SELECT issuer FROM identities WHERE subject = 'negative-subject'").get().issuer, "https://accounts.google.com");
      }
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

test("product auth rate limiter distinguishes an explicit refusal from an unavailable or malformed result", async () => {
  for (const [name, limiter, status, code] of [
    ["refused", async () => ({ success: false }), 429, "AUTH_RATE_LIMITED"],
    ["throws", async () => { throw new Error("synthetic limiter failure"); }, 503, "AUTH_RATE_LIMIT_UNAVAILABLE"],
    ["missing result", async () => null, 503, "AUTH_RATE_LIMIT_UNAVAILABLE"],
    ["malformed result", async () => ({ success: "false" }), 503, "AUTH_RATE_LIMIT_UNAVAILABLE"]
  ]) {
    const { database, binding } = await authDatabase();
    const env = {
      APP_ENV: "staging",
      APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com",
      GOOGLE_OIDC_CLIENT_ID: "google-rate-limit-client",
      GOOGLE_OIDC_CLIENT_SECRET: "secret-not-logged",
      ONBOARDING_RATE_LIMITER: { limit: limiter },
      DB: binding
    };
    try {
      const response = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/start`), env, {});
      assert.equal(response.status, status, name);
      assert.equal((await response.json()).code, code, name);
      assert.equal(response.headers.get("location"), null, name);
      assert.equal(response.headers.get("set-cookie"), null, name);
      assert.equal(database.prepare("SELECT count(*) AS count FROM oauth_transactions").get().count, 0, name);
    } finally {
      database.close();
    }
  }
});

test("nonce binding failure after transaction consume preserves only the verified return path", async () => {
  const { database, binding } = await authDatabase();
  const env = {
    APP_ENV: "staging",
    APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com",
    GOOGLE_OIDC_CLIENT_ID: "google-nonce-return-client",
    GOOGLE_OIDC_CLIENT_SECRET: "secret-not-logged",
    ONBOARDING_RATE_LIMITER: { limit: async () => ({ success: true }) },
    DB: binding
  };
  try {
    const start = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/start?return=%2Fonboarding%2Fcontinue`), env, {});
    const redirect = new URL(start.headers.get("location"));
    const transactionId = database.prepare("SELECT id FROM oauth_transactions").get().id;
    const cookieValue = start.headers.get("set-cookie").split(";")[0];
    const [cookieName, cookiePayload] = cookieValue.split("=");
    const [storedTransactionId, verifier] = decodeURIComponent(cookiePayload).split(".");
    assert.equal(storedTransactionId, transactionId);
    const nonceMismatchCookie = `${cookieName}=${encodeURIComponent(`${transactionId}.${verifier}.wrong-nonce`)}`;
    const response = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/callback?code=unused&state=${encodeURIComponent(redirect.searchParams.get("state"))}`, {
      headers: { accept: "text/html", cookie: nonceMismatchCookie }
    }), env, {});
    assert.equal(response.status, 401);
    assert.match(await response.text(), /href="\/onboarding\/continue"/u);
    assert.match(response.headers.get("set-cookie") ?? "", /__Host-mm_oauth_google_[0-9a-f]{64}=; Max-Age=0/u);
    assert.ok(database.prepare("SELECT consumed_at FROM oauth_transactions WHERE id=?").get(transactionId).consumed_at);
  } finally {
    database.close();
  }
});

test("an untrusted transaction return path is not copied into nonce failure HTML", async () => {
  const { database, binding } = await authDatabase();
  const env = {
    APP_ENV: "staging",
    APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com",
    GOOGLE_OIDC_CLIENT_ID: "google-untrusted-return-client",
    GOOGLE_OIDC_CLIENT_SECRET: "secret-not-logged",
    ONBOARDING_RATE_LIMITER: { limit: async () => ({ success: true }) },
    DB: binding
  };
  try {
    const start = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/start?return=%2Fonboarding%2Fcontinue`), env, {});
    const redirect = new URL(start.headers.get("location"));
    const transactionId = database.prepare("SELECT id FROM oauth_transactions").get().id;
    database.prepare("UPDATE oauth_transactions SET return_path='https://attacker.example/steal' WHERE id=?").run(transactionId);
    const cookieValue = start.headers.get("set-cookie").split(";")[0];
    const [, cookiePayload] = cookieValue.split("=");
    const [storedTransactionId, verifier] = decodeURIComponent(cookiePayload).split(".");
    assert.equal(storedTransactionId, transactionId);
    const response = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/callback?code=unused&state=${encodeURIComponent(redirect.searchParams.get("state"))}`, {
      headers: { accept: "text/html", cookie: `${cookieValue.split("=")[0]}=${encodeURIComponent(`${transactionId}.${verifier}.wrong-nonce`)}` }
    }), env, {});
    assert.equal(response.status, 401);
    const body = await response.text();
    assert.match(body, /href="\/"/u);
    assert.doesNotMatch(body, /attacker\.example/u);
    assert.ok(database.prepare("SELECT consumed_at FROM oauth_transactions WHERE id=?").get(transactionId).consumed_at);
  } finally {
    database.close();
  }
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
    assert.match(expired.headers.get("set-cookie") ?? "", /__Host-mm_oauth_google_[0-9a-f]{64}=; Max-Age=0; Path=\//u);

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

test("session read storage failure is a retryable Japanese logout error", async () => {
  const { database, binding } = await authDatabase();
  const failingDb = {
    prepare(sql) {
      if (sql.startsWith("SELECT s.application_id")) {
        return { bind() { return { first: async () => { throw new Error("synthetic D1 read failure"); } }; } };
      }
      return binding.prepare(sql);
    }
  };
  try {
    const response = await worker.fetch(new Request("https://meccha-manual-staging.meccha-iiyatsu.com/api/auth/logout", { method: "POST", headers: { origin: "https://meccha-manual-staging.meccha-iiyatsu.com", cookie: "__Host-mm_product=known-session", "content-type": "application/json" }, body: "{}" }), { APP_ENV: "staging", APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com", DB: failingDb }, {});
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.code, "AUTH_STORAGE_UNAVAILABLE");
    assert.match(body.message, /時間をおいて再度お試しください/u);
  } finally { database.close(); }
});

test("callback refuses disabled identity and suspended workspace with Japanese next steps", async () => {
  const { database, binding } = await authDatabase();
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = { ...await exportJWK(publicKey), kid: "product-auth-boundary", alg: "RS256", use: "sig" };
  const originalFetch = globalThis.fetch;
  const subject = "callback-boundary-subject";
  let nonce = "";
  const env = { APP_ENV: "staging", APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com", GOOGLE_OIDC_CLIENT_ID: "google-boundary-client", GOOGLE_OIDC_CLIENT_SECRET: "synthetic-secret", ONBOARDING_RATE_LIMITER: { limit: async () => ({ success: true }) }, DB: binding };
  globalThis.fetch = async (input, init = {}) => {
    const target = String(input);
    if (target === "https://oauth2.googleapis.com/token") {
      const token = await new SignJWT({ sub: subject, email: "boundary@example.test", email_verified: true, nonce })
        .setProtectedHeader({ alg: "RS256", kid: "product-auth-boundary" }).setIssuer("https://accounts.google.com").setAudience("google-boundary-client").setIssuedAt().setExpirationTime("5m").sign(privateKey);
      return Response.json({ id_token: token });
    }
    if (target === "https://www.googleapis.com/oauth2/v3/certs") return Response.json({ keys: [publicJwk] });
    throw new Error(`unexpected external request: ${target}`);
  };
  async function callback(code) {
    const start = await worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/start`), env, {});
    const redirect = new URL(start.headers.get("location"));
    nonce = redirect.searchParams.get("nonce");
    return worker.fetch(new Request(`${env.APP_BASE_URL}/api/auth/google/callback?code=${code}&state=${encodeURIComponent(redirect.searchParams.get("state"))}`, { headers: { cookie: start.headers.get("set-cookie").split(";")[0] } }), env, {});
  }
  try {
    database.prepare("INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES ('boundary-user', 'https://accounts.google.com', ?, 'disabled', '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z')").run(subject);
    const disabled = await callback("disabled-code");
    assert.equal(disabled.status, 403);
    const disabledBody = await disabled.json();
    assert.equal(disabledBody.code, "AUTH_IDENTITY_FORBIDDEN");
    assert.match(disabledBody.message, /管理者に状態確認/u);
    assert.equal(database.prepare("SELECT count(*) AS total FROM auth_sessions").get().total, 0);

    database.prepare("UPDATE identities SET status='active' WHERE application_id='boundary-user'").run();
    database.prepare("INSERT INTO workspaces(id, name, slug, status, created_by, created_at, updated_at, workspace_kind) VALUES ('boundary-workspace', 'Boundary Workspace', 'boundary-workspace', 'suspended', 'boundary-user', '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z', 'personal')").run();
    database.prepare("INSERT INTO workspace_members(workspace_id, application_id, role, status, joined_at, updated_at) VALUES ('boundary-workspace', 'boundary-user', 'owner', 'active', '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z')").run();
    const suspended = await callback("suspended-code");
    assert.equal(suspended.status, 403);
    const suspendedBody = await suspended.json();
    assert.equal(suspendedBody.code, "AUTH_WORKSPACE_UNAVAILABLE");
    assert.match(suspendedBody.message, /個人ワークスペースは現在利用できません/u);
    assert.equal(database.prepare("SELECT count(*) AS total FROM auth_sessions").get().total, 0);
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
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
    assert.match(response.headers.get("set-cookie") ?? "", /__Host-mm_oauth_google_[0-9a-f]{64}=; Max-Age=0/u);
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});
