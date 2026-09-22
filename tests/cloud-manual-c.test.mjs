import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import { exportJWK, SignJWT } from "jose";
import worker from "../apps/worker/src/index.ts";
import { handleCloudManualRoute } from "../apps/worker/src/cloud-manual-router.ts";
import { CloudManualRepository } from "../apps/worker/src/infra/d1/cloud-manual-repository.ts";

const BASE_URL = "https://meccha-manual-staging.meccha-iiyatsu.com";
const ISSUER = "https://access.example.invalid";
const AUDIENCE = "meccha-manual-staging";
const JWKS_URL = `${ISSUER}/.well-known/jwks.json`;
const OWNER_SUBJECT = "cloud-owner";
const OWNER_OPERATION = "cloud-manual-operation-0001";
const NOW = "2026-09-23T00:00:00.000Z";
const ONE_PIXEL_PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = { ...await exportJWK(publicKey), kid: "cloud-c-test", alg: "RS256", use: "sig" };
const migrationNames = [
  "0001_d1_identity_workspace.sql",
  "0002_d1_personal_workspace.sql",
  "0003_d1_onboarding_bootstrap.sql",
  "0004_d1_cloud_manual_claim.sql"
];

class LocalStatement {
  constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; }
  bind(...values) {
    if (values.length > 100) throw new Error("D1 parameter limit exceeded");
    const boundBytes = values.reduce((total, value) => total + new TextEncoder().encode(String(value ?? "")).byteLength, 0);
    if (boundBytes > 100 * 1024) throw new Error("D1 bound value limit exceeded");
    return new LocalStatement(this.database, this.sql, values);
  }
  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
  async first() { return this.database.prepare(this.sql).get(...this.values) ?? null; }
  async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.values) }; }
}

class LocalD1 {
  constructor(database) { this.database = database; this.failAt = -1; this.beforeBatch = null; this.batchCount = 0; this.tail = Promise.resolve(); this.lastError = null; }
  prepare(sql) { return new LocalStatement(this.database, sql); }
  async batch(statements) {
    const task = this.tail.then(async () => {
      this.batchCount += 1;
      this.beforeBatch?.();
      this.database.exec("BEGIN IMMEDIATE");
      try {
        const results = [];
        for (const [index, statement] of statements.entries()) {
          if (index === this.failAt) throw new Error("injected D1 failure");
          results.push(await statement.run());
        }
        this.database.exec("COMMIT");
        return results;
      } catch (error) {
        this.lastError = error;
        this.database.exec("ROLLBACK");
        throw error;
      }
    });
    this.tail = task.catch(() => undefined);
    return task;
  }
}

class MemoryR2 {
  constructor() { this.objects = new Map(); this.putCount = 0; this.failPut = false; this.failAfterPut = false; this.failHead = false; this.failGet = false; }
  async put(key, body, options = {}) {
    this.putCount += 1;
    if (this.failPut) throw new Error("injected R2 put failure");
    if (options.onlyIf?.etagDoesNotMatch === "*" && this.objects.has(key)) return null;
    const bytes = body instanceof Uint8Array ? body.slice() : new Uint8Array(await new Response(body).arrayBuffer());
    this.objects.set(key, { body: bytes, size: bytes.byteLength, httpMetadata: { ...(options.httpMetadata ?? {}) }, customMetadata: { ...(options.customMetadata ?? {}) } });
    if (this.failAfterPut) throw new Error("injected R2 response loss after put");
    return { etag: `etag-${this.putCount}` };
  }
  async head(key) {
    if (this.failHead) throw new Error("injected R2 head failure");
    const object = this.objects.get(key);
    return object ? { size: object.size, httpMetadata: { ...object.httpMetadata }, customMetadata: { ...object.customMetadata } } : null;
  }
  async get(key) {
    if (this.failGet) throw new Error("injected R2 get failure");
    const object = this.objects.get(key);
    return object ? { body: new Response(object.body).body, size: object.size, httpMetadata: { ...object.httpMetadata }, customMetadata: { ...object.customMetadata } } : null;
  }
  async delete(key) { this.objects.delete(key); }
}

let database;
let d1;
let r2;
let env;
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  database = new DatabaseSync(":memory:");
  for (const name of migrationNames) database.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  d1 = new LocalD1(database);
  r2 = new MemoryR2();
  env = {
    APP_ENV: "staging",
    APP_BASE_URL: BASE_URL,
    ACCESS_ISSUER: ISSUER,
    ACCESS_AUDIENCE: AUDIENCE,
    ACCESS_JWKS_URL: JWKS_URL,
    DB: d1,
    MANUAL_ASSETS: r2,
    ONBOARDING_RATE_LIMITER: { limit: async () => ({ success: true }) }
  };
  globalThis.fetch = async (url) => {
    assert.equal(String(url), JWKS_URL);
    return Response.json({ keys: [publicJwk] });
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  database?.close();
});

function count(table, where = "") { return Number(database.prepare(`SELECT count(*) AS n FROM ${table}${where}`).get().n); }
function one(sql, ...values) { return database.prepare(sql).get(...values); }
function all(sql, ...values) { return database.prepare(sql).all(...values); }

async function accessToken(subject = OWNER_SUBJECT, claims = {}) {
  const issued = Math.floor(Date.now() / 1000);
  return new SignJWT({ type: "app", sub: subject, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: publicJwk.kid })
    .setIssuer(ISSUER).setAudience(AUDIENCE).setIssuedAt(issued).setExpirationTime(issued + 300).sign(privateKey);
}

async function request(path, { method = "GET", body, headers = {}, subject = OWNER_SUBJECT, origin = BASE_URL, claims = {} } = {}) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Cf-Access-Jwt-Assertion", await accessToken(subject, claims));
  if (origin !== null) requestHeaders.set("origin", origin);
  if (body !== undefined && typeof body !== "string" && !(body instanceof Uint8Array)) {
    requestHeaders.set("content-type", "application/json");
    body = JSON.stringify(body);
  }
  requestHeaders.set("cf-connecting-ip", "198.51.100.10");
  const input = new Request(`${BASE_URL}${path}`, { method, headers: requestHeaders, body });
  Object.defineProperty(input, "cf", { value: { colo: "NRT", asn: 64500 }, configurable: true });
  return input;
}

