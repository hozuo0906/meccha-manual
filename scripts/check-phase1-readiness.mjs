import { readFile } from "node:fs/promises";

const requiredFiles = [
  "docs/08-operations/phase1-app-harness.md",
  "docs/04-data/phase1-supabase-setup.md",
  "docs/07-quality/rls-negative-test.md",
  "docs/03-architecture/auth-and-tenancy.md",
  "docs/03-architecture/adrs/ADR-0010-worker-cookie-auth-harness.md",
  "docs/03-architecture/adrs/ADR-0019-phase1-development-entry-gate.md",
  "docs/09-delivery/phase1-entry-gate.md",
  "supabase/migrations/202608010001_phase1_identity_workspaces.sql",
  "supabase/migrations/202608010002_phase1_workspace_membership_hardening.sql",
  "supabase/migrations/202608100001_phase1_workspace_input_hardening.sql",
  "supabase/migrations/202608100002_phase1_member_management.sql",
  "scripts/rls-negative-test.mjs",
  "scripts/phase1-migration-bundle.mjs",
  "scripts/test-phase1-migration-bundle.mjs",
  "scripts/check-worker-bundle.mjs",
  "tests/worker-runtime.test.mjs",
  "tests/worker-runtime-mutation.test.mjs",
  "tests/e2e/phase1-flow.spec.mjs",
  "playwright.phase1.config.mjs",
  "tsconfig.worker.json",
  ".gitignore"
];

const requiredTerms = [
  "Supabase Auth",
  "ワークスペース",
  "HttpOnly",
  "SameSite=Lax",
  "create_workspace",
  "RLS negative test",
  "owner/admin/editor/viewer",
  "最後のowner",
  "ユーザー承認",
  "本番開発"
];

const forbiddenRuntimeSnippets = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_JWT_SECRET",
  "service_role"
];

const requiredWorkerSnippets = [
  "POST\" && url.pathname === \"/api/auth/login\"",
  "POST\" && url.pathname === \"/api/auth/refresh\"",
  "POST\" && url.pathname === \"/api/auth/logout\"",
  "GET\" && url.pathname === \"/api/session\"",
  "GET\" && url.pathname === \"/api/workspaces\"",
  "POST\" && url.pathname === \"/api/workspaces\"",
  "list_workspace_members",
  "create_workspace_join_code",
  "redeem_workspace_join_code",
  "POST\" && url.pathname === \"/api/member-join-code\"",
  "update_workspace_member",
  "/rest/v1/rpc/create_workspace",
  "HttpOnly",
  "SameSite=Lax",
  "verifySameOriginWrite(request)"
];

const errors = [];
const contents = {};

