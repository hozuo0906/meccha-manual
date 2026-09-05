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
const m5RetirementContradictionPatterns = [
  /(?:廃止|退役|削除)(?:予定|時期|時点|判断)?\s*(?:を|は|が)?\s*M6\s*(?:に|へ|まで)\s*(?:延期|先送り)/,
  /M6\s*まで\s*(?:廃止|退役|削除)(?:予定|時期|時点|判断)?\s*(?:を|は|が)?\s*(?:延期|先送り)/,
  /M6\s*(?:で|に|へ)\s*(?:廃止|退役|削除)/,
  /M6\s*以降\s*(?:(?:に|で|は)\s*)?(?:[、，,]\s*)?(?:廃止|退役|削除)/,
  /M6\s*以降\s*(?:に|で)?\s*旧workflow\s*(?:を|は|が)?\s*(?:廃止|退役|削除)/i,
  /M6\s*になってから\s*(?:[、，,]\s*)?(?:廃止|退役|削除)/,
  /(?:廃止|退役|削除)(?:予定|時期|時点|判断)?\s*(?:は|を|が)\s*M6\s*(?:とする|と定める|に設定|に決定)/,
  /(?:廃止|退役|削除)(?:予定|時期|時点|判断)?\s*(?:を|は)\s*M6\s*(?:で|に)\s*(?:行う|行わないわけではない|実施する|実施しないわけではない)/,
  /(?:廃止|退役|削除)(?:予定|時期|時点|判断)?\s*(?:を|は)\s*M6\s*以降\s*(?:に|で)?\s*(?:行う|行わないわけではない|実施する|実施しないわけではない)/,
  /M6\s*まで(?:は)?\s*維持/,
  /M6\s*まで(?:は)?\s*残す/,
  /M6\s*まで(?:は)?\s*残さない(?:わけではない|とは限らない)/,
  /M6\s*から\s*(?:廃止|退役|削除)/,
  /M6\s*へ\s*先送り/,
  /M6\s*(?:へ|に)\s*持(?:ち)?越す/,
  /M6\s*(?:へ|に)\s*持(?:ち)?越さない(?:わけではない|とは限らない)/,
  /M6\s*(?:へ|に)の\s*持(?:ち)?越し/,
  /(?:廃止|退役|削除)(?:予定|時期|時点|判断)?\s*(?:を|は|が)\s*M(?:[6-9]|[1-9]\d+)\s*(?:に|へ|まで)\s*(?:延期|先送り)/,
  /M(?:[6-9]|[1-9]\d+)\s*(?:で|に|へ|以降(?:に|で|は)?|になってから|から|まで(?:は)?)\s*(?:旧workflow\s*)?(?:を|は|が)?\s*(?:廃止|退役|削除|維持|残す|先送り|持(?:ち)?越(?:す|し))/,
  /(?:廃止|退役|削除)(?:予定|時期|時点|判断)?\s*(?:は|を|が)\s*M(?:[6-9]|[1-9]\d+)\s*(?:とする|と定める|に設定|に決定)/
];
const m5CommonLegacyGateIdentityPatterns = [
  /(?:^|[^A-Za-z0-9_.-])(?:(?:canonical|renamed)[-_])?phase1-rls-live\.yml\b/i,
  /Phase 1 RLS Live Gate\b/i,
  /Supabase\s+RLS\s+live\s+gate\b/i,
  /(?:^|\s|現行)live\s+RLS\s+gate\b/i,
  /(?:対象|該当|当該)\s*[（(]\s*live\s+RLS\s+gate\b/i,
  /旧Supabase(?:\s*の\s*|\s+)(?:RLS\s+)?live\s+(?:gate|workflow)\b/i
];
const m5CarrierIdentityPatternsByName = new Map([
  ["environments preview matrix M5 safety", [/Phase 1 RLS immutable preview(?=$|[^A-Za-z0-9])/i]],
  ["environments dispatch matrix M5 safety", [/Phase 1 RLS immutable preview gate\b/i]],
  ["phase1 setup active exception", [/canonical live gate\b/i]],
  ["phase1 setup frozen baseline", [/canonical workflow\b/i]],
  ["phase1 setup superseded gate exception", [/canonical live gate\b/i]]
]);
const m5SafeNegativeEndings = /^\s*(?:しない|させない|行わない|実施しない|ない|(?:(?:する|させる|を(?:行う|実施する)|(?:許可|容認|承認)する|認める)?(?:予定|必要|方針|意図|意向)(?:は|が|では)?ない)|(?:(?:する|させる|を(?:行う|実施する)|(?:許可|容認|承認)する|認める)?ことはない)|(?:す)?べき(?:で|では)ない|することを禁止する|させることを禁止する|ことを禁止する|許可しない|許可されない|認めない|認められない|してはならない|させてはならない|することは禁止する|禁止する|禁止とする|不可)(?:\s*(?:もの|こと)とする)?\s*$/;
function normalizePredicateText(line) {
  return line
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/[*_]+/g, "");
}
function normalizeIdentityText(line) {
  return line
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/[~*_]+/g, "");
}
function isM5TargetWorkflowQualifier(prefix) {
  return /(?:^|[\s、,;；])(?:対象|該当|当該|現行|削除対象)(?:となる)?の$/.test(prefix)
    || /owner承認済みの$/.test(prefix)
    || /既存staging\/test契約の$/.test(prefix)
    || /既存staging\/test契約で(?:(?:現在|現に)\s*)?(?:使う|利用する)$/.test(prefix)
    || /(?:^|[\s、,;；])(?:本書|ここ|この(?:carrier|手順|文書|PR))で(?:使う|利用する)$/.test(prefix)
    || /(?:^|[\s、,;；])(?:Phase 1 RLS|Supabase RLS|旧Supabase(?:\s+RLS)?\s+live)\s*(?:(?:の|[:：]|[（(]|用|向け(?:の)?)|(?:で|が)(?:(?:現在|現に)\s*)?(?:使う|利用する)|に属する)?$/.test(prefix);
}
function hasExplicitForeignWorkflowOwner(prefix) {
  return /(?:[:：(（]|の|用|向け(?:の)?|(?:で|が)(?:(?:現在|現に)\s*)?(?:使う|利用する)|に属する)$/.test(prefix)
    && !isM5TargetWorkflowQualifier(prefix);
}
function stripM5IdentityPreamble(line) {
  return line
    .replace(/^\s*(?:(?:[-*+]|\d+[.)])\s+)?/, "")
    .replace(/^(?:(?:補足|注記|注意)\s*[:：]\s*)+/, "");
}
function matchesLegacyWorkflowIdentity(normalizedLine) {
  const candidateLine = stripM5IdentityPreamble(normalizedLine).replace(/旧workflow/gi, "旧workflow");
  let offset = candidateLine.indexOf("旧workflow");
  while (offset >= 0) {
    const rawPrefix = candidateLine.slice(0, offset).trimEnd();
    const alias = /(?:(?:canonical|renamed)(?:\/(?:canonical|renamed))?|改名後(?:の)?|Phase 1 RLSの)$/.exec(rawPrefix);
    const qualifierPrefix = alias ? rawPrefix.slice(0, alias.index).trimEnd() : rawPrefix;
    if (!hasExplicitForeignWorkflowOwner(qualifierPrefix)) return true;
    offset = candidateLine.indexOf("旧workflow", offset + 1);
  }
  return false;
}
function matchesCarrierSpecificM5Identity(normalizedLine, extraPatterns) {
  const candidateLine = stripM5IdentityPreamble(normalizedLine);
  return extraPatterns.some((pattern) => {
    const match = pattern.exec(candidateLine);
    return Boolean(match && !hasExplicitForeignWorkflowOwner(candidateLine.slice(0, match.index).trimEnd()));
  });
}
function matchesM5CarrierIdentity(line, extraPatterns = []) {
  const normalizedLine = normalizeIdentityText(line);
  return m5CommonLegacyGateIdentityPatterns.some((pattern) => pattern.test(normalizedLine))
    || matchesCarrierSpecificM5Identity(normalizedLine, extraPatterns)
    || matchesLegacyWorkflowIdentity(normalizedLine);
}
function hasTildeObfuscatedTerm(line, term) {
  const normalizedLine = normalizePredicateText(line);
  const compactTerm = term.replace(/\s+/g, "");
  let compactLine = "";
  const sourceIndexes = [];
  for (let index = 0; index < normalizedLine.length; index += 1) {
    const character = normalizedLine[index];
    if (character === "~" || /\s/.test(character)) continue;
    compactLine += character;
    sourceIndexes.push(index);
  }
  let offset = compactLine.indexOf(compactTerm);
  while (offset >= 0) {
    const start = sourceIndexes[offset];
    const end = sourceIndexes[offset + compactTerm.length - 1];
    const before = normalizedLine.slice(0, start);
    const span = normalizedLine.slice(start, end + 1);
    const after = normalizedLine.slice(end + 1);
    if (span.includes("~") || /~+\s*$/.test(before) || /^\s*~+/.test(after)) return true;
    offset = compactLine.indexOf(compactTerm, offset + 1);
  }
  return false;
}
function containsAffirmativeForbiddenAssertion(line, term) {
  const normalizedLine = normalizePredicateText(line);
  if (line.includes("~") && hasTildeObfuscatedTerm(line, term)) return true;
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
      if (m5SafeNegativeEndings.test(targetClause)) {
        offset = normalizedLine.indexOf(term, offset + 1);
        continue;
      }
      const safePermissionPattern = /許可しない|許可されない|認めない|認められない|禁止する|禁止とする|不可/g;
      const safeMatches = [...targetClause.matchAll(safePermissionPattern)];
      const lastSafeMatch = safeMatches.at(-1);
      const hasSafeNegative = Boolean(safeMatches.length === 1 && lastSafeMatch && targetClause.slice(lastSafeMatch.index + lastSafeMatch[0].length).trim() === "");
      const withoutSafeNegative = targetClause.replace(safePermissionPattern, "");
      const hasAffirmativeOrAmbiguousPermission = /許可|認め|容認|可/.test(withoutSafeNegative);
      const allowsProhibitedCarryover = /禁止しない|禁止されない/.test(targetClause);
      if (allowsProhibitedCarryover || hasAffirmativeOrAmbiguousPermission) return true;
      if (safeMatches.length > 0 && !hasSafeNegative) return true;
      if (hasSafeNegative) {
        offset = normalizedLine.indexOf(term, offset + 1);
        continue;
      }
      return true;
    } else {
      const predicate = sentence.trimStart().replace(/^(?:を|は|が|の)\s*/, "");
      if (term.endsWith("禁止しない") || !m5SafeNegativeEndings.test(predicate)) return true;
    }
    offset = normalizedLine.indexOf(term, offset + 1);
  }
  return false;
}
function findM5RetirementContradiction(line) {
  for (const term of m5CarrierRetirementContradictionTerms) {
    if (containsAffirmativeForbiddenAssertion(line, term)) return term;
  }
  const normalizedLine = normalizePredicateText(line);
  for (const pattern of m5RetirementContradictionPatterns) {
    const match = pattern.exec(normalizedLine);
    if (match) {
      if (containsAffirmativeForbiddenAssertion(line, match[0])) return match[0];
      continue;
    }
    if (line.includes("~")) {
      const obfuscatedMatch = pattern.exec(normalizedLine.replace(/~/g, ""));
      if (obfuscatedMatch && hasTildeObfuscatedTerm(line, obfuscatedMatch[0])) return "tilde-obfuscated M6 retirement";
    }
  }
  return null;
}
function findM5EmbeddedTargetContradiction(line, identityPatterns = []) {
  const normalizedLine = normalizePredicateText(line);
  const embeddedPattern = /M6\s*(?:まで(?:は)?|以降(?:に|で|は)?|になってから|から|で|に|へ)(.{1,120}?)(?:廃止|退役|削除|維持|残す|先送り|持(?:ち)?越(?:す|し))/gi;
  for (const match of normalizedLine.matchAll(embeddedPattern)) {
    const embeddedTarget = match[1].replace(/^\s*の\s*/, "");
    const actionTimingOverride = /(?:\bM[0-5]\b\s*(?:で|に)|今すぐ|直ちに)\s*(?:を|は)?\s*$/.test(match[1]);
    const followingPredicate = normalizedLine.slice((match.index ?? 0) + match[0].length);
    const postfixedActionTimingOverride = /^\s*(?:(?:(?:する|した|される|された)|を(?:行う|行った|実施する|実施した))\s*の|(?:予定|時期|時点|判断))?\s*(?:は|が)\s*(?:\bM[0-5]\b|今すぐ|直ちに)/.test(followingPredicate)
      || /^\s*(?:(?:する|した|される|された)|を(?:行う|行った|実施する|実施した))\s*(?:予定|時期|時点|判断)\s*(?:は|が)\s*(?:\bM[0-5]\b|今すぐ|直ちに)/.test(followingPredicate)
      || /^\s*(?:(?:の\s*)?(?:予定|時期|時点|判断)\s*)?を\s*(?:\bM[0-5]\b|今すぐ|直ちに)\s*(?:と(?:する|定める)|に(?:設定|決定)する)/.test(followingPredicate);
    if (actionTimingOverride || postfixedActionTimingOverride || !matchesM5CarrierIdentity(embeddedTarget, identityPatterns)) continue;
    if (containsAffirmativeForbiddenAssertion(line, match[0])) return match[0];
  }
  return null;
}
function logicalAssertionBlocks(lines) {
  const blocks = [];
  let current = null;
  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      return;
    }
    if (/^#{1,6}\s/.test(trimmed) || /^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flush();
      return;
    }
    if (trimmed.startsWith("|")) {
      flush();
      blocks.push({ text: line, indexes: [index] });
      return;
    }
    if (/^(?:[-*+]\s+|\d+[.)]\s+)/.test(trimmed)) flush();
    if (current) {
      const leftVisible = normalizeIdentityText(current.text).trimEnd();
      const rightVisible = normalizeIdentityText(trimmed).trimStart();
      const separator = /[.!?]$/.test(leftVisible) || (/[A-Za-z0-9]$/.test(leftVisible) && /^[A-Za-z0-9]/.test(rightVisible)) ? " " : "";
      current.text += separator + trimmed;
      current.indexes.push(index);
    } else {
      current = { text: line, indexes: [index] };
    }
  });
  flush();
  return blocks;
}
function visibleSentenceFragments(text) {
  return text.split(/(?:[。！？]+|[!?]+|\.(?=\s|$)|(?<=[^A-Za-z0-9_.-])\.|[;；]+)/).map((sentence) => sentence.trim()).filter(Boolean);
}
function hasExplicitNonTargetBinding(clause, hasPendingM6Timing = false) {
  let markerIndex = clause.search(/M6|着地後|replacement未着地/);
  if (markerIndex < 0 && hasPendingM6Timing) markerIndex = clause.search(/廃止|退役|削除|維持|残す|先送り|持(?:ち)?越/);
  if (markerIndex < 0) return false;
  const binding = clause.slice(0, markerIndex).trim();
  if (/^(?:(?:廃止|退役|削除)(?:予定|時期|時点|判断)?|これ|それ)(?:は|を|が|も|について(?:は)?|に関して(?:は)?)?$/.test(binding)) return false;
  return /(?:は|を|が|も|だけ|のみ|に限り|について(?:は)?|に関して(?:は)?)$/.test(binding);
}
function m5ClauseFragments(sentence) {
  const explicitSubjectBreaks = sentence.replace(
    /((?:(?:廃止|退役|削除|維持|先送り)(?:する一方で|させて|させ|して|し)|残(?:す一方で|して|し)|持(?:ち)?越(?:す一方で|して|し)))(?=[^、，,|。！？]{1,80}(?:は|を|が|も|だけ|のみ|に限り)\s*M6)/g,
    "$1|"
  );
  return explicitSubjectBreaks.split(/[、，,|]/).map((value) => value.trim()).filter(Boolean);
}
function findM5SentenceContradiction(sentence, identityPatterns = []) {
  let carriesTargetIdentity = false;
  let pendingM6Timing = null;
  for (const clause of m5ClauseFragments(sentence)) {
    const directEmbeddedContradiction = findM5EmbeddedTargetContradiction(clause, identityPatterns);
    if (directEmbeddedContradiction) return directEmbeddedContradiction;
    const hasTargetIdentity = matchesM5CarrierIdentity(clause, identityPatterns);
    const hasOtherBinding = !hasTargetIdentity && hasExplicitNonTargetBinding(clause, Boolean(pendingM6Timing));
    const targetIsBound = hasTargetIdentity || (carriesTargetIdentity && !hasOtherBinding);
    if (targetIsBound) {
      const pendingClause = pendingM6Timing ? `${pendingM6Timing}${clause}` : null;
      const contradiction = findM5RetirementContradiction(clause)
        ?? (pendingClause ? findM5RetirementContradiction(pendingClause) : null)
        ?? (pendingClause ? findM5EmbeddedTargetContradiction(pendingClause, identityPatterns) : null);
      if (contradiction) return contradiction;
    }
    if (hasTargetIdentity) carriesTargetIdentity = true;
    else if (hasOtherBinding) carriesTargetIdentity = false;
    pendingM6Timing = null;
    const pendingAction = /(?:廃止|退役|削除)(?:予定|時期|時点|判断)?\s*(?:を|は)\s*M6\s*以降\s*(?:に|は)?\s*$/.exec(clause);
    const trailingM6Timing = /M6\s*(?:まで(?:は)?|以降(?:に|で|は)?|になってから|から|で|に|へ)\s*$/.exec(clause);
    if (targetIsBound && pendingAction) pendingM6Timing = pendingAction[0];
    else if (trailingM6Timing && (targetIsBound || trailingM6Timing.index === 0)) pendingM6Timing = trailingM6Timing[0];
  }
  return null;
}
function findM5CarrierContradiction(lines, identityPatterns = [], isExemptIndex = () => false) {
  return logicalAssertionBlocks(lines)
    .filter(({ indexes }) => !indexes.every(isExemptIndex))
    .flatMap(({ text }) => visibleSentenceFragments(text))
    .map((sentence) => findM5SentenceContradiction(sentence, identityPatterns))
    .find(Boolean) ?? null;
}
const m5PredicateFixtures = [
  ["M6への持越しは許可しないわけではない", "M6への持越し", true],
  ["M6への持越しは許可しないとは認めない", "M6への持越し", true],
  ["M6への持越しは不可とは認めない", "M6への持越し", true],
  ["M6で削除しないわけではない", "M6で削除", true],
  ["M6で削除~~しない~~", "M6で削除", true],
  ["M6で削除~しない~", "M6で削除", true],
  ["M6で削除~~~しない~~~", "M6で削除", true],
  ["M6で削除~~しない", "M6で削除", true],
  ["旧workflowはM6で~~削除~~する", "M6で削除", true],
  ["旧workflowはM6で~削除する", "M6で削除", true],
  ["~~M6で削除しない~~", "M6で削除", true],
  ["M6への持越しは**許可しない**", "M6への持越し", false],
  ["M6で削除__しない__", "M6で削除", false]
];
for (const [line, term, expected] of m5PredicateFixtures) {
  if (containsAffirmativeForbiddenAssertion(line, term) !== expected) {
    errors.push(`M5 predicate fixture failed: ${line}`);
  }
}
for (const line of ["renamed旧workflowはM6で削除する", "canonical旧workflowはM6で削除する", "canonical/renamed旧workflowはM6で削除する", "改名後旧workflowはM6で削除する", "改名後の旧workflowはM6で削除する", "旧WorkflowはM6で削除する", "~~renamed~~旧workflowはM6で削除する", "~~旧workflow~~はM6で削除する", "~旧workflowはM6で削除する"]) {
  if (!matchesM5CarrierIdentity(line)) errors.push(`Legacy workflow identity fixture failed: ${line}`);
}
for (const line of ["Stripeの旧workflowはM6で削除する", "Stripeのcanonical旧workflowはM6で削除する", "Stripe（旧workflow）はM6で削除する", "Stripe: 旧workflowはM6で削除する", "Stripeに属する旧workflowはM6で削除する", "Stripe用旧workflowはM6で削除する", "Stripe向けcanonical旧workflowはM6で削除する", "決済で使う旧workflowはM6で削除する", "Phase 1 RLS Live GatewayはM6で削除する"]) {
  if (matchesM5CarrierIdentity(line)) errors.push(`Unrelated workflow identity fixture failed: ${line}`);
}
for (const line of ["旧Supabase live runtimeはM6で削除する", "旧Supabase live APIはM6で削除する"]) {
  if (matchesM5CarrierIdentity(line)) errors.push(`Unrelated Supabase identity fixture failed: ${line}`);
}
for (const line of ["旧Supabaseのlive gateはM6で削除する", "旧Supabase の live gateはM6で削除する", "旧Supabaseの live gateはM6で削除する", "旧Supabase live workflowはM6で削除する", "旧Supabase live  workflowはM6で削除する", "旧Supabase RLS live workflowはM6で削除する", ".github/workflows/phase1-rls-live.yml はM6で削除する", "renamed-phase1-rls-live.ymlはM6で削除する"]) {
  if (!matchesM5CarrierIdentity(line)) errors.push(`Legacy gate identity fixture failed: ${line}`);
}
for (const line of ["対象のrenamed旧workflowはM6で削除する", "Phase 1 RLS: 旧workflowはM6で削除する", "補足: 旧workflowはM6で削除する"]) {
  if (!matchesM5CarrierIdentity(line)) errors.push(`Attached legacy workflow alias fixture failed: ${line}`);
}
const m5RetirementPhraseFixtures = [
  ["旧workflowの退役をM6に延期する", true],
  ["旧workflowの廃止はM6まで延期する", true],
  ["旧workflowの退役時期をM6まで延期する", true],
  ["旧workflowはM6で廃止する", true],
  ["旧workflowの削除をM6で行う", true],
  ["旧workflowをM6に退役させる", true],
  ["旧workflowはM6まで維持し、その後削除する", true],
  ["旧workflowの廃止をM6へ先送りする", true],
  ["旧workflowの削除はM6で行う", true],
  ["旧workflowはM6以降に削除する", true],
  ["旧workflowはM6になってから廃止する", true],
  ["旧workflowはM6まで残す", true],
  ["旧workflowをM6に持ち越す", true],
  ["旧workflowのM6への持ち越しを許可する", true],
  ["旧workflowの削除はM6で行わないわけではない", true],
  ["旧workflowはM6以降、削除する", true],
  ["M6以降に旧workflowを削除する", true],
  ["旧workflowの削除をM6以降に行う", true],
  ["旧workflowはM6まで残さないわけではない", true],
  ["旧workflowはM6まで残さないとは限らない", true],
  ["旧workflowをM6に持ち越さないわけではない", true],
  ["旧workflowをM6に持ち越さないとは限らない", true],
  ["旧workflowはM6までは維持する", true],
  ["旧workflowはM6から削除する", true],
  ["旧workflowの削除時期はM6とする", true],
  ["旧workflowの削除予定をM6と定める", true],
  ["旧workflowはM7で削除する", true],
  ["旧workflowの削除時期はM7とする", true],
  ["旧workflowの退役をM6に延期しない", false],
  ["旧workflowはM6まで維持しない", false],
  ["旧workflowはM6で廃止しない", false],
  ["旧workflowをM6に退役させない", false],
  ["旧workflowはM6で削除する予定はない", false],
  ["旧workflowの廃止予定をM6に延期しない", false],
  ["旧workflowはM6へ先送りしない", false],
  ["旧workflowはM6まで残す予定はない", false],
  ["旧workflowのM6への持ち越しを許可しない", false],
  ["旧workflowのM6への持越し予定はない", false],
  ["旧workflowのM6への持越しは行わない", false],
  ["旧workflowはM6まで残すことはない", false],
  ["旧workflowをM6に持ち越すことはない", false],
  ["旧workflowはM6で削除する予定ではない", false],
  ["旧workflowはM6までは維持すべきではない", false],
  ["旧workflowをM6に持ち越すべきではない", false],
  ["旧workflowはM6まで維持しないものとする", false],
  ["旧workflowはM6まで維持しないこととする", false],
  ["旧workflowはM6まで維持する必要はない", false],
  ["旧workflowはM6まで維持する方針ではない", false],
  ["旧workflowはM6までは維持すべきだ", true],
  ["旧workflowをM6に持ち越すべきだ", true],
  ["旧workflowはM6まで維持するものとする", true],
  ["旧workflowはM6まで維持しないものとはしない", true],
  ["旧workflowはM6まで維持する必要がある", true],
  ["旧workflowはM6まで維持する方針である", true]
];
for (const [line, expected] of m5RetirementPhraseFixtures) {
  if (Boolean(findM5RetirementContradiction(line)) !== expected) errors.push(`M5 retirement phrase fixture failed: ${line}`);
}
for (const lines of [["- 旧Supabase live workflowはM6で", "  削除する。"], ["- 旧Supabase live", "  workflowはM6で削除する。"]]) {
  if (!findM5CarrierContradiction(lines)) {
    errors.push(`M5 soft-wrap contradiction fixture failed: ${lines.join(" / ")}`);
  }
}
if (findM5CarrierContradiction(["- 旧Supabase live work", "  flowはM6で削除する。"])) {
  errors.push("M5 soft-wrap unrelated identity fixture failed.");
}
for (const line of ["phase1-rls-live.yml はM5で削除する。Stripeの旧workflowはM6で削除する。", "phase1-rls-live.yml はM5で削除する. Stripeの旧workflowはM6で削除する!", "| phase1-rls-live.yml はM5で削除する | Stripeの旧workflowはM6で削除する |"]) {
  if (findM5CarrierContradiction([line])) {
    errors.push(`M5 sentence-local identity fixture failed: ${line}`);
  }
}
for (const line of ["phase1-rls-live.yml はM5で削除する!Stripeの旧workflowはM6で削除する。", "phase1-rls-live.yml はM5で削除する?Stripeの旧workflowはM6で削除する。", "phase1-rls-live.yml はM5で削除する.Stripeの旧workflowはM6で削除する。", "phase1-rls-live.yml はM5で削除する,Stripeの旧workflowはM6で削除する。"]) {
  if (findM5CarrierContradiction([line])) errors.push(`M5 adjacent ASCII boundary fixture failed: ${line}`);
}
for (const [line, carrierName] of [["Phase 1 RLS immutable previewerはM6で削除する。", "environments preview matrix M5 safety"], ["Stripe canonical live gatewayはM6で削除する。", "phase1 setup active exception"]]) {
  if (findM5CarrierContradiction([line], m5CarrierIdentityPatternsByName.get(carrierName))) {
    errors.push(`M5 carrier-specific identity boundary fixture failed: ${line}`);
  }
}
for (const [line, carrierName] of [["Stripeのcanonical workflowはM6で削除する。", "phase1 setup frozen baseline"], ["Stripeのcanonical live gateはM6で削除する。", "phase1 setup active exception"]]) {
  if (findM5CarrierContradiction([line], m5CarrierIdentityPatternsByName.get(carrierName))) {
    errors.push(`M5 carrier-specific owner fixture failed: ${line}`);
  }
}
if (!findM5CarrierContradiction(["既存staging/test契約のcanonical workflowはM6で削除する。"], m5CarrierIdentityPatternsByName.get("phase1 setup frozen baseline"))) {
  errors.push("M5 carrier-specific target owner fixture failed.");
}
if (!findM5CarrierContradiction(["既存staging/test契約で使うcanonical workflowはM6で削除する。"], m5CarrierIdentityPatternsByName.get("phase1 setup frozen baseline"))) {
  errors.push("M5 carrier-specific target usage fixture failed.");
}
for (const line of ["Stripeで現在使う旧workflowはM6で削除する。", "Stripeが使う旧workflowはM6で削除する。"]) {
  if (findM5CarrierContradiction([line])) errors.push(`M5 current foreign-owner fixture failed: ${line}`);
}
if (!findM5CarrierContradiction(["対象（live RLS gate）はM6で削除する。"])) {
  errors.push("M5 parenthesized target fixture failed.");
}
if (findM5CarrierContradiction(["~注記~: 旧workflowはM6で削除しない。"])) {
  errors.push("M5 tilde-locality fixture failed.");
}
if (findM5CarrierContradiction(["phase1-rls-live.yml はM5で削除する.", "  Stripeの旧workflowはM6で削除する。"])) {
  errors.push("M5 soft-wrap sentence-local identity fixture failed.");
}
for (const line of ["旧workflowはM5で削除し、監査資料はM6まで維持する。", "旧workflowはM5で削除し、監査資料をM6へ先送りする。", "旧workflowはM5で削除し、監査資料についてM6まで維持する。", "旧workflowはM5で削除し、監査資料もM6まで維持する。", "旧workflowはM5で削除し、監査資料だけM6まで維持する。", "旧workflowはM5で削除し、監査資料のみM6まで維持する。", "旧workflowはM5で削除し、監査資料に限りM6まで維持する。"]) {
  if (findM5CarrierContradiction([line])) errors.push(`M5 clause-local identity fixture failed: ${line}`);
}
for (const line of ["旧workflowはM5で削除し監査資料をM6まで維持する。", "旧workflowはM5で削除して監査資料をM6まで維持する。", "旧workflowはM5で削除する一方で監査資料をM6まで維持する。"]) {
  if (findM5CarrierContradiction([line])) errors.push(`M5 conjunction binding fixture failed: ${line}`);
}
for (const line of ["旧workflowはM5まで維持し監査資料をM6で削除する。", "旧workflowはM5で退役させ監査資料をM6まで維持する。"]) {
  if (findM5CarrierContradiction([line])) errors.push(`M5 alternate-action binding fixture failed: ${line}`);
}
if (!findM5CarrierContradiction(["旧workflowについては、M6で削除する。"])) {
  errors.push("M5 inherited clause identity fixture failed.");
}
for (const line of ["旧workflowはM5まで維持し、削除はM6で行う。", "旧workflowはM5まで維持し、廃止時期はM6まで延期する。", "旧workflowはM5まで維持し、これはM6で削除する。"]) {
  if (!findM5CarrierContradiction([line])) errors.push(`M5 continuation binding fixture failed: ${line}`);
}
for (const line of ["旧workflowはM6以降に、削除する。", "旧workflowはM6以降は、削除する。", "旧workflowはM6になってから、廃止する。"]) {
  if (!findM5CarrierContradiction([line])) errors.push(`M5 deferred-clause fixture failed: ${line}`);
}
for (const line of ["M6で、旧workflowを削除する。", "M6まで、旧workflowを維持する。", "M6へ、旧workflowを持ち越す。"]) {
  if (!findM5CarrierContradiction([line])) errors.push(`M5 standalone timing fixture failed: ${line}`);
}
for (const line of ["M6で旧workflowを削除する。", "M6で旧workflow（M5まで現行）を削除する。", "M6以降に旧workflowを削除する。", "M6以降、旧workflowを削除する。", "M6へ旧workflowを持ち越す。", "M6へ旧workflowを先送りする。", "旧workflowの削除をM6以降、行う。"]) {
  if (!findM5CarrierContradiction([line])) errors.push(`M5 target-order fixture failed: ${line}`);
}
if (findM5CarrierContradiction(["M6までの計画では旧workflowをM5で削除する。"])) {
  errors.push("M5 intervening milestone fixture failed.");
}
if (findM5CarrierContradiction(["M6までの計画では旧workflowを今すぐ削除する。"])) {
  errors.push("M5 planning-context fixture failed.");
}
if (findM5CarrierContradiction(["M6までの計画で旧workflowを削除するのはM5である。"])) {
  errors.push("M5 postfixed planning milestone fixture failed.");
}
for (const line of ["M6までの計画で旧workflowを削除したのはM5である。", "M6までの計画で旧workflowの削除予定はM5である。", "M6までの計画で旧workflowの削除時期をM5とする。", "M6までの計画で旧workflowの削除予定をM5とする。", "M6までの計画で旧workflowを削除する時期はM5とする。", "M6までの計画で旧workflowを削除する予定はM5である。"]) {
  if (findM5CarrierContradiction([line])) errors.push(`M5 postfixed planning variant fixture failed: ${line}`);
}
if (!findM5CarrierContradiction(["M6までの計画で旧workflowの削除時期をM6とする。"])) {
  errors.push("M5 postfixed M6 planning contradiction fixture failed.");
}
if (!findM5CarrierContradiction(["M6までの計画では旧workflowを維持し続ける。"])) {
  errors.push("M5 planning-context contradiction fixture failed.");
}
if (!findM5CarrierContradiction(["M6への旧workflowの持ち越しを許可する。"])) {
  errors.push("M5 embedded carryover noun fixture failed.");
}
if (findM5CarrierContradiction(["M6への旧workflowの持ち越しを許可しない。"])) {
  errors.push("M5 embedded carryover negative fixture failed.");
}
for (const line of ["M6への旧workflowの持ち越しを許可する予定ではない。", "M6への旧workflowの持ち越しを許可することはない。", "M6への旧workflowの持ち越しを認める予定はない。"]) {
  if (findM5CarrierContradiction([line])) errors.push(`M5 embedded carryover negative-modal fixture failed: ${line}`);
}
for (const line of ["M6への旧workflowの持ち越しを許可する予定である。", "M6への旧workflowの持ち越しを認める。"]) {
  if (!findM5CarrierContradiction([line])) errors.push(`M5 embedded carryover affirmative-modal fixture failed: ${line}`);
}
if (findM5CarrierContradiction(["M6へのStripeの旧workflowの持ち越しを許可する。"])) {
  errors.push("M5 embedded carryover foreign-owner fixture failed.");
}
if (!findM5CarrierContradiction(["M6でStripeの旧workflowを削除してからM6で旧workflowを削除する。"])) {
  errors.push("M5 later embedded target fixture failed.");
}
if (!findM5CarrierContradiction(["| 旧Supabase live workflow | transitional | M6で削除する |"])) {
  errors.push("M5 table-row inherited identity fixture failed.");
}
if (findM5CarrierContradiction(["Stripeで使う旧workflowはM6で削除する。"])) {
  errors.push("M5 foreign-owner identity fixture failed.");
}
if (!findM5CarrierContradiction(["補足: 旧workflowはM6で削除する。"])) {
  errors.push("M5 discourse-label identity fixture failed.");
}
if (!findM5CarrierContradiction(["> [!IMPORTANT]", "> 旧workflowはM6で削除する。"])) {
  errors.push("M5 blockquote callout contradiction fixture failed.");
}
if (!findM5CarrierContradiction(["- 旧workflowの履歴", "- 旧workflowはM6で削除する。"], [], (index) => index === 0)) {
  errors.push("M5 history sibling contradiction fixture failed.");
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
    const normalizedRawLine = line.replace(/^(?: {0,3}>\s?)+/, "");
    const rawFenceMatch = /^(?: {0,3})(?<marker>`{3,}|~{3,})(?<rest>.*)$/.exec(normalizedRawLine);
    if (fenceMarker !== null) {
      const marker = rawFenceMatch?.groups.marker;
      const sameFence = marker !== undefined && marker[0] === fenceMarker[0] && marker.length >= fenceMarker.length && /^\s*$/.test(rawFenceMatch.groups.rest);
      if (sameFence) fenceMarker = null;
      return "";
    }
    const visibleLine = removeHtmlCommentSpans(line);
    const unquotedLine = visibleLine.replace(/^(?: {0,3}>\s?)+/, "");
    const normalizedIndentedLine = unquotedLine.replace(/^(?:(?: {4,}|\t+))(?=(?:[-*+]|\d+[.)])\s+)/, "");
    if (/^(?: {4}|\t)/.test(normalizedIndentedLine)) return "";
    const fenceMatch = /^(?: {0,3})(?<marker>`{3,}|~{3,})(?<rest>.*)$/.exec(normalizedIndentedLine);
    if (fenceMatch) {
      const marker = fenceMatch.groups.marker;
      if (marker[0] === "`" && fenceMatch.groups.rest.includes("`")) return normalizedIndentedLine;
      fenceMarker = marker;
      return "";
    }
    return fenceMarker === null ? normalizedIndentedLine : "";
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
    exact: true,
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
    prefix: "- #92の完了記録を維持し、M5で退役済みの旧gateについてIssue #95の完了記録と残存履歴を整理する",
    exact: true,
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
    prefix: "EPIC-02、EPIC-03、EPIC-06のSupabase Auth/Postgres/RLS実装は移行前baselineとして保持するが、新規機能の土台やstaging合格証跡として拡張しない。Issue #92はcompleted closeされ、blanket main merge holdは解除済みである。#95の旧Supabase live gateはSupersededとし、新規Supabase資格情報やlive runを追加しない。Issue #176 M5の実immutable preview negative proofが完了するまではstaging合格、production資源作成・deploy、外部招待を禁止する。",
    exact: true,
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
  return { name, path, scope, boundedLines, lines, terms, forbiddenTerms, identityPatterns: m5CarrierIdentityPatternsByName.get(name) ?? [] };
});
const exemptCarrierLines = new Set(
  m5CarrierResolutions
    .filter(({ forbiddenTerms, lines }) => forbiddenTerms.length === 0 && lines.length === 1)
    .map(({ path, scope, boundedLines, lines }) => `${path}\u0000${scope}\u0000${boundedLines.indexOf(lines[0])}`)
);
for (const { name, path, scope, boundedLines, lines, terms, forbiddenTerms, identityPatterns } of m5CarrierResolutions) {
  if (lines.length !== 1) continue;
  for (const term of terms) {
    if (!lines[0].includes(term)) errors.push(`${name} is missing a required contract term in ${path}: ${term}`);
  }
  if (forbiddenTerms.length > 0 && !matchesM5CarrierIdentity(lines[0], identityPatterns)) {
    errors.push(`${name} canonical line is missing a typed legacy-gate identity in ${path}`);
  }
  const contradiction = findM5CarrierContradiction(
    boundedLines,
    identityPatterns,
    (index) => exemptCarrierLines.has(`${path}\u0000${scope}\u0000${index}`)
  );
  if (contradiction) {
    errors.push(`${name} contains a forbidden retirement assertion in ${path}: ${contradiction}`);
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
