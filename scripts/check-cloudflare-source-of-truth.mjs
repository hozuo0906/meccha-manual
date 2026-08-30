import { access, readFile } from "node:fs/promises";

const errors = [];

async function read(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    errors.push(`Missing Cloudflare source-of-truth file: ${path}`);
    return "";
  }
}

const required = new Map([
  ["AGENTS.md", [
    "対象DBのmigration", "データ／認可境界", "tenant越境・権限negative test",
    "D1 migration/schema", "Worker認可", "workspace固定query", "移行前Supabase/Postgres baselineを変更する場合だけ"
  ]],
  [".github/pull_request_template.md", [
    "対象DBのmigration", "D1 migration/schema", "workspace固定query",
    "移行前Supabase/Postgres baselineを変更した場合だけ"
  ]],
  [".github/workflows/phase1-readiness-gate.yml", [
    "name: Legacy Phase 1 Baseline Integrity", "Validate legacy Phase 1 baseline",
    "旧Phase 1 baseline整合検査", "実装着手の承認には使用できません"
  ]],
  ["docs/00-foundation/coding-guidelines.md", [
    "Durable ObjectsとD1の両方を同じ状態の正本にする。"
  ]],
  ["docs/01-product/product-requirements.md", [
    "Cloudflare AccessのメールOTP", "Access JWTの署名・issuer・audience・期限をWorkerが検証",
    "Worker認可とworkspace固定D1 query", "アプリ独自passwordは保存しない"
  ]],
  ["docs/01-product/non-functional-requirements.md", [
    "検証済みAccess主体", "workspace固定D1 query", "D1制約", "Access service token",
    "D1／R2はWorker bindingからのみ操作", "Cloudflare Access、D1、R2、Browser Run"
  ]],
  ["docs/03-architecture/adrs/ADR-0028-cloudflare-access-d1.md", [
    "access_user | service_token", "空の `sub`", "`common_name`",
    "not-beforeはclaimが存在する場合に検証", "nbfなしservice-token fixture",
    "ADR-0003", "ADR-0011", "ADR-0018", "ADR-0019", "ADR-0024", "ADR-0025", "ADR-0027"
  ]],
  ["docs/03-architecture/adrs/README.md", [
    "ADR-0019 | Superseded", "ADR-0028でD1へ更新", "ADR-0028でAccess/D1へ更新"
  ]],
  ["docs/03-architecture/auth-and-tenancy.md", [
    "Cloudflare Access", "access_user | service_token", "workspace固定D1 query", "Access到達やUI表示を認可根拠にしない",
    "空文字の `sub`、trim後非空の `common_name` の3条件すべて", "空の `sub` だけ"
  ]],
  ["docs/03-architecture/integrations.md", [
    "Access: メールOTP", "D1: application identity", "Legacy Supabase", "新規project、user、secret"
  ]],
  ["docs/04-data/d1-and-storage.md", [
    "Status: Accepted", "access_user | service_token", "subjectはtrim後非空", "workspace固定query"
  ]],
  ["docs/05-api/cloudflare-access-d1-api.md", [
    "Status: Accepted", "access_user | service_token", "503 MANUAL_MIGRATION_IN_PROGRESS", "service-token JWT",
    "not-beforeはclaimが存在する場合に検証", "nbfなしservice-token JWT",
    "空文字の `sub`、trim後非空の `common_name` の3条件すべて", "空の `sub` だけ"
  ]],
  ["docs/05-api/api-contracts.md", [
    "# API契約\n\nStatus: Accepted", "### Phase 1ハーネス\n\nStatus: Superseded",
    "### Accepted継続API索引\n\nStatus: Accepted", "### 将来の正式API\n\nStatus: Proposed",
    "課金API contract", "Business OS cloud runner契約", "Discord Interaction contract"
  ]],
  ["docs/07-quality/acceptance-catalog.md", [
    "workspace固定D1 query/constraint", "Access session/JWT", "D1 atomic operation/batch",
    "Access session終了導線", "Access cookieやrefresh tokenをアプリから操作しない", "認証世代"
  ]],
  ["docs/07-quality/test-strategy.md", [
    "Access JWT／Worker認可／D1 tenant", "移行前Postgres baselineを変更する場合だけ",
    "Access session終了導線", "refresh token交換やAccess cookie削除を行わない", "認証世代"
  ]],
  ["docs/08-operations/environment-variables.md", [
    "Issue #176 M5 staging immutable-preview検証用Access service token ID",
    "Issue #176 M5 immutable preview検証用Access service token 2件"
  ]],
  ["docs/09-delivery/cloudflare-migration-roadmap.md", [
    "503 MANUAL_MIGRATION_IN_PROGRESS", "M3状態をstaging合格または内部alpha合格として扱わない",
    "実行可能workflowをdefault branchから削除"
  ]],
  ["docs/09-delivery/decision-log.md", [
    "旧Web Lock", "認証世代が変わった後の古い応答を破棄", "Access cookie／refresh tokenをアプリから操作しない"
  ]]
]);