async function jsonRequest(path, options = {}) {
  const { parse = true, ...requestOptions } = options;
  const response = await worker.fetch(await request(path, requestOptions), env, {});
  let payload = null;
  if (parse) {
    try { payload = await response.json(); } catch { /* binary response */ }
  }
  return { response, payload };
}

async function bootstrap() {
  const result = await jsonRequest("/api/onboarding/bootstrap", { method: "POST", body: { operationId: OWNER_OPERATION } });
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  const owner = one("SELECT application_id AS id FROM identities WHERE subject = ?", OWNER_SUBJECT);
  assert.ok(owner?.id);
  return { workspaceId: result.payload.workspaceId, actorId: owner.id };
}

async function stageClaim({ operationId = "cloud-manual-operation-0002", assetCount = 1, bytes = ONE_PIXEL_PNG, slot = 0, contentType = "image/png" } = {}) {
  const intent = await jsonRequest("/api/onboarding/claim-intents", { method: "POST", body: { operationId, assetCount } });
  assert.equal(intent.response.status, 201, JSON.stringify(intent.payload));
  const staged = await uploadIntentAsset(intent.payload, operationId, slot, bytes, contentType);
  return { ...intent.payload, operationId, assetCount, bytes, sha256: await digest(bytes), staged };
}

async function uploadIntentAsset(intent, operationId, slot, bytes, contentType = "image/png") {
  const sha256 = await digest(bytes);
  return jsonRequest(`/api/onboarding/claim-intents/${intent.claimIntentId}/assets/${slot}`, {
    method: "PUT", body: bytes,
    headers: {
      "content-type": contentType,
      "content-length": String(bytes.byteLength),
      "x-claim-operation-id": operationId,
      "x-asset-sha256": sha256,
      "x-asset-byte-length": String(bytes.byteLength)
    }
  });
}

async function digest(bytes) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function claimBody(staged, { title = "最初の手順", description = "画像を含む手順書", steps = undefined } = {}) {
  return {
    operationId: staged.operationId,
    manual: {
      title,
      description,
      steps: steps ?? [{ type: "action", title: "画像を見る", instruction: "画像を確認する", actionType: "click", targetText: null, url: null, assetSlot: staged.assetCount > 0 ? 0 : null }]
    },
    assets: staged.assetCount > 0 ? [{ assetSlot: 0, sha256: staged.sha256 }] : []
  };
}

test("bootstrap→画像付きclaim→list/detail→asset proxyは保存内容とsha参照を再表示する", async () => {
  const { workspaceId } = await bootstrap();
  const pageResponse = await worker.fetch(await request("/manuals"), env, {});
  assert.equal(pageResponse.status, 200);
  assert.match(pageResponse.headers.get("content-type") ?? "", /^text\/html/u);
  const pageHtml = await pageResponse.text();
  assert.match(pageHtml, new RegExp(`data-workspace-id="${workspaceId}"`));
  const css = await jsonRequest(`/assets/cloud-manual.css?v=20260923`);
  assert.equal(css.response.status, 200);
  assert.match(css.response.headers.get("content-type") ?? "", /^text\/css/u);
  const js = await jsonRequest(`/assets/cloud-manual.js?v=20260923`);
  assert.equal(js.response.status, 200);
  assert.match(js.response.headers.get("content-type") ?? "", /javascript/u);
  const staged = await stageClaim();
  assert.equal(staged.staged.response.status, 200, JSON.stringify(staged.staged.payload));

  const claimed = await jsonRequest(`/api/onboarding/claims/${staged.claimIntentId}`, { method: "POST", body: claimBody(staged) });
  assert.equal(claimed.response.status, 200, JSON.stringify(claimed.payload));
  assert.equal(claimed.payload.status, "claimed");

  const listed = await jsonRequest(`/api/workspaces/${workspaceId}/manuals`);
  assert.equal(listed.response.status, 200);
  assert.equal(listed.payload.manuals.length, 1);
  assert.equal(listed.payload.manuals[0].title, "最初の手順");

  const detail = await jsonRequest(`/api/workspaces/${workspaceId}/manuals/${claimed.payload.manualId}`);
  assert.equal(detail.response.status, 200);
  assert.equal(detail.payload.draft.title, "最初の手順");
  assert.equal(detail.payload.steps.length, 1);
  assert.equal(detail.payload.steps[0].assetId, one("SELECT asset_id FROM claim_assets WHERE claim_intent_id = ?", staged.claimIntentId).asset_id);
  assert.equal(detail.payload.steps[0].assetId !== null, true);
  assert.equal(detail.payload.steps[0].assetUrl, `/api/workspaces/${workspaceId}/assets/${detail.payload.steps[0].assetId}`);

  const asset = await jsonRequest(`/api/workspaces/${workspaceId}/manuals/${claimed.payload.manualId}/assets/${detail.payload.steps[0].assetId}`, { parse: false });
  assert.equal(asset.response.status, 200);
  assert.equal(asset.response.headers.get("content-type"), "image/png");
  assert.deepEqual(new Uint8Array(await asset.response.arrayBuffer()), staged.bytes);
});

