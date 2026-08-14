import { readFile, writeFile } from "node:fs/promises";

function replaceOnce(source, find, replacement, label) {
  const index = source.indexOf(find);
  if (index < 0) throw new Error(`Missing replacement target: ${label}`);
  if (source.indexOf(find, index + find.length) >= 0) {
    throw new Error(`Replacement target is not unique: ${label}`);
  }
  return `${source.slice(0, index)}${replacement}${source.slice(index + find.length)}`;
}

function replaceIfNeeded(source, find, replacement, label) {
  if (source.includes(replacement)) return source;
  return replaceOnce(source, find, replacement, label);
}

let router = await readFile("apps/worker/src/manual-router.ts", "utf8");
router = replaceIfNeeded(
  router,
  "interface ManualEnv extends SupabaseBindings {}",
  "export interface ManualEnv extends SupabaseBindings {}",
  "ManualEnv export"
);
router = replaceIfNeeded(
  router,
  "const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;",
  `export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function canonicalUuidSegment(segment: string): string | null {
  try {
    const canonical = decodeURIComponent(segment).toLowerCase();
    return UUID_PATTERN.test(canonical) ? canonical : null;
  } catch {
    return null;
  }
}`,
  "canonical UUID helper"
);
router = replaceIfNeeded(
  router,
  "const MAX_MANUAL_TITLE_LENGTH = 64;",
  "export const MAX_MANUAL_TITLE_LENGTH = 64;",
  "manual title limit export"
);
for (const [find, replacement, label] of [
  ["class ManualError extends Error", "export class ManualError extends Error", "ManualError export"],
  ["function jsonResponse(body: unknown, status = 200): Response", "export function jsonResponse(body: unknown, status = 200): Response", "jsonResponse export"],
  ["function errorResponse(error: unknown): Response", "export function errorResponse(error: unknown): Response", "errorResponse export"],
  ["function verifySameOriginWrite(request: Request): void", "export function verifySameOriginWrite(request: Request): void", "same-origin helper export"],
  ["async function readJsonLimited(\n", "export async function readJsonLimited(\n", "response reader export"],
  ["async function readRequestJson(request: Request): Promise<Record<string, unknown>>", "export async function readRequestJson(request: Request): Promise<Record<string, unknown>>", "request reader export"],
  ["async function supabaseFetch(\n", "export async function supabaseFetch(\n", "Supabase fetch export"],
  ["async function cancelUnreadResponseBody(response: Response): Promise<void>", "export async function cancelUnreadResponseBody(response: Response): Promise<void>", "response cancel export"],
  ["async function requireSession(request: Request, env: ManualEnv): Promise<{ userId: string; accessToken: string }>", "export async function requireSession(request: Request, env: ManualEnv): Promise<{ userId: string; accessToken: string }>", "session helper export"],
  ["async function booleanRpc(\n", "export async function booleanRpc(\n", "boolean RPC export"],
  ["async function assertWorkspaceMember(\n", "export async function assertWorkspaceMember(\n", "membership helper export"]
]) {
  router = replaceIfNeeded(router, find, replacement, label);
}
router = replaceIfNeeded(
  router,
  '  if (request.method !== "POST") return;',
  '  if (!["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) return;',
  "all write methods same-origin boundary"
);
router = replaceIfNeeded(
  router,
  `    let workspaceId: string;
    try {
      workspaceId = decodeURIComponent(match[1]).toLowerCase();
    } catch {
      throw new ManualError(404, "MANUALS_NOT_FOUND", "指定された手順書領域が見つかりません。");
    }
    if (!UUID_PATTERN.test(workspaceId)) {
      throw new ManualError(404, "MANUALS_NOT_FOUND", "指定された手順書領域が見つかりません。");
    }`,
  `    const workspaceId = canonicalUuidSegment(match[1]);
    if (!workspaceId) {
      throw new ManualError(404, "MANUALS_NOT_FOUND", "指定された手順書領域が見つかりません。");
    }`,
  "base manual canonical UUID use"
);
router = replaceIfNeeded(
  router,
  "export type { ManualEnv, ManualSummary };",
  "export type { ManualSummary };",
  "final type export"
);
await writeFile("apps/worker/src/manual-router.ts", router, "utf8");

