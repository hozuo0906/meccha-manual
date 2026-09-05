import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import { exportJWK, SignJWT } from "jose";
import worker from "../apps/worker/src/index.ts";

const migrationPath = new URL("../migrations/0001_d1_identity_workspace.sql", import.meta.url);
const issuer = "https://team.example.invalid";
const audience = "meccha-manual-staging";
const jwksUrl = "https://team.example.invalid/.well-known/jwks.json";
const now = "2026-09-06T00:00:00.000Z";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = await exportJWK(publicKey);
publicJwk.kid = "m3-test-key";
publicJwk.alg = "RS256";
publicJwk.use = "sig";
const originalFetch = globalThis.fetch;

class LocalStatement {
  constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; }
  bind(...values) { return new LocalStatement(this.database, this.sql, values); }
  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
  async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.values) }; }
  async first() { return this.database.prepare(this.sql).get(...this.values) ?? null; }
}

class LocalD1 {
  constructor(database) { this.database = database; }
  prepare(sql) { return new LocalStatement(this.database, sql); }
  async batch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

let database;
let env;

beforeEach(async () => {
  database = new DatabaseSync(":memory:");
  database.exec(await readFile(migrationPath, "utf8"));
  database.prepare("INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)").run("app-user-1", issuer, "subject-1", now, now);
  database.prepare("INSERT INTO profiles(application_id, display_name, locale, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run("app-user-1", "テスト利用者", "ja-JP", "Asia/Tokyo", now, now);
  env = { ACCESS_ISSUER: issuer, ACCESS_AUDIENCE: audience, ACCESS_JWKS_URL: jwksUrl, DB: new LocalD1(database) };
  globalThis.fetch = async (url) => {
    assert.equal(String(url), jwksUrl);
    return Response.json({ keys: [publicJwk] });
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  database?.close();
});

async function accessToken(claims = {}) {
  const issued = Math.floor(Date.now() / 1_000);
  return new SignJWT({ type: "app", iss: issuer, aud: audience, sub: "subject-1", exp: issued + 300, iat: issued, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "m3-test-key" })
    .sign(privateKey);
}

function request(path, init = {}) {
  return new Request(`https://app.example.invalid${path}`, init);
}

async function accessRequest(path, init = {}, claims = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cf-Access-Jwt-Assertion", await accessToken(claims));
  return request(path, { ...init, headers });
}

test("Access userからD1 profile/workspacesへ解決する", async () => {
  const response = await worker.fetch(await accessRequest("/api/session"), env, {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    user: { id: "app-user-1" },
    profile: { id: "app-user-1", display_name: "テスト利用者", locale: "ja-JP", timezone: "Asia/Tokyo" },
    workspaces: []
  });
});

test("workspace作成と一覧は同じAccess identityのD1 repositoryを使う", async () => {
  const response = await worker.fetch(await accessRequest("/api/workspaces", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://app.example.invalid" },
    body: JSON.stringify({ name: "  営業部  ", slug: " SALES " })
  }), env, {});
  assert.equal(response.status, 201);
  const created = await response.json();
  assert.match(created.workspaceId, /^[0-9a-f-]{36}$/);

  const list = await worker.fetch(await accessRequest("/api/workspaces"), env, {});
  assert.equal(list.status, 200);
  const payload = await list.json();
  assert.equal(payload.workspaces.length, 1);
  assert.deepEqual(payload.workspaces[0], {
    id: created.workspaceId,
    name: "営業部",
    slug: "sales",
    status: "active",
    created_at: payload.workspaces[0].created_at
  });
});

test("本人参加コード発行は空JSONだけを受け付け、平文をDBへ保存しない", async () => {
  const response = await worker.fetch(await accessRequest("/api/member-join-code", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://app.example.invalid" },
    body: "{}"
  }), env, {});
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.match(payload.joinCode, /^mmj_[A-Za-z0-9_-]{43}$/u);
  assert.equal(database.prepare("SELECT count(*) AS count FROM workspace_join_codes WHERE digest = ?").get(payload.joinCode).count, 0);
  assert.equal(database.prepare("SELECT count(*) AS count FROM workspace_join_codes").get().count, 1);
});

test("不正JWT・unknown/disabled identityはD1業務queryへ進まず403/401になる", async () => {
  let response = await worker.fetch(request("/api/session", { headers: { "Cf-Access-Jwt-Assertion": "invalid.jwt" } }), env, {});
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "ACCESS_JWT_INVALID");

  response = await worker.fetch(await accessRequest("/api/session", {}, { sub: "unknown-subject" }), env, {});
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "ACCESS_ACTOR_FORBIDDEN");

  database.prepare("UPDATE identities SET status = 'disabled' WHERE application_id = 'app-user-1'").run();
  response = await worker.fetch(await accessRequest("/api/workspaces"), env, {});
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "ACCESS_ACTOR_FORBIDDEN");
});

test("Access設定が有効なD1 routeはD1 binding障害を503へ写像する", async () => {
  const unavailableEnv = { ...env, DB: undefined };
  const response = await worker.fetch(await accessRequest("/api/session"), unavailableEnv, {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "ACCESS_IDENTITY_UNAVAILABLE");
});

test("Access設定が一部でも存在するrouteはSupabaseへfallbackしない", async () => {
  let supabaseCalled = false;
  globalThis.fetch = async () => {
    supabaseCalled = true;
    throw new Error("legacy auth must not be called");
  };
  const response = await worker.fetch(request("/api/session"), {
    SUPABASE_URL: "https://legacy.example.invalid",
    SUPABASE_ANON_KEY: "legacy-key",
    ACCESS_AUDIENCE: audience
  }, {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "ACCESS_CONFIG_UNAVAILABLE");
  assert.equal(supabaseCalled, false);
});

test("service tokenは対象業務routeへ昇格しない", async () => {
  const tokenClaims = { sub: "", common_name: "runner.example" };
  const response = await worker.fetch(await accessRequest("/api/session", {}, tokenClaims), env, {});
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "ACCESS_ACTOR_FORBIDDEN");
});