test("MANUAL_ASSETSなしではcloud manual API・画面・static assetをmigrationとして拒否し副作用を残さない", async () => {
  const { workspaceId } = await bootstrap();
  const staged = await stageClaim({ operationId: "binding-guard-operation-0001", assetCount: 0 });
  const claimed = await jsonRequest(`/api/onboarding/claims/${staged.claimIntentId}`, { method: "POST", body: claimBody(staged, { title: "binding guard", description: "保存済み", steps: [] }) });
  assert.equal(claimed.response.status, 200, JSON.stringify(claimed.payload));
  const path = `/api/workspaces/${workspaceId}/manuals/${claimed.payload.manualId}`;
  const before = (await jsonRequest(path)).payload;
  const claimCount = count("claim_intents");
  const manualCount = count("manuals");
  const pending = await jsonRequest("/api/onboarding/claim-intents", { method: "POST", body: { operationId: "binding-guard-operation-0002", assetCount: 0 } });
  assert.equal(pending.response.status, 201);
  env.MANUAL_ASSETS = undefined;

  const claim = await jsonRequest("/api/onboarding/claim-intents", { method: "POST", body: { operationId: "binding-guard-operation-0003", assetCount: 0 } });
  assert.equal(claim.response.status, 503);
  assert.equal(claim.payload.code, "MANUAL_MIGRATION_IN_PROGRESS");
  assert.equal(count("claim_intents"), claimCount + 1);
  const finalize = await jsonRequest(`/api/onboarding/claims/${pending.payload.claimIntentId}`, { method: "POST", body: claimBody(pending, { title: "保存されない", description: "bindingなし", steps: [] }) });
  assert.equal(finalize.response.status, 503);
  assert.equal(finalize.payload.code, "MANUAL_MIGRATION_IN_PROGRESS");
  assert.equal(count("manuals"), manualCount);

  const listed = await jsonRequest(`/api/workspaces/${workspaceId}/manuals`);
  assert.equal(listed.response.status, 503);
  assert.equal(listed.payload.code, "MANUAL_MIGRATION_IN_PROGRESS");
  const patchResult = await jsonRequest(`${path}/draft`, {
    method: "PATCH",
    body: { title: "変更されない", description: "変更されない", expectedUpdatedAt: before.draft.updatedAt, steps: [] }
  });
  assert.equal(patchResult.response.status, 503);
  assert.equal(patchResult.payload.code, "MANUAL_MIGRATION_IN_PROGRESS");
  assert.equal(count("manuals"), manualCount);
  assert.equal(one("SELECT title FROM manuals WHERE id = ?", claimed.payload.manualId).title, before.manual.title);

  const direct = await handleCloudManualRoute(await request(`/api/workspaces/${workspaceId}/manuals`), env);
  assert.equal(direct?.status, 503);
  assert.equal((await direct.json()).code, "MANUAL_MIGRATION_IN_PROGRESS");
  for (const assetPath of ["/assets/cloud-manual.css?v=20260923", "/assets/cloud-manual.js?v=20260923", "/manuals"]) {
    const response = await jsonRequest(assetPath);
    assert.equal(response.response.status, 503, assetPath);
    assert.equal(response.payload.code, "MANUAL_MIGRATION_IN_PROGRESS", assetPath);
  }
  const session = await jsonRequest("/api/session");
  assert.equal(session.response.status, 200);
  assert.equal(session.payload.manuals.status, "migration");
});

test("cloud manualのstep URLは既存manual APIと同じHTTP/HTTPS正規化・拒否境界を使う", async () => {
  const { workspaceId } = await bootstrap();
  const staged = await stageClaim({ operationId: "step-url-contract-0001", assetCount: 0 });
  const claimed = await jsonRequest(`/api/onboarding/claims/${staged.claimIntentId}`, {
    method: "POST",
    body: claimBody(staged, { title: "URL契約", description: "正規化", steps: [{ type: "action", title: "移動", instruction: "開く", actionType: "navigate", targetText: null, url: "HTTPS://example.com:000443/?q=a", assetSlot: null }] })
  });
  assert.equal(claimed.response.status, 200, JSON.stringify(claimed.payload));
  const path = `/api/workspaces/${workspaceId}/manuals/${claimed.payload.manualId}`;
  const detail = await jsonRequest(path);
  assert.equal(detail.payload.steps[0].url, "https://example.com/?q=a");
  const invalidClaim = await stageClaim({ operationId: "step-url-contract-0002", assetCount: 0 });
  const invalidClaimResult = await jsonRequest(`/api/onboarding/claims/${invalidClaim.claimIntentId}`, {
    method: "POST",
    body: claimBody(invalidClaim, { title: "拒否", description: "不正URL", steps: [{ type: "action", title: "移動", instruction: "開く", actionType: "navigate", targetText: null, url: "javascript:alert(1)", assetSlot: null }] })
  });
  assert.equal(invalidClaimResult.response.status, 400);
  assert.equal(invalidClaimResult.payload.code, "STEP_URL_INVALID");
  assert.equal(count("manuals"), 1);
  const invalidUrls = [
    "javascript:alert(1)",
    "/relative/path",
    "https://user:secret@example.com/",
    "https://example.com\\path",
    "https://example.com/path with space",
    "https://example.com:99999/",
    "https://xn--bcher-kva.example/",
    "https://example.com/" + "あ".repeat(680)
  ];
  for (const [index, url] of invalidUrls.entries()) {
    const before = (await jsonRequest(path)).payload;
    const result = await jsonRequest(`${path}/draft`, {
      method: "PATCH",
      body: { title: before.manual.title, description: before.draft.description, expectedUpdatedAt: before.draft.updatedAt, steps: [{ id: before.steps[0].id, type: before.steps[0].type, title: before.steps[0].title, instruction: before.steps[0].instruction, actionType: before.steps[0].actionType, targetText: before.steps[0].targetText, url, assetId: null }] }
    });
    assert.equal(result.response.status, 400, `${index}:${url}`);
    assert.equal(result.payload.code, "STEP_URL_INVALID", `${index}:${url}`);
    const after = (await jsonRequest(path)).payload;
    assert.equal(after.steps[0].url, before.steps[0].url, `${index}:${url}`);
    assert.equal(after.manual.updatedAt, before.manual.updatedAt, `${index}:${url}`);
  }
  const before = (await jsonRequest(path)).payload;
  const valid = await jsonRequest(`${path}/draft`, {
    method: "PATCH",
    body: { title: before.manual.title, description: before.draft.description, expectedUpdatedAt: before.draft.updatedAt, steps: [{ id: before.steps[0].id, type: before.steps[0].type, title: before.steps[0].title, instruction: before.steps[0].instruction, actionType: before.steps[0].actionType, targetText: before.steps[0].targetText, url: "https://example.com:000443/?q=a", assetId: null }] }
  });
  assert.equal(valid.response.status, 200, JSON.stringify(valid.payload));
  const after = (await jsonRequest(path)).payload;
  assert.equal(after.steps[0].url, "https://example.com/?q=a");
});

