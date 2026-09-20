import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { generateKeyPairSync } from "node:crypto";
import { beforeEach, afterEach, test } from "node:test";
import { exportJWK, SignJWT } from "jose";
import worker from "../apps/worker/src/index.ts";
import { D1OnboardingRepository } from "../apps/worker/src/infra/d1/onboarding-repository.ts";

const issuer = "https://bootstrap.example.invalid";
const actor = { kind: "access_user", issuer, subject: "new-human" };
const operation = "bootstrap-operation-0001";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...await exportJWK(publicKey), kid: "bootstrap", alg: "RS256", use: "sig" };
const originalFetch = globalThis.fetch;
let database, db, repository, env;

class Statement {
  constructor(sql, values = []) { this.sql = sql; this.values = values; }
  bind(...values) { return new Statement(this.sql, values); }
  async first() { return database.prepare(this.sql).get(...this.values) ?? null; }
  async run() { return { success: true, meta: { changes: Number(database.prepare(this.sql).run(...this.values).changes) } }; }
}

beforeEach(async () => {
  database = new DatabaseSync(":memory:");
  for (const name of ["0001_d1_identity_workspace.sql", "0002_d1_personal_workspace.sql", "0003_d1_onboarding_bootstrap.sql"]) {
    database.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  }
  let tail = Promise.resolve();
  db = {
    failAt: -1, beforeBatch: null,
    prepare: (sql) => new Statement(sql),
    batch(statements) {
      const task = tail.then(async () => {
        db.beforeBatch?.();
        database.exec("BEGIN IMMEDIATE");
        try {
          const results = [];
          for (const [index, statement] of statements.entries()) {
            if (index === db.failAt) throw new Error("injected storage failure");
            results.push(await statement.run());
          }
          database.exec("COMMIT");
          return results;
        } catch (error) { database.exec("ROLLBACK"); throw error; }
      });
      tail = task.catch(() => {});
      return task;
    }
  };
  repository = new D1OnboardingRepository(db);
  env = {
    APP_ENV: "staging",
    APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com",
    ACCESS_ISSUER: issuer, ACCESS_AUDIENCE: "bootstrap-tests", ACCESS_JWKS_URL: `${issuer}/certs`, DB: db,
    ONBOARDING_RATE_LIMITER: { limit: async () => ({ success: true }) }
  };
  globalThis.fetch = async (url) => { assert.equal(String(url), `${issuer}/certs`); return Response.json({ keys: [jwk] }); };
});
afterEach(() => { globalThis.fetch = originalFetch; database.close(); });

function count(table) { return database.prepare(`SELECT count(*) AS n FROM ${table}`).get().n; }
async function request(body = { operationId: operation }, claims = {}, headers = {}, baseUrl = "https://meccha-manual-staging.meccha-iiyatsu.com") {
  const token = await new SignJWT({ type: "app", sub: actor.subject, ...claims }).setProtectedHeader({ alg: "RS256", kid: "bootstrap" })
    .setIssuer(issuer).setAudience("bootstrap-tests").setIssuedAt().setExpirationTime("5m").sign(privateKey);
  const requestHeaders = new Headers({ origin: baseUrl, "content-type": "application/json", "cf-connecting-ip": "198.51.100.10", "Cf-Access-Jwt-Assertion": token });
  for (const [name, value] of Object.entries(headers)) requestHeaders.set(name, value);
  const input = new Request(`${baseUrl}/api/onboarding/bootstrap`, {
    method: "POST", headers: requestHeaders,
    body: JSON.stringify(body)
  });
  Object.defineProperty(input, "cf", { value: { colo: "NRT", asn: 64500 }, configurable: true });
  return input;
}

test("bootstrap rejects a non-allowlisted origin or incomplete runtime config before D1", async () => {
  const mismatched = await worker.fetch(await request({ operationId: "bootstrap-origin-mismatch" }, {}, {}, "https://meccha-manual.meccha-iiyatsu.com"), env, {});
  assert.equal(mismatched.status, 503);
  assert.equal((await mismatched.json()).code, "ONBOARDING_UNAVAILABLE");
  const missingConfig = await worker.fetch(await request({ operationId: "bootstrap-config-missing" }), { ...env, APP_BASE_URL: undefined }, {});
  assert.equal(missingConfig.status, 503);
  assert.equal((await missingConfig.json()).code, "ONBOARDING_UNAVAILABLE");
  assert.equal(count("identities"), 0);
});

