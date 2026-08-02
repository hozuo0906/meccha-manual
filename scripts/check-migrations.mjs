import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
const forbiddenSnippets = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "service_role key",
  "DATABASE_PASSWORD",
  "JWT_SECRET"
];

const requiredPhase2Snippets = [
  "create table if not exists public.folders",
  "create table if not exists public.manuals",
  "create table if not exists public.manual_revisions",
  "create table if not exists public.manual_steps",
  "create table if not exists public.step_targets",
  "alter table public.folders enable row level security",
  "alter table public.manuals enable row level security",
  "alter table public.manual_revisions enable row level security",
  "alter table public.manual_steps enable row level security",
  "alter table public.step_targets enable row level security",
  "create or replace function public.can_view_manual",
  "create or replace function public.can_edit_manual",
  "create or replace function public.create_manual",
  "create or replace function public.publish_manual",
  "create or replace function public.create_manual_draft",
  "published or superseded revisions are immutable",
  "manual steps can only be changed on draft revisions",
  "manual publication fields must be changed through publish_manual",
  "folder workspace_id is immutable",
  "and created_by = auth.uid()"
];

const phase1HardeningFile = "202608020003_phase1_workspace_membership_hardening.sql";
const requiredPhase1HardeningSnippets = [
  "create or replace function public.protect_workspace_identity()",
  "select target_user_id = auth.uid()",
  "new.id is distinct from old.id",
  "new.workspace_id is distinct from old.workspace_id",
  "new.user_id is distinct from old.user_id",
  "new.created_by is distinct from old.created_by",
  "new.created_at is distinct from old.created_at",
  "revoke execute on function public.create_workspace(text, text) from public, anon",
  "revoke execute on function public.is_workspace_member(uuid, uuid) from public, anon",
  "revoke execute on function public.has_workspace_role(uuid, uuid, public.workspace_role[]) from public, anon",
  "create trigger workspaces_protect_identity",
  "execute function public.protect_workspace_identity()",
  "grant execute on function public.create_workspace(text, text) to authenticated"
];

const entries = await readdir(migrationsDir, { withFileTypes: true });
const migrationFiles = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
  .map((entry) => entry.name)
  .sort();

const errors = [];

if (migrationFiles.length === 0) {
  errors.push("No Supabase migrations found.");
}

for (const file of migrationFiles) {
  const content = await readFile(path.join(migrationsDir, file), "utf8");

  for (const snippet of forbiddenSnippets) {
    if (content.includes(snippet)) {
      errors.push(`Forbidden secret-related snippet found in ${file}: ${snippet}`);
    }
  }

  if (/create table if not exists public\.\w+[\s\S]*?(?=create table|create index|create or replace|alter table|do \$\$|$)/gi.test(content)) {
    const createdTables = [...content.matchAll(/create table if not exists public\.(\w+)/gi)]
      .map((match) => match[1]);

    for (const table of createdTables) {
      if (!content.includes(`alter table public.${table} enable row level security`)) {
        errors.push(`Missing RLS enable statement for table ${table} in ${file}`);
      }
    }
  }
}

const phase2File = "202608020001_phase2_manual_core.sql";
if (!migrationFiles.includes(phase2File)) {
  errors.push(`Missing required migration: ${phase2File}`);
} else {
  const phase2 = await readFile(path.join(migrationsDir, phase2File), "utf8");
  for (const snippet of requiredPhase2Snippets) {
    if (!phase2.includes(snippet)) {
      errors.push(`Missing Phase 2 migration snippet: ${snippet}`);
    }
  }
}

if (!migrationFiles.includes(phase1HardeningFile)) {
  errors.push(`Missing required migration: ${phase1HardeningFile}`);
} else {
  const phase1Hardening = await readFile(path.join(migrationsDir, phase1HardeningFile), "utf8");
  for (const snippet of requiredPhase1HardeningSnippets) {
    if (!phase1Hardening.includes(snippet)) {
      errors.push(`Missing Phase 1 hardening migration snippet: ${snippet}`);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Migrations OK: ${migrationFiles.length} SQL files checked.`);