test("PATCHの一括snapshotでtitle/description/追加・削除・並べ替え・画像mappingを原子的に反映する", async () => {
  const { workspaceId, actorId } = await bootstrap();
  const staged = await stageClaim();
  const claimed = await jsonRequest(`/api/onboarding/claims/${staged.claimIntentId}`, { method: "POST", body: claimBody(staged) });
  assert.equal(claimed.response.status, 200, JSON.stringify(claimed.payload));
  const path = `/api/workspaces/${workspaceId}/manuals/${claimed.payload.manualId}`;
  const before = (await jsonRequest(path)).payload;
  const original = before.steps[0];
  const direct = await new CloudManualRepository(d1).updateDraftWithSteps(actorId, workspaceId, claimed.payload.manualId, before.draft.title, before.draft.description, [{ id: original.id, type: original.type, title: original.title, instruction: original.instruction, actionType: original.actionType, targetText: original.targetText, url: original.url, assetId: original.assetId }], before.draft.updatedAt, before.draft.updatedAt);
  assert.ok(Date.parse(direct.updatedAt) > Date.parse(before.draft.updatedAt));
  const directBefore = (await jsonRequest(path)).payload;
  const added = { type: "note", title: "追加", instruction: "確認する", actionType: null, targetText: null, url: null, assetId: original.assetId };

  const edited = await jsonRequest(`${path}/draft`, {
    method: "PATCH",
    body: {
      title: "編集済み手順", description: "説明も更新", expectedUpdatedAt: directBefore.draft.updatedAt,
      steps: [{ ...added }, { id: original.id, type: original.type, title: original.title, instruction: original.instruction, actionType: original.actionType, targetText: original.targetText, url: original.url, assetId: original.assetId }]
    }
  });
  assert.equal(edited.response.status, 200, JSON.stringify(edited.payload));
  const after = (await jsonRequest(path)).payload;
  assert.equal(after.manual.title, "編集済み手順");
  assert.equal(after.draft.description, "説明も更新");
  assert.deepEqual(after.steps.map((step) => step.title), ["追加", "画像を見る"]);
  assert.equal(after.steps[0].assetId, original.assetId);

  const deleted = await jsonRequest(`${path}/draft`, {
    method: "PATCH",
    body: {
      title: "編集済み手順", description: "説明も更新", expectedUpdatedAt: after.draft.updatedAt,
      steps: [{ id: after.steps[0].id, type: after.steps[0].type, title: after.steps[0].title, instruction: after.steps[0].instruction, actionType: after.steps[0].actionType, targetText: after.steps[0].targetText, url: after.steps[0].url, assetId: after.steps[0].assetId }]
    }
  });
  assert.equal(deleted.response.status, 200, JSON.stringify(deleted.payload));
  const final = (await jsonRequest(path)).payload;
  assert.deepEqual(final.steps.map((step) => step.title), ["追加"]);
  assert.equal(count("manual_steps", " WHERE deleted_at IS NOT NULL"), 1);
});

test("同一operationのintent重複は同じintentを返し、assetCount変更は拒否する", async () => {
  await bootstrap();
  const first = await jsonRequest("/api/onboarding/claim-intents", { method: "POST", body: { operationId: "same-operation-00001", assetCount: 0 } });
  assert.equal(first.response.status, 201);
  const concurrent = await Promise.all([
    jsonRequest("/api/onboarding/claim-intents", { method: "POST", body: { operationId: "same-operation-race01", assetCount: 0 } }),
    jsonRequest("/api/onboarding/claim-intents", { method: "POST", body: { operationId: "same-operation-race01", assetCount: 0 } })
  ]);
  assert.deepEqual(concurrent.map((result) => result.response.status), [201, 201]);
  assert.equal(concurrent[0].payload.claimIntentId, concurrent[1].payload.claimIntentId);
  const replay = await jsonRequest("/api/onboarding/claim-intents", { method: "POST", body: { operationId: "same-operation-00001", assetCount: 0 } });
  assert.equal(replay.response.status, 201);
  assert.equal(replay.payload.claimIntentId, first.payload.claimIntentId);
  const conflict = await jsonRequest("/api/onboarding/claim-intents", { method: "POST", body: { operationId: "same-operation-00001", assetCount: 1 } });
  assert.equal(conflict.response.status, 409, `${JSON.stringify(conflict.payload)} d1=${d1.lastError?.message ?? "none"}`);
  assert.equal(count("claim_intents"), 2);
});

test("assetはcontent-length、digest、slot、metadataの不一致で拒否され、R2/D1副作用を作らない", async () => {
  await bootstrap();
  const intent = await jsonRequest("/api/onboarding/claim-intents", { method: "POST", body: { operationId: "asset-negative-0001", assetCount: 1 } });
  assert.equal(intent.response.status, 201);
  const bytes = ONE_PIXEL_PNG;
  const sha256 = await digest(bytes);
  const base = {
    method: "PUT", body: bytes,
    headers: { "content-type": "image/png", "content-length": "3", "x-claim-operation-id": "asset-negative-0001", "x-asset-sha256": sha256, "x-asset-byte-length": "3" }
  };
  const wrongLength = await jsonRequest(`/api/onboarding/claim-intents/${intent.payload.claimIntentId}/assets/0`, { ...base, headers: { ...base.headers, "content-length": "2" } });
  assert.equal(wrongLength.response.status, 400);
  const wrongDigest = await jsonRequest(`/api/onboarding/claim-intents/${intent.payload.claimIntentId}/assets/0`, { ...base, headers: { ...base.headers, "x-asset-sha256": "0".repeat(64) } });
  assert.equal(wrongDigest.response.status, 400);
  const wrongType = await jsonRequest(`/api/onboarding/claim-intents/${intent.payload.claimIntentId}/assets/0`, { ...base, headers: { ...base.headers, "content-type": "application/octet-stream" } });
  assert.equal(wrongType.response.status, 415);
  const wrongSlot = await jsonRequest(`/api/onboarding/claim-intents/${intent.payload.claimIntentId}/assets/1`, base);
  assert.equal(wrongSlot.response.status, 400);
  assert.equal(r2.putCount, 0);
  assert.equal(count("claim_assets"), 0);
});

test("claim finalizeのD1途中失敗は全rollbackし、再送はmanualを重複作成しない", async () => {
  await bootstrap();
  const staged = await stageClaim();
  d1.failAt = 1;
  const failed = await jsonRequest(`/api/onboarding/claims/${staged.claimIntentId}`, { method: "POST", body: claimBody(staged) });
  assert.equal(failed.response.status, 503, JSON.stringify(failed.payload));
  assert.equal(count("manuals"), 0);
  assert.equal(count("manual_revisions"), 0);
  assert.equal(count("assets"), 0);
  assert.equal(one("SELECT status FROM claim_intents WHERE id = ?", staged.claimIntentId).status, "pending");
  d1.failAt = -1;
  const retry = await jsonRequest(`/api/onboarding/claims/${staged.claimIntentId}`, { method: "POST", body: claimBody(staged) });
  assert.equal(retry.response.status, 200, JSON.stringify(retry.payload));
  const replay = await jsonRequest(`/api/onboarding/claims/${staged.claimIntentId}`, { method: "POST", body: claimBody(staged) });
  assert.equal(replay.response.status, 200);
  assert.equal(replay.payload.manualId, retry.payload.manualId);
  assert.equal(count("manuals"), 1);
  assert.equal(count("manual_revisions"), 1);
  const altered = await jsonRequest(`/api/onboarding/claims/${staged.claimIntentId}`, { method: "POST", body: claimBody(staged, { title: "別内容" }) });
  assert.equal(altered.response.status, 409);
  assert.equal(count("manuals"), 1);
});