let entrypoint = await readFile("apps/worker/src/index-phase2.ts", "utf8");
entrypoint = replaceIfNeeded(
  entrypoint,
  'import { handleManualRoute, type ManualEnv } from "./manual-router.ts";',
  'import { handleManualEditRoute } from "./manual-edit-router.ts";\nimport { handleManualRoute, type ManualEnv } from "./manual-router.ts";',
  "manual edit route import"
);
entrypoint = replaceIfNeeded(
  entrypoint,
  `  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const manualResponse = await handleManualRoute(request, env);`,
  `  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const manualEditResponse = await handleManualEditRoute(request, env);
    if (manualEditResponse) return manualEditResponse;
    const manualResponse = await handleManualRoute(request, env);`,
  "manual edit route dispatch"
);
await writeFile("apps/worker/src/index-phase2.ts", entrypoint, "utf8");

let setup = await readFile("docs/04-data/phase2-manual-core-setup.md", "utf8");
setup = replaceIfNeeded(
  setup,
  `supabase/migrations/202608020001_phase2_manual_core.sql
supabase/migrations/202608020002_phase2_manual_create_context_fix.sql
supabase/migrations/202608140005_phase2_manual_title_length.sql`,
  `supabase/migrations/202608020001_phase2_manual_core.sql
supabase/migrations/202608020002_phase2_manual_create_context_fix.sql
supabase/migrations/202608140005_phase2_manual_title_length.sql
supabase/migrations/202608140010_phase2_manual_step_mutations.sql
supabase/migrations/202608140012_phase2_manual_edit_http_contract.sql`,
  "Phase 2 migration rollout list"
);
setup = replaceIfNeeded(
  setup,
  "`202608140005_phase2_manual_title_length.sql` は、`manuals.title` と `manual_revisions.title` のraw長を1〜64文字へ固定し、ECMAScript `trim()`相当後に空白だけとなる値を拒否するforward migrationである。既存行を切り詰めたり正規化したりせず、互換性のない既存データがある場合はconstraint validationを失敗させて安全に停止する。",
  "`202608140005_phase2_manual_title_length.sql` は、`manuals.title` と `manual_revisions.title` のraw長を1〜64文字へ固定し、ECMAScript `trim()`相当後に空白だけとなる値を拒否するforward migrationである。既存行を切り詰めたり正規化したりせず、互換性のない既存データがある場合はconstraint validationを失敗させて安全に停止する。\n\n`202608140010_phase2_manual_step_mutations.sql` は、4つのstep mutation RPCを同じdraft revision lockへ統一し、authenticatedの直接step DMLを閉じる。\n\n`202608140012_phase2_manual_edit_http_contract.sql` は、draft metadataの原子的更新RPC、本文フィールド上限、manual/revisionのauthenticated direct write revokeを追加する。既存行を加工せず、上限違反があればconstraint validationで停止する。",
  "Phase 2 edit migration descriptions"
);
setup = replaceIfNeeded(
  setup,
  "- `create_manual_draft(manual_id)`\n- `manuals.title` と `manual_revisions.title` のraw 1〜64文字・ECMAScript空白のみ拒否DB制約",
  "- `create_manual_draft(manual_id)`\n- `update_manual_draft(manual_id, title, description)`\n- `append_manual_step` / `update_manual_step` / `soft_delete_manual_step` / `reorder_manual_steps`\n- `manuals.title` と `manual_revisions.title` のraw 1〜64文字・ECMAScript空白のみ拒否DB制約\n- draft descriptionとstep本文フィールドの上限DB制約",
  "Phase 2 edit scope"
);
setup = replaceIfNeeded(
  setup,
  "- 手順書の公開状態、現在の下書き、現在の公開版はRPC以外で変更しない。",
  "- 手順書の公開状態、現在の下書き、現在の公開版はRPC以外で変更しない。\n- manual作成、draft metadata更新、step mutationはSECURITY DEFINER RPCだけを利用し、authenticated direct DMLを許可しない。\n- 詳細APIは200 active steps、6 MiBを上限とし、本文フィールド上限をDBとWorkerで一致させる。",
  "Phase 2 edit rules"
);
setup = replaceIfNeeded(
  setup,
  `7. 既存の \`manuals.title\` と \`manual_revisions.title\` に65文字以上、またはECMAScript \`trim()\`相当後に空となる行がないことを確認する。
8. \`supabase/migrations/202608140005_phase2_manual_title_length.sql\` の全文を貼り、\`Run\` を押す。
9. migration履歴とconstraint名を確認し、後述のRLS回帰テストを実行する。`,
  `7. 既存の \`manuals.title\` と \`manual_revisions.title\` に65文字以上、またはECMAScript \`trim()\`相当後に空となる行がないことを確認する。
8. \`supabase/migrations/202608140005_phase2_manual_title_length.sql\` の全文を貼り、\`Run\` を押す。
9. \`supabase/migrations/202608140010_phase2_manual_step_mutations.sql\` の適用前に、step mutationを利用する全clientがRPC経由へ切替済みであることを確認する。
10. \`supabase/migrations/202608140010_phase2_manual_step_mutations.sql\` の全文を貼り、\`Run\` を押す。
11. description 10,000文字超、step title 128文字超、instruction 4,000文字超、target 256文字超、URL 2,048文字超の既存行がないことを確認する。
12. \`supabase/migrations/202608140012_phase2_manual_edit_http_contract.sql\` の全文を貼り、\`Run\` を押す。
13. migration履歴、constraint、function権限を確認し、後述のRLS/RPC回帰テストを実行する。`,
  "Phase 2 edit manual rollout steps"
);
setup = replaceIfNeeded(
  setup,
  "- `manual_revisions_title_nonblank`",
  "- `manual_revisions_title_nonblank`\n- `manual_revisions_description_length`\n- `manual_steps_title_length` / `manual_steps_title_nonblank`\n- `manual_steps_instruction_length`\n- `manual_steps_target_text_length` / `manual_steps_target_text_nonblank`\n- `manual_steps_url_length`",
  "Phase 2 edit expected constraints"
);
setup = replaceIfNeeded(
  setup,
  "- draft revisionの手順ステップは追加・更新・削除できる。",
  "- `update_manual_draft`はmanual titleとcurrent draft title/descriptionを同じtransactionで更新する。\n- authenticatedはmanual/revision/stepを直接変更できず、editorは承認済みRPC経由で変更できる。\n- draft revisionの手順ステップは追加・更新・soft delete・並べ替えできる。\n- viewer、anon、別workspaceはmutation RPCを実行できない。\n- 200 active stepsと本文フィールド上限を超える入力・応答を拒否する。",
  "Phase 2 edit verification plan"
);
setup = replaceIfNeeded(
  setup,
  "リポジトリでは `tests/sql/phase2-manual-title-fixture.sql`、`tests/sql/phase2-manual-title-test.sql` と `Manual API` workflowが、使い捨てPostgresへ実migrationを適用してタイトル制約を検証する。",
  "リポジトリではタイトル境界に加え、`tests/sql/phase2-manual-edit-http-fixture.sql`、`tests/sql/phase2-manual-edit-http-test.sql` と `Manual Edit API` workflowが、使い捨てPostgresへstep/draft migrationを実適用してRPC・権限・上限を検証する。",
  "Phase 2 edit verification harness"
);
await writeFile("docs/04-data/phase2-manual-core-setup.md", setup, "utf8");

