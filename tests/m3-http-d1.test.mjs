import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import { exportJWK, SignJWT } from "jose";
import worker from "../apps/worker/src/index.ts";

const migrationPaths = [
  new URL("../migrations/0001_d1_identity_workspace.sql", import.meta.url),
  new URL("../migrations/0002_d1_personal_workspace.sql", import.meta.url),
  new URL("../migrations/0009_d1_owner_transfer.sql", import.meta.url)
];
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
    if (/^\s*SELECT\b/iu.test(this.sql)) return { success: true, meta: { changes: 0 }, results: this.database.prepare(this.sql).all(...this.values) };
    const result = this.database.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
  async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.values) }; }
  async first() { return this.database.prepare(this.sql).get(...this.values) ?? null; }
}

class LocalD1 {
  constructor(database, beforeBatch = null) {
    this.database = database;
    this.beforeBatch = beforeBatch;
  }
  prepare(sql) { return new LocalStatement(this.database, sql); }
  async batch(statements) {
    this.beforeBatch?.();
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
  for (const migrationPath of migrationPaths) database.exec(await readFile(migrationPath, "utf8"));
  database.prepare("INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)").run("app-user-1", issuer, "subject-1", now, now);
  database.prepare("INSERT INTO profiles(application_id, display_name, locale, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run("app-user-1", "テスト利用者", "ja-JP", "Asia/Tokyo", now, now);
  env = {
    ACCESS_ISSUER: issuer,
    ACCESS_AUDIENCE: audience,
    ACCESS_JWKS_URL: jwksUrl,
    ACCESS_HEALTH_SERVICE_TOKEN_NAMES: "runner.example",
    DB: new LocalD1(database)
  };
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
    workspaces: [],
    manuals: { status: "migration" },
    members: { status: "ready" },
    authMode: "access"
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

test("workspace作成batch直前に無効化された主体はACCESS_ACTOR_FORBIDDENへ写像し、旧shellを残さない", async () => {
  const racedD1 = new LocalD1(database, () => {
    database.prepare("UPDATE identities SET status = 'disabled' WHERE application_id = ?").run("app-user-1");
  });
  const response = await worker.fetch(await accessRequest("/api/workspaces", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://app.example.invalid" },
    body: JSON.stringify({ name: "営業部", slug: "sales" })
  }), { ...env, DB: racedD1 }, {});

  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "ACCESS_ACTOR_FORBIDDEN");
  assert.equal(database.prepare("SELECT count(*) AS count FROM workspaces").get().count, 0);
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

test("/health/config requires an allowlisted Access service token", async () => {
  let healthResponse = await worker.fetch(request("/health/config"), env, {});
  assert.equal(healthResponse.status, 401);
  assert.equal((await healthResponse.json()).code, "ACCESS_JWT_REQUIRED");

  healthResponse = await worker.fetch(await accessRequest("/health/config", {}, { sub: "", common_name: "not-allowed" }), env, {});
  assert.equal(healthResponse.status, 403);
  assert.equal((await healthResponse.json()).code, "ACCESS_FORBIDDEN");

  healthResponse = await worker.fetch(await accessRequest("/health/config", {}, { sub: "", common_name: "runner.example" }), env, {});
  assert.equal(healthResponse.status, 200);
  assert.equal((await healthResponse.json()).status, "ok");
});

test("Access member APIはworkspace固定D1 queryとrole boundaryを正本にする", async () => {
  const workspaceResponse = await worker.fetch(await accessRequest("/api/workspaces", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://app.example.invalid" },
    body: JSON.stringify({ name: "Sales", slug: "sales" })
  }), env, {});
  assert.equal(workspaceResponse.status, 201);
  const { workspaceId } = await workspaceResponse.json();

  let response = await worker.fetch(await accessRequest(`/api/workspaces/${workspaceId}/members`), env, {});
  assert.equal(response.status, 200);
  let payload = await response.json();
  assert.equal(payload.currentUserRole, "owner");
  assert.deepEqual(payload.members.map((member) => member.role), ["owner"]);

  const secondUserId = "22222222-2222-4222-8222-222222222222";
  database.prepare("INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)").run(secondUserId, issuer, "subject-2", now, now);
  database.prepare("INSERT INTO profiles(application_id, display_name, locale, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(secondUserId, "合成メンバー", "ja-JP", "Asia/Tokyo", now, now);
  const joinCodeResponse = await worker.fetch(await accessRequest("/api/member-join-code", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://app.example.invalid" },
    body: "{}"
  }, { sub: "subject-2" }), env, {});
  assert.equal(joinCodeResponse.status, 201);
  const { joinCode } = await joinCodeResponse.json();

  response = await worker.fetch(await accessRequest(`/api/workspaces/${workspaceId}/members`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://app.example.invalid" },
    body: JSON.stringify({ joinCode, role: "viewer" })
  }), env, {});
  assert.equal(response.status, 201);

  response = await worker.fetch(await accessRequest(`/api/workspaces/${workspaceId}/members`, {}, { sub: "subject-2" }), env, {});
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.equal(payload.currentUserRole, "viewer");
  assert.deepEqual(payload.members.map((member) => member.userId), ["app-user-1", secondUserId]);

  response = await worker.fetch(await accessRequest(`/api/workspaces/${workspaceId}/members/33333333-3333-4333-8333-333333333333`, {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: "https://app.example.invalid" },
    body: JSON.stringify({ role: "editor", status: "active" })
  }, { sub: "subject-2" }), env, {});
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "ACCESS_FORBIDDEN");

