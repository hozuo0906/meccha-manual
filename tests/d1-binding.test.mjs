import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { D1RepositoryError } from "../apps/worker/src/infra/d1/d1-errors.ts";
import { D1IdentityRepository } from "../apps/worker/src/infra/d1/identity-repository.ts";
import { D1WorkspaceRepository } from "../apps/worker/src/infra/d1/workspace-repository.ts";

const migrationPath = new URL("../migrations/0001_d1_identity_workspace.sql", import.meta.url);
const NOW = "2026-09-05T00:00:00.000Z";
const LATER = "2026-09-05T00:05:00.000Z";
const TEST_TIMEOUT_MS = 45_000;

const options = {
  timeout: TEST_TIMEOUT_MS,
  ...(process.platform === "win32"
    ? { skip: "Miniflare v5 D1 binding hangs on Windows; this smoke test runs on hosted Linux CI only." }
    : {})
};

test("Miniflare D1 binding applies migration and exercises the real workspace repository", options, async () => {
  if (process.platform === "win32") return;

  let miniflare;
  let disposePromise;
  let disposeTimer;
  const dispose = () => {
    if (!miniflare) return Promise.resolve();
    disposePromise ??= Promise.resolve(miniflare.dispose());
    return disposePromise;
  };
  try {
    miniflare = new Miniflare(
      convertV4MiniflareOptions({
        compatibilityDate: "2026-01-01",
        d1Databases: ["DB"],
        modules: true,
        script: "export default { fetch() { return new Response('ok'); } };"
      })
    );
    disposeTimer = setTimeout(() => void dispose(), TEST_TIMEOUT_MS - 1_000);
    disposeTimer.unref?.();

    const db = await miniflare.getD1Database("DB");
    await applyMigration(db, await readFile(migrationPath, "utf8"));
    await assertMigrationAndSeed(db);

    const identities = new D1IdentityRepository(db);
    const workspaces = new D1WorkspaceRepository(db);
    assert.deepEqual(await identities.findByIssuerAndSubject("issuer-a", "alice"), {
      applicationId: "alice",
      status: "active"
    });

    const firstWorkspace = await workspaces.createWorkspace(
      "alice",
      { name: "Alpha workspace", slug: "alpha" },
      NOW
    );
    assert.equal(await count(db, "SELECT count(*) AS count FROM workspace_members WHERE workspace_id = ?1", firstWorkspace.id), 1);
    assert.equal(await count(db, "SELECT count(*) AS count FROM audit_logs WHERE action = 'workspace.created' AND workspace_id = ?1", firstWorkspace.id), 1);

    const secondWorkspace = await workspaces.createWorkspace(
      "alice",
      { name: "Beta workspace", slug: "beta" },
      NOW
    );
    const joinCode = await workspaces.issueJoinCode("bob", NOW);
    await workspaces.consumeJoinCode("alice", firstWorkspace.id, joinCode.code, "viewer", NOW);

    const auditAfterJoin = await count(db, "SELECT count(*) AS count FROM audit_logs");
    assert.equal(await count(db, "SELECT count(*) AS count FROM workspace_members WHERE workspace_id = ?1 AND application_id = 'bob'", firstWorkspace.id), 1);
    assert.equal(await count(db, "SELECT count(*) AS count FROM audit_logs WHERE action = 'member.joined' AND workspace_id = ?1", firstWorkspace.id), 1);

    await assert.rejects(
      () => workspaces.consumeJoinCode("alice", secondWorkspace.id, joinCode.code, "viewer", NOW),
      (error) => error?.code === "conflict"
    );
    assert.equal(await count(db, "SELECT count(*) AS count FROM workspace_members WHERE workspace_id = ?1", secondWorkspace.id), 1);
    assert.equal(await count(db, "SELECT count(*) AS count FROM audit_logs WHERE workspace_id = ?1", secondWorkspace.id), 1);
    assert.equal(await count(db, "SELECT count(*) AS count FROM audit_logs"), auditAfterJoin);

    await db.exec(
      "CREATE TRIGGER test_d1_binding_mid_batch_failure BEFORE INSERT ON workspace_members " +
      "WHEN NEW.role = 'owner' BEGIN SELECT RAISE(ABORT, 'injected mid-batch failure'); END;"
    );
    const workspaceCountBeforeRollback = await count(db, "SELECT count(*) AS count FROM workspaces");
    const auditCountBeforeRollback = await count(db, "SELECT count(*) AS count FROM audit_logs");
    try {
      await assert.rejects(
        () => workspaces.createWorkspace("alice", { name: "Rollback workspace", slug: "rollback" }, LATER),
        (error) => {
          assert.ok(error instanceof D1RepositoryError, `unexpected D1 error: ${error?.constructor?.name ?? typeof error}`);
          assert.equal(error.code, "conflict");
          return true;
        }
      );
    } finally {
      await db.exec("DROP TRIGGER test_d1_binding_mid_batch_failure");
    }
    assert.equal(await count(db, "SELECT count(*) AS count FROM workspaces"), workspaceCountBeforeRollback);
    assert.equal(await count(db, "SELECT count(*) AS count FROM audit_logs"), auditCountBeforeRollback);
    assert.equal(await count(db, "SELECT count(*) AS count FROM workspaces WHERE slug = 'rollback'"), 0);

    await workspaces.updateMember(
      "alice",
      firstWorkspace.id,
      "bob",
      { role: "editor", status: "active" },
      LATER
    );
    assert.equal(
      (await db.prepare("SELECT role, status FROM workspace_members WHERE workspace_id = ?1 AND application_id = 'bob'").bind(firstWorkspace.id).first()).role,
      "editor"
    );
    const memberAuditCount = await count(db, "SELECT count(*) AS count FROM audit_logs WHERE action = 'member.updated' AND workspace_id = ?1", firstWorkspace.id);
    assert.equal(memberAuditCount, 1);

    await workspaces.updateMember(
      "alice",
      firstWorkspace.id,
      "bob",
      { role: "editor", status: "active" },
      LATER
    );
    assert.equal(await count(db, "SELECT count(*) AS count FROM audit_logs WHERE action = 'member.updated' AND workspace_id = ?1", firstWorkspace.id), memberAuditCount);
  } finally {
    if (disposeTimer) clearTimeout(disposeTimer);
    await dispose();
  }
});