test("R2 put後の応答不達はorphanを残さず、同じslotの再送で一度だけstagedになる", async () => {
  await bootstrap();
  const intentResponse = await jsonRequest("/api/onboarding/claim-intents", { method: "POST", body: { operationId: "r2-response-loss-0001", assetCount: 1 } });
  assert.equal(intentResponse.response.status, 201);
  const bytes = ONE_PIXEL_PNG;
  r2.failAfterPut = true;
  const lost = await uploadIntentAsset(intentResponse.payload, "r2-response-loss-0001", 0, bytes);
  assert.equal(lost.response.status, 200, JSON.stringify(lost.payload));
  assert.equal(count("claim_assets"), 1);
  assert.equal(r2.objects.size, 1);
  r2.failAfterPut = false;
  const retry = await uploadIntentAsset(intentResponse.payload, "r2-response-loss-0001", 0, bytes);
  assert.equal(retry.response.status, 200, JSON.stringify(retry.payload));
  assert.equal(count("claim_assets"), 1);
  assert.equal(r2.objects.size, 1);

  const unknownIntent = await jsonRequest("/api/onboarding/claim-intents", { method: "POST", body: { operationId: "r2-unknown-result-0001", assetCount: 1 } });
  assert.equal(unknownIntent.response.status, 201);
  r2.failAfterPut = true;
  r2.failHead = true;
  const unknown = await uploadIntentAsset(unknownIntent.payload, "r2-unknown-result-0001", 0, bytes);
  assert.equal(unknown.response.status, 503, JSON.stringify(unknown.payload));
  assert.equal(count("claim_assets"), 2);
  assert.equal(one("SELECT status FROM claim_assets WHERE claim_intent_id = ?", unknownIntent.payload.claimIntentId).status, "reserved");
  assert.equal(r2.objects.size, 2);
  r2.failAfterPut = false;
  r2.failHead = false;
  const recovered = await uploadIntentAsset(unknownIntent.payload, "r2-unknown-result-0001", 0, bytes);
  assert.equal(recovered.response.status, 200, JSON.stringify(recovered.payload));
  assert.equal(one("SELECT status FROM claim_assets WHERE claim_intent_id = ?", unknownIntent.payload.claimIntentId).status, "staged");
  assert.equal(count("claim_assets"), 2);
  assert.equal(r2.objects.size, 2);
});

test("completed claimの期限切れ後も同一payloadの再送は同じmanualを返し、別payloadは拒否する", async () => {
  await bootstrap();
  const staged = await stageClaim({ operationId: "completed-expiry-0001" });
  const path = `/api/onboarding/claims/${staged.claimIntentId}`;
  const body = claimBody(staged);
  const first = await jsonRequest(path, { method: "POST", body });
  assert.equal(first.response.status, 200);
  database.prepare("UPDATE claim_intents SET expires_at = ? WHERE id = ?").run("2020-01-01T00:00:00.000Z", staged.claimIntentId);
  const replay = await jsonRequest(path, { method: "POST", body });
  assert.equal(replay.response.status, 200);
  assert.equal(replay.payload.manualId, first.payload.manualId);
  const altered = await jsonRequest(path, { method: "POST", body: claimBody(staged, { title: "期限後の別内容" }) });
  assert.equal(altered.response.status, 409);
  assert.equal(count("manuals"), 1);
  assert.equal(count("assets"), 1);
});

test("並行slot uploadは合計100MiBを超えず、R2 orphanとD1予約超過を作らない", async () => {
  await bootstrap();
  const assetCount = 11;
  const intent = await jsonRequest("/api/onboarding/claim-intents", { method: "POST", body: { operationId: "parallel-total-limit-01", assetCount } });
  assert.equal(intent.response.status, 201);
  const bytes = new Uint8Array(10 * 1024 * 1024);
  bytes.set(ONE_PIXEL_PNG);
  const results = await Promise.all(Array.from({ length: assetCount }, (_, slot) => uploadIntentAsset(intent.payload, "parallel-total-limit-01", slot, bytes)));
  const successes = results.filter((result) => result.response.status === 200);
  const overLimit = results.filter((result) => result.response.status === 413);
  assert.equal(successes.length, 10, results.map((result) => `${result.response.status}:${JSON.stringify(result.payload)}`).join("\n"));
  assert.equal(overLimit.length, 1, `${results.map((result) => `${result.response.status}:${JSON.stringify(result.payload)}`).join("\n")} claimAssets=${count("claim_assets")} r2Objects=${r2.objects.size}`);
  assert.equal(count("claim_assets"), 10);
  assert.equal(r2.objects.size, 10);
  assert.equal(all("SELECT byte_length FROM claim_assets WHERE claim_intent_id = ?", intent.payload.claimIntentId).reduce((total, row) => total + row.byte_length, 0), 100 * 1024 * 1024);
});

