import { readFile } from "node:fs/promises";

const requiredDocs = {
  "README.md": [
    "Cloudflare R2を第一候補",
    "Stripe Checkout Sessions / Link / Webhook"
  ],
  "docs/01-product/pricing-and-plans.md": [
    "550円 / 1マニュアル",
    "3,300円 / 月",
    "9,900円 / 月",
    "`single_export`",
    "`personal_monthly`",
    "`team_monthly`",
    "Stripe Link",
    "購入日から30日間",
    "上限超過による自動課金は行わず"
  ],
  "docs/08-operations/remaining-harness-plan.md": [
    "R2 Storageハーネス",
    "Staging/Production分離ハーネス",
    "Stripe課金ハーネス",
    "DB migration安全ハーネス",
    "Browser Run / Browser Sessionハーネス",
    "承認が必要な操作",
    "完了条件"
  ],
  "docs/08-operations/environments-and-delivery.md": [
    "GitHub Environment",
    "Cloudflare Worker",
    "Supabase project",
    "Stripe",
    "`main` マージ後の扱い",
    "現段階のproduction workflowはcheckで停止する"
  ],
  "docs/08-operations/stripe-billing-harness.md": [
    "`BILLING_FEATURE_ENABLED=false`",
    "550 JPY / one manual / tax included",
    "3,300 JPY / monthly / tax included",
    "9,900 JPY / monthly / tax included",
    "Stripe Checkout SessionsとLink",
    "client_reference_id",
    "raw body",
    "stripe_event_id",
    "順不同",
    "未払い",
    "解約",
    "返金",
    "席数",
    "flagに関係なく継続",
    "自動返金queue",
    "idempotency key",
    "PLAN_CHANGE_UNRESOLVED"
  ],
  "docs/08-operations/db-migration-safety-harness.md": [
    "適用前チェック",
    "RLS negative test",
    "production",
    "実DB接続、migration適用、Secret取得を行っていない"
  ],
  "docs/08-operations/browser-run-session-harness.md": [
    "Durable Object",
    "Live View URL",
    "SSRF",
    "actual peer",
    "fail closed",
    "WebSocket",
    "WebTransport/QUIC",
    "WebRTC",
    "application bytes",
    "capture.browserRun.egressVerified.enabled=false",
    "入力値",
    "スクリーンショット",
    "終了・失敗・期限切れ",
    "監査ログ"
  ],
  "docs/08-operations/feature-flags.md": [
    "`capture.browserRun.egressVerified.enabled`",
    "AC-023"
  ],
  "docs/05-api/api-contracts.md": [
    "503 BROWSER_EGRESS_NOT_VERIFIED",
    "mobile preview session",
    "hostnameのallowlistや運営承認はこの拒否を迂回できず"
  ],
  "docs/01-product/requirements-traceability.md": [
    "| FR-007 | SCR-CAPTURE-START | capture session APIs | browser_sessions, capture_sessions | ADR-0002 | AC-020, AC-023, AC-025 |",
    "| FR-016 | SCR-MOBILE-PREVIEW | mobile preview session API | browser_sessions | ADR-0002 | AC-024, AC-025 |"
  ],
  "docs/07-quality/acceptance-catalog.md": [
    "| AC-020 | editorユーザーかつ `capture.browserRun.egressVerified.enabled=true`、P0検証済み |",
    "| AC-024 | editorユーザーかつegress P0検証未完了 |",
    "| AC-025 | Browser Runセッション稼働中 |"
  ],
  "docs/09-delivery/decision-log.md": [
    "DEC-032",
    "任意URL・承認済みhost・mobile previewを含む全Browser Run起動",
    "egress kill switchで既存Browserの全通信を即時遮断",
    "Live Viewを失効して再発行を拒否",
    "全sessionのclose完了まで再試行・監査"
  ],
  "docs/09-delivery/risk-register.md": [
    "RISK-018",
    "任意URL・承認済みhost・mobile previewを含む全Browser Runをfail closed"
  ],
  "docs/08-operations/environment-variables.md": [
    "`STRIPE_SECRET_KEY`",
    "`STRIPE_WEBHOOK_SECRET`",
    "`STRIPE_PRICE_SINGLE_EXPORT`",
    "`STRIPE_PRICE_PERSONAL_MONTHLY`",
    "`STRIPE_PRICE_TEAM_MONTHLY`",
    "`BILLING_FEATURE_ENABLED`"
  ],
  "docs/03-architecture/integrations.md": [
    "`single_export`: 550 JPY",
    "`personal_monthly`: 3,300 JPY",
    "`team_monthly`: 9,900 JPY",
    "固定Payment Link URLはentitlement付与に使わない"
  ],
  "docs/01-product/requirements-traceability.md": [
    "AC-056, AC-057, AC-059, AC-062, AC-063",
    "AC-055, AC-058"
  ]
};

const forbiddenLegacyR2Names = [
  "meccha-manual-staging-capture-assets",
  "meccha-manual-staging-manual-assets",
  "meccha-manual-staging-exports",
  "meccha-manual-staging-avatars",
  "meccha-manual-production-capture-assets",
  "meccha-manual-production-manual-assets",
  "meccha-manual-production-exports",
  "meccha-manual-production-avatars"
];

