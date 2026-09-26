import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import { exportJWK, SignJWT } from "jose";
import { randomSecret, validateSecret } from "../apps/worker/src/share-link-crypto.ts";
import { derivePasscodeHash, sha256Hex } from "../apps/worker/src/share-link-crypto.ts";
import { handleShareLinkRoute } from "../apps/worker/src/share-link-router.ts";

const migrationNames = [
  "0001_d1_identity_workspace.sql",
  "0002_d1_personal_workspace.sql",
  "0003_d1_onboarding_bootstrap.sql",
  "0004_d1_cloud_manual_claim.sql",
  "0005_d1_share_links.sql"
];
const NOW = "2026-09-26T00:00:00.000Z";
const HTTP_BASE_URL = "https://meccha-manual-staging.meccha-iiyatsu.com";
const HTTP_ISSUER = "https://access.example.invalid";
const HTTP_AUDIENCE = "share-test";
const HTTP_JWKS_URL = `${HTTP_ISSUER}/.well-known/jwks.json`;
const HTTP_WORKSPACE = "11111111-1111-4111-8111-111111111111";
const HTTP_MANUAL = "22222222-2222-4222-8222-222222222222";
const HTTP_DRAFT = "33333333-3333-4333-8333-333333333333";
const HTTP_PUBLISHED = "44444444-4444-4444-8444-444444444444";
const HTTP_OWNER = "55555555-5555-4555-8555-555555555555";
const HTTP_ADMIN = "77777777-7777-4777-8777-777777777777";
const HTTP_LINK = "66666666-6666-4666-8666-666666666666";
const HTTP_ASSET = "88888888-8888-4888-8888-888888888888";
const HTTP_CLAIM_INTENT = "99999999-9999-4999-8999-999999999999";
const HTTP_CLAIM_ASSET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const { privateKey: httpPrivateKey, publicKey: httpPublicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const httpPublicJwk = { ...await exportJWK(httpPublicKey), kid: "share-test", alg: "RS256", use: "sig" };

class HttpStatement {
  constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; }
  bind(...values) { return new HttpStatement(this.database, this.sql, values); }
  async run() { const result = this.database.prepare(this.sql).run(...this.values); return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; }
  async first() { return this.database.prepare(this.sql).get(...this.values) ?? null; }
  async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.values) }; }
}

class HttpD1 {
  constructor(database) { this.database = database; this.failAt = -1; this.beforeBatch = null; }
  prepare(sql) { return new HttpStatement(this.database, sql); }
  async batch(statements) {
    this.beforeBatch?.();
    this.database.exec("BEGIN IMMEDIATE");
    try { const results = []; for (const [index, statement] of statements.entries()) { if (index === this.failAt) throw new Error("injected batch failure"); results.push(await statement.run()); } this.database.exec("COMMIT"); return results; }
    catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }
}

