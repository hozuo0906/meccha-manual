import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { D1IdentityRepository } from "../apps/worker/src/infra/d1/identity-repository.ts";
import { D1RepositoryError } from "../apps/worker/src/infra/d1/d1-errors.ts";
import { D1WorkspaceRepository } from "../apps/worker/src/infra/d1/workspace-repository.ts";

const migrationPath = new URL("../migrations/0001_d1_identity_workspace.sql", import.meta.url);
const NOW = "2026-09-05T00:00:00.000Z";
const LATER = "2026-09-05T00:05:00.000Z";

class LocalStatement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new LocalStatement(this.database, this.sql, values);
  }

  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }

  async all() {
    return { success: true, results: this.database.prepare(this.sql).all(...this.values) };
  }

  async first() {
    return this.database.prepare(this.sql).get(...this.values) ?? null;
  }
}

class LocalD1 {
  constructor(database) {
    this.database = database;
    this.failAt = null;
  }

  prepare(sql) {
    return new LocalStatement(this.database, sql);
  }

  async batch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const [index, statement] of statements.entries()) {
        if (this.failAt === index) throw new Error("injected batch failure");
        results.push(await statement.run());
      }
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

let database;
let d1;
let identities;
let workspaces;

beforeEach(async () => {
  database = new DatabaseSync(":memory:");
  database.exec(await readFile(migrationPath, "utf8"));
  d1 = new LocalD1(database);
  identities = new D1IdentityRepository(d1);
  workspaces = new D1WorkspaceRepository(d1);
  seedIdentity("alice", "issuer-a", " raw-alice ");
  seedIdentity("bob", "issuer-a", "bob");
  seedIdentity("carol", "issuer-a", "carol");
  seedIdentity("disabled", "issuer-a", "disabled", "disabled");
});

afterEach(() => database?.close());

