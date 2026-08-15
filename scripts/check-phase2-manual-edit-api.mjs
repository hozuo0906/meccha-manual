import { readFile } from "node:fs/promises";

const [baseRouter, editRouter, entrypoint, migration, contract, setup, workflow] = await Promise.all([
  readFile("apps/worker/src/manual-router.ts", "utf8"),
  readFile("apps/worker/src/manual-edit-router.ts", "utf8"),
  readFile("apps/worker/src/index-phase2.ts", "utf8"),
  readFile("supabase/migrations/202608140012_phase2_manual_edit_http_contract.sql", "utf8"),
  readFile("docs/05-api/phase2-manual-edit-api.md", "utf8"),
  readFile("docs/04-data/phase2-manual-core-setup.md", "utf8"),
  readFile(".github/workflows/manual-edit-api.yml", "utf8")
]);

const requiredBaseRouter = [
  "export class ManualError",
  "export function canonicalUuidSegment",
  "export async function readRequestJson",
  "MAX_JSON_BODY_BYTES = 64 * 1024",
  "export async function supabaseFetch",
  "export async function requireSession",
  "export async function booleanRpc",
  "export async function assertWorkspaceMember",
  '["POST", "PATCH", "PUT", "DELETE"]'
];

const requiredEditRouter = [
  "handleManualEditRoute",
  "/draft$",
  "/steps$",
  "/steps\\/reorder$",
  "update_manual_draft",
  "append_manual_step",
  "update_manual_step",
  "soft_delete_manual_step",
  "reorder_manual_steps",
  "MAX_MANUAL_DETAIL_JSON_BYTES = 6 * 1024 * 1024",
  "MAX_MANUAL_STEPS = 200",
  "MANUAL_STEPS_LIMIT_EXCEEDED",
  "requireInternalFields",
  "MANUAL_DRAFT_UPDATE_RESULT_UNKNOWN",
  "MANUAL_DRAFT_EDIT_CONFLICT",
  "MANUAL_DRAFT_VERSION_INVALID",
  "requiredExpectedDraftUpdatedAt",
  "expected_draft_revision_id: expectedDraftId",
  "expected_draft_updated_at: expectedUpdatedAt",
  "MANUAL_STEP_CREATE_RESULT_UNKNOWN",
  "MANUAL_STEP_UPDATE_RESULT_UNKNOWN",
  "MANUAL_STEP_EDIT_CONFLICT",
  "MANUAL_STEP_VERSION_INVALID",
  "requiredExpectedStepUpdatedAt",
  "expected_step_updated_at: expectedUpdatedAt",
  "MANUAL_STEP_DELETE_RESULT_UNKNOWN",
  "MANUAL_STEP_REORDER_RESULT_UNKNOWN",
  "suggestManualInstruction",
  "MANUAL_EDIT_FIELD_UNEXPECTED"
];

const requiredMigration = [
  "manual_revisions_description_length",
  "manual_steps_title_length",
  "manual_steps_title_nonblank",
  "manual_steps_instruction_length",
  "manual_steps_target_text_length",
  "manual_steps_target_text_nonblank",
  "manual_steps_url_length",
  "manual_steps_annotation_size",
  "manual_steps_masking_size",
  "manual step limit preflight failed",
  "manual_steps_active_limit_guard",
  "manual step limit exceeded",
  "create function public.update_manual_draft(",
  "expected_draft_revision_id uuid",
  "expected_draft_updated_at timestamptz",
  "manual draft changed concurrently",
  "for update;",
  "revoke insert, update, delete on table public.manuals from authenticated",
  "revoke insert, update, delete on table public.manual_revisions from authenticated",
  "grant execute on function public.update_manual_draft(uuid, uuid, timestamptz, text, text) to authenticated"
];

const requiredContract = [
  "GET /api/workspaces/{workspaceId}/manuals/{manualId}",
  "PATCH /api/workspaces/{workspaceId}/manuals/{manualId}/draft",
  "POST /api/workspaces/{workspaceId}/manuals/{manualId}/steps",
  "PATCH /api/workspaces/{workspaceId}/manuals/{manualId}/steps/{stepId}",
  "DELETE /api/workspaces/{workspaceId}/manuals/{manualId}/steps/{stepId}",
  "POST /api/workspaces/{workspaceId}/manuals/{manualId}/steps/reorder",
  "200 active steps",
  "64 KiB",
  "6 MiB",
  "MANUAL_DRAFT_EDIT_CONFLICT",
  "MANUAL_STEP_EDIT_CONFLICT",
  "`expectedUpdatedAt`",
  "202608140012_phase2_manual_edit_http_contract.sql",
  "入力値そのもの",
  "外部AI API"
];

const requiredWorkflow = [
  '"apps/worker/src/manual-edit-router.ts"',
  '"docs/05-api/phase2-manual-edit-api.md"',
  '"supabase/migrations/202608140012_phase2_manual_edit_http_contract.sql"',
  '"tests/manual-edit-api.test.mjs"',
  "phase2-manual-edit-http-fixture.sql",
  "phase2-manual-edit-http-test.sql",
  "test-phase2-manual-draft-locks.sh",
  "node scripts/check-phase2-manual-edit-api.mjs",
  "git diff --check \"origin/${GITHUB_BASE_REF}...HEAD\""
];

const errors = [];
for (const snippet of requiredBaseRouter) {
  if (!baseRouter.includes(snippet)) errors.push(`Missing shared manual HTTP boundary: ${snippet}`);
}
for (const snippet of requiredEditRouter) {
  if (!editRouter.includes(snippet)) errors.push(`Missing manual edit router contract: ${snippet}`);
}
for (const snippet of requiredMigration) {
  if (!migration.toLowerCase().includes(snippet.toLowerCase())) errors.push(`Missing manual edit migration contract: ${snippet}`);
}
for (const snippet of requiredContract) {
  if (!contract.includes(snippet)) errors.push(`Missing manual edit documentation contract: ${snippet}`);
}
for (const snippet of requiredWorkflow) {
  if (!workflow.includes(snippet)) errors.push(`Missing manual edit workflow contract: ${snippet}`);
}
if (!entrypoint.includes("handleManualEditRoute")) {
  errors.push("Phase 2 entrypoint does not dispatch manual edit routes");
}
if (!setup.includes("202608140012_phase2_manual_edit_http_contract.sql")) {
  errors.push("Accepted Phase 2 rollout omits manual edit HTTP migration");
}

const forbidden = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "service" + "_role",
  "openai",
  "anthropic",
  "browser binding",
  "wrangler deploy"
];
for (const snippet of forbidden) {
  if (`${editRouter}\n${migration}`.toLowerCase().includes(snippet.toLowerCase())) {
    errors.push(`Forbidden manual edit implementation dependency: ${snippet}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Phase 2 manual detail/edit HTTP API contracts OK.");