let definitions = await readFile("docs/04-data/table-definitions.md", "utf8");
definitions = replaceIfNeeded(
  definitions,
  "| `manuals` | `workspace_id`, `folder_id`, `title`, `status`, `current_draft_revision_id`, `current_published_revision_id`, `owner_id`, `archived_at` | メンバー閲覧、editor以上で変更。raw `title`は`char_length(title) between 1 and 64`、かつECMAScript `trim()`相当後に空でないことを`manuals_title_length`と`manuals_title_nonblank`でdirect authenticated writeにも強制 |",
  "| `manuals` | `workspace_id`, `folder_id`, `title`, `status`, `current_draft_revision_id`, `current_published_revision_id`, `owner_id`, `archived_at` | メンバー閲覧。作成・draft metadata・公開状態変更はSECURITY DEFINER RPCのみ。raw `title`は1〜64文字、ECMAScript `trim()`相当後に空でないことをDBで強制し、authenticated direct writeをrevoke |",
  "manual table edit boundary"
);
definitions = replaceIfNeeded(
  definitions,
  "| `manual_revisions` | `workspace_id`, `manual_id`, `revision_no`, `state`, `title`, `description`, `source_url`, `cover_asset_id`, `published_at` | 下書きはeditor以上、公開版は不変。raw `title`は`char_length(title) between 1 and 64`、かつECMAScript `trim()`相当後に空でないことを`manual_revisions_title_length`と`manual_revisions_title_nonblank`で強制 |",
  "| `manual_revisions` | `workspace_id`, `manual_id`, `revision_no`, `state`, `title`, `description`, `source_url`, `cover_asset_id`, `published_at` | メンバー閲覧、公開版は不変。draft更新・作成・公開はRPCのみ。titleは1〜64文字・空白のみ拒否、descriptionは10,000文字以内をDBで強制し、authenticated direct writeをrevoke |",
  "manual revision edit boundary"
);
definitions = replaceIfNeeded(
  definitions,
  "| `manual_steps` | `workspace_id`, `revision_id`, `position`, `type`, `title`, `instruction`, `action_type`, `target_text`, `url`, `asset_id`, `annotation`, `masking` | revision権限を継承、公開版更新禁止 |",
  "| `manual_steps` | `workspace_id`, `revision_id`, `position`, `type`, `title`, `instruction`, `action_type`, `target_text`, `url`, `asset_id`, `annotation`, `masking` | メンバー閲覧、公開版更新禁止。authenticated direct DMLをrevokeし、同じdraft revision lockを取る4 RPCだけで変更。title 128、instruction 4,000、target 256、URL 2,048文字以内をDBで強制 |",
  "manual step edit boundary"
);
await writeFile("docs/04-data/table-definitions.md", definitions, "utf8");