test("first authenticated bootstrap provisions the complete atomic result; replay preserves createdIdentity", async () => {
  const response = await worker.fetch(await request(), env, {});
  assert.equal(response.status, 200);
  const first = await response.json();
  assert.equal(first.createdIdentity, true);
  assert.deepEqual(await repository.bootstrap(actor, operation), first);
  const again = await repository.bootstrap(actor, "bootstrap-operation-0002");
  assert.equal(again.workspaceId, first.workspaceId);
  assert.equal(again.createdIdentity, false);
  for (const table of ["identities", "profiles", "workspaces", "workspace_members", "audit_logs", "onboarding_signup_events"]) assert.equal(count(table), 1, table);
  assert.equal(count("onboarding_bootstrap_operations"), 2);
  const event = database.prepare("SELECT * FROM onboarding_signup_events").get();
  assert.equal(event.event_id, `meccha-manual:onboarding:v1:signup_completed:${event.application_id.length}:${event.application_id}:${operation}`);
  assert.equal(event.operation_id, operation);
});

test("direct storage rejects malformed operation IDs even outside the repository", async () => {
  await repository.bootstrap(actor, operation);
  const saved = database.prepare("SELECT * FROM onboarding_bootstrap_operations").get();
  const insert = database.prepare("INSERT INTO onboarding_bootstrap_operations VALUES (?, ?, ?, ?, ?)");
  for (const invalid of ["a".repeat(15), "a".repeat(129), "a".repeat(16) + "é", "a".repeat(16) + "\n", "a".repeat(16) + "\0hidden", "a".repeat(16) + "/"]) {
    assert.throws(() => insert.run(saved.application_id, invalid, saved.workspace_id, 0, saved.created_at), /CHECK constraint failed/);
  }
  assert.throws(() => insert.run(saved.application_id, Buffer.from("a".repeat(16)), saved.workspace_id, 0, saved.created_at), /CHECK constraint failed/);
  for (const valid of ["A_z-09".repeat(3), "a".repeat(16), "Z".repeat(128)]) {
    insert.run(saved.application_id, valid, saved.workspace_id, 0, saved.created_at);
  }
  assert.equal(count("onboarding_bootstrap_operations"), 4);
});

test("direct storage rejects operation rows outside the actor's active personal owner workspace", async () => {
  await repository.bootstrap(actor, operation);
  const saved = database.prepare("SELECT * FROM onboarding_bootstrap_operations WHERE operation_id=?").get(operation);
  const insertIdentity = database.prepare("INSERT INTO identities VALUES (?, ?, ?, 'active', ?, ?)");
  const insertWorkspace = database.prepare("INSERT INTO workspaces VALUES (?, ?, ?, 'active', ?, ?, ?, ?)");
  const insertMember = database.prepare("INSERT INTO workspace_members VALUES (?, ?, 'owner', 'active', ?, ?)");
  const now = "2026-01-01T00:00:00.000Z";
  insertIdentity.run("identity-b", issuer, "other-human", now, now);
  insertWorkspace.run("personal-b", "Personal B", "personal-b", "identity-b", now, now, "personal");
  insertMember.run("personal-b", "identity-b", now, now);
  insertWorkspace.run("standard-a", "Standard A", "standard-a", saved.application_id, now, now, "standard");
  insertMember.run("standard-a", saved.application_id, now, now);
  insertIdentity.run("identity-c", issuer, "third-human", now, now);
  insertWorkspace.run("personal-c", "Personal C", "personal-c", "identity-c", now, now, "personal");
  insertMember.run("personal-c", "identity-b", now, now);
  const insert = database.prepare("INSERT INTO onboarding_bootstrap_operations VALUES (?, ?, ?, ?, ?)");
  for (const [applicationId, operationId, workspaceId] of [
    [saved.application_id, "cross-tenant-operation", "personal-b"],
    [saved.application_id, "standard-workspace-op", "standard-a"],
    ["identity-c", "owner-mismatch-op", "personal-c"]
  ]) {
    assert.throws(
      () => insert.run(applicationId, operationId, workspaceId, 0, now),
      /bootstrap operation requires active personal owner workspace/
    );
  }
  assert.throws(
    () => insert.run(saved.application_id, "created-identity-standard", "standard-a", 1, saved.created_at),
    /bootstrap operation requires active personal owner workspace/
  );
});

