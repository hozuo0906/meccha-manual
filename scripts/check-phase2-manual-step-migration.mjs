import { readFile } from "node:fs/promises";

const migrationPath = "supabase/migrations/202608140010_phase2_manual_step_mutations.sql";
const contractPath = "docs/05-api/phase2-manual-edit-api.md";
const workflowPath = ".github/workflows/manual-step-migration.yml";
const [sql, contract, workflow] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(contractPath, "utf8"),
  readFile(workflowPath, "utf8")
]);

const required = [
  "create or replace function public.append_manual_step(",
  "create or replace function public.update_manual_step(",
  "expected_step_updated_at timestamptz",
  "and ms.updated_at = expected_step_updated_at",
  "manual step changed concurrently",
  "create or replace function public.soft_delete_manual_step(",
  "create or replace function public.reorder_manual_steps(",
  "for update of mr",
  "array['owner', 'admin', 'editor']::public.workspace_role[]",
  "ordered step ids must contain every active step exactly once",
  "ordered step ids must not contain duplicates",
  "ordered step ids contain an invalid step",
  "temporary_base := max_position::bigint + active_step_count::bigint + 1",
  "set position = temporary_base::integer + requested.ordinality::integer",
  "set position = requested.ordinality::integer - 1",
  "revoke insert, update, delete on table public.manual_steps from authenticated",
  "revoke all on function public.append_manual_step(",
  "revoke all on function public.update_manual_step(",
  "revoke all on function public.soft_delete_manual_step(uuid, uuid) from public, anon, authenticated",
  "revoke all on function public.reorder_manual_steps(uuid, uuid[]) from public, anon, authenticated",
  "grant execute on function public.append_manual_step(",
  "grant execute on function public.update_manual_step(",
  "grant execute on function public.soft_delete_manual_step(uuid, uuid) to authenticated",
  "grant execute on function public.reorder_manual_steps(uuid, uuid[]) to authenticated"
];

const requiredContract = [
  "`append_manual_step`",
  "`update_manual_step`",
  "`soft_delete_manual_step`",
  "`reorder_manual_steps`",
  "`authenticated`から`manual_steps`への直接`INSERT / UPDATE / DELETE`権限をrevokeする。",
  "同一のdraft revision rowを`FOR UPDATE`でlockする。",
  "4 RPCが同じrevision lockを待つ並行実行試験",
  "同じupdatedAtを持つ2更新のうち1件だけ成功",
  "`MANUAL_STEP_EDIT_CONFLICT`",
  "`［保存ボタン］をクリックします。`",
  "GitHub PRだけを根拠にstaging/productionへ適用しない"
];

const requiredWorkflow = [
  '"docs/01-product/requirements-traceability.md"',
  '"docs/05-api/phase2-manual-edit-api.md"',
  '"scripts/check-phase2-manual-step-migration.mjs"',
  '"scripts/test-phase2-manual-step-locks.sh"',
  '"tests/sql/phase2-manual-step-rpc-test.sql"',
  "git diff --check \"origin/${GITHUB_BASE_REF}...HEAD\""
];

const forbidden = [
  "service_role",
  "SUPABASE_SERVICE_ROLE_KEY",
  "disable row level security",
  "grant all",
  "drop table",
  "truncate"
];

const errors = [];
for (const snippet of required) {
  if (!sql.toLowerCase().includes(snippet.toLowerCase())) {
    errors.push(`Missing manual-step migration contract: ${snippet}`);
  }
}
for (const snippet of requiredContract) {
  if (!contract.includes(snippet)) {
    errors.push(`Missing manual edit API contract: ${snippet}`);
  }
}
for (const snippet of requiredWorkflow) {
  if (!workflow.includes(snippet)) {
    errors.push(`Missing manual-step workflow trigger/check: ${snippet}`);
  }
}
for (const snippet of forbidden) {
  if (sql.toLowerCase().includes(snippet.toLowerCase())) {
    errors.push(`Forbidden manual-step migration contract: ${snippet}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Phase 2 manual step mutation, documentation, and workflow contracts OK.");
