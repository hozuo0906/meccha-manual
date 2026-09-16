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
    ACCESS_ISSUER: issuer, ACCESS_AUDIENCE: "bootstrap-tests", ACCESS_JWKS_URL: `${issuer}/certs`, DB: db,
    ONBOARDING_RATE_LIMITER: { limit: async () => ({ success: true }) }
  };
  globalThis.fetch = async (url) => { assert.equal(String(url), `${issuer}/certs`); return Response.json({ keys: [jwk] }); };
});
afterEach(() => { globalThis.fetch = originalFetch; database.close(); });

function count(table) { return database.prepare(`SELECT count(*) AS n FROM ${table}`).get().n; }
async function request(body = { operationId: operation }, claims = {}, headers = {}) {
  const token = await new SignJWT({ type: "app", sub: actor.subject, ...claims }).setProtectedHeader({ alg: "RS256", kid: "bootstrap" })
    .setIssuer(issuer).setAudience("bootstrap-tests").setIssuedAt().setExpirationTime("5m").sign(privateKey);
  return new Request("https://app.example.invalid/api/onboarding/bootstrap", {
    method: "POST", headers: { origin: "https://app.example.invalid", "content-type": "application/json", "Cf-Access-Jwt-Assertion": token, ...headers },
    body: JSON.stringify(body)
  });
}

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
  assert.match(event.event_id, /^[a-f0-9]{64}$/);
  assert.equal(event.operation_id, operation);
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
  env.ONBOARDING_RATE_LIMITER.limit = async () => ({ success: false });
  const limited = await worker.fetch(await request(), env, {});
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");
  delete env.ONBOARDING_RATE_LIMITER;
  assert.equal((await worker.fetch(await request(), env, {})).status, 503);
  assert.equal(count("identities"), 0);
});