test("direct storage rejects signup events without a created identity operation on insert and update", async () => {
  await repository.bootstrap(actor, operation);
  const saved = database.prepare("SELECT * FROM onboarding_bootstrap_operations WHERE operation_id=?").get(operation);
  const zeroOperation = "bootstrap-zero-identity";
  database.prepare("INSERT INTO identities VALUES (?, ?, ?, 'active', ?, ?)")
    .run("identity-zero", issuer, "zero-human", saved.created_at, saved.created_at);
  database.prepare("INSERT INTO workspaces VALUES (?, ?, ?, 'active', ?, ?, ?, ?)")
    .run("personal-zero", "Personal Zero", "personal-zero", "identity-zero", saved.created_at, saved.created_at, "personal");
  database.prepare("INSERT INTO workspace_members VALUES (?, ?, 'owner', 'active', ?, ?)")
    .run("personal-zero", "identity-zero", saved.created_at, saved.created_at);
  database.prepare("INSERT INTO onboarding_bootstrap_operations VALUES (?, ?, ?, ?, ?)")
    .run("identity-zero", zeroOperation, "personal-zero", 0, saved.created_at);
  const eventInsert = database.prepare("INSERT INTO onboarding_signup_events VALUES (?, 'signup_completed', ?, ?, ?, ?)");
  assert.throws(
    () => eventInsert.run("event-zero-identity", "identity-zero", zeroOperation, "personal-zero", saved.created_at),
    /signup event requires created identity operation/
  );
  const event = database.prepare("SELECT * FROM onboarding_signup_events WHERE operation_id=?").get(operation);
  assert.throws(
    () => database.prepare("UPDATE onboarding_signup_events SET operation_id=? WHERE event_id=?").run(zeroOperation, event.event_id),
    /signup event identity is immutable/
  );
  assert.throws(
    () => database.prepare("UPDATE onboarding_bootstrap_operations SET created_identity=0 WHERE operation_id=?").run(operation),
    /bootstrap created identity is immutable/
  );
  assert.throws(
    () => database.prepare("UPDATE onboarding_bootstrap_operations SET workspace_id=? WHERE operation_id=?").run("other-workspace", operation),
    /bootstrap operation identity is immutable/
  );
  assert.throws(
    () => database.prepare("UPDATE onboarding_bootstrap_operations SET application_id=? WHERE operation_id=?").run("other-application", operation),
    /bootstrap operation identity is immutable/
  );
  assert.throws(
    () => database.prepare("UPDATE onboarding_bootstrap_operations SET operation_id=? WHERE operation_id=?").run("other-operation-id", operation),
    /bootstrap operation identity is immutable/
  );
});

test("created identity operation requires the authoritative identity timestamp and is unique per identity", async () => {
  const createdAt = "2026-01-01T00:00:00.000Z";
  database.prepare("INSERT INTO identities VALUES (?, ?, ?, 'active', ?, ?)")
    .run("identity-old", issuer, "old-human", createdAt, createdAt);
  database.prepare("INSERT INTO workspaces VALUES (?, ?, ?, 'active', ?, ?, ?, ?)")
    .run("personal-old", "Personal Old", "personal-old", "identity-old", createdAt, createdAt, "personal");
  database.prepare("INSERT INTO workspace_members VALUES (?, ?, 'owner', 'active', ?, ?)")
    .run("personal-old", "identity-old", createdAt, createdAt);
  const insert = database.prepare("INSERT INTO onboarding_bootstrap_operations VALUES (?, ?, ?, ?, ?)");
  assert.throws(
    () => insert.run("identity-old", "bootstrap-forged-old", "personal-old", 1, "2026-01-02T00:00:00.000Z"),
    /created identity operation requires authoritative identity timestamp/
  );
  insert.run("identity-old", "bootstrap-first-old", "personal-old", 1, createdAt);
  assert.throws(
    () => insert.run("identity-old", "bootstrap-second-old", "personal-old", 1, createdAt),
    /UNIQUE constraint failed/
  );
});

