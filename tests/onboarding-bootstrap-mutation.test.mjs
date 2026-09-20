import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { D1OnboardingRepository } from "../apps/worker/src/infra/d1/onboarding-repository.ts";

const issuer = "https://bootstrap-mutation.example.invalid";
const actor = { kind: "access_user", issuer, subject: "new-human" };
const operation = "bootstrap-mutation-0001";

class Statement {
  constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; }
  bind(...values) { return new Statement(this.database, this.sql, values); }
  async first() { return this.database.prepare(this.sql).get(...this.values) ?? null; }
  async run() { this.database.prepare(this.sql).run(...this.values); return { success: true }; }
}

function databaseBinding(database) {
  let tail = Promise.resolve();
  const binding = {
    lastError: null,
    prepare: (sql) => new Statement(database, sql),
    batch(statements) {
      const task = tail.then(async () => {
        database.exec("BEGIN IMMEDIATE");
        try {
          const result = [];
          for (const statement of statements) result.push(await statement.run());
          database.exec("COMMIT");
          return result;
        } catch (error) { binding.lastError = error; database.exec("ROLLBACK"); throw error; }
      });
      tail = task.catch(() => {});
      return task;
    }
  };
  return binding;
}

async function seededRepository() {
  const database = new DatabaseSync(":memory:");
  for (const name of ["0001_d1_identity_workspace.sql", "0002_d1_personal_workspace.sql", "0003_d1_onboarding_bootstrap.sql"]) {
    database.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  }
  const now = "2026-01-01T00:00:00.000Z";
  database.prepare("INSERT INTO identities VALUES (?, ?, ?, 'active', ?, ?)").run("old-app", issuer, "old-human", now, now);
  database.prepare("INSERT INTO workspaces VALUES (?, ?, ?, 'active', ?, ?, ?, ?)").run("old-personal", "Old Personal", "old-personal", "old-app", now, now, "personal");
  database.prepare("INSERT INTO workspace_members VALUES (?, ?, 'owner', 'active', ?, ?)").run("old-personal", "old-app", now, now);
  const binding = databaseBinding(database);
  return { database, binding };
}

async function loadMutatedRepository(name, replacements) {
  const directory = await mkdtemp(join(process.cwd(), `.onboarding-mutation-${name}-`));
  const d1Directory = join(directory, "infra", "d1");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(d1Directory, { recursive: true }));
  let source = await readFile("apps/worker/src/infra/d1/onboarding-repository.ts", "utf8");
  for (const [before, after] of replacements) {
    assert.ok(source.includes(before), `mutation target not found: ${before}`);
    source = source.replace(before, after);
  }
  await Promise.all([
    writeFile(join(d1Directory, "onboarding-repository.ts"), source, "utf8"),
    writeFile(join(d1Directory, "d1-errors.ts"), await readFile("apps/worker/src/infra/d1/d1-errors.ts", "utf8"), "utf8"),
    writeFile(join(d1Directory, "d1-types.ts"), await readFile("apps/worker/src/infra/d1/d1-types.ts", "utf8"), "utf8"),
    writeFile(join(directory, "access-identity.ts"), await readFile("apps/worker/src/access-identity.ts", "utf8"), "utf8")
  ]);
  const module = await import(`${pathToFileURL(join(d1Directory, "onboarding-repository.ts")).href}?mutation=${Date.now()}-${name}`);
  return { Repository: module.D1OnboardingRepository, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

async function assertActorIsolation(Repository) {
  const { database, binding } = await seededRepository();
  try {
    const result = await new Repository(binding).bootstrap(actor, operation);
    assert.equal(result.createdIdentity, true, "bootstrap must report the newly created actor identity");
    assert.equal(database.prepare("SELECT count(*) AS n FROM identities WHERE issuer=? AND subject=?").get(issuer, actor.subject).n, 1);
    assert.notEqual(result.workspaceId, "old-personal", "bootstrap must not reuse another subject's workspace");
  } finally {
    database.close();
  }
}

async function assertMutatedBootstrapFailsClosed(Repository) {
  const { database, binding } = await seededRepository();
  try {
    await assert.rejects(() => new Repository(binding).bootstrap(actor, operation), { code: "unavailable" });
    assert.match(binding.lastError?.message ?? "", /bootstrap operation requires active personal owner workspace/, "the D1 scope guard must be the rejection boundary");
    assert.equal(database.prepare("SELECT count(*) AS n FROM identities").get().n, 1, "mutated authorization must roll back the newly inserted identity");
    assert.equal(database.prepare("SELECT count(*) AS n FROM onboarding_bootstrap_operations").get().n, 0, "mutated authorization must not persist an operation");
  } finally {
    database.close();
  }
}

test("弱めたissuer/subject identity predicateはbootstrap認可のmutation検査で検出される", async () => {
  await assertActorIsolation(D1OnboardingRepository);
  const mutation = await loadMutatedRepository("identity", [[
    "const identity = \"SELECT application_id FROM identities WHERE issuer = ?1 AND subject = ?2 AND status = 'active'\";",
    "const identity = \"SELECT application_id FROM identities WHERE issuer = ?1 AND status = 'active' ORDER BY application_id DESC\";"
  ]]);
  try {
    await assertMutatedBootstrapFailsClosed(mutation.Repository);
  } finally {
    await mutation.cleanup();
  }
});
