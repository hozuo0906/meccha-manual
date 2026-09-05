import { access, readFile } from "node:fs/promises";

const errors = [];

async function read(path) {
  try {
    return (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
  } catch {
    errors.push(`Missing Cloudflare source-of-truth file: ${path}`);
    return "";
  }
}

const m5RetirementTerms = [
  "(1) replacement gateと対応docsの着地",
  "(2) 旧 `.github/workflows/phase1-rls-live.yml` の削除",
  "(3) runbookの `Status: Superseded` 化",
  "(4) source-of-truth checkerとworkflow checkerのcanonical存在必須からcanonical/renamed旧identity再追加拒否への反転",
  "(5) workflow本体、`scripts/check-workflows.mjs`、`scripts/check-cloudflare-source-of-truth.mjs`、`tests/cloudflare-access-fetch.test.mjs` の同一PR scope化"
];

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
    "stable idempotency/correlation key", "outboxのatomic保存時に確定", "sink側で重複を拒否", "single-writer境界", "未知結果のまま同じeffectを再送せず", "CAS成功後にworkerが停止", "sink callが最大1系統",
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
    "lease付き`processing`", "`reconcile_required`", "`dead_letter`", "受理済みworkを黙って失わない", "OQ-031", "lease_generation", "compatibility floor", "forward-fix", "code-only rollback",
    "stable idempotency/correlation key", "outboxのatomic保存時に確定", "sink側で重複を拒否", "single-writer境界", "未知結果のまま同じeffectを再送せず", "CAS成功後停止・lease takeover・旧worker復帰", "sink callが最大1系統"
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
    "# API契約\n\nStatus: Accepted", "### Phase 1ハーネス\n\nStatus: Superseded",
    "### Accepted継続API索引\n\nStatus: Accepted", "### 将来の正式API\n\nStatus: Proposed",
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
    "Status: Accepted", ".github/workflows/phase1-rls-live.yml", "Issue #176 M5", "同じrollback単位", "現行Accepted live gate",
    "## 現行実行に参照する登録済みEnvironment secrets", "owner承認済み・登録済みの既存 `staging` / test値だけを確認・利用する",
    "新規Secret、資格情報、test user、Environment、projectの作成・登録は禁止する", "owner承認済みの既存専用テストアカウント",
    "登録済みの既存一組が揃う場合だけ利用", "## 現行Accepted transitional gateの実行手順",
    "Issue #215の文書・checker整合PRとは別に、ownerがこのlive gate実行自体を明示承認したことを確認する。承認がない場合はdispatchしない。"
  ]],
  ["docs/08-operations/prelaunch-shortcut-and-launch-gate.md", [
    "現行Accepted transitional gate", "Issue #176 M5", "同じrollback単位", "canonical workflow"
  ]],
  ["docs/07-quality/rls-negative-test.md", [
    "Status: Accepted", "canonical `.github/workflows/phase1-rls-live.yml`", "owner承認済み", "既存staging/test契約", "M5 replacement gate", "production実行"
  ]],
  ["docs/04-data/phase1-supabase-setup.md", [
    "Status: Superseded", "owner承認済みのcanonical live gate", "Accepted例外", "新規Supabase project、migration、test user、データ、資格情報、`MECCHA_RLS_*` secretは追加しない",
    "`npm run test:rls`はowner承認済みの既存staging/test契約をcanonical workflowから実行する場合に限り"
  ]],
  ["docs/08-operations/stripe-billing-harness.md", [
    "exact POSTとbody上限", "署名対象timestamp", "副作用なしで検証", "有界parse/schema検証",
    "receiptと再実行可能なreconciliation work/outbox", "guard commit成功後だけStripeへ2xx",
    "lease付き`processing`", "`reconcile_required`", "`dead_letter`", "受理済みeventを黙って失わない"
  ]],
  ["docs/08-operations/environments-and-delivery.md", [
    "Phase 1 RLS immutable preview", "現行Accepted transitional gate", "owner承認済みの既存staging/test契約",
    "M5 replacement gateと対応docsがmainへ着地する同一commit/rollback unit内で", "旧workflow削除", "runbookのStatus: Superseded化", "canonical/renamed旧workflow再追加拒否", "M6へ持ち越さない"
  ]],
  ["docs/09-delivery/cloudflare-migration-roadmap.md", [
    "503 MANUAL_MIGRATION_IN_PROGRESS", "M3状態をstaging合格または内部alpha合格として扱わない",
    "現行AcceptedのSupabase RLS live gate workflow", "OQ-031を解決", "receiptと再実行可能なwork/outbox",
    "processing lease期限", "結果不明", "既存Discord KV get→putを単独のreplay guard正本にしない", "CAS成功後停止→lease takeover→旧worker復帰", "stable idempotency/correlation key", "sink call最大1系統",
    "compatibility floor", "code-only rollback", "fail-closed/forward-fix", "選択的rollback rehearsal", "旧live workflowの削除、runbookのStatus: Superseded化、canonical/renamed旧workflow再追加拒否はM5 replacement gateと対応docsがmainへ着地する同一commit/rollback unit内で完了し、M6へ持ち越さない", "M5で退役済みの旧gateについてIssue #95の完了記録と残存履歴を整理する",
    "DEC-064 Safetyの5操作", "直接依存test同一scope"
  ]],
  ["docs/09-delivery/session-handoff.md", [
    "現行live RLS gate workflow", "Issue #176 M5 replacement gate", "新規test user、資格情報、環境は追加せず", "owner承認済み既存staging/test契約"
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
  ["docs/08-operations/phase1-rls-live-gate.md", []],
  ["docs/08-operations/environments-and-delivery.md", ["Legacy immutable preview gate", "既存RLS workflowはSupersededとして削除済み", "旧Supabase workflowは削除済み", "実行不可", "着地後にSupersededとしてM6で退役し、再追加をCIで拒否する", "着地した後、M6で退役する"]],
  ["docs/09-delivery/cloudflare-migration-roadmap.md", ["live workflowをM6で退役", "#95と旧Supabase gateのclose／supersede判断を行う"]],
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
  ["docs/04-data/phase2-manual-core-setup.md", "M4"],
  ["docs/05-api/phase2-manual-api.md", "M4"],
  ["docs/05-api/phase2-manual-edit-api.md", "M4"],
  ["docs/07-quality/phase2-smoke-test.md", "M4"],
  ["docs/08-operations/cloud-harness.md", "M1〜M5"],
  ["docs/08-operations/db-migration-safety-harness.md", "M2/M4"],
  ["docs/08-operations/phase1-app-harness.md", "M1〜M3"],
  ["docs/08-operations/phase2-manual-core-staging-alpha.md", "M4/M5"],
  ["docs/08-operations/remaining-harness-plan.md", "M0〜M7"],
  ["docs/09-delivery/phase1-entry-gate.md", "M1〜M3"]
]);