test("direct storage rejects forged event envelopes and operation timestamp mutation", async () => {
  await repository.bootstrap(actor, operation);
  const event = database.prepare("SELECT * FROM onboarding_signup_events WHERE operation_id=?").get(operation);
  await repository.bootstrap({ ...actor, subject: "other-human" }, "bootstrap-other-0001");
  const otherEvent = database.prepare("SELECT * FROM onboarding_signup_events WHERE operation_id=?").get("bootstrap-other-0001");
  database.prepare("INSERT INTO identities VALUES (?, ?, ?, 'active', ?, ?)")
    .run("identity-envelope", issuer, "envelope-human", event.occurred_at, event.occurred_at);
  database.prepare("INSERT INTO workspaces VALUES (?, ?, ?, 'active', ?, ?, ?, ?)")
    .run("personal-envelope", "Personal Envelope", "personal-envelope", "identity-envelope", event.occurred_at, event.occurred_at, "personal");
  database.prepare("INSERT INTO workspace_members VALUES (?, ?, 'owner', 'active', ?, ?)")
    .run("personal-envelope", "identity-envelope", event.occurred_at, event.occurred_at);
  const envelopeOperation = "bootstrap-envelope";
  database.prepare("INSERT INTO onboarding_bootstrap_operations VALUES (?, ?, ?, ?, ?)")
    .run("identity-envelope", envelopeOperation, "personal-envelope", 1, event.occurred_at);
  const insert = database.prepare("INSERT INTO onboarding_signup_events VALUES (?, 'signup_completed', ?, ?, ?, ?)");
  assert.throws(
    () => insert.run(`meccha-manual:onboarding:v1:signup_completed:7:forged:${envelopeOperation}`, "identity-envelope", envelopeOperation, "personal-envelope", event.occurred_at),
    /signup event envelope does not match operation/
  );
  assert.throws(
    () => insert.run(`${event.event_id}:forged`, "identity-envelope", envelopeOperation, "personal-envelope", event.occurred_at),
    /signup event envelope does not match operation/
  );
  assert.throws(
    () => insert.run(`meccha-manual:onboarding:v1:signup_completed:${"identity-envelope".length}:identity-envelope:${envelopeOperation}`, "identity-envelope", envelopeOperation, "personal-envelope", "2026-01-01T00:00:00.000Z"),
    /signup event envelope does not match operation/
  );
  assert.throws(
    () => database.prepare("UPDATE onboarding_signup_events SET event_id=? WHERE event_id=?").run(`${event.event_id}:forged`, event.event_id),
    /signup event envelope does not match operation/
  );
  assert.throws(
    () => database.prepare("UPDATE onboarding_signup_events SET occurred_at=? WHERE event_id=?").run("2026-01-01T00:00:00.000Z", event.event_id),
    /signup event envelope does not match operation/
  );
  assert.throws(
    () => database.prepare("UPDATE onboarding_signup_events SET application_id=?, operation_id=?, workspace_id=? WHERE event_id=?")
      .run(otherEvent.application_id, otherEvent.operation_id, otherEvent.workspace_id, event.event_id),
    /signup event identity is immutable/
  );
  assert.throws(
    () => database.prepare("UPDATE onboarding_signup_events SET event_id=?, application_id=?, operation_id=?, workspace_id=?, occurred_at=? WHERE event_id=?")
      .run(otherEvent.event_id, otherEvent.application_id, otherEvent.operation_id, otherEvent.workspace_id, otherEvent.occurred_at, event.event_id),
    /signup event identity is immutable/
  );
  assert.throws(
    () => database.prepare("UPDATE onboarding_bootstrap_operations SET created_at=? WHERE operation_id=?").run("2026-01-01T00:00:00.000Z", operation),
    /bootstrap operation timestamp is immutable/
  );
  assert.throws(
    () => database.prepare("DELETE FROM onboarding_signup_events WHERE event_id=?").run(event.event_id),
    /signup event is append only/
  );
  assert.throws(
    () => database.prepare("DELETE FROM onboarding_bootstrap_operations WHERE application_id=? AND operation_id=?")
      .run(event.application_id, event.operation_id),
    /bootstrap operation is append only/
  );
  assert.throws(
    () => database.prepare("INSERT OR REPLACE INTO onboarding_bootstrap_operations VALUES (?, ?, ?, ?, ?)")
      .run(event.application_id, event.operation_id, event.workspace_id, 0, event.occurred_at),
    /bootstrap operation is append only/
  );
  assert.throws(
    () => database.prepare("INSERT OR REPLACE INTO onboarding_signup_events VALUES (?, 'signup_completed', ?, ?, ?, ?)")
      .run(event.event_id, event.application_id, event.operation_id, event.workspace_id, event.occurred_at),
    /signup event is append only/
  );
});

