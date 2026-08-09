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
  "scripts/rls-negative-test.mjs",
  "scripts/phase1-migration-bundle.mjs",
  "scripts/test-phase1-migration-bundle.mjs",
  "tests/worker-runtime.test.mjs",
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
  "authenticatedCannotBypassWorkspaceInputContract"
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
  "npm run worker:runtime:test",
  "npm run app:auth:test",
  "node --experimental-strip-types --check apps/worker/src/index.ts",
  "node --experimental-strip-types --check apps/worker/src/app-assets.ts",
  "npm run phase1-readiness:check"
]) {
  if (!readinessWorkflow.includes(command)) {
    errors.push(`Phase 1 readiness workflow must run: ${command}`);
  }
}

if (!contents["docs/09-delivery/phase1-entry-gate.md"]?.includes("Status: Ready for owner approval")) {
  errors.push("Phase 1 entry gate must be ready for owner approval, not approved implicitly.");
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Phase 1 readiness gate OK.");
