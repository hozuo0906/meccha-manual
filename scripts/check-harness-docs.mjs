import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";

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
    "監査ログ",
    "provider保証の絶対失効",
    "未実証なら起動をfail closed",
    "closeの失敗・hangとWorker/DO再起動"
  ],
  "docs/08-operations/browser-run-egress-proof.md": [
    "guardrails.allowedDomains",
    "actual peer",
    "blocked_before_bytes",
    "disabled_before_attempt",
    "WebTransport/QUIC",
    "WebRTC ICE/STUN/TURN",
    "BROWSER_EGRESS_NOT_VERIFIED",
    "RUN_ISOLATED_STAGING_P0"
  ],
  "docs/08-operations/feature-flags.md": [
    "`capture.browserRun.egressVerified.enabled`",
    "AC-023",
    "owner明示承認が揃うまでAI用flagを登録しない"
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
  "docs/08-operations/r2-storage-harness.md": [
    "初回要求前に推測不能なoperation key",
    "active reserved bytes",
    "lease期限後にreconciliation",
    "結果不明再送",
    "予約枠の永久消費"
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
if ((contents["docs/08-operations/feature-flags.md"] ?? "").includes("ai.assistiveGeneration.enabled")) {
  errors.push("AI feature flag must not be registered before owner approval.");
}
if ((contents["docs/08-operations/environment-variables.md"] ?? "").includes("| `AI_PROVIDER_API_KEY` |")) {
  errors.push("AI provider secret must not be registered before owner approval.");
}

async function listRuntimeFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = `${root}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await listRuntimeFiles(path));
    else if (entry.isFile() && /\.(?:[cm]?[jt]s|tsx?|jsonc?|html|css|sql)$/i.test(entry.name)) files.push(path);
  }
  return files;
}

const runtimeFiles = [
  ...await listRuntimeFiles("apps"),
  ...await listRuntimeFiles("supabase"),
  "wrangler.jsonc",
  "wrangler.brand.jsonc",
  "package.json"
];
const packageManifest = JSON.parse(await readFile("package.json", "utf8"));
const approvedDependencies = [];
const approvedDevDependencies = {
  "@cloudflare/workers-types": "5.20260812.1",
  "@playwright/test": "1.62.1",
  parse5: "^8.0.0",
  typescript: "7.0.2",
  wrangler: "4.121.0"
};
for (const [group, actual, approved] of [
  ["dependencies", Object.keys(packageManifest.dependencies ?? {}), approvedDependencies],
  ["devDependencies", Object.keys(packageManifest.devDependencies ?? {}), Object.keys(approvedDevDependencies)]
]) {
  const unexpected = actual.filter((name) => !approved.includes(name));
  if (unexpected.length > 0) errors.push(`Unapproved ${group} may introduce a product runtime boundary: ${unexpected.join(", ")}`);
}
for (const [name, spec] of Object.entries(approvedDevDependencies)) {
  if (packageManifest.devDependencies?.[name] !== spec) errors.push(`Approved dependency spec changed: ${name}`);
}
const packageLock = JSON.parse(await readFile("package-lock.json", "utf8"));
const packageLockSha256 = createHash("sha256").update(await readFile("package-lock.json")).digest("hex");
if (packageLockSha256 !== "d206407a8c85c247f9f6f1f97f677f32d082ad8a257e5650dc65f74755922196") {
  errors.push("package-lock.json dependency graph or resolution metadata changed without allowlist review.");
}
if (JSON.stringify(packageLock.packages?.[""]?.dependencies ?? {}) !== JSON.stringify(packageManifest.dependencies ?? {})) {
  errors.push("package-lock runtime dependencies differ from package.json.");
}
if (JSON.stringify(packageLock.packages?.[""]?.devDependencies ?? {}) !== JSON.stringify(packageManifest.devDependencies ?? {})) {
  errors.push("package-lock devDependencies differ from package.json.");
}

function hasAiRuntimeBoundary(content, path = "") {
  const normalizedPath = path.toLowerCase();
  let normalizedContent = content.replace(/\\u\{([0-9a-f]{1,6})\}|\\u([0-9a-f]{4})/gi, (_match, braced, fixed) => String.fromCodePoint(Number.parseInt(braced ?? fixed, 16)));
  let previousNormalizedContent;
  do {
    previousNormalizedContent = normalizedContent;
    normalizedContent = normalizedContent.replace(/(["'`])([^"'`\\$]*)\1\s*\+\s*(["'`])([^"'`\\$]*)\3/g, (_match, quote, left, _rightQuote, right) => `${quote}${left}${right}${quote}`);
  } while (normalizedContent !== previousNormalizedContent);
  const approvedEgressHosts = new Set([
    "api.github.com",
    "discord.com",
    "spjowmulvoyxxkfeyjkr.supabase.co",
    "www.meccha-iiyatsu.com",
    "meccha-manual.meccha-iiyatsu.com",
    "meccha-manual.tattoo-studio-crm.workers.dev"
  ]);
  const literalUrls = normalizedContent.match(/https?:\/\/[^\s'"`<>)]+/gi) ?? [];
  const hasUnapprovedLiteralEgress = literalUrls.some((literal) => {
    try {
      const parsed = new URL(literal.replace(/\$\{.*$/, ""));
      const host = parsed.hostname.toLowerCase();
      return parsed.protocol !== "https:" || !approvedEgressHosts.has(host);
    } catch {
      return true;
    }
  });
  const directFetchArguments = [...content.matchAll(/(?<![.\w])fetch\s*\(\s*([^,\n)]+)/g)].map((match) => match[1].trim());
  const approvedDirectFetchArguments = new Set([
    "`${config.url}${path}`",
    "request: Request",
    "`https://api.github.com/repos/${owner}/${repo}/issues`",
    "`https://api.github.com${path}`",
    "`https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`"
  ]);
  const isApprovedDirectFetchArgument = (argument) => {
    if (argument === "request: Request") return true;
    const expectedCounts = {
      "apps/worker/src/index.ts": new Map([
        ["`${config.url}${path}`", 1],
        ["`https://api.github.com/repos/${owner}/${repo}/issues`", 1],
        ["`https://api.github.com${path}`", 1],
        ["`https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`", 1]
      ]),
      "apps/worker/src/manual-router.ts": new Map([["`${config.url}${path}`", 1]]),
      "apps/worker/src/app-assets.ts": new Map([["path", 1]])
    };
    const expected = expectedCounts[path]?.get(argument);
    return expected !== undefined && directFetchArguments.filter((candidate) => candidate === argument).length === expected;
  };
  const hasUnapprovedDirectFetch = directFetchArguments.some((argument) =>
    !isApprovedDirectFetchArgument(argument)
  );
  const memberFetchReceivers = [...content.matchAll(/\b([A-Za-z_$][\w$]*)\.fetch\s*\(/g)].map((match) => match[1]);
  const hasUnapprovedMemberFetch = memberFetchReceivers.some((receiver) => receiver !== "phase1Worker")
    || (memberFetchReceivers.includes("phase1Worker") && (path !== "apps/worker/src/index-phase2.ts" || memberFetchReceivers.filter((receiver) => receiver === "phase1Worker").length !== 1));
  const hasFetchAlias = /(?:=|:)\s*(?:globalThis\.)?fetch\b(?!\s*\()/m.test(content);
  let fetchCapabilityRemainder = normalizedContent
    .replace(/\basync\s+fetch\s*\(/g, "(");
  if (path === "apps/worker/src/index-phase2.ts") fetchCapabilityRemainder = fetchCapabilityRemainder.replace(/\bphase1Worker\.fetch\s*\(/g, "(");
  if (["apps/worker/src/index.ts", "apps/worker/src/manual-router.ts"].includes(path)) fetchCapabilityRemainder = fetchCapabilityRemainder.replace(/\bfetch\s*\(\s*`\$\{config\.url\}\$\{path\}`/g, "(");
  if (path === "apps/worker/src/index.ts") fetchCapabilityRemainder = fetchCapabilityRemainder
    .replace(/\bfetch\s*\(\s*`https:\/\/api\.github\.com\/repos\/\$\{owner\}\/\$\{repo\}\/issues`/g, "(")
    .replace(/\bfetch\s*\(\s*`https:\/\/api\.github\.com\$\{path\}`/g, "(")
    .replace(/\bfetch\s*\(\s*`https:\/\/discord\.com\/api\/v10\/webhooks\/\$\{interaction\.application_id\}\/\$\{interaction\.token\}\/messages\/@original`/g, "(");
  if (path === "apps/worker/src/app-assets.ts") fetchCapabilityRemainder = fetchCapabilityRemainder.replace(/\bfetch\s*\(\s*path/g, "(");
  const hasFetchCapabilityEscape = /\bfetch\b|["']fetch["']/.test(fetchCapabilityRemainder);
  const hasDynamicCapabilityLookup = /\b(?:globalThis|Reflect|eval|Function)\b|\b(?:self|window)\s*\[/.test(normalizedContent);
  const hasUnapprovedOutboundCapability = (
    /["'`](?:cloudflare:sockets|node:(?:http|https|http2|net|tls|dgram|dns)|(?:http|https|http2|net|tls|dgram|dns))["'`]/.test(normalizedContent)
    || /\b(?:WebSocket|WebTransport|RTCPeerConnection|EventSource|XMLHttpRequest)\b|\bnavigator\.sendBeacon\b/.test(normalizedContent)
  );
  return (
    hasUnapprovedLiteralEgress || hasUnapprovedDirectFetch || hasUnapprovedMemberFetch || hasFetchAlias || hasFetchCapabilityEscape || hasDynamicCapabilityLookup || hasUnapprovedOutboundCapability ||
    /(?:OPENAI|ANTHROPIC|GEMINI|COHERE|MISTRAL)_API_KEY|AI_PROVIDER_API_KEY|ai\.assistiveGeneration/i.test(content) ||
    /(?:api\.openai\.com|[a-z0-9.-]+\.openai\.azure\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|bedrock-runtime\.[a-z0-9-]+\.(?:amazonaws\.com|api\.aws))/i.test(content) ||
    /\/(?:api\/)?v?\d*\/?(?:ai|generate|completions?|chat)(?:\/|\b)/i.test(content) ||
    /(?:from\s+|require\s*\(\s*|import\s*\(\s*)['"](?:openai|@anthropic-ai\/sdk|@google\/generative-ai|cohere-ai|@mistralai\/mistralai|@aws-sdk\/client-bedrock-runtime)['"]/i.test(content) ||
    /["'](?:openai|@anthropic-ai\/sdk|@google\/generative-ai|cohere-ai|@mistralai\/mistralai|@aws-sdk\/client-bedrock-runtime)["']\s*:/i.test(content) ||
    /(?:^|[\/\-_.])(?:ai[-_.]?adapter|openai|anthropic|gemini|llm)(?:[\/\-_.]|$)/i.test(normalizedPath)
  );
}

for (const fixture of [
  { content: 'import OpenAI from "openai";', path: "apps/worker/src/generator.ts" },
  { content: 'router.post("/v1/chat", handler);', path: "apps/worker/src/routes.ts" },
  { content: 'const client = require("@anthropic-ai/sdk");', path: "apps/worker/src/provider.ts" },
  { content: 'const sdk = await import("openai");', path: "apps/worker/src/provider.ts" },
  { content: '{ "dependencies": { "openai": "1.0.0" } }', path: "package.json" },
  { content: 'const sdk = await import("cohere-ai");', path: "apps/worker/src/provider.ts" },
  { content: '{ "dependencies": { "@mistralai/mistralai": "1.0.0" } }', path: "package.json" },
  { content: '{ "dependencies": { "@aws-sdk/client-bedrock-runtime": "1.0.0" } }', path: "package.json" },
  { content: 'await fetch("https://acme.openai.azure.com/openai/deployments/manual/responses");', path: "apps/worker/src/provider.ts" },
  { content: 'await fetch("https://bedrock-runtime.ap-northeast-1.amazonaws.com/model/example/invoke");', path: "apps/worker/src/provider.ts" },
  { content: 'await fetch("https://bedrock-runtime.ap-northeast-1.api.aws/model/example/invoke");', path: "apps/worker/src/provider.ts" },
  { content: 'await fetch("https://api.groq.com/openai/v1/responses");', path: "apps/worker/src/provider.ts" },
  { content: 'await fetch("https://aiplatform.googleapis.com/v1/projects/example/locations/us-central1/publishers/google/models/gemini:generateContent");', path: "apps/worker/src/provider.ts" },
  { content: 'await fetch("https://unapproved-ai-proxy.workers.dev/v1/responses");', path: "apps/worker/src/provider.ts" },
  { content: 'await fetch("http://unapproved-ai-proxy.workers.dev/v1/responses");', path: "apps/worker/src/provider.ts" },
  { content: 'await fetch("https://attacker-project.supabase.co/functions/v1/ai-proxy");', path: "apps/worker/src/provider.ts" },
  { content: 'await fetch("https:" + "//api.groq.com/openai/v1/responses");', path: "apps/worker/src/provider.ts" },
  { content: 'await globalThis.fetch("https:" + "//api.groq.com/openai/v1/responses");', path: "apps/worker/src/provider.ts" },
  { content: 'const externalFetch = fetch; await externalFetch(dynamicUrl);', path: "apps/worker/src/provider.ts" },
  { content: 'await globalThis["fetch"]("https:" + "//api.groq.com/openai/v1/responses");', path: "apps/worker/src/provider.ts" },
  { content: 'const { fetch: externalFetch } = globalThis; await externalFetch(dynamicUrl);', path: "apps/worker/src/provider.ts" },
  { content: 'const externalFetch = Reflect.get(globalThis, "fet" + "ch"); await externalFetch("https:" + "//api.groq.com/openai/v1/responses");', path: "apps/worker/src/provider.ts" },
  { content: 'const externalFetch = self["fet" + `ch`]; await externalFetch("https:" + `//api.groq.com/openai/v1/responses`);', path: "apps/worker/src/provider.ts" },
  { content: 'import { connect } from "cloudflare:sockets"; connect({ hostname: env.REMOTE_HOST, port: 443 }, { secureTransport: "on" });', path: "apps/worker/src/provider.ts" },
  { content: 'import https from "node:https"; https.request({ hostname: env.REMOTE_HOST });', path: "apps/worker/src/provider.ts" },
  { content: 'const socket = new WebSocket(env.REMOTE_URL);', path: "apps/worker/src/provider.ts" },
  { content: 'const module = await import(`cloudflare:sockets`); module.connect({ hostname: env.REMOTE_HOST, port: 443 });', path: "apps/worker/src/provider.ts" },
  { content: 'const socket = new Web\\u0053ocket(env.REMOTE_URL);', path: "apps/worker/src/provider.ts" },
  { content: 'const config = { url: env.AI_PROXY_URL }; const path = ""; return fetch(`${config.url}${path}`);', path: "apps/worker/src/provider.ts" },
  { content: 'fetch(`${config.url}${path}`); fetch(`${config.url}${path}`);', path: "apps/worker/src/index.ts" },
  { content: 'const phase1Worker = env.AI_PROXY; return phase1Worker.fetch(request);', path: "apps/worker/src/provider.ts" },
  { content: "select create_ai_adapter();", path: "supabase/migrations/ai-adapter.sql" }
]) {
  if (!hasAiRuntimeBoundary(fixture.content, fixture.path)) {
    errors.push(`AI absence regression fixture was not detected: ${fixture.path}`);
  }
}

for (const file of runtimeFiles) {
  const content = await readFile(file, "utf8");
  if (hasAiRuntimeBoundary(content, file)) {
    errors.push(`AI runtime boundary must not exist before owner approval: ${file}`);
  }
}
const browserAcceptanceCatalog = contents["docs/07-quality/acceptance-catalog.md"] ?? "";
const ac023 = browserAcceptanceCatalog.split("\n").find((line) => line.startsWith("| AC-023 |")) ?? "";
for (const term of ["application bytes送信前", "actual peerで拒否", "1経路でも拘束不能", "BROWSER_EGRESS_NOT_VERIFIED", "fail closed"]) {
  if (!ac023.includes(term)) errors.push(`AC-023 is missing fail-closed term: ${term}`);
}
const ac024 = browserAcceptanceCatalog.split("\n").find((line) => line.startsWith("| AC-024 |")) ?? "";
for (const term of ["mobile previewを開始", "Browser Runへ通信せず", "BROWSER_EGRESS_NOT_VERIFIED", "拒否される"]) {
  if (!ac024.includes(term)) errors.push(`AC-024 is missing preflight rejection term: ${term}`);
}
const ac025 = browserAcceptanceCatalog.split("\n").find((line) => line.startsWith("| AC-025 |")) ?? "";
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
  "FR-021": ["AC-051", "AC-053", "AC-055", "AC-058", "AC-064", "AC-065"]
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
