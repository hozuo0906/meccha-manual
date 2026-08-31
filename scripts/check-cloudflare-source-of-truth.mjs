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
  ["docs/03-architecture/adrs/ADR-0007-stripe-webhook-source-of-truth.md", [
    "署名対象timestampを副作用なしで検証", "receiptと再実行可能なreconciliation work/outbox",
    "received/processing/retryable/reconcile_required/completed/dead_letter", "結果不明は照合前に自動再送しない"
  ]],
  ["docs/03-architecture/adrs/ADR-0012-discord-issue-bridge.md", [
    "署名対象timestampを副作用なしで検証", "有界parse/schema検証", "receiptと再実行可能なIssue work/outbox",
    "lease付き`processing`", "reconcile_required", "同じinteraction ID・同じpayload digest",
    "単独のreplay guard正本にしない", "OQ-031"
  ]],
  ["docs/03-architecture/adrs/ADR-0022-free-first-stripe-billing.md", [
    "署名対象timestampを副作用なしで検証", "receiptと再実行可能なreconciliation work/outbox",
    "received/processing/retryable/reconcile_required/completed/dead_letter", "同じID・異なるdigestは拒否"
  ]],
  ["docs/03-architecture/adrs/ADR-0028-cloudflare-access-d1.md", [
    "access_user | service_token", "空の `sub`", "`common_name`",
    "not-beforeはclaimが存在する場合に検証", "nbfなしservice-token fixture",
    "External provider callback boundary", "path別Access Bypass", "hostname全体、共通prefix、wildcard pathへBypassを適用しない",
    "receiptと再実行可能なwork/outboxを単一のatomic operation", "guard commit成功後だけproviderへ成功応答",
    "lease付き`processing`", "`reconcile_required`", "`dead_letter`", "同じID・異なるpayload digest", "lease_generation", "fencing token", "latest `lease_generation`", "CAS", "旧owner",
    "受理済みworkを黙って失わない", "path別Access Bypassを有効化しない",
    "ADR-0003", "ADR-0011", "ADR-0018", "ADR-0019", "ADR-0024", "ADR-0025", "ADR-0027",
    "Migration compatibility floor", "code-only rollback", "forward-fix", "fail closed"
  ]],
  ["docs/03-architecture/adrs/README.md", [
    "ADR-0019 | Superseded", "ADR-0028でD1へ更新", "ADR-0028でAccess/D1へ更新"
  ]],
  ["docs/03-architecture/auth-and-tenancy.md", [
    "Cloudflare Access", "access_user | service_token", "workspace固定D1 query", "Access到達やUI表示を認可根拠にしない",
    "空文字の `sub`、trim後非空の `common_name` の3条件すべて", "空の `sub` だけ",
    "External provider callback", "path別Access Bypass", "receiptと再実行可能なwork/outbox",
    "received/processing/retryable/reconcile_required/completed/dead_letter", "通常ブラウザwrite APIだけに同一Origin"
  ]],
  ["docs/03-architecture/integrations.md", [
    "Access: メールOTP", "D1: application identity", "Legacy Supabase", "新規project、user、secret",
    "Stripe/Discord callback", "receiptと再実行可能なwork/outbox", "結果不明は照合前に自動再送せず",
    "既存Discord KV get→putはauthoritative guardにせず", "callbackでは`Origin`を認証根拠にしない"
  ]],
  ["docs/04-data/d1-and-storage.md", [
    "Status: Accepted", "access_user | service_token", "subjectはtrim後非空", "workspace固定query",
    "Provider callback replay境界", "単一のatomic guard operation", "再実行に必要な最小workまたはdurable outbox参照",
    "lease付き`processing`", "`reconcile_required`", "`dead_letter`", "受理済みworkを黙って失わない", "OQ-031", "lease_generation", "compatibility floor", "forward-fix", "code-only rollback"
  ]],
  ["docs/05-api/cloudflare-access-d1-api.md", [
    "Status: Accepted", "access_user | service_token", "503 MANUAL_MIGRATION_IN_PROGRESS", "service-token JWT",
    "not-beforeはclaimが存在する場合に検証", "nbfなしservice-token JWT",
    "空文字の `sub`、trim後非空の `common_name` の3条件すべて", "空の `sub` だけ",
    "External provider callback", "receiptと再実行可能なwork/outboxを単一のatomic operation",
    "guard commit成功後だけproviderへ成功応答", "lease付き`processing`", "`reconcile_required`", "`dead_letter`",
    "通常のブラウザ状態変更APIは同一origin", "path別Access Bypassを有効化しない"
  ]],
  ["docs/05-api/api-contracts.md", [
    "# API契約", "Status: Accepted", "### Phase 1ハーネス", "Status: Superseded",
    "### Accepted継続API索引", "### 将来の正式API", "Status: Proposed",
    "`GET /health/config`", "`service_token` actorだけを許可", "Access JWTなし・不正・`access_user` actorを拒否",
    "path別Access Bypassは到達経路に限る", "receiptと再実行可能なwork/outboxを単一のatomic operation",
    "guard commit成功後だけproviderへ成功応答", "received", "reconcile_required", "dead_letter",
    "課金API contract", "Business OS cloud runner契約", "Discord Interaction contract"
  ]],
  ["docs/07-quality/acceptance-catalog.md", [
    "workspace固定D1 query/constraint", "Access session/JWT", "D1 atomic operation/batch",
    "Access session終了導線", "Access cookieやrefresh tokenをアプリから操作しない", "認証世代",
    "AC-018", "AC-019", "AC-027", "receiptと再実行可能なwork/outbox",
    "received/processing/retryable/reconcile_required/completed/dead_letter", "受理済みworkを黙って失わず",
    "`Origin`をcallback認証に使わない", "path別Access Bypassを有効化しない"
  ]],
  ["docs/07-quality/test-strategy.md", [
    "Access JWT／Worker認可／D1 tenant", "移行前Postgres baselineを変更する場合だけ",
    "Access session終了導線", "refresh token交換やAccess cookie削除を行わない", "認証世代",
    "Access callback境界", "receiptと再実行可能なwork/outbox", "processing lease期限",
    "結果不明照合", "KV get→putだけでは原子性合格にせず", "path別Access Bypassを有効化しない"
  ]],
  ["docs/08-operations/domain-and-publication.md", [
    "Access session CookieはCloudflare Accessが管理", "Access Cookieや独自access/refresh tokenを発行・更新・削除しない",
    "path別Access Bypass application", "hostname全体、共通prefix、wildcard pathへBypassを適用しない",
    "receiptと再実行可能なwork/outbox", "結果不明は照合前に自動再送せず",
    "通常のブラウザwrite APIはアプリ自身のOriginだけ", "`Origin`の有無や値を認証根拠にせず",
    "通常アプリAPIはAccess user用application", "`GET /health/config`はservice-token用Access application/policy"
  ]],
  ["docs/08-operations/environment-variables.md", [
    "Issue #176 M5 staging immutable-preview検証用Access service token ID",
    "Issue #176 M5 immutable preview検証用Access service token 2件",
    "authoritative replay guardには使わず", "atomic receipt/work commit後の短期応答cache",
    "OQ-031／Issue #176 M2", "path別Access Bypassを有効化しない"
  ]],
  ["docs/08-operations/discord-reporting-and-command-bridge.md", [
    "exact POSTとbody上限", "署名対象 `x-signature-timestamp` を副作用なしで検証",
    "有界parse/schema検証", "receiptと再実行可能なIssue work/outbox",
    "guard commit成功後だけDiscordへ3秒以内にdeferred", "lease付き`processing`",
    "`reconcile_required`", "`dead_letter`", "authoritative replay guardではなく",
    "OQ-031", "path別Access Bypassを有効化しない"
  ]],
  ["docs/08-operations/phase1-rls-live-gate.md", [
    "Status: Accepted", ".github/workflows/phase1-rls-live.yml", "Issue #176 M5", "同じrollback単位", "現行Accepted live gate"
  ]],
  ["docs/08-operations/stripe-billing-harness.md", [
    "exact POSTとbody上限", "署名対象timestamp", "副作用なしで検証", "有界parse/schema検証",
    "receiptと再実行可能なreconciliation work/outbox", "guard commit成功後だけStripeへ2xx",
    "lease付き`processing`", "`reconcile_required`", "`dead_letter`", "受理済みeventを黙って失わない"
  ]],
  ["docs/09-delivery/cloudflare-migration-roadmap.md", [
    "503 MANUAL_MIGRATION_IN_PROGRESS", "M3状態をstaging合格または内部alpha合格として扱わない",
    "現行AcceptedのSupabase RLS live gate workflow", "OQ-031を解決", "receiptと再実行可能なwork/outbox",
    "processing lease期限", "結果不明", "既存Discord KV get→putを単独のreplay guard正本にしない",
    "compatibility floor", "code-only rollback", "fail-closed/forward-fix", "選択的rollback rehearsal"
  ]],
  ["docs/09-delivery/decision-log.md", [
    "旧Web Lock", "認証世代が変わった後の古い応答を破棄", "Access cookie／refresh tokenをアプリから操作しない",
    "path別Access Bypass", "通常アプリAPIと`GET /health/config`はAccess保護を維持",
    "receiptと再実行可能なwork/outbox", "received/processing/retryable/reconcile_required/completed/dead_letter",
    "結果不明は照合前に自動再送せず", "OQ-031をM2で解決"
  ]],
  ["docs/09-delivery/open-questions.md", [
    "OQ-031", "Issue #176 M2", "receiptと再実行可能なwork/outbox",
    "received/processing/retryable/reconcile_required/completed/dead_letter",
    "既存Discord KV get→putだけでは合格にせず", "path別Access Bypassを有効化しない"
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
  ["docs/03-architecture/adrs/ADR-0022-free-first-stripe-billing.md", [
    "`stripe_event_id` の一意制約で重複を拒否する"
  ]],
  ["docs/03-architecture/adrs/ADR-0028-cloudflare-access-d1.md", [
    "replayは予約時にfail closedで拒否", "provider event/interaction IDをauthoritative replay/idempotency storeへ原子的に予約"
  ]],
  ["docs/05-api/cloudflare-access-d1-api.md", [
    "replayは予約時に拒否", "authoritative storeへの原子的予約、Queue"
  ]],
  ["docs/03-architecture/auth-and-tenancy.md", [
    "新規予約に成功したrequestだけ",
    "Supabase Authを使います", "API WorkerはSupabase JWT", "RLS: 最終防衛線",
    "空の `sub` または `common_name` を持つmachine actor"
  ]],
  ["docs/03-architecture/integrations.md", ["Postgres: 業務データ、ファイルメタデータ、監査ログの正本", "RLS: workspace単位", "SupabaseにはR2 object key"]],
  ["docs/04-data/storage-object-contract.md", ["## Postgresメタデータ", "認可時はPostgres正本", "WorkerはSupabase session"]],
  ["docs/05-api/api-contracts.md", ["# API契約\n\nStatus: Superseded", "新規予約に成功", "単独のreplay guard正本にせず、予約後"]],
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
  ["docs/08-operations/domain-and-publication.md", [
    "production用Supabase", "Supabaseのproduction Site URL", "`SUPABASE_URL` / `SUPABASE_ANON_KEY`",
    "`__Host-mm_access`", "`__Host-mm_refresh`"
  ]],
  ["docs/08-operations/observability-and-runbook.md", ["Supabase RLS denial rate", "Supabase障害:"]],
  ["docs/08-operations/r2-storage-harness.md", ["権限の正本はSupabase Auth", "Postgresメタデータ方針"]],
  ["docs/08-operations/environment-variables.md", [
    "RLS preview用", "Discord interaction IDの短期replay防止KV binding",
    "`DISCORD_INTERACTION_STORE` KV bindingを設定し、同じDiscord interaction IDから重複Issueを作らない"
  ]],
  ["docs/08-operations/discord-reporting-and-command-bridge.md", [
    "`DISCORD_INTERACTION_STORE` でinteraction IDを短期保存し、同じDiscord requestから重複Issueを作らない"
  ]],
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
  for (const term of terms) if (content.includes(term)) errors.push(`Active source contains a forbidden legacy or unsafe term in ${path}: ${term}`);
}
for (const [path, successor] of superseded) {
  const head = (contents.get(path) ?? "").split(/\r?\n/).slice(0, 10).join("\n");
  for (const term of ["Status: Superseded", "実行禁止:", "ADR-0028", "Issue #176", successor]) {
    if (!head.includes(term)) errors.push(`Superseded baseline banner is incomplete in ${path}: ${term}`);
  }
}
try {
  await access(".github/workflows/phase1-rls-live.yml");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  errors.push("Accepted Phase 1 RLS live gate is missing before the Issue #176 M5 replacement gate lands.");
}
try {
  await access(".github/workflows/phase1-rls-live.yaml");
  errors.push("The preserved Phase 1 RLS live gate must use the canonical .yml filename.");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}


const apiContracts = contents.get("docs/05-api/api-contracts.md") ?? "";
const proposedStart = apiContracts.indexOf("### 将来の正式API");
const acceptedIndexStart = apiContracts.indexOf("### Accepted継続API索引", proposedStart);
const acceptedIndexEnd = apiContracts.indexOf("\n## 課金API contract", acceptedIndexStart);
const acceptedEndpoints = [
  "GET /health/config",
  "POST /v1/manuals/{id}/exports",
  "POST /v1/workspaces/{workspaceId}/capture-sessions",
  "POST /v1/workspaces/{workspaceId}/capture-sessions/{id}/live-url",
  "POST /v1/workspaces/{workspaceId}/capture-sessions/{id}/commands",
  "GET /v1/workspaces/{workspaceId}/capture-sessions/{id}/events",
  "DELETE /v1/workspaces/{workspaceId}/capture-sessions/{id}",
  "POST /v1/workspaces/{workspaceId}/mobile-preview-sessions",
  "GET /v1/billing/summary",
  "POST /v1/billing/checkout-intents",
  "GET /v1/billing/checkout-intents/{id}",
  "POST /v1/webhooks/stripe",
  "POST /v1/integrations/discord/interactions"
];
if (proposedStart < 0 || acceptedIndexStart < 0 || acceptedIndexEnd < 0) {
  errors.push("API contract must separate Proposed future APIs from the Accepted continuation index.");
} else {
  const proposedOnly = apiContracts.slice(proposedStart, acceptedIndexStart);
  const acceptedOnly = apiContracts.slice(acceptedIndexStart, acceptedIndexEnd);
  for (const endpoint of acceptedEndpoints) {
    const markdownEndpoint = `\`${endpoint}\``;
    if (proposedOnly.includes(markdownEndpoint)) errors.push(`Accepted API remains inside Proposed list: ${endpoint}`);
    const occurrences = acceptedOnly.split(markdownEndpoint).length - 1;
    if (occurrences !== 1) errors.push(`Accepted API index must contain endpoint exactly once: ${endpoint}`);
  }
}
if (apiContracts.includes("GET /health/config` | Cloudflare Workerが必要な公開設定を読めているか確認 | public")) {
  errors.push("GET /health/config must not be documented as a public route.");
}

function callbackSection(path, startMarker, endMarker) {
  const content = contents.get(path) ?? "";
  const start = content.indexOf(startMarker);
  if (start < 0) {
    errors.push(`Missing callback section start in ${path}: ${startMarker}`);
    return "";
  }
  const end = endMarker ? content.indexOf(endMarker, start + startMarker.length) : content.length;
  if (end < 0) {
    errors.push(`Missing callback section end in ${path}: ${endMarker}`);
    return "";
  }
  return content.slice(start, end);
}

function requireOrderedCallbackMarkers({ path, start, end, markers }) {
  const section = callbackSection(path, start, end);
  if (!section) return;
  let cursor = 0;
  for (const marker of markers) {
    const index = section.indexOf(marker, cursor);
    if (index < 0) {
      errors.push(`Callback contract order is missing or reversed in ${path}: ${marker}`);
      return;
    }
    cursor = index + marker.length;
  }
}

const commonCallbackOrder = [
  "exact POSTとbody上限",
  "署名対象timestampを副作用なしで検証",
  "有界parse/schema検証",
  "receiptと再実行可能なwork/outboxを単一のatomic operation",
  "providerへ成功応答",
  "Queue、外部API、業務D1",
  "path別Access Bypassを有効化しない"
];

for (const spec of [
  {
    path: "docs/03-architecture/adrs/ADR-0028-cloudflare-access-d1.md",
    start: "## External provider callback boundary",
    end: "## Authorization boundary",
    markers: commonCallbackOrder
  },
  {
    path: "docs/05-api/cloudflare-access-d1-api.md",
    start: "## External provider callback",
    end: "## Application session",
    markers: commonCallbackOrder
  },
  {
    path: "docs/05-api/api-contracts.md",
    start: "## 共通",
    end: "## API一覧",
    markers: [
      "exact POSTとbody上限",
      "署名対象timestampを副作用なしで検証",
      "有界parse/schema検証",
      "receiptと再実行可能なwork/outboxを単一のatomic operation",
      "guard commit成功後だけproviderへ成功応答",
      "保存済みoutboxからQueue",
      "path別Access Bypassを有効化しない"
    ]
  },
  {
    path: "docs/07-quality/test-strategy.md",
    start: "# テスト戦略",
    end: null,
    markers: [
      "exact POSTとbody上限",
      "署名対象timestampを副作用なしで検証",
      "有界parse/schema・allowlist検証",
      "receiptと再実行可能なwork/outboxを単一のatomic operation",
      "providerへ成功応答",
      "保存済みoutboxからQueue",
      "path別Access Bypassを有効化しない"
    ]
  },
  {
    path: "docs/07-quality/acceptance-catalog.md",
    start: "| AC-018 |",
    end: "| AC-017 |",
    markers: [
      "exact POSTとbody上限",
      "署名対象timestampを副作用なしで検証",
      "有界parse/schema・allowlist検証",
      "receiptと再実行可能なwork/outboxを単一のatomic operation",
      "guard commit成功後だけproviderへ成功応答",
      "保存済みoutboxからQueue",
      "path別Access Bypassを有効化しない"
    ]
  },
  {
    path: "docs/08-operations/discord-reporting-and-command-bridge.md",
    start: "Workerの処理:",
    end: "危険操作検知:",
    markers: [
      "exact POSTとbody上限",
      "署名対象 `x-signature-timestamp` を副作用なしで検証",
      "有界parse/schema検証",
      "receiptと再実行可能なIssue work/outboxを単一のatomic operation",
      "guard commit成功後だけDiscordへ3秒以内にdeferred",
      "保存済みoutboxからdispatcher",
      "path別Access Bypassを有効化しない"
    ]
  },
  {
    path: "docs/08-operations/stripe-billing-harness.md",
    start: "## Webhook処理",
    end: "## entitlement",
    markers: [
      "exact POSTとbody上限",
      "署名対象timestamp",
      "副作用なしで検証",
      "有界parse/schema検証",
      "receiptと再実行可能なreconciliation work/outboxを単一のatomic operation",
      "guard commit成功後だけStripeへ2xx",
      "保存済みoutboxからdispatcher"
    ]
  }
]) requireOrderedCallbackMarkers(spec);

for (const spec of [
  {
    path: "docs/03-architecture/adrs/ADR-0007-stripe-webhook-source-of-truth.md",
    start: "## 影響",
    end: null,
    markers: ["exact POSTとbody上限", "署名対象timestampを副作用なしで検証", "有界parse/schema・provider固有allowlist検証", "単一のatomic operation", "guard commit後だけproviderへ2xx", "保存済みoutboxからdispatcher"]
  },
  {
    path: "docs/03-architecture/adrs/ADR-0012-discord-issue-bridge.md",
    start: "## 実装",
    end: "## 非対象",
    markers: ["exact POSTとbody上限", "署名対象timestampを副作用なしで検証", "有界parse/schema検証とallowlist検証", "単一のatomic operation", "guard commit後だけprovider success", "保存済みoutboxからdispatcher"]
  },
  {
    path: "docs/03-architecture/adrs/ADR-0022-free-first-stripe-billing.md",
    start: "## 決定",
    end: "## entitlementの基本状態",
    markers: ["exact POSTとbody上限", "署名対象timestampを副作用なしで検証", "有界parse/schema・provider固有allowlist検証", "単一のatomic operation", "guard commit後だけproviderへ2xx", "保存済みoutboxからdispatcher"]
  }
]) requireOrderedCallbackMarkers(spec);

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Cloudflare source-of-truth OK: Access/Workers/D1/R2 contracts, callback order/recovery, legacy fences, and the preserved-until-M5 live RLS gate are consistent.");