async function httpFixture() {
  const raw = new DatabaseSync(":memory:");
  for (const name of migrationNames) raw.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  raw.exec(`
    INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES ('${HTTP_OWNER}', '${HTTP_ISSUER}', 'http-owner', 'active', '${NOW}', '${NOW}');
    INSERT INTO profiles(application_id, display_name, locale, timezone, created_at, updated_at) VALUES ('${HTTP_OWNER}', 'Owner', 'ja-JP', 'Asia/Tokyo', '${NOW}', '${NOW}');
    INSERT INTO workspaces(id, name, slug, status, created_by, created_at, updated_at, workspace_kind) VALUES ('${HTTP_WORKSPACE}', 'Workspace', 'share-workspace', 'active', '${HTTP_OWNER}', '${NOW}', '${NOW}', 'personal');
    INSERT INTO workspace_members(workspace_id, application_id, role, status, joined_at, updated_at) VALUES ('${HTTP_WORKSPACE}', '${HTTP_OWNER}', 'owner', 'active', '${NOW}', '${NOW}');
    INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES ('${HTTP_ADMIN}', '${HTTP_ISSUER}', 'http-admin', 'active', '${NOW}', '${NOW}');
    INSERT INTO profiles(application_id, display_name, locale, timezone, created_at, updated_at) VALUES ('${HTTP_ADMIN}', 'Admin', 'ja-JP', 'Asia/Tokyo', '${NOW}', '${NOW}');
    INSERT INTO workspace_members(workspace_id, application_id, role, status, joined_at, updated_at) VALUES ('${HTTP_WORKSPACE}', '${HTTP_ADMIN}', 'owner', 'active', '${NOW}', '${NOW}');
    INSERT INTO manuals(id, workspace_id, title, status, current_draft_revision_id, created_by, created_at, updated_at) VALUES ('${HTTP_MANUAL}', '${HTTP_WORKSPACE}', '共有手順書', 'draft', '${HTTP_DRAFT}', '${HTTP_OWNER}', '${NOW}', '${NOW}');
    INSERT INTO manual_revisions(id, workspace_id, manual_id, revision_no, state, title, description, content_version, created_at, updated_at) VALUES ('${HTTP_DRAFT}', '${HTTP_WORKSPACE}', '${HTTP_MANUAL}', 1, 'draft', '共有手順書', '説明', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '${NOW}', '${NOW}');
    INSERT INTO manual_revisions(id, workspace_id, manual_id, revision_no, state, title, description, content_version, created_at, updated_at) VALUES ('${HTTP_PUBLISHED}', '${HTTP_WORKSPACE}', '${HTTP_MANUAL}', 2, 'superseded', '公開snapshot', '公開説明', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '${NOW}', '${NOW}');
    INSERT INTO claim_intents(id, actor_application_id, workspace_id, operation_id, asset_count, expires_at, status, manual_id, created_at, completed_at, updated_at) VALUES ('${HTTP_CLAIM_INTENT}', '${HTTP_OWNER}', '${HTTP_WORKSPACE}', 'http-claim-operation-0001', 1, '2026-10-01T00:00:00.000Z', 'completed', '${HTTP_MANUAL}', '${NOW}', '${NOW}', '${NOW}');
    INSERT INTO assets(id, workspace_id, bucket, object_key, kind, content_type, byte_length, checksum_sha256, created_at, updated_at) VALUES ('${HTTP_ASSET}', '${HTTP_WORKSPACE}', 'MANUAL_ASSETS', 'manual/${HTTP_ASSET}', 'manual_image', 'image/png', 1, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '${NOW}', '${NOW}');
    INSERT INTO claim_assets(id, claim_intent_id, asset_slot, workspace_id, operation_id, object_key, content_type, byte_length, sha256, status, asset_id, created_at, updated_at) VALUES ('${HTTP_CLAIM_ASSET}', '${HTTP_CLAIM_INTENT}', 0, '${HTTP_WORKSPACE}', 'http-claim-operation-0001', 'manual/${HTTP_ASSET}', 'image/png', 1, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'completed', '${HTTP_ASSET}', '${NOW}', '${NOW}');
    INSERT INTO manual_steps(id, workspace_id, revision_id, position, type, title, instruction, action_type, asset_id, created_at, updated_at) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab', '${HTTP_WORKSPACE}', '${HTTP_PUBLISHED}', 0, 'action', '画像', '画像を確認します。', 'click', '${HTTP_ASSET}', '${NOW}', '${NOW}');
    UPDATE manual_revisions SET state = 'published' WHERE id = '${HTTP_PUBLISHED}';
    UPDATE manuals SET status = 'published', current_published_revision_id = '${HTTP_PUBLISHED}' WHERE id = '${HTTP_MANUAL}';
  `);
  const token = randomSecret(32); const tokenHash = await sha256Hex(token); const salt = randomSecret(16); const passcode = "correct-passcode"; const passcodeHash = await derivePasscodeHash(passcode, salt); const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  raw.prepare("INSERT INTO share_links (id, workspace_id, manual_id, published_revision_id, source_draft_revision_id, source_content_version, token_hash, passcode_salt, passcode_hash, permission, expires_at, created_by, operation_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'read_only', ?, ?, ?, ?, ?)").run(HTTP_LINK, HTTP_WORKSPACE, HTTP_MANUAL, HTTP_PUBLISHED, HTTP_DRAFT, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", tokenHash, salt, passcodeHash, expiresAt, HTTP_OWNER, "http-share-operation-0001", NOW, NOW);
  return { raw, token, passcode, expiresAt };
}

async function accessToken(subject = "http-owner") {
  const issued = Math.floor(Date.now() / 1000);
  return new SignJWT({ type: "app", sub: subject }).setProtectedHeader({ alg: "RS256", kid: httpPublicJwk.kid }).setIssuer(HTTP_ISSUER).setAudience(HTTP_AUDIENCE).setIssuedAt(issued).setExpirationTime(issued + 300).sign(httpPrivateKey);
}

async function database() {
  const db = new DatabaseSync(":memory:");
  for (const name of migrationNames) db.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  db.exec(`
    INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES ('owner', 'issuer', 'owner', 'active', '${NOW}', '${NOW}');
    INSERT INTO profiles(application_id, display_name, locale, timezone, created_at, updated_at) VALUES ('owner', 'Owner', 'ja-JP', 'Asia/Tokyo', '${NOW}', '${NOW}');
    INSERT INTO workspaces(id, name, slug, status, created_by, created_at, updated_at, workspace_kind) VALUES ('workspace', 'Workspace', 'workspace', 'active', 'owner', '${NOW}', '${NOW}', 'personal');
    INSERT INTO workspace_members(workspace_id, application_id, role, status, joined_at, updated_at) VALUES ('workspace', 'owner', 'owner', 'active', '${NOW}', '${NOW}');
    INSERT INTO manuals(id, workspace_id, title, status, current_draft_revision_id, created_by, created_at, updated_at) VALUES ('manual', 'workspace', 'Manual', 'draft', 'draft', 'owner', '${NOW}', '${NOW}');
    INSERT INTO manual_revisions(id, workspace_id, manual_id, revision_no, state, title, description, content_version, created_at, updated_at) VALUES ('draft', 'workspace', 'manual', 1, 'draft', 'Manual', 'Description', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '${NOW}', '${NOW}');
  `);
  return db;
}

function insertPublished(db, { linkId = "link", revisionId = "published", tokenHash = "a".repeat(64), sourceVersion = "a".repeat(32), expiresAt = "2026-10-01T00:00:00.000Z" } = {}) {
  db.exec(`INSERT INTO manual_revisions(id, workspace_id, manual_id, revision_no, state, title, description, content_version, created_at, updated_at) VALUES ('${revisionId}', 'workspace', 'manual', 2, 'published', 'Manual', 'Description', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '${NOW}', '${NOW}');`);
  db.exec(`UPDATE manuals SET status = 'published', current_published_revision_id = '${revisionId}' WHERE id = 'manual';`);
  db.prepare(`INSERT INTO share_links (id, workspace_id, manual_id, published_revision_id, source_draft_revision_id, source_content_version, token_hash, passcode_salt, passcode_hash, permission, expires_at, created_by, operation_id, created_at, updated_at) VALUES (?, 'workspace', 'manual', ?, 'draft', ?, ?, ?, ?, 'read_only', ?, 'owner', 'operation-00000001', ?, ?)`).run(linkId, revisionId, sourceVersion, tokenHash, "salt-salt-salt-salt-s", "h".repeat(64), expiresAt, NOW, NOW);
}

test("共有secretはcanonicalな256bit base64urlだけを受け付ける", () => {
  const secret = randomSecret(32);
  assert.equal(secret.length, 43);
  assert.equal(validateSecret(secret, 32), secret);
  assert.throws(() => validateSecret(`${secret}A`, 32));
  assert.throws(() => validateSecret(`${secret.slice(0, -1)}_`, 32));
});

test("公開snapshotは内容変更・step追加・revoke取消・期限延長を拒否し、state supersededだけを許可する", async () => {
  const db = await database();
  insertPublished(db);
  assert.throws(() => db.prepare("UPDATE manual_revisions SET title = 'changed' WHERE id = 'published'").run(), /published revision is immutable/u);
  assert.throws(() => db.prepare("INSERT INTO manual_steps (id, workspace_id, revision_id, position, type, title, instruction, created_at, updated_at) VALUES ('step', 'workspace', 'published', 0, 'action', 'Step', 'Instruction', ?, ?)").run(NOW, NOW), /published step is immutable/u);
  db.prepare("INSERT INTO share_grants (id, share_link_id, token_hash, grant_hash, workspace_id, manual_id, published_revision_id, expires_at, created_at, updated_at) VALUES ('grant', 'link', ?, ?, 'workspace', 'manual', 'published', ?, ?, ?)").run("a".repeat(64), "b".repeat(64), "2026-09-26T00:10:00.000Z", NOW, NOW);
  assert.throws(() => db.prepare("UPDATE share_grants SET expires_at = '2026-09-26T00:11:00.000Z' WHERE id = 'grant'").run(), /grant expiry cannot be extended/u);
  db.prepare("UPDATE share_grants SET revoked_at = ? WHERE id = 'grant'").run(NOW);
  assert.throws(() => db.prepare("UPDATE share_grants SET revoked_at = NULL WHERE id = 'grant'").run(), /grant revoke cannot be undone/u);
  db.prepare("UPDATE manual_revisions SET state = 'superseded' WHERE id = 'published'").run();
  assert.throws(() => db.prepare("UPDATE share_links SET expires_at = '2027-01-01T00:00:00.000Z' WHERE id = 'link'").run(), /expiry cannot be extended/u);
  db.prepare("UPDATE share_links SET revoked_at = ? WHERE id = 'link'").run(NOW);
  assert.throws(() => db.prepare("INSERT INTO share_grants (id, share_link_id, token_hash, grant_hash, workspace_id, manual_id, published_revision_id, expires_at, created_at, updated_at) VALUES ('grant-2', 'link', ?, ?, 'workspace', 'manual', 'published', ?, ?, ?)").run("a".repeat(64), "c".repeat(64), "2026-09-26T00:10:00.000Z", NOW, NOW), /grant scope or expiry mismatch/u);
  assert.throws(() => db.prepare("UPDATE share_links SET revoked_at = NULL WHERE id = 'link'").run(), /revoke cannot be undone/u);
});

test("共有linkはmanual単位で1本に固定し、source draft CASを外れた発行を拒否する", async () => {
  const db = await database();
  insertPublished(db);
  assert.throws(() => db.prepare(`INSERT INTO share_links (id, workspace_id, manual_id, published_revision_id, source_draft_revision_id, source_content_version, token_hash, passcode_salt, passcode_hash, permission, expires_at, created_by, operation_id, created_at, updated_at) VALUES ('link-2', 'workspace', 'manual', 'published', 'draft', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '${"b".repeat(64)}', 'salt-salt-salt-salt-s', '${"h".repeat(64)}', 'read_only', '2026-10-01T00:00:00.000Z', 'owner', 'operation-00000002', ?, ? )`).run(NOW, NOW), /UNIQUE|constraint/u);
  db.prepare("UPDATE manual_revisions SET content_version = ? WHERE id = 'draft'").run("c".repeat(32));
  assert.throws(() => db.prepare(`INSERT INTO share_links (id, workspace_id, manual_id, published_revision_id, source_draft_revision_id, source_content_version, token_hash, passcode_salt, passcode_hash, permission, expires_at, created_by, operation_id, created_at, updated_at) VALUES ('link-3', 'workspace', 'manual', 'published', 'draft', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '${"c".repeat(64)}', 'salt-salt-salt-salt-s', '${"h".repeat(64)}', 'read_only', '2026-10-01T00:00:00.000Z', 'owner', 'operation-00000003', ?, ? )`).run(NOW, NOW), /share link scope mismatch/u);
});

test("HTTP共有viewerはresolve→contentを通し、draft編集後もsnapshotを維持し、停止後はgrantを拒否する", async () => {
  const fixture = await httpFixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { assert.equal(String(url), HTTP_JWKS_URL); return Response.json({ keys: [httpPublicJwk] }); };
  const env = { APP_ENV: "staging", APP_BASE_URL: HTTP_BASE_URL, ACCESS_ISSUER: HTTP_ISSUER, ACCESS_AUDIENCE: HTTP_AUDIENCE, ACCESS_JWKS_URL: HTTP_JWKS_URL, DB: new HttpD1(fixture.raw), MANUAL_ASSETS: { get: async (key) => key === `manual/${HTTP_ASSET}` ? { body: new Uint8Array([137]), size: 1 } : null }, SHARE_AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) } };
  const request = async (path, { method = "GET", body, token, grant, authenticated = false, subject = "http-owner" } = {}) => {
    const headers = new Headers({ origin: HTTP_BASE_URL });
    if (token) headers.set("x-share-token", token);
    if (grant) headers.set("x-share-grant", grant);
    if (authenticated) headers.set("Cf-Access-Jwt-Assertion", await accessToken(subject));
    if (body !== undefined) { headers.set("content-type", "application/json"); body = JSON.stringify(body); }
    return handleShareLinkRoute(new Request(`${HTTP_BASE_URL}${path}`, { method, headers, body }), env);
  };
  try {
    const viewer = await request("/s/");
    assert.equal(viewer?.status, 200);
    assert.match(await viewer.text(), /id="share-viewer"/u);
    const viewerCss = await request("/s/assets/share.css");
    assert.match(await viewerCss.text(), /#share-auth\[hidden\].*display:none/u);
    const resolve = await request("/s/api/resolve", { method: "POST", body: { passcode: fixture.passcode }, token: fixture.token });
    assert.equal(resolve?.status, 200);
    const resolved = await resolve.json();
    assert.match(resolved.grant, /^[A-Za-z0-9_-]{43}$/u);
    const wrong = await request("/s/api/resolve", { method: "POST", body: { passcode: "wrong-passcode" }, token: fixture.token });
    const unknown = await request("/s/api/resolve", { method: "POST", body: { passcode: fixture.passcode }, token: randomSecret(32) });
    assert.equal(wrong?.status, 401);
    assert.equal(unknown?.status, 401);
    assert.deepEqual(await wrong.json(), await unknown.json());
    const savedLimiter = env.SHARE_AUTH_RATE_LIMITER;
    env.SHARE_AUTH_RATE_LIMITER = undefined;
    assert.equal((await request("/s/api/resolve", { method: "POST", body: { passcode: fixture.passcode }, token: fixture.token }))?.status, 503);
    env.SHARE_AUTH_RATE_LIMITER = { limit: async () => ({ success: false }) };
    assert.equal((await request("/s/api/resolve", { method: "POST", body: { passcode: fixture.passcode }, token: fixture.token }))?.status, 429);
    env.SHARE_AUTH_RATE_LIMITER = savedLimiter;
    const content = await request("/s/api/content", { method: "POST", grant: resolved.grant });
    assert.equal(content?.status, 200);
    const payload = await content.json();
    assert.equal(payload.title, "公開snapshot");
    assert.equal(payload.steps[0].assetId, HTTP_ASSET);
    const asset = await request(`/s/api/assets/${HTTP_ASSET}`, { grant: resolved.grant });
    assert.equal(asset?.status, 200);
    assert.deepEqual([...new Uint8Array(await asset.arrayBuffer())], [137]);
    fixture.raw.prepare("UPDATE manual_revisions SET title = '編集中の下書き' WHERE id = ?").run(HTTP_DRAFT);
    const contentAfterDraftEdit = await request("/s/api/content", { method: "POST", grant: resolved.grant });
    assert.equal((await contentAfterDraftEdit.json()).title, "公開snapshot");
    fixture.raw.prepare("UPDATE workspace_members SET role = 'viewer' WHERE workspace_id = ? AND application_id = ?").run(HTTP_WORKSPACE, HTTP_OWNER);
    const membershipDenied = await request("/s/api/content", { method: "POST", grant: resolved.grant });
    assert.equal(membershipDenied?.status, 401);
    assert.equal((await request(`/api/workspaces/${HTTP_WORKSPACE}/manuals/${HTTP_MANUAL}/share-links`, { authenticated: true }))?.status, 403);
    assert.equal((await request(`/api/workspaces/${HTTP_WORKSPACE}/manuals/${HTTP_MANUAL}/share-links`, { method: "DELETE", body: { shareLinkId: HTTP_LINK }, authenticated: true }))?.status, 403);
    const adminMetadata = await request(`/api/workspaces/${HTTP_WORKSPACE}/manuals/${HTTP_MANUAL}/share-links`, { authenticated: true, subject: "http-admin" });
    assert.equal(adminMetadata?.status, 200);
    assert.equal((await adminMetadata.json()).share.shareLinkId, HTTP_LINK);
    const stopped = await request(`/api/workspaces/${HTTP_WORKSPACE}/manuals/${HTTP_MANUAL}/share-links`, { method: "DELETE", body: { shareLinkId: HTTP_LINK }, authenticated: true, subject: "http-admin" });
    assert.equal(stopped?.status, 200, await stopped?.clone().text());
    const denied = await request("/s/api/content", { method: "POST", grant: resolved.grant });
    assert.equal(denied?.status, 401);
    assert.equal((await denied.json()).code, "SHARE_UNAVAILABLE");
    assert.equal((await request("/s/api/unknown")).status, 404);
    const reissueToken = randomSecret(32);
    const reissueExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    env.DB.beforeBatch = () => fixture.raw.prepare("UPDATE manual_revisions SET content_version = ? WHERE id = ?").run("cccccccccccccccccccccccccccccccc", HTTP_DRAFT);
    const raced = await request(`/api/workspaces/${HTTP_WORKSPACE}/manuals/${HTTP_MANUAL}/share-links`, { method: "POST", authenticated: true, subject: "http-admin", body: { confirmed: true, operationId: "http-share-operation-race", token: reissueToken, passcode: "reissue-passcode", expiresAt: reissueExpiry, expectedDraftRevisionId: HTTP_DRAFT, expectedContentVersion: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } });
    assert.equal(raced?.status, 409);
    assert.equal(Number(fixture.raw.prepare("SELECT count(*) AS n FROM manual_revisions").get().n), 2);
    assert.equal(Number(fixture.raw.prepare("SELECT count(*) AS n FROM share_links").get().n), 1);
    env.DB.beforeBatch = null;
    fixture.raw.prepare("UPDATE manual_revisions SET content_version = ? WHERE id = ?").run("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", HTTP_DRAFT);
    const created = await request(`/api/workspaces/${HTTP_WORKSPACE}/manuals/${HTTP_MANUAL}/share-links`, { method: "POST", authenticated: true, subject: "http-admin", body: { confirmed: true, operationId: "http-share-operation-0002", token: reissueToken, passcode: "reissue-passcode", expiresAt: reissueExpiry, expectedDraftRevisionId: HTTP_DRAFT, expectedContentVersion: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } });
    assert.equal(created?.status, 200, await created?.clone().text());
    const retry = await request(`/api/workspaces/${HTTP_WORKSPACE}/manuals/${HTTP_MANUAL}/share-links`, { method: "POST", authenticated: true, subject: "http-admin", body: { confirmed: true, operationId: "http-share-operation-0002", token: reissueToken, passcode: "reissue-passcode", expiresAt: reissueExpiry, expectedDraftRevisionId: HTTP_DRAFT, expectedContentVersion: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } });
    assert.equal(retry?.status, 200);
    assert.equal((await retry.json()).reused, true);
    const altered = await request(`/api/workspaces/${HTTP_WORKSPACE}/manuals/${HTTP_MANUAL}/share-links`, { method: "POST", authenticated: true, subject: "http-admin", body: { confirmed: true, operationId: "http-share-operation-0002", token: randomSecret(32), passcode: "reissue-passcode", expiresAt: reissueExpiry, expectedDraftRevisionId: HTTP_DRAFT, expectedContentVersion: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } });
    assert.equal(altered?.status, 409);
    const reissued = await request("/s/api/resolve", { method: "POST", body: { passcode: "reissue-passcode" }, token: reissueToken });
    assert.equal(reissued?.status, 200, await reissued?.clone().text());
    const reissuedPayload = await reissued.json();
    const oldRevoke = await request(`/api/workspaces/${HTTP_WORKSPACE}/manuals/${HTTP_MANUAL}/share-links`, { method: "DELETE", body: { shareLinkId: HTTP_LINK }, authenticated: true, subject: "http-admin" });
    assert.equal(oldRevoke?.status, 200);
    assert.equal((await oldRevoke.json()).revoked, false);
    assert.equal((await request("/s/api/content", { method: "POST", grant: reissuedPayload.grant }))?.status, 200);
    fixture.raw.prepare("UPDATE share_grants SET expires_at = ? WHERE grant_hash = (SELECT grant_hash FROM share_grants ORDER BY created_at DESC LIMIT 1)").run(new Date(Date.now() - 1000).toISOString());
    assert.equal((await request("/s/api/content", { method: "POST", grant: reissuedPayload.grant }))?.status, 401);
    fixture.raw.prepare("UPDATE share_links SET expires_at = ? WHERE id = (SELECT id FROM share_links ORDER BY created_at DESC LIMIT 1)").run(new Date(Date.now() - 1000).toISOString());
    assert.equal((await request("/s/api/resolve", { method: "POST", body: { passcode: "reissue-passcode" }, token: reissueToken }))?.status, 401);
    env.DB.failAt = 2;
    const failedToken = randomSecret(32);
    const failed = await request(`/api/workspaces/${HTTP_WORKSPACE}/manuals/${HTTP_MANUAL}/share-links`, { method: "POST", authenticated: true, subject: "http-admin", body: { confirmed: true, operationId: "http-share-operation-0003", token: failedToken, passcode: "failed-passcode", expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(), expectedDraftRevisionId: HTTP_DRAFT, expectedContentVersion: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } });
    assert.equal(failed?.status, 409);
    assert.equal(Number(fixture.raw.prepare("SELECT count(*) AS n FROM manual_revisions").get().n), 3);
    assert.equal(Number(fixture.raw.prepare("SELECT count(*) AS n FROM share_links").get().n), 2);
  } finally { globalThis.fetch = originalFetch; fixture.raw.close(); }
});