let decisionLog = await readFile("docs/09-delivery/decision-log.md", "utf8");
if (!decisionLog.includes("| DEC-052 |")) {
  const row = "| DEC-052 | 2026-08-14 | 手順書詳細は200 active steps・6 MiB、draft description 10,000文字、step title 128文字、instruction 4,000文字、target 256文字、URL 2,048文字を上限とし、manual/revision/stepのwriteはSECURITY DEFINER RPCへ集約する | 有効なデータだけで詳細APIのbuffer上限を超えるDoSと、複数tableの部分更新・Worker境界迂回を同時に防ぐため |\n";
  const match = decisionLog.match(/\| DEC-051 \|[^\n]*\n/);
  if (!match) throw new Error("Missing DEC-051 insertion anchor");
  decisionLog = decisionLog.replace(match[0], `${match[0]}${row}`);
}
await writeFile("docs/09-delivery/decision-log.md", decisionLog, "utf8");

let traceability = await readFile("docs/01-product/requirements-traceability.md", "utf8");
traceability = replaceIfNeeded(
  traceability,
  "| FR-004 | SCR-MANUAL-EDITOR | `GET/POST /api/workspaces/{id}/manuals`, manual detail/draft APIs | manuals, manual_revisions, manual_steps | ADR-0006 | `tests/manual-api.test.mjs`, #64 manual edit tests, AC-010 | #63, #64, EPIC-06 |",
  "| FR-004 | SCR-MANUAL-EDITOR | `GET/POST /api/workspaces/{id}/manuals`, manual detail/draft APIs | manuals, manual_revisions, manual_steps | ADR-0006 | `tests/manual-api.test.mjs`, `tests/manual-edit-api.test.mjs`, AC-010 | #63, #64, #74, EPIC-06 |",
  "FR-004 HTTP edit traceability"
);
traceability = replaceIfNeeded(
  traceability,
  "| FR-005 | SCR-MANUAL-EDITOR | manual step append/update/delete/reorder APIs | manual_steps | ADR-0006 | #64 manual edit tests | #64, EPIC-06 |",
  "| FR-005 | SCR-MANUAL-EDITOR | manual step append/update/delete/reorder APIs | manual_steps | ADR-0006 | `tests/manual-edit-api.test.mjs`, step RPC/RLS/lock SQL tests | #64, #74, EPIC-06 |",
  "FR-005 HTTP edit traceability"
);
traceability = replaceIfNeeded(
  traceability,
  "| FR-006 | SCR-MANUAL-EDITOR | local instruction suggestion only; external APIなし | - | ADR-0009 | `tests/manual-instruction-template.test.mjs`, #64 manual edit tests | #64, EPIC-06 |",
  "| FR-006 | SCR-MANUAL-EDITOR | local instruction suggestion only; external APIなし | - | ADR-0009 | `tests/manual-instruction-template.test.mjs`, `tests/manual-edit-api.test.mjs` | #64, #74, EPIC-06 |",
  "FR-006 HTTP edit traceability"
);
traceability = replaceIfNeeded(
  traceability,
  "- Issue #64のAccepted API契約は `docs/05-api/phase2-manual-edit-api.md` を正とする。",
  "- Issue #64/#74のAccepted API契約は `docs/05-api/phase2-manual-edit-api.md` を正とする。",
  "manual edit issue source of truth"
);
await writeFile("docs/01-product/requirements-traceability.md", traceability, "utf8");