const paths = new Set([...required.keys(), ...forbidden.keys(), ...superseded.keys(), "docs/09-delivery/issue-map.md"]);
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
const m5SafetyTerms = [
  ...m5RetirementTerms,
  "同一commit/rollback unit内",
  "M6への持越し",
  "replacement未着地のまま先行退役を禁止"
];
const m5CarrierRetirementContradictionTerms = [
  "M6で退役",
  "M6で削除",
  "M6へ持ち越す",
  "M6への持越し",
  "着地後に退役する",
  "M6へ持ち越して退役する",
  "旧workflowの廃止をM6に延期",
  "着地後の別PRで削除",
  "replacement未着地のまま先行退役を禁止しない"
];
const m5CarrierIdentityTermsByName = new Map([
  ["DEC-064 pre-M5 transition", ["phase1-rls-live.yml", "Phase 1 RLS Live Gate"]],
  ["DEC-064 Safety", ["phase1-rls-live.yml", "Phase 1 RLS Live Gate"]],
  ["phase1 runbook M5 safety", ["phase1-rls-live.yml", "Phase 1 RLS Live Gate", "旧workflow"]],
  ["session handoff M5 safety", ["phase1-rls-live.yml", "live RLS gate", "旧workflow"]],
  ["environments intro M5 safety", ["Phase 1 RLS Live Gate", "Issue #176 M5 replacement gate"]],
  ["environments preview matrix M5 safety", ["Phase 1 RLS immutable preview", "Phase 1 RLS immutable preview gate"]],
  ["environments dispatch matrix M5 safety", ["Phase 1 RLS immutable preview gate", "Issue #176 M5 replacement gate"]],
  ["environments boundary M5 safety", ["現行live RLS gate", "Issue #176 M5 replacement gate", "旧workflow削除"]],
  ["roadmap current live-gate M5 safety", ["Supabase RLS live gate", "Issue #176 M5"]],
  ["roadmap M0 live-workflow M5 safety", ["旧Supabase live workflow", "M5 replacement gate"]],
  ["roadmap M5 five-actions safety", ["DEC-064 Safetyの5操作", "旧workflow削除"]],
  ["roadmap M6 residual safety", ["旧live workflow", "M5 replacement gate"]],
  ["prelaunch M5 safety", ["Phase 1 RLS Live Gate", "canonical workflow"]],
  ["rls negative-test M5 safety", ["phase1-rls-live.yml", "M5 replacement gate"]],
  ["phase1 setup active exception", ["Supabase/Auth/Postgres/RLS", "canonical live gate"]],
  ["phase1 setup frozen baseline", ["Supabase project", "canonical workflow"]],
  ["phase1 setup superseded gate exception", ["Supabaseテストユーザー", "canonical live gate"]]
]);
function normalizePredicateText(line) {
  return line
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/[*_~]+/g, "");
}
function matchesCarrierIdentity(line, identity) {
  const normalizedLine = normalizePredicateText(line);
  if (identity === "旧workflow") return /(?:^|\s)旧workflow/.test(normalizedLine);
  return normalizedLine.includes(identity);
}
function containsAffirmativeForbiddenAssertion(line, term) {
  const normalizedLine = normalizePredicateText(line);
  let offset = normalizedLine.indexOf(term);
  while (offset >= 0) {
    const sentence = normalizedLine.slice(offset + term.length).split(/[。！？\n]/, 1)[0];
    if (term === "M6への持越し") {
      let predicate = sentence.trimStart();
      predicate = predicate.replace(/^(?:を|は|が|の)\s*/, "").trimStart();
      predicate = predicate.replace(/^[、,;；]\s*/, "");
      const targetClause = predicate;
      if (!targetClause.trim()) {
        offset = normalizedLine.indexOf(term, offset + 1);
        continue;
      }
      const safePermissionPattern = /許可しない|許可されない|認めない|認められない|禁止する|禁止とする|不可/g;
      const hasSafeNegative = safePermissionPattern.test(targetClause);
      const withoutSafeNegative = targetClause.replace(safePermissionPattern, "");
      const hasAffirmativeOrAmbiguousPermission = /許可|認め|容認|可/.test(withoutSafeNegative);
      const allowsProhibitedCarryover = /禁止しない|禁止されない/.test(targetClause);
      if (allowsProhibitedCarryover || hasAffirmativeOrAmbiguousPermission) return true;
      if (hasSafeNegative) {
        offset = normalizedLine.indexOf(term, offset + 1);
        continue;
      }
      return true;
    } else if (term.endsWith("禁止しない") || !/^\s*(?:しない|ない|することを禁止する|ことを禁止する|許可しない|許可されない|認めない|認められない|してはならない|することは禁止する|禁止する|禁止とする|不可)/.test(sentence)) return true;
    offset = normalizedLine.indexOf(term, offset + 1);
  }
  return false;
}
function documentLines(path) {
  const rawLines = (contents.get(path) ?? "").split("\n");
  let fenceMarker = null;
  let inComment = false;
  function removeHtmlCommentSpans(line) {
    let visible = "";
    let cursor = 0;
    while (cursor < line.length) {
      if (inComment) {
        const commentEnd = line.indexOf("-->", cursor);
        if (commentEnd < 0) return visible;
        inComment = false;
        cursor = commentEnd + 3;
        continue;
      }
      const commentStart = line.indexOf("<!--", cursor);
      if (commentStart < 0) {
        visible += line.slice(cursor);
        return visible;
      }
      visible += line.slice(cursor, commentStart);
      const commentEnd = line.indexOf("-->", commentStart + 4);
      if (commentEnd < 0) {
        inComment = true;
        return visible;
      }
      cursor = commentEnd + 3;
    }
    return visible;
  }
  return rawLines.map((line) => {
    const trimmed = line.trimStart();
    const rawFenceMatch = /^(?: {0,3})(?<marker>`{3,}|~{3,})(?<rest>.*)$/.exec(line);
    if (fenceMarker !== null) {
      const marker = rawFenceMatch?.groups.marker;
      const sameFence = marker !== undefined && marker[0] === fenceMarker[0] && marker.length >= fenceMarker.length && /^\s*$/.test(rawFenceMatch.groups.rest);
      if (sameFence) fenceMarker = null;
      return "";
    }
    const visibleLine = removeHtmlCommentSpans(line);
    const visibleTrimmed = visibleLine.trimStart();
    if (/^(?: {4}|\t)/.test(visibleLine) || visibleTrimmed.startsWith(">")) return "";
    const fenceMatch = /^(?: {0,3})(?<marker>`{3,}|~{3,})(?<rest>.*)$/.exec(visibleLine);
    if (fenceMatch) {
      const marker = fenceMatch.groups.marker;
      if (marker[0] === "`" && fenceMatch.groups.rest.includes("`")) return visibleLine;
      fenceMarker = marker;
      return "";
    }
    return fenceMarker === null ? visibleLine : "";
  });
}
function sectionLines(path, sectionPrefix, anchored = false) {
  const lines = documentLines(path);
  if (!sectionPrefix) return lines;
  const headingIndexes = lines.flatMap((line, index) => (anchored ? line.startsWith(sectionPrefix) : line === sectionPrefix) ? [index] : []);
  if (headingIndexes.length !== 1) return [];
  const start = headingIndexes[0];
  const scopeLevel = /^(#+)\s/.exec(sectionPrefix)?.[1].length ?? 2;
  const endHeading = new RegExp(`^#{1,${scopeLevel}}\\s`);
  const end = lines.findIndex((line, index) => index > start && endHeading.test(line));
  return lines.slice(start, end < 0 ? lines.length : end);
}
const decisionLogLines = documentLines("docs/09-delivery/decision-log.md");
const dec064HeadingCount = decisionLogLines.filter((line) => line.startsWith("## DEC-064:")).length;
if (dec064HeadingCount !== 1) errors.push(`DEC-064 must have exactly one section heading in docs/09-delivery/decision-log.md (found ${dec064HeadingCount})`);
const m5CarrierEntries = [
  {
    name: "DEC-064 Preserves section",
    path: "docs/09-delivery/decision-log.md",
    scope: "## DEC-064:",
    scopeAnchored: true,
    prefix: "- Preserves:",
    exact: true,
    terms: []
  },
  {
    name: "DEC-064 pre-M5 transition",
    path: "docs/09-delivery/decision-log.md",
    scope: "## DEC-064:",
    scopeAnchored: true,
    prefix: "  - DEC-063のAccess境界と現行Accepted Phase 1 RLS Live Gate。",
    terms: [
      "pre-M5では `.github/workflows/phase1-rls-live.yml`",
      "Status: Accepted",
      "Issue #215の文書・checker整合PRとは別にownerが明示承認",
      "登録済みの既存staging/test入力",
      "future M5ではSafety記載の5操作",
      "同一commit/rollback unit"
    ],
    forbiddenTerms: m5CarrierRetirementContradictionTerms
  },
  {
    name: "DEC-064 Safety",
    path: "docs/09-delivery/decision-log.md",
    scope: "## DEC-064:",
    scopeAnchored: true,
    prefix: "  - 旧 `phase1-rls-live.yml` はpre-M5では現行Accepted live gateとして維持する。",
    terms: m5SafetyTerms,
    forbiddenTerms: m5CarrierRetirementContradictionTerms
  },
  {
    name: "phase1 runbook M5 safety",
    path: "docs/08-operations/phase1-rls-live-gate.md",
    scope: "# Phase 1 RLS Live Gate",
    prefix: "`.github/workflows/phase1-rls-live.yml` は現行Accepted live gateである。",
    terms: m5SafetyTerms
  },
  {
    name: "session handoff M5 safety",
    path: "docs/09-delivery/session-handoff.md",
    scope: "## Cloudflare Access / D1移行引き継ぎ（2026-08-30）",
    prefix: "- 現行live RLS gate workflow `.github/workflows/phase1-rls-live.yml` とrunbook",
    terms: m5SafetyTerms
  },
  {
    name: "session handoff Issue 95 history",
    path: "docs/09-delivery/session-handoff.md",
    scope: "## Cloudflare Access / D1移行引き継ぎ（2026-08-30）",
    prefix: "- Issue #95のSupabase staging内部alphaはIssue #176 M5のAccess/D1/R2 staging実証へ置換し、旧経路を実行しない。",
    terms: ["Issue #95", "Issue #176 M5", "旧経路を実行しない"],
    forbiddenTerms: []
  },
  {
    name: "environments intro M5 safety",
    path: "docs/08-operations/environments-and-delivery.md",
    scope: "## 目的と現在地",
    prefix: "Cloudflare Git連携",
    terms: ["Cloudflare Git連携", "Phase 1 RLS Live Gate", "現行Accepted transitional gate", "Issue #176 M5", "M5 replacement gate", "同じrollback単位", "旧workflow削除", "runbookのStatus: Superseded化", "canonical/renamed旧workflow再追加拒否", "M6へ持ち越さない"]
  },
  {
    name: "environments preview matrix M5 safety",
    path: "docs/08-operations/environments-and-delivery.md",
    scope: "## 環境対応表",
    prefix: "| Phase 1 RLS immutable preview |",
    terms: ["Phase 1 RLS immutable preview", "現行Accepted transitional gate", "使用しない", "owner承認済みの既存staging/test契約", "canonical workflow", "Issue #176 M5 replacement gate", "旧workflow削除", "runbookのStatus: Superseded化", "canonical/renamed旧workflow再追加拒否", "M6へ持ち越さない"]
  },
  {
    name: "environments dispatch matrix M5 safety",
    path: "docs/08-operations/environments-and-delivery.md",
    scope: "## 自動操作と承認必須操作",
    prefix: "| Phase 1 RLS immutable preview gate |",
    terms: ["Phase 1 RLS immutable preview gate", "workflow_dispatch", "owner承認済み・登録済みの既存staging/test契約", "canonical workflow", "新規Secret、資格情報、test user、Environment、projectは作成・登録しない", "Issue #176 M5 replacement gate", "旧workflow削除", "runbookのStatus: Superseded化", "canonical/renamed旧workflow再追加拒否", "M6へ持ち越さない"]
  },
  {
    name: "environments boundary M5 safety",
    path: "docs/08-operations/environments-and-delivery.md",
    scope: "## Cloudflare Worker / Wrangler",
    prefix: "- Cloudflare Git integration",
    terms: ["現行live RLS gate", "owner承認済みの既存staging/test契約", "canonical workflow", "Issue #176 M5 replacement gate", "旧workflow削除", "runbookのStatus: Superseded化", "canonical/renamed旧workflow再追加拒否", "M6へ持ち越さない"]
  },
  {
    name: "roadmap current live-gate M5 safety",
    path: "docs/09-delivery/cloudflare-migration-roadmap.md",
    scope: "## 現在地",
    prefix: "- 現行AcceptedのSupabase RLS live gate workflow",
    terms: ["現行AcceptedのSupabase RLS live gate workflow", "Issue #176 M5のAccess/D1/R2置換gate", "同じrollback単位", "新規Supabase test user", "資格情報", "live run"]
  },
  {
    name: "roadmap M0 live-workflow M5 safety",
    path: "docs/09-delivery/cloudflare-migration-roadmap.md",
    scope: "## M0: 正本移行",
    prefix: "- 旧Supabase live workflow",
    terms: ["旧Supabase live workflow", "M5置換gate着地まで維持", "M5 replacement gate", "同一commit/rollback unit", "退役", "再追加防止check", "M6へ持ち越さない"]
  },
  {
    name: "roadmap M5 five-actions safety",
    path: "docs/09-delivery/cloudflare-migration-roadmap.md",
    scope: "## M5: staging統合実証",
    prefix: "- DEC-064 Safetyの5操作",
    terms: ["DEC-064 Safetyの5操作", "replacement gateと対応docs", "旧workflow削除", "runbook Superseded", "両checker反転", "直接依存test同一scope", "同一commit/rollback unit"]
  },
  {
    name: "roadmap M6 residual safety",
    path: "docs/09-delivery/cloudflare-migration-roadmap.md",
    scope: "## M6: Supabase退役",
    prefix: "- 残存runtime、環境変数、harness、文書からSupabase依存を削除",
    terms: ["残存runtime、環境変数、harness、文書からSupabase依存を削除", "旧live workflowの削除", "runbookのStatus: Superseded化", "canonical/renamed旧workflow再追加拒否", "M5 replacement gate", "同一commit/rollback unit", "M6へ持ち越さない"]
  },
  {
    name: "roadmap Issue 95 history safety",
    path: "docs/09-delivery/cloudflare-migration-roadmap.md",
    scope: "## M6: Supabase退役",
    prefix: "- #92の完了記録を維持し",
    terms: ["M5で退役済みの旧gate", "Issue #95", "完了記録と残存履歴を整理する"],
    forbiddenTerms: []
  },
  {
    name: "prelaunch M5 safety",
    path: "docs/08-operations/prelaunch-shortcut-and-launch-gate.md",
    scope: "## 現在の暫定運用",
    prefix: "- `Phase 1 RLS Live Gate`",
    terms: ["Phase 1 RLS Live Gate", "現行Accepted transitional gate", "Issue #176 M5", "Access/D1/R2 replacement gate", "同じrollback単位", "既存staging/test契約", "canonical workflow", "M5着地時", "新規Supabase test user", "MECCHA_RLS_*"]
  },
  {
    name: "rls negative-test M5 safety",
    path: "docs/07-quality/rls-negative-test.md",
    scope: "# RLS negative test",
    prefix: "本書は移行前Supabase/Postgres/RLS",
    terms: ["Supabase/Postgres/RLS", "canonical `.github/workflows/phase1-rls-live.yml`", "owner承認済み", "既存staging/test契約", "既存資格情報", "M5 replacement gate", "同じrollback単位", "Acceptedとして維持", "新規環境", "production実行"]
  },
  {
    name: "phase1 setup active exception",
    path: "docs/04-data/phase1-supabase-setup.md",
    scope: "# Phase 1 Supabase setup",
    prefix: "本書は新規Supabase/Auth/Postgres/RLS setup手順としてはSuperseded",
    terms: ["Superseded", "既存staging/test契約", "owner承認済み", "canonical live gate", "Issue #176 M5", "replacement gate", "同じrollback単位", "Accepted例外", "新規project", "migration", "資格情報", "remote write"]
  },
  {
    name: "phase1 setup frozen baseline",
    path: "docs/04-data/phase1-supabase-setup.md",
    scope: "# Phase 1 Supabase setup",
    prefix: "新規Supabase project、migration、test user",
    terms: ["新規Supabase project", "migration", "test user", "データ", "資格情報", "`MECCHA_RLS_*` secret", "`npm run test:rls`", "owner承認済み", "canonical workflow", "Issue #176 M5", "replacement gate", "同じrollback単位", "Issue #176 M6"]
  },
  {
    name: "phase1 setup superseded gate exception",
    path: "docs/04-data/phase1-supabase-setup.md",
    scope: "## Superseded gateと移管先",
    prefix: "専用Supabaseテストユーザー2名",
    terms: ["専用Supabaseテストユーザー2名", "CI secret登録", "実stagingでの`npm run test:rls`", "既存staging/test契約", "owner承認済みcanonical live gate", "M5 replacement gate", "同じrollback単位", "Accepted例外", "無秩序な手動実行", "新規環境", "production実行"]
  },
  {
    name: "issue-map Issue 95 Superseded context",
    path: "docs/09-delivery/issue-map.md",
    scope: "## 現在の最優先: EPIC-15 Cloudflare認証・DB統一移行",
    prefix: "EPIC-02、EPIC-03、EPIC-06",
    terms: ["#95", "旧Supabase live gate", "Superseded"],
    forbiddenTerms: []
  }
];
const m5CarrierResolutions = m5CarrierEntries.map(({ name, path, scope, scopeAnchored = false, prefix, exact = false, terms, forbiddenTerms = path === "docs/09-delivery/decision-log.md" ? [] : m5CarrierRetirementContradictionTerms }) => {
  const boundedLines = sectionLines(path, scope, scopeAnchored);
  const lines = boundedLines.filter((line) => exact ? line === prefix : line.startsWith(prefix));
  if (lines.length !== 1) {
    errors.push(`${name} must contain exactly one canonical line in ${path}: ${prefix}`);
  }
  return { name, path, scope, boundedLines, lines, terms, forbiddenTerms, identityTerms: m5CarrierIdentityTermsByName.get(name) ?? [] };
});
const exemptCarrierLines = new Set(
  m5CarrierResolutions
    .filter(({ forbiddenTerms, lines }) => forbiddenTerms.length === 0 && lines.length === 1)
    .map(({ path, scope, boundedLines, lines }) => `${path}\u0000${scope}\u0000${boundedLines.indexOf(lines[0])}`)
);
for (const { name, path, scope, boundedLines, lines, terms, forbiddenTerms, identityTerms } of m5CarrierResolutions) {
  if (lines.length !== 1) continue;
  for (const term of terms) {
    if (!lines[0].includes(term)) errors.push(`${name} is missing a required contract term in ${path}: ${term}`);
  }
  for (const term of forbiddenTerms) {
    if (containsAffirmativeForbiddenAssertion(lines[0], term)) errors.push(`${name} contains a forbidden retirement assertion in ${path}: ${term}`);
    if (boundedLines.some((line, index) => line !== lines[0] && !exemptCarrierLines.has(`${path}\u0000${scope}\u0000${index}`) && identityTerms.some((identity) => matchesCarrierIdentity(line, identity)) && containsAffirmativeForbiddenAssertion(line, term))) {
      errors.push(`${name} contains a forbidden retirement assertion in ${path}: ${term}`);
    }
  }
}
const environmentTransitionLines = [
  "| Phase 1 RLS immutable preview | 現行Accepted transitional gate | 使用しない | owner承認済みの既存staging/test契約をcanonical workflowから実行する。Issue #176 M5 replacement gateと対応docsがmainへ着地する同一commit/rollback unit内で旧workflow削除・runbookのStatus: Superseded化・canonical/renamed旧workflow再追加拒否を完了する。M6へ持ち越さない |",
  "| Phase 1 RLS immutable preview gate | 手動（workflow_dispatch） | owner承認済み・登録済みの既存staging/test契約だけをcanonical workflowから確認・利用する。新規Secret、資格情報、test user、Environment、projectは作成・登録しない。Issue #176 M5 replacement gateと対応docsがmainへ着地する同一commit/rollback unit内で旧workflow削除・runbookのStatus: Superseded化・canonical/renamed旧workflow再追加拒否を完了する。M6へ持ち越さない。 |",
  "- immutable preview CI用 `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` はowner承認済み・登録済みの既存 `staging` Environmentの一組だけを確認・利用し、Business OS用repository secretと共有・fallback運用しない。新規Secret、資格情報、test user、Environment、projectの作成・登録は禁止する。"
];
const environmentTransitionSource = (contents.get("docs/08-operations/environments-and-delivery.md") ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
for (const line of environmentTransitionLines) {
  const count = environmentTransitionSource.filter((sourceLine) => sourceLine === line).length;
  if (count !== 1) errors.push(`Environment transition contract must contain exactly one canonical exact line: ${line}`);
}
const forbiddenExactLines = new Map([
  ["docs/08-operations/phase1-rls-live-gate.md", [
    "## Legacy secret inventory（登録しない）",
    "RLS test用4件とpreview-only Access用2件を `staging` Environment secretsとして登録する。",
    "- Access 2件は必ず一組で登録し、片方欠落時は停止する。",
    "## Legacy実行手順（実行しない）",
    "2. GitHub `staging` Environmentへ上記6件を登録し、Business OS用値と共有していないことを確認する。"
  ]]
]);
for (const [path, lines] of forbiddenExactLines) {
  const sourceLines = new Set((contents.get(path) ?? "").split("\n"));
  for (const line of lines) {
    if (sourceLines.has(line)) errors.push(`Active source contains an exact legacy live-gate line: ${line}`);
  }
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
    path: "docs/03-architecture/adrs/ADR-0028-cloudflare-access-d1.md",
    start: "## External provider callback boundary",
    end: "## Authorization boundary",
    markers: [
      "stable idempotency/correlation key", "outboxのatomic保存時に確定", "sink側で重複を拒否",
      "single-writer境界", "未知結果のまま同じeffectを再送せず", "CAS成功後にworkerが停止", "sink callが最大1系統"
    ]
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