test("200stepsのclaimと再保存を受け入れ、順序と全stepを維持する", async () => {
  const { workspaceId } = await bootstrap();
  const staged = await stageClaim({ operationId: "steps-boundary-0001", assetCount: 0 });
  const steps = Array.from({ length: 200 }, (_, index) => ({
    type: index % 2 === 0 ? "action" : "note",
    title: `手順${index}`,
    instruction: index === 0 ? "" : `確認${index}`,
    actionType: index % 2 === 0 ? "click" : null,
    targetText: null,
    url: null,
    assetSlot: null
  }));
  const claimed = await jsonRequest(`/api/onboarding/claims/${staged.claimIntentId}`, { method: "POST", body: claimBody(staged, { title: "200件", description: "", steps }) });
  assert.equal(claimed.response.status, 200, JSON.stringify(claimed.payload));
  const path = `/api/workspaces/${workspaceId}/manuals/${claimed.payload.manualId}`;
  const detail = await jsonRequest(path);
  assert.equal(detail.response.status, 200);
  assert.equal(detail.payload.steps.length, 200);
  assert.deepEqual(detail.payload.steps.map((step) => step.title), steps.map((step) => step.title));
  const reordered = [...detail.payload.steps].reverse().map((step) => ({ id: step.id, type: step.type, title: step.title, instruction: step.instruction, actionType: step.actionType, targetText: step.targetText, url: step.url, assetId: null }));
  reordered[0] = { type: "note", title: "新規空step", instruction: "", actionType: null, targetText: null, url: null, assetId: null };
  const saved = await jsonRequest(`${path}/draft`, { method: "PATCH", body: { title: "200件再保存", description: "再保存", expectedUpdatedAt: detail.payload.draft.updatedAt, steps: reordered } });
  assert.equal(saved.response.status, 200, JSON.stringify(saved.payload));
  const after = await jsonRequest(path);
  assert.equal(after.payload.steps.length, 200);
  assert.equal(after.payload.steps[0].title, "新規空step");
  assert.equal(after.payload.steps[199].title, "手順0");
});

test("100assetsを全slotで参照でき、viewer・他workspace・別manual asset越境は拒否する", async () => {
  const { workspaceId, actorId } = await bootstrap();
  const stagedIntent = await jsonRequest("/api/onboarding/claim-intents", { method: "POST", body: { operationId: "assets-boundary-0001", assetCount: 100 } });
  assert.equal(stagedIntent.response.status, 201);
  const uploadResults = await Promise.all(Array.from({ length: 100 }, (_, slot) => uploadIntentAsset(stagedIntent.payload, "assets-boundary-0001", slot, ONE_PIXEL_PNG)));
  assert.equal(uploadResults.filter((result) => result.response.status === 200).length, 100);
  const sha256 = await digest(ONE_PIXEL_PNG);
  const steps = Array.from({ length: 100 }, (_, slot) => ({ type: "action", title: `画像${slot}`, instruction: "確認", actionType: "click", targetText: null, url: null, assetSlot: slot }));
  const claimed = await jsonRequest(`/api/onboarding/claims/${stagedIntent.payload.claimIntentId}`, {
    method: "POST",
    body: { operationId: "assets-boundary-0001", manual: { title: "100画像", description: "全slot", steps }, assets: Array.from({ length: 100 }, (_, assetSlot) => ({ assetSlot, sha256 })) }
  });
  assert.equal(claimed.response.status, 200, JSON.stringify(claimed.payload));
  const detailPath = `/api/workspaces/${workspaceId}/manuals/${claimed.payload.manualId}`;
  const detail = await jsonRequest(detailPath);
  assert.equal(detail.payload.steps.length, 100);
  assert.equal(new Set(detail.payload.steps.map((step) => step.assetId)).size, 100);

  const otherStaged = await stageClaim({ operationId: "assets-boundary-other-0001", assetCount: 0 });
  const otherClaim = await jsonRequest(`/api/onboarding/claims/${otherStaged.claimIntentId}`, { method: "POST", body: claimBody(otherStaged, { title: "別manual", description: "空", steps: [] }) });
  assert.equal(otherClaim.response.status, 200, JSON.stringify(otherClaim.payload));
  const otherPath = `/api/workspaces/${workspaceId}/manuals/${otherClaim.payload.manualId}`;
  const otherDetail = await jsonRequest(otherPath);
  const crossAsset = await jsonRequest(`${otherPath}/draft`, {
    method: "PATCH",
    body: { title: "別manual", description: "空", expectedUpdatedAt: otherDetail.payload.draft.updatedAt, steps: [{ type: "action", title: "越境", instruction: "拒否", actionType: "click", targetText: null, url: null, assetId: detail.payload.steps[0].assetId }] }
  });
  assert.equal(crossAsset.response.status, 409, `${JSON.stringify(crossAsset.payload)} d1=${d1.lastError?.message ?? "none"}`);
  assert.equal((await jsonRequest(otherPath)).payload.steps.length, 0);

  const viewerSubject = "cloud-viewer";
  const viewerId = "viewer-application-0000000000000000000000000001";
  database.prepare("INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)").run(viewerId, ISSUER, viewerSubject, NOW, NOW);
  database.prepare("INSERT INTO workspace_members(workspace_id, application_id, role, status, joined_at, updated_at) VALUES (?, ?, 'viewer', 'active', ?, ?)").run(workspaceId, viewerId, NOW, NOW);
  const viewerDetail = await jsonRequest(detailPath, { subject: viewerSubject });
  assert.equal(viewerDetail.response.status, 200);
  assert.equal(viewerDetail.payload.permissions.canEdit, false);
  const viewerPatch = await jsonRequest(`${detailPath}/draft`, { subject: viewerSubject, method: "PATCH", body: { title: "viewer", description: "拒否", expectedUpdatedAt: detail.payload.draft.updatedAt, steps: [] } });
  assert.equal(viewerPatch.response.status, 403);

  const foreignWorkspace = "00000000-0000-4000-8000-000000000099";
  const foreignList = await jsonRequest(`/api/workspaces/${foreignWorkspace}/manuals`);
  assert.equal(foreignList.response.status, 403);
  assert.equal(one("SELECT application_id FROM workspace_members WHERE workspace_id = ? AND application_id = ?", workspaceId, actorId).application_id, actorId);
});

test("owner限定・same-origin・service token・inactive identityの拒否は副作用0", async () => {
  await bootstrap();
  const before = count("claim_intents");
  const noOrigin = await jsonRequest("/api/onboarding/claim-intents", { method: "POST", origin: null, body: { operationId: "negative-origin-0001", assetCount: 0 } });
  assert.equal(noOrigin.response.status, 403);
  const otherOrigin = await jsonRequest("/api/onboarding/claim-intents", { method: "POST", origin: "https://other.example.invalid", body: { operationId: "negative-origin-0002", assetCount: 0 } });
  assert.equal(otherOrigin.response.status, 403);
  const service = await jsonRequest("/api/onboarding/claim-intents", { method: "POST", claims: { sub: "", common_name: "runner.example" }, body: { operationId: "negative-origin-0003", assetCount: 0 } });
  assert.equal(service.response.status, 403);
  const unknown = await jsonRequest("/api/onboarding/claim-intents", { method: "POST", subject: "unknown-actor", body: { operationId: "negative-origin-0004", assetCount: 0 } });
  assert.equal(unknown.response.status, 403);
  const ownerId = one("SELECT application_id AS id FROM identities WHERE subject = ?", OWNER_SUBJECT).id;
  const backupOwnerId = "backup-owner-application-0000000000000000000000000001";
  database.prepare("INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)").run(backupOwnerId, ISSUER, "backup-owner", NOW, NOW);
  database.prepare("INSERT INTO workspace_members(workspace_id, application_id, role, status, joined_at, updated_at) SELECT workspace_id, ?, 'owner', 'active', ?, ? FROM workspace_members WHERE application_id = ? AND role = 'owner' LIMIT 1").run(backupOwnerId, NOW, NOW, ownerId);
  database.prepare("UPDATE identities SET status = 'disabled' WHERE application_id = ?").run(ownerId);
  const inactive = await jsonRequest("/api/onboarding/claim-intents", { method: "POST", body: { operationId: "negative-origin-0005", assetCount: 0 } });
  assert.equal(inactive.response.status, 403);
  assert.equal(count("claim_intents"), before);
});

