import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { D1WorkspaceRepository } from "../apps/worker/src/infra/d1/workspace-repository.ts";

const migration = await readFile(new URL("../migrations/0001_d1_identity_workspace.sql", import.meta.url), "utf8");
const repositorySource = await readFile(new URL("../apps/worker/src/infra/d1/workspace-repository.ts", import.meta.url), "utf8");
const now = "2026-09-05T00:00:00.000Z";

const sourceContracts = [
  ["workspace list actor identity", "i.status = 'active'"],
  ["workspace list membership status", "m.status = 'active'"],
  ["workspace list role", "m.role IN ('owner', 'admin', 'editor', 'viewer')"],
  ["workspace list workspace status", "w.status = 'active'"],
  ["workspace list sentinel", "WORKSPACE_LIST_FETCH_LIMIT = WORKSPACE_LIST_LIMIT + 1"],
  ["member list actor workspace", "actor_member.workspace_id = ?2"],
  ["member list target status", "target.status = 'active'"],
  ["member update management role", "actor_member.role IN ('owner', 'admin')"],
  ["member update workspace status", "w.status = 'active'"],
  ["member update target identity", "target_identity.status = 'active'"],
  ["member update no-consent reactivation", "target.status <> 'active' AND ?2 = 'active'"],
  ["join consume nonce", "c.consumption_nonce = ?6"],
  ["join consume requested role", "SELECT ?1, c.issuer_application_id, ?2, 'active'"],
  ["fixed list limit", "LIMIT ?2"],
  ["fixed member limit", "LIMIT ?3"]
];

const schemaContracts = [
  ["identity issuer subject unique", "UNIQUE (issuer, subject)"],
  ["active slug unique", "WHERE status = 'active'"],
  ["active member limit", "workspace_member_insert_limit"],
  ["owner transfer trigger", "workspace_member_owner_transfer"],
  ["last owner trigger", "workspace_member_owner_loss_update"],
  ["identity last owner trigger", "identity_disable_last_owner"],
  ["workspace identity immutable", "workspace_identity_immutable"],
  ["member identity immutable", "workspace_member_identity_immutable"],
  ["append-only audit", "audit_logs_append_only_delete"]
];

function methodBody(source, name, nextName) {
  const start = source.indexOf(`async ${name}`);
  const end = nextName ? source.indexOf(`async ${nextName}`, start) : source.lastIndexOf("\n}");
  if (start < 0 || end < 0) throw new Error(`missing method: ${name}`);
  return source.slice(start, end);
}

const methodContracts = [
  ["listWorkspaces", "getProfile", [["m.application_id = ?1", "i.status = 'active'", "m.status = 'active'", "m.role IN ('owner', 'admin', 'editor', 'viewer')", "w.status = 'active'", "LIMIT ?2"]]],
  ["getProfile", "listMembers", [["p.application_id = ?1", "i.status = 'active'"]]],
  ["listMembers", "createWorkspace", [["actor_member.application_id = ?1", "actor_member.workspace_id = ?2", "actor_member.status = 'active'", "actor_member.role IN ('owner', 'admin', 'editor', 'viewer')", "w.status = 'active'", "target.status = 'active'", "LIMIT ?3"]]],
  ["createWorkspace", "issueJoinCode", [["i.application_id = ?5 AND i.status = 'active'"], ["w.id = ?1", "w.created_by = ?3", "w.status = 'active'"], ["workspace_id = ?3", "role = 'owner'"]]],
  ["issueJoinCode", "consumeJoinCode", [["application_id = ?1 AND status = 'active'"], ["i.application_id = ?5 AND i.status = 'active'"], ["issuer_application_id = ?2 AND digest = ?5"]]],
  ["consumeJoinCode", "updateMember", [["c.digest = ?3", "admin_member.workspace_id = ?5"], ["w.status = 'active'", "c.consumption_nonce = ?6"], ["workspace_id = ?3", "c.consumption_nonce = ?7"]]],
  ["updateMember", null, [["target.workspace_id = ?4 AND target.application_id = ?5", "target_identity.status = 'active'", "actor_member.workspace_id = ?4", "actor_member.application_id = ?6", "actor_member.role IN ('owner', 'admin')", "w.status = 'active'"], ["changes() = 1"], ["target.workspace_id = ?1", "target_identity.status = 'active'", "actor_member.workspace_id = ?1", "actor_member.application_id = ?3", "actor_member.role IN ('owner', 'admin')", "w.status = 'active'"]]]
];

function preparedSqls(body, name) {
  const sqls = [];
  const pattern = /\.prepare\(\s*`([\s\S]*?)`\s*\)/g;
  for (const match of body.matchAll(pattern)) {
    if (match[1].includes("${")) throw new Error(`interpolated SQL is forbidden in ${name}`);
    sqls.push(match[1]);
  }
  return sqls;
}