  response = await worker.fetch(await accessRequest(`/api/workspaces/${workspaceId}/members/${secondUserId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: "https://app.example.invalid" },
    body: JSON.stringify({ role: "editor", status: "active" })
  }), env, {});
  assert.equal(response.status, 200);

  response = await worker.fetch(await accessRequest("/api/workspaces/11111111-1111-4111-8111-111111111111/members"), env, {});
  assert.equal(response.status, 404);
  assert.equal((await response.json()).code, "WORKSPACE_MEMBERS_NOT_FOUND");
});

test("Access modeはlegacy auth routeのみSupabase fallbackをかけず停止する", async () => {
  let supabaseCalled = false;
  globalThis.fetch = async () => {
    supabaseCalled = true;
    throw new Error("legacy route must not be called");
  };
  for (const path of [
    "/api/auth/login",
    "/api/auth/refresh"
  ]) {
    const response = await worker.fetch(request(path), env, {});
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "MANUAL_MIGRATION_IN_PROGRESS");
  }
  assert.equal(supabaseCalled, false);
});

test("Access user logout returns the Access session termination URL", async () => {
  const response = await worker.fetch(await accessRequest("/api/auth/logout", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://app.example.invalid" },
    body: "{}"
  }), env, {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", redirectUrl: "/cdn-cgi/access/logout" });
});

test("Access user logout does not require D1 identity resolution", async () => {
  const response = await worker.fetch(await accessRequest("/api/auth/logout", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://app.example.invalid" },
    body: "{}"
  }), { ...env, DB: undefined }, {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", redirectUrl: "/cdn-cgi/access/logout" });
});

const TRANSFER_TARGET = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
async function ownerTransferFixture() {
  const created = await worker.fetch(await accessRequest("/api/workspaces", {
    method: "POST", headers: { "content-type": "application/json", origin: "https://app.example.invalid" },
    body: JSON.stringify({ name: "移管検証", slug: "transfer" })
  }), env, {});
  assert.equal(created.status, 201);
  const { workspaceId } = await created.json();
  database.prepare("INSERT INTO identities VALUES (?, ?, 'transfer-target', 'active', ?, ?)").run(TRANSFER_TARGET, issuer, now, now);
  database.prepare("INSERT INTO profiles VALUES (?, '移管先', 'ja-JP', 'Asia/Tokyo', ?, ?)").run(TRANSFER_TARGET, now, now);
  database.prepare("INSERT INTO workspace_members VALUES (?, ?, 'editor', 'active', ?, ?)").run(workspaceId, TRANSFER_TARGET, now, now);
  return workspaceId;
}
async function sendTransfer(workspaceId, body = { targetUserId: TRANSFER_TARGET }, claims = {}, extraHeaders = {}) {
  return worker.fetch(await accessRequest(`/api/workspaces/${workspaceId}/owner-transfer`, {
    method: "POST", headers: { "content-type": "application/json", origin: "https://app.example.invalid", ...extraHeaders },
    body: JSON.stringify(body)
  }, claims), env, {});
}

test("owner-transfer API succeeds, reload shows demotion and replay is denied", async () => {
  const workspaceId = await ownerTransferFixture();
  const response = await sendTransfer(workspaceId);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  const list = await worker.fetch(await accessRequest(`/api/workspaces/${workspaceId}/members`), env, {});
  const payload = await list.json();
  assert.equal(payload.currentUserRole, "admin");
  assert.equal(payload.members.find((member) => member.userId === TRANSFER_TARGET).role, "owner");
  const replay = await sendTransfer(workspaceId);
  assert.equal(replay.status, 403);
  assert.equal((await replay.json()).code, "OWNER_TRANSFER_FORBIDDEN");
});

test("owner-transfer API distinguishes invalid input, target, self, Personal Workspace and conflict", async () => {
  const workspaceId = await ownerTransferFixture();
  for (const body of [{}, { targetUserId: "bad" }, { targetUserId: TRANSFER_TARGET, extra: true }]) {
    const response = await sendTransfer(workspaceId, body);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "OWNER_TRANSFER_INPUT_INVALID");
  }
  const missing = await sendTransfer(workspaceId, { targetUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" });
  assert.equal(missing.status, 409);
  assert.equal((await missing.json()).code, "OWNER_TRANSFER_TARGET_INVALID");
  const personalId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  database.prepare("INSERT INTO workspaces VALUES (?, '個人', 'personal-transfer', 'active', 'app-user-1', ?, ?, 'personal')").run(personalId, now, now);
  database.prepare("INSERT INTO workspace_members VALUES (?, 'app-user-1', 'owner', 'active', ?, ?)").run(personalId, now, now);
  const personal = await sendTransfer(personalId);
  assert.equal(personal.status, 409);
  assert.equal((await personal.json()).code, "OWNER_TRANSFER_PERSONAL_WORKSPACE");
  env.DB.beforeBatch = () => database.prepare("UPDATE workspace_members SET status = 'removed' WHERE workspace_id = ? AND application_id = ?").run(workspaceId, TRANSFER_TARGET);
  const conflict = await sendTransfer(workspaceId);
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).code, "OWNER_TRANSFER_CONFLICT");
  assert.equal(database.prepare("SELECT count(*) AS n FROM workspace_owner_transfer_permits").get().n, 0);
  env.DB.beforeBatch = null;
  database.prepare("UPDATE workspace_members SET status = 'active' WHERE workspace_id = ? AND application_id = ?").run(workspaceId, TRANSFER_TARGET);
  assert.equal((await sendTransfer(workspaceId)).status, 200);
  const self = await sendTransfer(workspaceId, { targetUserId: TRANSFER_TARGET }, { sub: "transfer-target" });
  assert.equal(self.status, 409);
  assert.equal((await self.json()).code, "OWNER_TRANSFER_SELF");
});

for (const role of ["admin", "editor", "viewer"]) {
  test(`owner-transfer API denies ${role}, cross-tenant requests and invalid authentication`, async () => {
    const workspaceId = await ownerTransferFixture();
    database.prepare("UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND application_id = ?").run(role, workspaceId, TRANSFER_TARGET);
    for (const id of [workspaceId, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"]) {
      const response = await sendTransfer(id, undefined, { sub: "transfer-target" });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).code, "OWNER_TRANSFER_FORBIDDEN");
    }
    const csrf = await sendTransfer(workspaceId, undefined, {}, { origin: "https://other.example.invalid" });
    assert.equal(csrf.status, 403);
    const service = await sendTransfer(workspaceId, undefined, { sub: "", common_name: "runner.example" });
    assert.equal(service.status, 403);
    const unauthenticated = await worker.fetch(request(`/api/workspaces/${workspaceId}/owner-transfer`, {
      method: "POST", headers: { "content-type": "application/json", origin: "https://app.example.invalid" }, body: JSON.stringify({ targetUserId: TRANSFER_TARGET })
    }), env, {});
    assert.equal(unauthenticated.status, 401);
    assert.equal(database.prepare("SELECT count(*) AS n FROM workspace_owner_transfer_permits").get().n, 0);
  });
}

test("owner-transfer storage errors return a bounded Japanese error without lower-level details", async () => {
  const workspaceId = await ownerTransferFixture();
  env.DB.beforeBatch = () => { throw new Error("synthetic database detail"); };
  const response = await sendTransfer(workspaceId);
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.code, "OWNER_TRANSFER_UNAVAILABLE");
  assert.doesNotMatch(payload.message, /synthetic/);
});