test("D1直接mutationはtenant/workspace/manual/asset境界を拒否する", async () => {
  const { workspaceId } = await bootstrap();
  const staged = await stageClaim();
  const claimed = await jsonRequest(`/api/onboarding/claims/${staged.claimIntentId}`, { method: "POST", body: claimBody(staged) });
  assert.equal(claimed.response.status, 200);
  const manual = one("SELECT id, current_draft_revision_id AS revision_id FROM manuals WHERE id = ?", claimed.payload.manualId);
  const asset = one("SELECT id FROM assets LIMIT 1");
  assert.throws(() => database.prepare("INSERT INTO manual_steps (id, workspace_id, revision_id, position, type, title, instruction, asset_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'action', ?, ?, ?, ?, ?)").run(crypto.randomUUID(), "00000000-0000-4000-8000-000000000000", manual.revision_id, 1, "越境", "拒否", asset.id, NOW, NOW), /workspace|mismatch|FOREIGN KEY/i);
  assert.throws(() => database.prepare("UPDATE claim_assets SET workspace_id = ? WHERE claim_intent_id = ?").run("00000000-0000-4000-8000-000000000000", staged.claimIntentId), /immutable|constraint/i);
  assert.equal(one("SELECT workspace_id FROM manuals WHERE id = ?", claimed.payload.manualId).workspace_id, workspaceId);
});

test("PATCHのCAS miss、archived、batch SQL失敗は変更前snapshotを保つ", async () => {
  const { workspaceId } = await bootstrap();
  const staged = await stageClaim();
  const claimed = await jsonRequest(`/api/onboarding/claims/${staged.claimIntentId}`, { method: "POST", body: claimBody(staged) });
  const path = `/api/workspaces/${workspaceId}/manuals/${claimed.payload.manualId}`;
  const before = (await jsonRequest(path)).payload;
  const step = before.steps[0];
  const body = { title: "CAS", description: "CAS", expectedUpdatedAt: "2020-01-01T00:00:00.000Z", steps: [{ id: step.id, type: step.type, title: step.title, instruction: step.instruction, actionType: step.actionType, targetText: step.targetText, url: step.url, assetId: step.assetId }] };
  const cas = await jsonRequest(`${path}/draft`, { method: "PATCH", body });
  assert.equal(cas.response.status, 409, `${JSON.stringify(cas.payload)} d1=${d1.lastError?.message ?? "none"}`);
  const unchanged = (await jsonRequest(path)).payload;
  assert.equal(unchanged.manual.title, before.manual.title);
  d1.failAt = 1;
  const failed = await jsonRequest(`${path}/draft`, { method: "PATCH", body: { ...body, expectedUpdatedAt: unchanged.draft.updatedAt } });
  assert.equal(failed.response.status, 503, JSON.stringify(failed.payload));
  const afterFailure = (await jsonRequest(path)).payload;
  assert.equal(afterFailure.manual.title, before.manual.title);
  database.prepare("UPDATE manuals SET archived_at = ?, status = 'archived' WHERE id = ?").run(NOW, claimed.payload.manualId);
  d1.failAt = -1;
  const archived = await jsonRequest(`${path}/draft`, { method: "PATCH", body: { ...body, expectedUpdatedAt: afterFailure.draft.updatedAt } });
  assert.equal(archived.response.status, 404);
});

test("PATCH batch直前のrole取消はdraft metadataとstep配列へ副作用を残さない", async () => {
  const { workspaceId, actorId } = await bootstrap();
  const staged = await stageClaim({ operationId: "patch-role-race-0001" });
  const claimed = await jsonRequest(`/api/onboarding/claims/${staged.claimIntentId}`, { method: "POST", body: claimBody(staged) });
  assert.equal(claimed.response.status, 200);
  const path = `/api/workspaces/${workspaceId}/manuals/${claimed.payload.manualId}`;
  const before = (await jsonRequest(path)).payload;
  const step = before.steps[0];
  const backupOwnerId = "backup-owner-application-0000000000000000000000000002";
  database.prepare("INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)").run(backupOwnerId, ISSUER, "backup-owner-race", NOW, NOW);
  database.prepare("INSERT INTO workspace_members(workspace_id, application_id, role, status, joined_at, updated_at) SELECT workspace_id, ?, 'owner', 'active', ?, ? FROM workspace_members WHERE application_id = ? AND role = 'owner' LIMIT 1").run(backupOwnerId, NOW, NOW, actorId);
  d1.beforeBatch = () => database.prepare("UPDATE workspace_members SET role = 'viewer' WHERE workspace_id = ? AND application_id = ?").run(workspaceId, actorId);
  const raced = await jsonRequest(`${path}/draft`, {
    method: "PATCH",
    body: {
      title: "role取消競合", description: "保存されない", expectedUpdatedAt: before.draft.updatedAt,
      steps: [{ id: step.id, type: step.type, title: "保存されないstep", instruction: step.instruction, actionType: step.actionType, targetText: step.targetText, url: step.url, assetId: step.assetId }]
    }
  });
  assert.ok([403, 409].includes(raced.response.status), JSON.stringify(raced.payload));
  d1.beforeBatch = null;
  const after = (await jsonRequest(path)).payload;
  assert.equal(after.manual.title, before.manual.title);
  assert.equal(after.steps[0].title, before.steps[0].title);
  assert.equal(one("SELECT role FROM workspace_members WHERE workspace_id = ? AND application_id = ?", workspaceId, actorId).role, "viewer");
});