test("parallel distinct operations converge to one workspace and one signup event", async () => {
  const results = await Promise.all(Array.from({ length: 8 }, (_, index) => repository.bootstrap(actor, `bootstrap-concurrent-${index}`)));
  assert.equal(new Set(results.map((result) => result.workspaceId)).size, 1);
  assert.equal(results.filter((result) => result.createdIdentity).length, 1);
  assert.equal(count("workspaces"), 1);
  assert.equal(count("onboarding_signup_events"), 1);
});

test("concurrent same-operation retry returns the identical original response", async () => {
  const results = await Promise.all(Array.from({ length: 5 }, () => repository.bootstrap(actor, operation)));
  for (const result of results) assert.deepEqual(result, results[0]);
  assert.equal(count("onboarding_bootstrap_operations"), 1);
});

for (let step = 0; step < 7; step++) {
  test(`batch failure at statement ${step} rolls back all provisioning and retry recovers`, async () => {
    db.failAt = step;
    await assert.rejects(repository.bootstrap(actor, operation), { code: "unavailable" });
    for (const table of ["identities", "profiles", "workspaces", "workspace_members", "audit_logs", "onboarding_bootstrap_operations", "onboarding_signup_events"]) assert.equal(count(table), 0, table);
    db.failAt = -1;
    assert.equal((await repository.bootstrap(actor, operation)).createdIdentity, true);
  });
}

test("disabled identity cannot bootstrap or revive; a different subject is a distinct identity", async () => {
  database.prepare("INSERT INTO identities VALUES (?, ?, ?, 'disabled', ?, ?)").run("disabled", issuer, actor.subject, "now", "now");
  await assert.rejects(repository.bootstrap(actor, operation), { code: "actor_forbidden" });
  assert.equal(count("workspaces"), 0);
  await repository.bootstrap({ ...actor, subject: "different-subject" }, operation);
  assert.equal(database.prepare("SELECT status FROM identities WHERE application_id='disabled'").get().status, "disabled");
});

for (const status of ["suspended", "deleted"]) {
  test(`${status} Personal Workspace refuses replay without replacement`, async () => {
    await repository.bootstrap(actor, operation);
    database.prepare("UPDATE workspaces SET status=?").run(status);
    await assert.rejects(repository.bootstrap(actor, operation), { code: "personal_workspace_unavailable" });
    assert.equal(count("workspaces"), 1);
  });
}

test("authorization is rechecked inside the batch after the preflight read", async () => {
  await repository.bootstrap(actor, operation);
  db.beforeBatch = () => database.prepare("UPDATE workspaces SET status='suspended'").run();
  await assert.rejects(repository.bootstrap(actor, "bootstrap-operation-0002"), { code: "personal_workspace_unavailable" });
  assert.equal(count("onboarding_bootstrap_operations"), 1);
});

test("unregistered human remains forbidden on ordinary business APIs", async () => {
  const input = await request();
  const response = await worker.fetch(new Request("https://app.example.invalid/api/workspaces", { headers: input.headers }), env, {});
  assert.equal(response.status, 403);
  assert.equal(count("identities"), 0);
});

test("service actors, cross-origin requests and guest payload fail without writes", async () => {
  for (const input of [
    await request(undefined, { sub: "", common_name: "machine" }),
    await request(undefined, {}, { origin: "https://other.example.invalid" }),
    await request({ operationId: operation, manual: { title: "must not enter bootstrap" } })
  ]) {
    const response = await worker.fetch(input, env, {});
    assert.ok([400, 403].includes(response.status));
    assert.equal(count("identities"), 0);
  }
});