const forbidden = new Map([
  ["AGENTS.md", ["DB変更はmigration、テーブル定義、ERD/RLS方針", "テスト担当: 自動テスト、RLS negative test"]],
  [".github/pull_request_template.md", ["DB変更がある場合、テーブル定義、RLS方針、RLSテスト"]],
  ["docs/00-foundation/coding-guidelines.md", ["Durable ObjectsとPostgresの両方を同じ状態の正本にする。"]],
  ["docs/01-product/product-requirements.md", ["ユーザーはSupabase Authでログインできる", "権限ごとのCRUDがAPIとRLSで制御される"]],
  ["docs/01-product/non-functional-requirements.md", ["全テナントデータはRLSで分離する", "Supabase service role", "Supabaseは東京リージョン"]],
  ["docs/03-architecture/adrs/ADR-0003-durable-object-session-state.md", ["永続データの正本はSupabase Postgres"]],
  ["docs/03-architecture/adrs/ADR-0011-cloudflare-r2-file-storage.md", ["SupabaseはAuth、Postgres、RLS", "PostgresにはR2 object key", "WorkerはSupabase session"]],
  ["docs/03-architecture/adrs/ADR-0018-r2-bucket-binding-contract.md", ["Supabase PostgresはAuth", "WorkerはSupabase Auth session"]],
  ["docs/03-architecture/adrs/ADR-0024-domain-and-publication-boundary.md", ["Supabase production設定", "Supabase Site URL", "Supabaseのredirect allowlist"]],
  ["docs/03-architecture/adrs/ADR-0025-consent-based-member-join-codes.md", ["SECURITY DEFINER RPC", "RLS経由"]],
  ["docs/03-architecture/adrs/ADR-0027-prelaunch-repository-and-staging-boundary.md", ["staging Workerの `SUPABASE_URL`", "`SUPABASE_ANON_KEY` は承認済み", "production Supabase"]],
  ["docs/03-architecture/auth-and-tenancy.md", [
    "Supabase Authを使います", "API WorkerはSupabase JWT", "RLS: 最終防衛線",
    "空の `sub` または `common_name` を持つmachine actor"
  ]],
  ["docs/03-architecture/integrations.md", ["Postgres: 業務データ、ファイルメタデータ、監査ログの正本", "RLS: workspace単位", "SupabaseにはR2 object key"]],
  ["docs/04-data/storage-object-contract.md", ["## Postgresメタデータ", "認可時はPostgres正本", "WorkerはSupabase session"]],
  ["docs/05-api/api-contracts.md", ["# API契約\n\nStatus: Superseded"]],
  [".github/workflows/phase1-readiness-gate.yml", ["Phase 1着手前ゲートは通っています", "本番開発へ進めます"]],
  ["docs/05-api/browser-capture-foundation-api.md", ["将来の永続化はworkspace RLS"]],
  ["docs/06-security/security-and-privacy.md", ["- RLS抜け。"]],
  ["docs/07-quality/acceptance-catalog.md", [
    "Supabase REST", "access tokenとrefresh token", "APIとRLS",
    "WorkerのCookie削除レスポンス", "login/logoutは全タブ横断で直列化", "後発loginのCookieを削除しない"
  ]],
  ["docs/07-quality/test-strategy.md", [
    "- RLS negative test。", "共有URL、RLS、削除", "refreshは専用POSTと認証Web Lock"
  ]],
  ["docs/08-operations/browser-run-session-harness.md", ["Supabase Postgres/RLS", "API WorkerがSupabase session", "完了後の正本はPostgres"]],
  ["docs/08-operations/codex-cloud-environment.md", ["Cloudflare Worker、Supabase、Discord通知"]],
  ["docs/08-operations/domain-and-publication.md", ["production用Supabase", "Supabaseのproduction Site URL", "`SUPABASE_URL` / `SUPABASE_ANON_KEY`"]],
  ["docs/08-operations/observability-and-runbook.md", ["Supabase RLS denial rate", "Supabase障害:"]],
  ["docs/08-operations/r2-storage-harness.md", ["権限の正本はSupabase Auth", "Postgresメタデータ方針"]],
  ["docs/08-operations/environment-variables.md", ["RLS preview用"]],
  ["docs/09-delivery/decision-log.md", ["認証遷移を直列化し"]]
]);

