import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const migrationFiles = [
  "supabase/migrations/202608010001_phase1_identity_workspaces.sql",
  "supabase/migrations/202608010002_phase1_workspace_membership_hardening.sql",
  "supabase/migrations/202608100001_phase1_workspace_input_hardening.sql",
  "supabase/migrations/202608100002_phase1_member_management.sql"
];

const transactionPattern = /^\s*(?:begin|commit|rollback)\s*;/im;
const sections = [];

for (const file of migrationFiles) {
  const sql = await readFile(file, "utf8");
  if (transactionPattern.test(sql)) {
    throw new Error(`${file} must not contain transaction control; the bundle owns the transaction.`);
  }

  const digest = createHash("sha256").update(sql).digest("hex");
  sections.push([
    `-- BEGIN ${file}`,
    `-- SHA-256 ${digest}`,
    sql.trim(),
    `-- END ${file}`
  ].join("\n"));
}

const bundle = [
  "-- Generated Phase 1 migration bundle. Do not edit this output.",
  "-- All Phase 1 migrations run in one transaction; any statement failure aborts the whole bundle.",
  "begin;",
  "set local lock_timeout = '5s';",
  "set local statement_timeout = '60s';",
  ...sections,
  "commit;",
  ""
].join("\n\n");

process.stdout.write(bundle);