const errors = [];
const contents = {};

for (const [file, terms] of Object.entries(requiredDocs)) {
  try {
    const content = await readFile(file, "utf8");
    contents[file] = content;
    for (const term of terms) {
      if (!content.includes(term)) {
        errors.push(`Missing harness term in ${file}: ${term}`);
      }
    }
  } catch {
    errors.push(`Missing harness document: ${file}`);
  }
}

const combined = Object.values(contents).join("\n");
const acceptanceCatalog = contents["docs/07-quality/acceptance-catalog.md"] ?? "";
const ac023 = acceptanceCatalog.split("\n").find((line) => line.startsWith("| AC-023 |")) ?? "";
for (const term of ["application bytes送信前", "actual peerで拒否", "1経路でも拘束不能", "BROWSER_EGRESS_NOT_VERIFIED", "fail closed"]) {
  if (!ac023.includes(term)) errors.push(`AC-023 is missing fail-closed term: ${term}`);
}
const ac024 = acceptanceCatalog.split("\n").find((line) => line.startsWith("| AC-024 |")) ?? "";
for (const term of ["mobile previewを開始", "Browser Runへ通信せず", "BROWSER_EGRESS_NOT_VERIFIED", "拒否される"]) {
  if (!ac024.includes(term)) errors.push(`AC-024 is missing preflight rejection term: ${term}`);
}
const ac025 = acceptanceCatalog.split("\n").find((line) => line.startsWith("| AC-025 |")) ?? "";
for (const term of ["flagをfalseへ戻す", "既存egressを即時遮断", "Live View失効", "再発行拒否", "全session終了"]) {
  if (!ac025.includes(term)) errors.push(`AC-025 is missing emergency shutdown term: ${term}`);
}
for (const legacyName of forbiddenLegacyR2Names) {
  if (combined.includes(legacyName)) {
    errors.push(`Legacy R2 bucket name remains in harness docs: ${legacyName}`);
  }
}

for (const legacyTerm of [
  "`STRIPE_PAYMENT_LINK_SINGLE_EXPORT`",
  "`STRIPE_PAYMENT_LINK_PERSONAL_MONTHLY`",
  "`STRIPE_PAYMENT_LINK_TEAM_MONTHLY`",
  "Product: `めっちゃマニュアル Pro`",
  "Stripe Payment Links + Webhook"
]) {
  if (combined.includes(legacyTerm)) {
    errors.push(`Legacy Stripe contract remains in harness docs: ${legacyTerm}`);
  }
}

const traceability = contents["docs/01-product/requirements-traceability.md"] ?? "";
const requiredAcceptanceByRequirement = {
  "FR-019": ["AC-050", "AC-052", "AC-054", "AC-055", "AC-056", "AC-057", "AC-059", "AC-062", "AC-063"],
  "FR-021": ["AC-051", "AC-053", "AC-055", "AC-058"]
};
for (const [requirement, acceptanceIds] of Object.entries(requiredAcceptanceByRequirement)) {
  const row = traceability.split("\n").find((line) => line.startsWith(`| ${requirement} |`));
  if (!row) {
    errors.push(`Missing traceability row: ${requirement}`);
    continue;
  }
  const acceptanceColumn = row.split("|")[6] ?? "";
  const actual = [...acceptanceColumn.matchAll(/AC-\d{3}/g)].map(([id]) => id).sort();
  const expected = [...acceptanceIds].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    errors.push(`Acceptance criteria mismatch in ${requirement}: expected ${expected.join(", ")}`);
  }
}

const acceptanceCatalog = await readFile("docs/07-quality/acceptance-catalog.md", "utf8");
const acceptanceIds = [...acceptanceCatalog.matchAll(/^\| (AC-\d{3}) \|/gm)].map(([, id]) => id);
const duplicateAcceptanceIds = acceptanceIds.filter((id, index) => acceptanceIds.indexOf(id) !== index);
if (duplicateAcceptanceIds.length > 0) {
  errors.push(`Duplicate acceptance criteria IDs: ${[...new Set(duplicateAcceptanceIds)].join(", ")}`);
}

const wrangler = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
for (const [environment, config] of [["default", wrangler], ...Object.entries(wrangler.env ?? {})]) {
  const billingFlag = config?.vars?.BILLING_FEATURE_ENABLED;
  if (billingFlag !== undefined && billingFlag !== false && billingFlag !== "false") {
    errors.push(`Billing must remain disabled in ${environment} wrangler environment.`);
  }

  const configuredNames = [
    ...Object.keys(config?.vars ?? {}),
    ...(config?.secrets?.required ?? [])
  ];
  if (configuredNames.some((name) => String(name).startsWith("STRIPE_"))) {
    errors.push(`Stripe runtime configuration must not be registered yet in ${environment}.`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Harness docs OK: ${Object.keys(requiredDocs).length} documents and disabled Stripe runtime state checked without reading secrets.`);