const superseded = new Map([
  ["docs/03-architecture/adrs/ADR-0019-phase1-development-entry-gate.md", "M1〜M3"],
  ["docs/04-data/phase1-supabase-setup.md", "M1〜M5"],
  ["docs/04-data/phase2-manual-core-setup.md", "M4"],
  ["docs/05-api/phase2-manual-api.md", "M4"],
  ["docs/05-api/phase2-manual-edit-api.md", "M4"],
  ["docs/07-quality/phase2-smoke-test.md", "M4"],
  ["docs/07-quality/rls-negative-test.md", "M2/M3/M5"],
  ["docs/08-operations/cloud-harness.md", "M1〜M5"],
  ["docs/08-operations/db-migration-safety-harness.md", "M2/M4"],
  ["docs/08-operations/phase1-app-harness.md", "M1〜M3"],
  ["docs/08-operations/phase1-rls-live-gate.md", "M5"],
  ["docs/08-operations/phase2-manual-core-staging-alpha.md", "M4/M5"],
  ["docs/08-operations/remaining-harness-plan.md", "M0〜M7"],
  ["docs/09-delivery/phase1-entry-gate.md", "M1〜M3"]
]);

const paths = new Set([...required.keys(), ...forbidden.keys(), ...superseded.keys()]);
const contents = new Map();
await Promise.all([...paths].map(async (path) => contents.set(path, await read(path))));

for (const [path, terms] of required) {
  const content = contents.get(path) ?? "";
  for (const term of terms) if (!content.includes(term)) errors.push(`Missing Cloudflare source-of-truth term in ${path}: ${term}`);
}
for (const [path, terms] of forbidden) {
  const content = contents.get(path) ?? "";
  for (const term of terms) if (content.includes(term)) errors.push(`Active source retains retired Supabase instruction in ${path}: ${term}`);
}
for (const [path, successor] of superseded) {
  const head = (contents.get(path) ?? "").split(/\r?\n/).slice(0, 10).join("\n");
  for (const term of ["Status: Superseded", "実行禁止:", "ADR-0028", "Issue #176", successor]) {
    if (!head.includes(term)) errors.push(`Superseded baseline banner is incomplete in ${path}: ${term}`);
  }
}
for (const path of [".github/workflows/phase1-rls-live.yml", ".github/workflows/phase1-rls-live.yaml"]) {
  try {
    await access(path);
    errors.push(`Retired Supabase live workflow must not exist: ${path}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}


const apiContracts = contents.get("docs/05-api/api-contracts.md") ?? "";
const proposedStart = apiContracts.indexOf("### 将来の正式API");
const acceptedIndexStart = apiContracts.indexOf("### Accepted継続API索引", proposedStart);
if (proposedStart < 0 || acceptedIndexStart < 0) {
  errors.push("API contract must separate Proposed future APIs from the Accepted continuation index.");
} else {
  const proposedOnly = apiContracts.slice(proposedStart, acceptedIndexStart);
  for (const endpoint of [
    "POST /v1/manuals/{id}/exports",
    "POST /v1/workspaces/{workspaceId}/capture-sessions",
    "GET /v1/billing/summary",
    "POST /v1/billing/checkout-intents",
    "POST /v1/integrations/discord/interactions"
  ]) {
    if (proposedOnly.includes(endpoint)) errors.push(`Accepted API remains inside Proposed list: ${endpoint}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Cloudflare source-of-truth OK: active contracts use Access/Workers/D1/R2, legacy Supabase runbooks are fenced, and the live RLS workflow is absent.");
