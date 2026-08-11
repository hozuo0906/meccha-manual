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

const phase1HardeningFile = "202608010002_phase1_workspace_membership_hardening.sql";
const phase1InputHardeningFile = "202608100001_phase1_workspace_input_hardening.sql";
const phase1MemberManagementFile = "202608100002_phase1_member_management.sql";
const phase2SetupFile = "docs/04-data/phase2-manual-core-setup.md";
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
const requiredPhase1InputHardeningSnippets = [
  "constraint workspaces_name_length",
  "create or replace function public.normalize_workspace_name(workspace_name text)",
  "update public.workspaces",
  "left(public.normalize_workspace_name(name), 64)",
  "name = public.normalize_workspace_name(name)",
  "char_length(name) between 1 and 64",
  "normalized_name text := public.normalize_workspace_name(workspace_name)",
  "normalized_slug text := lower(public.normalize_workspace_name(workspace_slug))",
  "chr(160)",
  "chr(12288)",
  "workspace name must be between 1 and 64 characters",
  "workspace slug format is invalid",
  "revoke execute on function public.create_workspace(text, text) from public, anon",
  "grant execute on function public.create_workspace(text, text) to authenticated"
];
const requiredPhase1MemberManagementSnippets = [
  "constraint profiles_display_name_length",
  "left(public.normalize_workspace_name(display_name), 64)",
  "char_length(display_name) between 0 and 64",
  "bounded_display_name text := left(public.normalize_workspace_name(requested_display_name), 64)",
  "before insert or update or delete on public.workspace_members",
  "new.role = 'owner' and old.role <> 'owner'",
  "create or replace function public.list_workspace_members(target_workspace_id uuid)",
  "create table if not exists public.workspace_join_codes",
  "create table if not exists public.audit_logs",
  "create or replace function public.create_workspace_join_code()",
  "create or replace function public.redeem_workspace_join_code(",
  "create or replace function public.update_workspace_member(",
  "MM_WORKSPACE_MEMBERS_NOT_FOUND",
  "MM_MEMBER_MANAGE_FORBIDDEN",
  "MM_OWNER_TRANSFER_REQUIRED",
  "new.created_by := auth.uid()",
  "gen_random_bytes(32)",
  "set search_path = extensions, public, pg_temp",
  "create unique index workspace_join_codes_one_per_user",
  "on conflict (user_id) do update",
  "consumed_workspace_id = null",
  "previous_status = 'removed' and target_status = 'active'",
  "interval '10 minutes'",
  "revoke insert, update, delete on table public.workspace_members from authenticated",
  "revoke all on table public.workspace_join_codes from public, anon, authenticated",
  "grant execute on function public.list_workspace_members(uuid) to authenticated",
  "grant execute on function public.create_workspace_join_code() to authenticated",
  "grant execute on function public.redeem_workspace_join_code(uuid, text, public.workspace_role) to authenticated",
  "grant execute on function public.update_workspace_member(uuid, uuid, public.workspace_role, public.workspace_member_status) to authenticated"
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

if (migrationFiles.indexOf(phase1HardeningFile) >= migrationFiles.indexOf(phase2File)) {
  errors.push("Phase 1 hardening migration must sort before every Phase 2 migration.");
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

if (!migrationFiles.includes(phase1InputHardeningFile)) {
  errors.push(`Missing required migration: ${phase1InputHardeningFile}`);
} else {
  const phase1InputHardening = await readFile(path.join(migrationsDir, phase1InputHardeningFile), "utf8");
  for (const snippet of requiredPhase1InputHardeningSnippets) {
    if (!phase1InputHardening.includes(snippet)) {
      errors.push(`Missing Phase 1 input hardening migration snippet: ${snippet}`);
    }
  }
}

if (!migrationFiles.includes(phase1MemberManagementFile)) {
  errors.push(`Missing required migration: ${phase1MemberManagementFile}`);
} else {
  const phase1MemberManagement = await readFile(path.join(migrationsDir, phase1MemberManagementFile), "utf8");
  for (const snippet of requiredPhase1MemberManagementSnippets) {
    if (!phase1MemberManagement.includes(snippet)) {
      errors.push(`Missing Phase 1 member management migration snippet: ${snippet}`);
    }
  }
  for (const forbidden of ["add_workspace_member_by_email", "target_email"]) {
    if (phase1MemberManagement.includes(forbidden)) {
      errors.push(`Obsolete email member-add surface remains in Phase 1 migration: ${forbidden}`);
    }
  }
}

const phase2Setup = await readFile(phase2SetupFile, "utf8");
for (const prerequisite of [
  "202608010001_phase1_identity_workspaces.sql",
  phase1HardeningFile
]) {
  if (!phase2Setup.includes(prerequisite)) {
    errors.push(`Phase 2 setup must list prerequisite migration: ${prerequisite}`);
  }
}

const rlsNegativeTest = await readFile("scripts/rls-negative-test.mjs", "utf8");
for (const executableCheck of [
  "assertAnonymousRpcRejected",
  "code !== \"42501\"",
  "permission denied for function",
  "assertIdentityFieldsImmutable",
  "assertDisplayNameContract",
  "displayNameUsesCodePointSafeBound",
  "assertInitialAuditContract",
  "auditActorActionResourceMetadataVerified",
  "idempotentMemberUpdateDoesNotDuplicateAudit",
  "auditWritesAreAppendOnlyForClients",
  "editorViewerCannotReadAudit",
  "assertMembershipTableWritesRevoked",
  "directMembershipTableWritesRevoked",
  "ownerCannotMutateIdentityFields",
  "adminCannotMutateIdentityFields",
  "assertCrossWorkspaceMemberApisRejected",
  "assertMemberManagementApis",
  "assertMemberMutationApisRejected",
  "adminCanUseMemberMutationApi",
  "assertRemovedMemberRequiresFreshJoinCode",
  "repeatedJoinCodeIssuanceReplacesPriorCode",
  "removedMemberRequiresFreshJoinCode",
  "assertMemberAuditSequence",
  "memberApiRejectsLastOwnerRemoval"
]) {
  if (!rlsNegativeTest.includes(executableCheck)) {
    errors.push(`RLS negative test is missing executable hardening check: ${executableCheck}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Migrations OK: ${migrationFiles.length} SQL files checked.`);