for (const file of requiredFiles) {
  try {
    contents[file] = await readFile(file, "utf8");
  } catch {
    errors.push(`Missing Phase 1 readiness file: ${file}`);
  }
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const worker = await readFile("apps/worker/src/index.ts", "utf8");
const appAssets = await readFile("apps/worker/src/app-assets.ts", "utf8");
const wrangler = await readFile("wrangler.jsonc", "utf8");
const combined = Object.values(contents).join("\n");

for (const term of requiredTerms) {
  if (!combined.includes(term)) {
    errors.push(`Missing Phase 1 readiness term: ${term}`);
  }
}

for (const snippet of requiredWorkerSnippets) {
  if (!worker.includes(snippet)) {
    errors.push(`Missing Phase 1 worker snippet: ${snippet}`);
  }
}

for (const snippet of forbiddenRuntimeSnippets) {
  if (worker.includes(snippet) || appAssets.includes(snippet) || wrangler.includes(snippet)) {
    errors.push(`Forbidden privileged runtime snippet found: ${snippet}`);
  }
}

if (!packageJson.scripts?.["test:rls"]) {
  errors.push("package.json must define test:rls.");
}

if (!packageJson.scripts?.["phase1-readiness:check"]) {
  errors.push("package.json must define phase1-readiness:check.");
}

if (!packageJson.scripts?.["migrations:check"]) {
  errors.push("package.json must define migrations:check.");
}

if (!packageJson.scripts?.["worker:check"]) {
  errors.push("package.json must define worker:check.");
}

if (!packageJson.scripts?.["worker:runtime:test"]) {
  errors.push("package.json must define worker:runtime:test.");
}

if (!packageJson.scripts?.["worker:typecheck"]) {
  errors.push("package.json must define worker:typecheck.");
}

if (!packageJson.scripts?.["worker:bundle:check"]) {
  errors.push("package.json must define worker:bundle:check.");
}

if (!packageJson.scripts?.["worker:runtime:mutation:test"]) {
  errors.push("package.json must define worker:runtime:mutation:test.");
}

if (!packageJson.scripts?.["phase1:e2e:test"]) {
  errors.push("package.json must define phase1:e2e:test.");
}

if (!packageJson.scripts?.["app:auth:test"]) {
  errors.push("package.json must define app:auth:test.");
}

if (!packageJson.scripts?.["phase1-migration:bundle"]) {
  errors.push("package.json must define phase1-migration:bundle.");
}

if (!packageJson.scripts?.["test:phase1-migration-bundle"]) {
  errors.push("package.json must define test:phase1-migration-bundle.");
}

if (!packageJson.scripts?.check?.includes("phase1-readiness:check")) {
  errors.push("npm run check must include phase1-readiness:check.");
}

for (const command of ["worker:typecheck", "worker:bundle:check", "worker:runtime:mutation:test"]) {
  if (!packageJson.scripts?.check?.includes(command)) {
    errors.push(`npm run check must include ${command}.`);
  }
}

const hardening = contents["supabase/migrations/202608010002_phase1_workspace_membership_hardening.sql"] || "";
for (const snippet of [
  "select target_user_id = auth.uid()",
  "create trigger workspaces_protect_identity",
  "owner role changes require a dedicated transfer flow",
  "workspace must keep at least one active owner",
  "new.created_by := auth.uid()",
  "revoke execute on function public.create_workspace(text, text) from public, anon"
]) {
  if (!hardening.includes(snippet)) {
    errors.push(`Missing Phase 1 hardening snippet: ${snippet}`);
  }
}

const inputHardening = contents["supabase/migrations/202608100001_phase1_workspace_input_hardening.sql"] || "";
for (const snippet of [
  "update public.workspaces",
  "left(public.normalize_workspace_name(name), 64)",
  "name = public.normalize_workspace_name(name)",
  "char_length(name) between 1 and 64",
  "workspace name must be between 1 and 64 characters",
  "workspace slug format is invalid",
  "normalized_slug text := lower(public.normalize_workspace_name(workspace_slug))"
]) {
  if (!inputHardening.includes(snippet)) {
    errors.push(`Missing Phase 1 input hardening snippet: ${snippet}`);
  }
}

const memberManagement = contents["supabase/migrations/202608100002_phase1_member_management.sql"] || "";
for (const snippet of [
  "profiles_display_name_length",
  "char_length(display_name) between 0 and 64",
  "bounded_display_name text := left(public.normalize_workspace_name(requested_display_name), 64)",
  "before insert or update or delete on public.workspace_members",
  "new.role = 'owner' and old.role <> 'owner'",
  "public.list_workspace_members",
  "public.create_workspace_join_code",
  "public.redeem_workspace_join_code",
  "public.workspace_join_codes",
  "public.audit_logs",
  "public.update_workspace_member",
  "set search_path = extensions, public, pg_temp",
  "create unique index workspace_join_codes_one_per_user",
  "on conflict (user_id) do update",
  "previous_status <> 'active' and target_status = 'active'",
  "previous_status in ('invited', 'removed') and previous_role <> 'owner'",
  "active_member_count >= 1000",
  "when wm.status = 'removed' then '利用停止済み'",
  "left join public.profiles p on p.id = wm.user_id and wm.status <> 'removed'",
  "revoke insert, update, delete on table public.workspace_members from authenticated",
  "MM_MEMBER_MANAGE_FORBIDDEN",
  "MM_OWNER_TRANSFER_REQUIRED"
]) {
  if (!memberManagement.includes(snippet)) {
    errors.push(`Missing Phase 1 member management snippet: ${snippet}`);
  }
}

const rlsNegativeTest = contents["scripts/rls-negative-test.mjs"] || "";
for (const snippet of [
  "assertEditorViewerRestrictions",
  "assertLastOwnerProtected",
  "assertCrossWorkspaceWritesRejected",
  "editorCannotManageWorkspaceOrMembers",
  "viewerCannotManageWorkspaceOrMembers",
  "ownerCannotRemoveOrDowngradeLastOwner",
  "adminCannotRemoveOrDowngradeLastOwner",
  "userACannotWriteUserBWorkspaceViaSupabaseRest",
  "userBCannotWriteUserAWorkspaceViaSupabaseRest",
  "membershipCreatedByForcedToActor",
  "assertDisplayNameContract",
  "displayNameUsesCodePointSafeBound",
  "assertInitialAuditContract",
  "auditActorActionResourceMetadataVerified",
  "idempotentMemberUpdateDoesNotDuplicateAudit",
  "auditWritesAreAppendOnlyForClients",
  "editorViewerCannotReadAudit",
  "assertMembershipTableWritesRevoked",
  "directMembershipTableWritesRevoked",
  "authenticatedCannotBypassWorkspaceInputContract",
  "assertCrossWorkspaceMemberApisRejected",
  "assertMemberManagementApis",
  "assertMemberMutationApisRejected",
  "adminCanUseMemberMutationApi",
  "assertRemovedMemberRequiresFreshJoinCode",
  "repeatedJoinCodeIssuanceReplacesPriorCode",
  "removedMemberRequiresFreshJoinCode",
  "removedMemberMutationRedactsProfile",
  "assertMemberAuditSequence",
  "memberApiRejectsLastOwnerRemoval"
]) {
  if (!rlsNegativeTest.includes(snippet)) {
    errors.push(`Missing executable Phase 1 RLS check: ${snippet}`);
  }
}

const readinessWorkflow = await readFile(".github/workflows/phase1-readiness-gate.yml", "utf8");
for (const command of [
  "npm run migrations:check",
  "npm run migration:safety:check",
  "npm run test:phase1-migration-bundle",
  "npm run secrets:check",
  "npm run worker:check",
  "npm run worker:typecheck",
  "npm run worker:bundle:check",
  "npm run worker:runtime:test",
  "npm run worker:runtime:mutation:test",
  "npm run app:auth:test",
  "npx --no-install playwright install --with-deps chromium",
  "npm run phase1:e2e:test",
  "node --experimental-strip-types --check apps/worker/src/index.ts",
  "node --experimental-strip-types --check apps/worker/src/app-assets.ts",
  "npm run phase1-readiness:check"
]) {
  if (!readinessWorkflow.includes(command)) {
    errors.push(`Phase 1 readiness workflow must run: ${command}`);
  }
}


for (const snippet of [
  "name: Legacy Phase 1 Baseline Integrity",
  "name: Validate legacy Phase 1 baseline",
  "name: Notify Discord about legacy baseline",
  "旧Phase 1 baseline整合検査",
  "Cloudflare移行、staging受入、実装着手の承認には使用できません"
]) {
  if (!readinessWorkflow.includes(snippet)) {
    errors.push(`Legacy Phase 1 baseline workflow is missing safe wording: ${snippet}`);
  }
}
for (const snippet of ["Phase 1着手前ゲートは通っています", "本番開発へ進めます"]) {
  if (readinessWorkflow.includes(snippet)) {
    errors.push(`Legacy Phase 1 baseline workflow retains misleading approval wording: ${snippet}`);
  }
}

const legacyEntryGate = contents["docs/09-delivery/phase1-entry-gate.md"] || "";
for (const term of ["Status: Superseded", "実行禁止:", "ADR-0028", "Issue #176", "M1〜M3"]) {
  if (!legacyEntryGate.includes(term)) {
    errors.push(`Superseded Phase 1 baseline banner is incomplete: ${term}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Phase 1 legacy Supabase baseline integrity OK; this is not a Cloudflare migration or staging acceptance gate.");