function seedIdentity(id, issuer, subject, status = "active") {
  database.prepare(
    "INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, issuer, subject, status, NOW, NOW);
  database.prepare(
    "INSERT INTO profiles(application_id, display_name, locale, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, id, "ja-JP", "Asia/Tokyo", NOW, NOW);
}

function codeFor(id, now = NOW) {
  return workspaces.issueJoinCode(id, now);
}

async function createOwnedWorkspace(id = "alice", slug = "alpha") {
  return workspaces.createWorkspace(id, { name: "  日本語 workspace  ", slug: ` ${slug.toUpperCase()} ` }, NOW);
}

test("migration and identity repository preserve raw subject and status", async () => {
  assert.deepEqual(await identities.findByIssuerAndSubject("issuer-a", " raw-alice "), {
    applicationId: "alice", status: "active"
  });
  assert.equal(await identities.findByIssuerAndSubject("issuer-a", "raw-alice"), null);
  assert.deepEqual(await workspaces.getProfile("alice"), {
    applicationId: "alice", displayName: "alice", locale: "ja-JP", timezone: "Asia/Tokyo"
  });
  assert.deepEqual(await identities.findByIssuerAndSubject("issuer-a", "disabled"), {
    applicationId: "disabled", status: "disabled"
  });
  assert.equal(await identities.findByIssuerAndSubject("issuer-a", "unknown"), null);
  assert.equal(await workspaces.getProfile("disabled"), null);
  assert.throws(() => database.prepare(
    "INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run("duplicate", "issuer-a", " raw-alice ", "active", NOW, NOW));
  assert.throws(() => database.prepare(
    "INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run("blank", "issuer-a", "   ", "active", NOW, NOW));
  assert.throws(() => database.prepare(
    "INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run("unicode-blank", "issuer-a", "\u00a0\u3000", "active", NOW, NOW));
});

test("create workspace normalizes input and atomically creates owner/audit", async () => {
  const workspace = await createOwnedWorkspace();
  assert.equal(workspace.name, "日本語 workspace");
  assert.equal(workspace.slug, "alpha");
  assert.deepEqual(await workspaces.listWorkspaces("alice"), [workspace]);
  assert.equal((database.prepare("SELECT count(*) AS count FROM workspace_members").get()).count, 1);
  assert.equal((database.prepare("SELECT count(*) AS count FROM audit_logs WHERE action = 'workspace.created'").get()).count, 1);
  await assert.rejects(() => workspaces.createWorkspace("alice", { name: "x", slug: "alpha" }, NOW), (error) => error.code === "conflict");
  assert.deepEqual(await workspaces.listWorkspaces("disabled"), []);
});

test("workspace name and slug bounds are checked in repository and migration", async () => {
  await assert.rejects(() => workspaces.createWorkspace("alice", { name: " ", slug: "abc" }, NOW), (error) => error.code === "invalid_input");
  await assert.rejects(() => workspaces.createWorkspace("alice", { name: "a", slug: "a_b" }, NOW), (error) => error.code === "invalid_input");
  await assert.rejects(() => workspaces.createWorkspace("alice", { name: "a", slug: "ab" }, NOW), (error) => error.code === "invalid_input");
  await assert.rejects(() => workspaces.createWorkspace("alice", { name: "😀".repeat(65), slug: "valid" }, NOW), (error) => error.code === "invalid_input");
  assert.equal((await workspaces.createWorkspace("alice", { name: "double", slug: "a--b" }, NOW)).slug, "a--b");
  await assert.rejects(() => workspaces.createWorkspace("alice", { name: "a", slug: "valid" }, "not-a-time"), (error) => error.code === "invalid_input");
});

test("every workspace query is actor and workspace scoped", async () => {
  const first = await createOwnedWorkspace("alice", "first");
  const second = await createOwnedWorkspace("alice", "second");
  assert.equal((await workspaces.listMembers("alice", first.id)).length, 1);
  assert.deepEqual(await workspaces.listMembers("bob", first.id), []);
  assert.deepEqual(await workspaces.listMembers("alice", "other-workspace-id"), []);
  database.prepare("UPDATE workspaces SET status = 'suspended' WHERE id = ?").run(second.id);
  assert.deepEqual(await workspaces.listWorkspaces("alice"), [first]);
  assert.deepEqual(await workspaces.listMembers("alice", second.id), []);
  assert.throws(() => database.prepare("UPDATE identities SET status = 'disabled' WHERE application_id = 'alice'").run());
  assert.deepEqual(await workspaces.listWorkspaces("alice"), [first]);
  assert.deepEqual(await workspaces.listMembers("alice", first.id), [
    { applicationId: "alice", displayName: "alice", role: "owner", status: "active", joinedAt: NOW }
  ]);
});

test("disabled identities do not count as effective owners for disable, update, or delete", async () => {
  const soleEffectiveOwner = await createOwnedWorkspace("alice", "sole-effective-owner");
  database.prepare(
    "INSERT INTO workspace_members(workspace_id, application_id, role, status, joined_at, updated_at) VALUES (?, 'disabled', 'owner', 'active', ?, ?)"
  ).run(soleEffectiveOwner.id, NOW, NOW);
  assert.throws(() => database.prepare(
    "UPDATE identities SET status = 'disabled' WHERE application_id = 'alice'"
  ).run());
  assert.throws(() => database.prepare(
    "UPDATE workspace_members SET status = 'removed' WHERE workspace_id = ? AND application_id = 'alice'"
  ).run(soleEffectiveOwner.id));
  assert.throws(() => database.prepare(
    "DELETE FROM workspace_members WHERE workspace_id = ? AND application_id = 'alice'"
  ).run(soleEffectiveOwner.id));

  database.prepare(
    "INSERT INTO workspace_members(workspace_id, application_id, role, status, joined_at, updated_at) VALUES (?, 'bob', 'owner', 'active', ?, ?)"
  ).run(soleEffectiveOwner.id, NOW, NOW);
  database.prepare("UPDATE identities SET status = 'disabled' WHERE application_id = 'alice'").run();
  assert.equal(database.prepare("SELECT status FROM identities WHERE application_id = 'alice'").get().status, "disabled");
  assert.throws(() => database.prepare(
    "UPDATE identities SET status = 'disabled' WHERE application_id = 'bob'"
  ).run());
  assert.throws(() => database.prepare(
    "UPDATE workspace_members SET status = 'removed' WHERE workspace_id = ? AND application_id = 'bob'"
  ).run(soleEffectiveOwner.id));
  assert.throws(() => database.prepare(
    "DELETE FROM workspace_members WHERE workspace_id = ? AND application_id = 'bob'"
  ).run(soleEffectiveOwner.id));
});

test("disabled non-owner actors cannot read their memberships or workspaces", async () => {
  const workspace = await createOwnedWorkspace();
  await workspaces.consumeJoinCode("alice", workspace.id, (await codeFor("bob")).code, "admin", NOW);
  await workspaces.consumeJoinCode("alice", workspace.id, (await codeFor("carol", LATER)).code, "viewer", LATER);

  database.prepare("UPDATE identities SET status = 'disabled' WHERE application_id = 'bob'").run();
  assert.deepEqual(await workspaces.listWorkspaces("bob"), []);
  assert.deepEqual(await workspaces.listMembers("bob", workspace.id), []);

  database.prepare("UPDATE identities SET status = 'disabled' WHERE application_id = 'carol'").run();
  assert.deepEqual(await workspaces.listWorkspaces("carol"), []);
  assert.deepEqual(await workspaces.listMembers("carol", workspace.id), []);
});

test("same target identity in two workspaces cannot cross workspace mutation", async () => {
  const first = await createOwnedWorkspace("alice", "first");
  const second = await createOwnedWorkspace("alice", "second");
  await workspaces.consumeJoinCode("alice", first.id, (await codeFor("bob")).code, "viewer", NOW);
  await workspaces.consumeJoinCode("alice", second.id, (await codeFor("bob", LATER)).code, "viewer", LATER);
  await workspaces.updateMember("alice", first.id, "bob", { role: "editor", status: "active" }, LATER);
  assert.equal((database.prepare("SELECT role FROM workspace_members WHERE workspace_id = ? AND application_id = 'bob'").get(first.id)).role, "editor");
  assert.equal((database.prepare("SELECT role FROM workspace_members WHERE workspace_id = ? AND application_id = 'bob'").get(second.id)).role, "viewer");
});

test("workspace list returns exactly 1000 and rejects a 1001st result", async () => {
  const workspaceInsert = database.prepare(
    "INSERT INTO workspaces(id, name, slug, status, created_by, created_at, updated_at) VALUES (?, ?, ?, 'active', 'alice', ?, ?)"
  );
  const memberInsert = database.prepare(
    "INSERT INTO workspace_members(workspace_id, application_id, role, status, joined_at, updated_at) VALUES (?, 'alice', 'owner', 'active', ?, ?)"
  );
  database.exec("BEGIN");
  try {
    for (let index = 0; index < 1000; index += 1) {
      const id = `listed-${index}`;
      workspaceInsert.run(id, `Workspace ${index}`, `listed-${index}`, NOW, NOW);
      memberInsert.run(id, NOW, NOW);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  assert.equal((await workspaces.listWorkspaces("alice")).length, 1000);
  const id = "listed-1000";
  workspaceInsert.run(id, "Workspace 1000", "listed-1000", NOW, NOW);
  memberInsert.run(id, NOW, NOW);
  await assert.rejects(() => workspaces.listWorkspaces("alice"), (error) => error.code === "limit_exceeded");
});

test("join code is digest-only, ten-minute, single-use, and reissue revokes old code", async () => {
  const workspace = await createOwnedWorkspace();
  const anotherWorkspace = await createOwnedWorkspace("alice", "unused");
  const first = await codeFor("bob");
  const second = await codeFor("bob", LATER);
  assert.match(first.code, /^mmj_[A-Za-z0-9_-]{43}$/u);
  assert.notEqual(first.code, second.code);
  assert.equal((database.prepare("SELECT count(*) AS count FROM workspace_join_codes WHERE digest LIKE 'mmj_%'").get()).count, 0);
  assert.equal((database.prepare("SELECT count(*) AS count FROM workspace_join_codes WHERE revoked_at IS NOT NULL").get()).count, 1);
  assert.equal((database.prepare("SELECT count(*) AS count FROM audit_logs WHERE action = 'join_code.issued'").get()).count, 2);
  await assert.rejects(() => workspaces.consumeJoinCode("alice", anotherWorkspace.id, first.code, "viewer", LATER), (error) => error.code === "conflict");
});

test("join code consume atomically adds or reactivates issuer and writes audit", async () => {
  const workspace = await createOwnedWorkspace();
  const code = await codeFor("bob");
  await workspaces.consumeJoinCode("alice", workspace.id, code.code, "viewer", NOW);
  assert.equal((await workspaces.listMembers("alice", workspace.id)).length, 2);
  assert.equal((database.prepare("SELECT count(*) AS count FROM audit_logs WHERE action = 'member.joined'").get()).count, 1);
  await assert.rejects(() => workspaces.consumeJoinCode("alice", workspace.id, code.code, "viewer", NOW), (error) => error.code === "conflict");
  await workspaces.updateMember("alice", workspace.id, "bob", { role: "admin", status: "active" }, NOW);
  database.prepare("UPDATE workspace_members SET status = 'removed' WHERE workspace_id = ? AND application_id = 'bob'").run(workspace.id);
  const rejoin = await codeFor("bob", LATER);
  await workspaces.consumeJoinCode("alice", workspace.id, rejoin.code, "viewer", LATER);
  const rejoinedMember = database.prepare("SELECT role, status, joined_at FROM workspace_members WHERE workspace_id = ? AND application_id = 'bob'").get(workspace.id);
  assert.equal(rejoinedMember.role, "viewer");
  assert.equal(rejoinedMember.status, "active");
  assert.equal(rejoinedMember.joined_at, LATER);
});

test("consumption nonce prevents same-time replay into another workspace", async () => {
  const firstWorkspace = await createOwnedWorkspace("alice", "first");
  const secondWorkspace = await createOwnedWorkspace("alice", "second");
  const code = await codeFor("bob");
  await workspaces.consumeJoinCode("alice", firstWorkspace.id, code.code, "viewer", NOW);
  const auditCountBeforeReplay = (database.prepare("SELECT count(*) AS count FROM audit_logs").get()).count;
  database.prepare("UPDATE workspaces SET status = 'deleted' WHERE id = ?").run(firstWorkspace.id);
  await assert.rejects(() => workspaces.consumeJoinCode("alice", secondWorkspace.id, code.code, "viewer", NOW), (error) => error.code === "conflict");
  assert.equal((database.prepare("SELECT count(*) AS count FROM workspace_members WHERE application_id = 'bob'").get()).count, 1);
  assert.equal((database.prepare("SELECT count(*) AS count FROM audit_logs WHERE action = 'member.joined'").get()).count, 1);
  assert.equal((database.prepare("SELECT count(*) AS count FROM audit_logs").get()).count, auditCountBeforeReplay);
  assert.equal((database.prepare("SELECT count(*) AS count FROM workspace_join_codes WHERE consumed_at IS NOT NULL").get()).count, 1);
});

test("parallel consumption of one code has one winner and one atomic loser", async () => {
  const workspace = await createOwnedWorkspace();
  const code = await codeFor("bob");
  const outcomes = await Promise.allSettled([
    workspaces.consumeJoinCode("alice", workspace.id, code.code, "viewer", NOW),
    workspaces.consumeJoinCode("alice", workspace.id, code.code, "viewer", NOW)
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 1);
  assert.equal((database.prepare("SELECT count(*) AS count FROM workspace_members WHERE application_id = 'bob'").get()).count, 1);
  assert.equal((database.prepare("SELECT count(*) AS count FROM audit_logs WHERE action = 'member.joined'").get()).count, 1);
});

test("owner/admin/editor/viewer boundaries and owner invariants are enforced", async () => {
  const workspace = await createOwnedWorkspace();
  const bobCode = await codeFor("bob");
  const carolCode = await codeFor("carol");
  await workspaces.consumeJoinCode("alice", workspace.id, bobCode.code, "viewer", NOW);
  await workspaces.consumeJoinCode("alice", workspace.id, carolCode.code, "viewer", NOW);
  assert.equal((database.prepare("SELECT role FROM workspace_members WHERE workspace_id = ? AND application_id = 'bob'").get(workspace.id)).role, "viewer");
  const ownerAttemptCode = await codeFor("carol", LATER);
  await assert.rejects(() => workspaces.consumeJoinCode("alice", workspace.id, ownerAttemptCode.code, "owner", LATER), (error) => error.code === "conflict");
  await assert.rejects(() => workspaces.updateMember("bob", workspace.id, "carol", { role: "editor", status: "active" }, NOW), (error) => error.code === "forbidden");
  await workspaces.updateMember("alice", workspace.id, "bob", { role: "admin", status: "active" }, NOW);
  const auditBeforeIdempotent = (database.prepare("SELECT count(*) AS count FROM audit_logs WHERE action = 'member.updated'").get()).count;
  await workspaces.updateMember("alice", workspace.id, "bob", { role: "admin", status: "active" }, NOW);
  assert.equal((database.prepare("SELECT count(*) AS count FROM audit_logs WHERE action = 'member.updated'").get()).count, auditBeforeIdempotent);
  await workspaces.updateMember("bob", workspace.id, "carol", { role: "editor", status: "active" }, NOW);
  await workspaces.updateMember("bob", workspace.id, "bob", { role: "editor", status: "active" }, NOW);
  await assert.rejects(() => workspaces.updateMember("carol", workspace.id, "bob", { role: "viewer", status: "removed" }, NOW), (error) => error.code === "forbidden");
  await assert.rejects(() => workspaces.updateMember("alice", workspace.id, "alice", { role: "viewer", status: "removed" }, NOW), (error) => error.code === "forbidden");
  await assert.rejects(() => workspaces.updateMember("alice", workspace.id, "bob", { role: "owner", status: "active" }, NOW), (error) => error.code === "invalid_input");
  assert.throws(() => database.prepare("UPDATE workspace_members SET role = 'owner' WHERE workspace_id = ? AND application_id = 'bob'").run(workspace.id));
  assert.throws(() => database.prepare("UPDATE workspace_members SET status = 'removed' WHERE workspace_id = ? AND application_id = 'alice'").run(workspace.id));
  assert.throws(() => database.prepare("UPDATE workspaces SET created_by = 'bob' WHERE id = ?").run(workspace.id));
  assert.throws(() => database.prepare("UPDATE workspaces SET created_at = ? WHERE id = ?").run(LATER, workspace.id));
  assert.throws(() => database.prepare("UPDATE workspaces SET id = 'replacement-id' WHERE id = ?").run(workspace.id));
  assert.throws(() => database.prepare("UPDATE workspace_members SET application_id = 'carol' WHERE workspace_id = ? AND application_id = 'bob'").run(workspace.id));
});

test("non-active membership cannot be reactivated without a consent code", async () => {
  const workspace = await createOwnedWorkspace();
  const code = await codeFor("bob");
  await workspaces.consumeJoinCode("alice", workspace.id, code.code, "viewer", NOW);
  await workspaces.updateMember("alice", workspace.id, "bob", { role: "viewer", status: "removed" }, NOW);
  await assert.rejects(() => workspaces.updateMember("alice", workspace.id, "bob", { role: "viewer", status: "active" }, LATER), (error) => error.code === "forbidden");
});

test("disabled target identity is rejected consistently without update or audit", async () => {
  const workspace = await createOwnedWorkspace();
  const code = await codeFor("bob");
  await workspaces.consumeJoinCode("alice", workspace.id, code.code, "viewer", NOW);
  database.prepare("UPDATE identities SET status = 'disabled' WHERE application_id = 'bob'").run();
  const auditBefore = (database.prepare("SELECT count(*) AS count FROM audit_logs WHERE action = 'member.updated'").get()).count;
  await assert.rejects(() => workspaces.updateMember("alice", workspace.id, "bob", { role: "viewer", status: "removed" }, NOW), (error) => error.code === "forbidden");
  await assert.rejects(() => workspaces.updateMember("alice", workspace.id, "bob", { role: "viewer", status: "removed" }, NOW), (error) => error.code === "forbidden");
  assert.equal((database.prepare("SELECT status FROM workspace_members WHERE workspace_id = ? AND application_id = 'bob'").get(workspace.id)).status, "active");
  assert.equal((database.prepare("SELECT count(*) AS count FROM audit_logs WHERE action = 'member.updated'").get()).count, auditBefore);
});

test("D1 batch rollback leaves no workspace after an injected mid-operation failure", async () => {
  d1.failAt = 1;
  await assert.rejects(() => createOwnedWorkspace(), (error) => error.code === "unavailable");
  assert.equal((database.prepare("SELECT count(*) AS count FROM workspaces").get()).count, 0);
  assert.equal((database.prepare("SELECT count(*) AS count FROM workspace_members").get()).count, 0);
  assert.equal((database.prepare("SELECT count(*) AS count FROM audit_logs").get()).count, 0);
});

test("membership limit and append-only audit are database constraints", async () => {
  const workspace = await createOwnedWorkspace();
  const insert = database.prepare(
    "INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)"
  );
  const member = database.prepare(
    "INSERT INTO workspace_members(workspace_id, application_id, role, status, joined_at, updated_at) VALUES (?, ?, 'viewer', 'active', ?, ?)"
  );
  for (let index = 0; index < 999; index += 1) {
    const id = `bulk-${index}`;
    insert.run(id, "issuer-bulk", id, NOW, NOW);
    member.run(workspace.id, id, NOW, NOW);
  }
  assert.throws(() => {
    insert.run("over-limit", "issuer-bulk", "over-limit", NOW, NOW);
    member.run(workspace.id, "over-limit", NOW, NOW);
  });
  assert.throws(() => database.prepare("DELETE FROM audit_logs" ).run());
  assert.throws(() => database.prepare("UPDATE audit_logs SET metadata_json = '{}'" ).run());
});

test("expiry and disabled actors cannot consume codes", async () => {
  const workspace = await createOwnedWorkspace();
  const expiredCode = await codeFor("carol");
  await assert.rejects(() => workspaces.consumeJoinCode("alice", workspace.id, expiredCode.code, "viewer", "2026-09-05T00:10:00.001Z"), (error) => error.code === "conflict");
  const bobMembershipCode = await codeFor("bob");
  await workspaces.consumeJoinCode("alice", workspace.id, bobMembershipCode.code, "admin", NOW);
  const disabledCode = await codeFor("carol", LATER);
  const revocationsBeforeDisabledIssue = (database.prepare("SELECT count(*) AS count FROM workspace_join_codes WHERE revoked_at IS NOT NULL").get()).count;
  database.prepare("UPDATE identities SET status = 'disabled' WHERE application_id = 'bob'").run();
  await assert.rejects(() => workspaces.issueJoinCode("bob", LATER), (error) => error.code === "forbidden");
  assert.equal((database.prepare("SELECT count(*) AS count FROM workspace_join_codes WHERE revoked_at IS NOT NULL").get()).count, revocationsBeforeDisabledIssue);
  await assert.rejects(() => workspaces.consumeJoinCode("bob", workspace.id, disabledCode.code, "viewer", LATER), (error) => error.code === "conflict");
});

test("database status constraints reject malformed identity and membership rows", async () => {
  assert.throws(() => database.prepare(
    "UPDATE identities SET status = 'bogus' WHERE application_id = 'alice'"
  ).run());
  const workspace = await createOwnedWorkspace();
  assert.throws(() => database.prepare(
    "UPDATE workspace_members SET role = 'unknown' WHERE workspace_id = ? AND application_id = 'alice'"
  ).run(workspace.id));
});