function verifySourceContracts(source) {
  for (const [name, nextName, markers] of methodContracts) {
    const body = methodBody(source, name, nextName);
    const sqls = preparedSqls(body, name);
    assert.equal(sqls.length, markers.length, `unexpected SQL statement count in ${name}`);
    for (const [index, sqlMarkers] of markers.entries()) {
      for (const marker of sqlMarkers) assert.ok(sqls[index].includes(marker), `missing boundary in ${name} SQL ${index}: ${marker}`);
    }
  }
}

for (const [label, marker] of schemaContracts) {
  assert.ok(migration.includes(marker), `missing boundary: ${label}`);
}
verifySourceContracts(repositorySource);
const updateMethodStart = repositorySource.indexOf("async updateMember");
const updateMethodEnd = repositorySource.lastIndexOf("\n}");
const withoutWorkspacePredicate = `${repositorySource.slice(0, updateMethodStart)}${repositorySource.slice(updateMethodStart, updateMethodEnd).replace("target.workspace_id = ?4 AND target.application_id = ?5", "/* target.workspace_id = ?4 */ target.application_id = ?5")}${repositorySource.slice(updateMethodEnd)}`;
assert.throws(() => verifySourceContracts(withoutWorkspacePredicate), /target\.workspace_id/);

class LocalStatement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }
  bind(...values) { return new LocalStatement(this.database, this.sql, values); }
  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
  async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.values) }; }
  async first() { return this.database.prepare(this.sql).get(...this.values) ?? null; }
}

class LocalD1 {
  constructor(database, mutate = (sql) => sql) {
    this.database = database;
    this.mutate = mutate;
  }
  prepare(sql) { return new LocalStatement(this.database, this.mutate(sql)); }
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

function seededDatabase(sql = migration) {
  const database = new DatabaseSync(":memory:");
  database.exec(sql);
  for (const id of ["alice", "bob"]) {
    database.prepare(
      "INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at) VALUES (?, 'issuer', ?, 'active', ?, ?)"
    ).run(id, id, now, now);
    database.prepare(
      "INSERT INTO profiles(application_id, display_name, locale, timezone, created_at, updated_at) VALUES (?, ?, 'ja-JP', 'Asia/Tokyo', ?, ?)"
    ).run(id, id, now, now);
  }
  database.prepare(
    "INSERT INTO workspaces(id, name, slug, status, created_by, created_at, updated_at) VALUES ('workspace', 'Workspace', 'workspace', 'active', 'alice', ?, ?)"
  ).run(now, now);
  database.prepare(
    "INSERT INTO workspace_members(workspace_id, application_id, role, status, joined_at, updated_at) VALUES ('workspace', 'alice', 'owner', 'active', ?, ?)"
  ).run(now, now);
  database.prepare(
    "INSERT INTO workspace_members(workspace_id, application_id, role, status, joined_at, updated_at) VALUES ('workspace', 'bob', 'viewer', 'active', ?, ?)"
  ).run(now, now);
  return database;
}

function ownerTransferIsRejected(sql) {
  const database = seededDatabase(sql);
  try {
    database.prepare("UPDATE workspace_members SET role = 'owner' WHERE workspace_id = 'workspace' AND application_id = 'bob'").run();
    return false;
  } catch {
    return true;
  } finally {
    database.close();
  }
}

const ownerTriggerStart = migration.indexOf("CREATE TRIGGER workspace_member_owner_transfer");
const ownerTriggerEnd = migration.indexOf("END;", ownerTriggerStart) + "END;".length;
assert.ok(ownerTriggerStart >= 0 && ownerTriggerEnd > ownerTriggerStart, "owner trigger mutation target missing");
const withoutOwnerTrigger = `${migration.slice(0, ownerTriggerStart)}${migration.slice(ownerTriggerEnd)}`;
assert.equal(ownerTransferIsRejected(migration), true, "baseline owner transfer must be rejected");
assert.equal(ownerTransferIsRejected(withoutOwnerTrigger), false, "owner trigger mutation must be observable");

const baselineDatabase = seededDatabase();
const baselineRepository = new D1WorkspaceRepository(new LocalD1(baselineDatabase));
await assert.rejects(
  () => baselineRepository.updateMember("bob", "workspace", "bob", { role: "editor", status: "active" }, now),
  (error) => error?.code === "forbidden"
);
baselineDatabase.close();

const mutatedDatabase = seededDatabase();
const mutatedRepository = new D1WorkspaceRepository(new LocalD1(
  mutatedDatabase,
  (sql) => sql.replace("AND actor_member.role IN ('owner', 'admin')", "")
));
await mutatedRepository.updateMember("bob", "workspace", "bob", { role: "editor", status: "active" }, now);
assert.equal(mutatedDatabase.prepare("SELECT role FROM workspace_members WHERE application_id = 'bob'").get().role, "editor", "worker actor-role mutation must be observable");
mutatedDatabase.close();

console.log("D1 workspace boundary OK: fixed scoped queries and owner/actor authorization mutations are observable.");