test("rate limit denial and unavailable bindings fail closed without provisioning", async () => {
  const keys = [];
  env.ONBOARDING_RATE_LIMITER.limit = async ({ key }) => { keys.push(key); return { success: false }; };
  const limited = await worker.fetch(await request(), env, {});
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");
  assert.equal(keys.length, 1);
  assert.match(keys[0], /^actor:[a-f0-9]{64}$/);
  assert.doesNotMatch(keys[0], /198\.51\.100\.10/);
  const missingSignal = await request();
  missingSignal.headers.delete("cf-connecting-ip");
  assert.equal((await worker.fetch(missingSignal, env, {})).status, 503);
  const workerSubrequest = await request(undefined, {}, { "CF-Worker": "app.example.invalid" });
  assert.equal((await worker.fetch(workerSubrequest, env, {})).status, 503);
  delete env.ONBOARDING_RATE_LIMITER;
  assert.equal((await worker.fetch(await request(), env, {})).status, 503);
  assert.equal(count("identities"), 0);
});

test("bootstrap applies independent actor and connection rate limits", async () => {
  const keys = [];
  env.ONBOARDING_RATE_LIMITER.limit = async ({ key }) => { keys.push(key); return { success: true }; };
  assert.equal((await worker.fetch(await request(), env, {})).status, 200);
  assert.equal(keys.length, 2);
  assert.match(keys[0], /^actor:[a-f0-9]{64}$/);
  assert.match(keys[1], /^connection:[a-f0-9]{64}$/);
  assert.notEqual(keys[0], keys[1]);
});

test("connection rate limit rejects a second actor on the same trusted IP without provisioning", async () => {
  const keys = [];
  const connectionKeys = new Set();
  env.ONBOARDING_RATE_LIMITER.limit = async ({ key }) => {
    keys.push(key);
    if (!key.startsWith("connection:")) return { success: true };
    const first = !connectionKeys.has(key);
    connectionKeys.add(key);
    return { success: first };
  };
  const first = await worker.fetch(await request({ operationId: "bootstrap-connection-first" }), env, {});
  assert.equal(first.status, 200, await first.text());
  const second = await worker.fetch(
    await request({ operationId: "bootstrap-connection-second" }, { sub: "new-human-2" }),
    env,
    {}
  );
  assert.equal(second.status, 429, await second.text());
  assert.equal(keys.length, 4);
  assert.match(keys[0], /^actor:[a-f0-9]{64}$/);
  assert.match(keys[1], /^connection:[a-f0-9]{64}$/);
  assert.match(keys[2], /^actor:[a-f0-9]{64}$/);
  assert.match(keys[3], /^connection:[a-f0-9]{64}$/);
  assert.notEqual(keys[0], keys[2]);
  assert.equal(keys[1], keys[3]);
  assert.equal(count("identities"), 1);
  assert.equal(count("onboarding_bootstrap_operations"), 1);
  assert.equal(count("onboarding_signup_events"), 1);
  assert.equal(database.prepare("SELECT count(*) AS n FROM identities WHERE subject=?").get("new-human-2").n, 0);
});

test("connection signal requires Cloudflare provenance and canonicalizes IPv6", async () => {
  const keys = [];
  env.ONBOARDING_RATE_LIMITER.limit = async ({ key }) => { keys.push(key); return { success: true }; };
  const full = await request({ operationId: "bootstrap-ipv6-full" }, {}, { "CF-Connecting-IP": "2001:0DB8:0:0:0:0:0:1" });
  assert.ok(full.cf);
  assert.equal(full.headers.get("CF-Connecting-IP"), "2001:0DB8:0:0:0:0:0:1");
  assert.equal(full.headers.has("CF-Worker"), false);
  const fullResponse = await worker.fetch(full, env, {});
  assert.equal(fullResponse.status, 200, await fullResponse.text());
  const compressed = await request({ operationId: "bootstrap-ipv6-compressed" }, {}, { "CF-Connecting-IP": "2001:db8::1" });
  assert.equal((await worker.fetch(compressed, env, {})).status, 200);
  assert.equal(keys[1], keys[3]);
  for (const value of [":::1", ":1::"]) {
    const invalid = await request({ operationId: `bootstrap-invalid-${value.replace(/[^A-Za-z0-9]/g, "")}` }, {}, { "CF-Connecting-IP": value });
    assert.equal((await worker.fetch(invalid, env, {})).status, 503);
  }
  const noProvenance = await request({ operationId: "bootstrap-no-cf-provenance" });
  Object.defineProperty(noProvenance, "cf", { value: undefined });
  assert.equal((await worker.fetch(noProvenance, env, {})).status, 503);
});