async function applyMigration(db, migration) {
  // D1 exec treats each newline as a query boundary. This migration has no
  // comments, so collapsing its finite SQL to one line keeps trigger bodies
  // (including BEGIN/END) intact while retaining semicolon statement boundaries.
  assert.doesNotMatch(migration, /--|\/\*/u, "migration splitter only accepts comment-free SQL");
  await db.exec(migration.replace(/\r?\n/g, " ").trim());
}

async function assertMigrationAndSeed(db) {
  const tables = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
  for (const table of ["identities", "profiles", "workspaces", "workspace_members", "workspace_join_codes", "audit_logs"]) {
    assert.ok(tables.results.some((row) => row.name === table), `missing D1 table: ${table}`);
  }

  const triggers = await db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger'").all();
  assert.ok(triggers.results.some((row) => row.name === "workspace_member_owner_loss_update" && row.sql.includes("BEGIN") && row.sql.includes("END")));
  assert.ok(triggers.results.some((row) => row.name === "audit_logs_append_only_delete"));

  for (const [id, subject] of [["alice", "alice"], ["bob", "bob"]]) {
    await db.prepare(
      "INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES (?1, 'issuer-a', ?2, 'active', ?3, ?3)"
    ).bind(id, subject, NOW).run();
    await db.prepare(
      "INSERT INTO profiles(application_id, display_name, locale, timezone, created_at, updated_at) VALUES (?1, ?2, 'ja-JP', 'Asia/Tokyo', ?3, ?3)"
    ).bind(id, id, NOW).run();
  }
}

async function count(db, sql, ...values) {
  const row = await db.prepare(sql).bind(...values).first();
  return Number(row?.count ?? 0);
}