test("PATCH batch直前のidentity無効化はmetadataとstep配列へ副作用を残さない", async () => {
  const { workspaceId, actorId } = await bootstrap();
  const staged = await stageClaim({ operationId: "patch-identity-race-0001" });
  const claimed = await jsonRequest(`/api/onboarding/claims/${staged.claimIntentId}`, { method: "POST", body: claimBody(staged) });
  const path = `/api/workspaces/${workspaceId}/manuals/${claimed.payload.manualId}`;
  const before = (await jsonRequest(path)).payload;
  const step = before.steps[0];
  d1.beforeBatch = () => database.prepare("UPDATE identities SET status = 'disabled' WHERE application_id = ?").run(actorId);
  const raced = await jsonRequest(`${path}/draft`, { method: "PATCH", body: { title: "保存されない", description: "保存されない", expectedUpdatedAt: before.draft.updatedAt, steps: [{ id: step.id, type: step.type, title: "保存されない", instruction: step.instruction, actionType: step.actionType, targetText: step.targetText, url: step.url, assetId: step.assetId }] } });
  assert.ok([403, 409].includes(raced.response.status), JSON.stringify(raced.payload));
  d1.beforeBatch = null;
  assert.equal(one("SELECT title FROM manuals WHERE id = ?", claimed.payload.manualId).title, before.manual.title);
  assert.equal(one("SELECT title FROM manual_steps WHERE id = ?", step.id).title, before.steps[0].title);
});

test("PATCH batch直前のworkspace停止はmetadataとstep配列へ副作用を残さずclaim statusも隠す", async () => {
  const { workspaceId, actorId } = await bootstrap();
  const staged = await stageClaim({ operationId: "patch-workspace-race-0001" });
  const claimed = await jsonRequest(`/api/onboarding/claims/${staged.claimIntentId}`, { method: "POST", body: claimBody(staged) });
  const path = `/api/workspaces/${workspaceId}/manuals/${claimed.payload.manualId}`;
  const before = (await jsonRequest(path)).payload;
  const step = before.steps[0];
  d1.beforeBatch = () => database.prepare("UPDATE workspaces SET status = 'suspended' WHERE id = ?").run(workspaceId);
  const raced = await jsonRequest(`${path}/draft`, { method: "PATCH", body: { title: "保存されない", description: "保存されない", expectedUpdatedAt: before.draft.updatedAt, steps: [{ id: step.id, type: step.type, title: "保存されない", instruction: step.instruction, actionType: step.actionType, targetText: step.targetText, url: step.url, assetId: step.assetId }] } });
  assert.ok([403, 409].includes(raced.response.status), JSON.stringify(raced.payload));
  d1.beforeBatch = null;
  const status = await jsonRequest(`/api/onboarding/claims/${staged.claimIntentId}?operationId=patch-workspace-race-0001`);
  assert.equal(status.response.status, 404);
  assert.equal(one("SELECT title FROM manuals WHERE id = ?", claimed.payload.manualId).title, before.manual.title);
  assert.equal(one("SELECT title FROM manual_steps WHERE id = ?", step.id).title, before.steps[0].title);
  database.prepare("UPDATE workspaces SET status = 'active' WHERE id = ?").run(workspaceId);
  database.prepare("UPDATE identities SET status = 'active' WHERE application_id = ?").run(actorId);
});
test("/manuals rejects service tokens before workspace resolution", async () => {
  const result = await jsonRequest("/manuals", { claims: { sub: "", common_name: "health-check" } });
  assert.equal(result.response.status, 403);
});

test("/manuals requires an active identity, workspace, and owner membership", async () => {
  const { workspaceId, actorId } = await bootstrap();
  const page = await worker.fetch(await request("/manuals"), env, {});
  assert.equal(page.status, 200);

  const backupOwnerId = crypto.randomUUID();
  database.prepare("INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)").run(backupOwnerId, ISSUER, "backup-owner", NOW, NOW);
  database.prepare("INSERT INTO workspace_members(workspace_id, application_id, role, status, joined_at, updated_at) VALUES (?, ?, 'owner', 'active', ?, ?)").run(workspaceId, backupOwnerId, NOW, NOW);

  database.prepare("UPDATE identities SET status = 'disabled' WHERE application_id = ?").run(actorId);
  assert.equal((await worker.fetch(await request("/manuals"), env, {})).status, 403);
  database.prepare("UPDATE identities SET status = 'active' WHERE application_id = ?").run(actorId);

  database.prepare("UPDATE workspaces SET status = 'suspended' WHERE id = ?").run(workspaceId);
  assert.equal((await worker.fetch(await request("/manuals"), env, {})).status, 403);
  database.prepare("UPDATE workspaces SET status = 'active' WHERE id = ?").run(workspaceId);

  database.prepare("DELETE FROM workspace_members WHERE workspace_id = ? AND application_id = ?").run(workspaceId, actorId);
  assert.equal((await worker.fetch(await request("/manuals"), env, {})).status, 403);
});

test("claim retries require an active owner membership", async () => {
  const { workspaceId, actorId } = await bootstrap();
  const staged = await stageClaim({ operationId: "owner-revoke-retry-0001" });
  assert.equal(staged.staged.response.status, 200, JSON.stringify(staged.staged.payload));

  const backupOwnerId = crypto.randomUUID();
  database.prepare("INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)").run(backupOwnerId, ISSUER, "backup-owner-retry", NOW, NOW);
  database.prepare("INSERT INTO workspace_members(workspace_id, application_id, role, status, joined_at, updated_at) VALUES (?, ?, 'owner', 'active', ?, ?)").run(workspaceId, backupOwnerId, NOW, NOW);
  database.prepare("DELETE FROM workspace_members WHERE workspace_id = ? AND application_id = ?").run(workspaceId, actorId);

  const status = await jsonRequest(`/api/onboarding/claims/${staged.claimIntentId}?operationId=${staged.operationId}`);
  assert.equal(status.response.status, 404);
  const retryUpload = await uploadIntentAsset(staged, staged.operationId, 0, staged.bytes);
  assert.equal(retryUpload.response.status, 404);
  const retryFinalize = await jsonRequest(`/api/onboarding/claims/${staged.claimIntentId}`, { method: "POST", body: claimBody(staged) });
  assert.equal(retryFinalize.response.status, 404);
});
