import { readFile } from "node:fs/promises";

const migrationPath = "supabase/migrations/202608140001_phase2_manual_step_mutations.sql";
const sql = await readFile(migrationPath, "utf8");

const required = [
  "create or replace function public.append_manual_step(",
  "create or replace function public.reorder_manual_steps(",
  "for update of mr",
  "array['owner', 'admin', 'editor']::public.workspace_role[]",
  "ordered step ids must contain every active step exactly once",
  "ordered step ids must not contain duplicates",
  "ordered step ids contain an invalid step",
  "temporary_base := max_position::bigint + active_step_count::bigint + 1",
  "set position = temporary_base::integer + requested.ordinality::integer",
  "set position = requested.ordinality::integer - 1",
  "revoke all on function public.append_manual_step(",
  "revoke all on function public.reorder_manual_steps(uuid, uuid[]) from public, anon, authenticated",
  "grant execute on function public.append_manual_step(",
  "grant execute on function public.reorder_manual_steps(uuid, uuid[]) to authenticated"
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
for (const snippet of forbidden) {
  if (sql.toLowerCase().includes(snippet.toLowerCase())) {
    errors.push(`Forbidden manual-step migration contract: ${snippet}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Phase 2 manual step mutation migration contract OK.");
