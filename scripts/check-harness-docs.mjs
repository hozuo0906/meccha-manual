import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import npmPackageArg from "npm-package-arg";
import { parse } from "pgsql-parser";

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

// AC-060 covers product runtime/source/config, not the separately governed
// ADR-0026 development automation. Keep the scan surface and exclusions in
// one contract so extending the gate cannot silently omit a product root.
const AI_PROHIBITION_SCAN_CONTRACT = Object.freeze({
  surfaces: Object.freeze([
    Object.freeze({
      id: "product-source-runtime-config",
      roots: Object.freeze(["apps", "wrangler.jsonc", "wrangler.brand.jsonc"]),
      rules: Object.freeze(["imports", "provider-endpoints", "provider-bindings"])
    }),
    Object.freeze({
      id: "dependency-manifests",
      roots: Object.freeze(["package.json", "package-lock.json", "apps"]),
      rules: Object.freeze(["dependency-declarations"])
    }),
    Object.freeze({
      id: "product-db-migrations",
      roots: Object.freeze(["supabase/migrations"]),
      rules: Object.freeze(["ai-schema-objects"])
    })
  ]),
  // Development-only automation (including ADR-0026) is intentionally not a
  // product surface. Keep this list explicit so a future surface cannot
  // accidentally absorb its credentials or provider configuration.
  rootOnlyExclusions: Object.freeze([
    ".github/workflows/business-os-codex.yml",
    "scripts",
    "docs/03-architecture/adrs/ADR-0026-business-os-cloud-runner.md"
  ]),
  nestedExclusions: Object.freeze(["node_modules", "dist", "build", "generated"]),
  knownProviderPackages: Object.freeze([
    /^openai$/i,
    /^@openai\//i,
    /^@anthropic-ai\//i,
    /^@google\/(?:generative-ai|genai)$/i,
    /^@ai-sdk\//i,
    /^ai$/i,
    /^cohere-ai$/i,
    /^groq-sdk$/i,
    /^@mistralai\//i,
    /^ollama$/i,
    /^replicate$/i,
    /^@aws-sdk\/client-bedrock-runtime$/i,
    /^@azure\/openai$/i
  ]),
  providerEndpointHosts: Object.freeze([
    /https?:\/\/(?:api\.)?openai\.com\b/i,
    /https?:\/\/api\.anthropic\.com\b/i,
    /https?:\/\/generativelanguage\.googleapis\.com\b/i,
    /https?:\/\/api\.cohere\.ai\b/i,
    /https?:\/\/api\.mistral\.ai\b/i,
    /https?:\/\/api\.groq\.com\b/i,
    /https?:\/\/api\.replicate\.com\b/i,
    /https?:\/\/openrouter\.ai\b/i
  ]),
  providerBindings: Object.freeze([
    /\bAI_PROVIDER_API_KEY\b/i,
    /\bAI_API_KEY\b/i,
    /\bAI_PROVIDER_ENDPOINT\b/i,
    /\bAI_API_ENDPOINT\b/i,
    /AI_(?:API_)?ENDPOINT/i,
    /\bai\.assistiveGeneration\.enabled\b/i,
    /\b(?:OPENAI|ANTHROPIC|GOOGLE|GEMINI|COHERE|MISTRAL|GROQ)_API_KEY\b/i,
    /\b(?:OPENAI|ANTHROPIC)_BASE_URL\b/i,
    /\bREPLICATE_API_TOKEN\b/i
  ]),
  aiSchemaObjects: Object.freeze([
    /\b(?:create|alter|drop)\s+(?:or\s+replace\s+)?(?:table|index|view|function|type|policy)\s+(?:if\s+not\s+exists\s+)?(?:["`']?[a-z0-9_]+["`']?\s*\.\s*)?["`']?ai_[a-z0-9_]+\b/i,
    /\bai_(?:[a-z0-9]+_)*(?:settings?|providers?|logs?|generations?|requests?|usage|prompts?)\b/i,
    /\b(?:llm|embedding|inference|prompt)_(?:[a-z0-9]+_)*(?:settings?|configs?|logs?|generations?|requests?|usage)\b/i,
    /\bmodel_(?:settings?|configs?|providers?)\b/i
  ])
});

async function listProductFiles(entry, scanRoot) {
  const info = await readdir(entry, { withFileTypes: true }).catch(() => null);
  if (!Array.isArray(info)) return [entry];
  const files = [];
  for (const item of info) {
    const child = path.join(entry, item.name);
    const relativeChild = path.relative(scanRoot, child).split(path.sep).join("/");
    if (isExcluded(relativeChild)) continue;
    if (item.isDirectory()) files.push(...await listProductFiles(child, scanRoot));
    else files.push(child);
  }
  return files;
}

function isExcluded(relativeFile) {
  const normalized = relativeFile.split(path.sep).join("/");
  const segments = normalized.split("/");
  const rootOnlyExcluded = AI_PROHIBITION_SCAN_CONTRACT.rootOnlyExclusions.some(
    (excluded) => normalized === excluded || normalized.startsWith(`${excluded}/`)
  );
  const nestedExcluded = AI_PROHIBITION_SCAN_CONTRACT.nestedExclusions.some(
    (excluded) => normalized === excluded || normalized.startsWith(`${excluded}/`) || segments.includes(excluded)
  );
  return rootOnlyExcluded || nestedExcluded;
}

function isDependencyManifest(relativeFile) {
  const fileName = relativeFile.split(path.sep).join("/").split("/").at(-1);
  return fileName === "package.json" || fileName === "package-lock.json";
}

function isKnownProviderPackage(specifier) {
  return AI_PROHIBITION_SCAN_CONTRACT.knownProviderPackages.some((pattern) => pattern.test(specifier));
}

const INVALID_NPM_ALIAS = Symbol("invalid-npm-alias");

function npmAliasTargetPackage(specifier) {
  if (typeof specifier !== "string" || !/^npm:/i.test(specifier)) return null;
  try {
    const parsed = npmPackageArg(specifier);
    if (parsed.type !== "alias" || typeof parsed.subSpec?.name !== "string") {
      return INVALID_NPM_ALIAS;
    }
    return parsed.subSpec.name;
  } catch {
    return INVALID_NPM_ALIAS;
  }
}

function isKnownProviderDependency(dependencyName, declaration) {
  if (isKnownProviderPackage(dependencyName)) return true;
  if (typeof declaration === "string") {
    const aliasTarget = npmAliasTargetPackage(declaration);
    return aliasTarget === INVALID_NPM_ALIAS || isKnownProviderPackage(aliasTarget);
  }
  if (declaration && typeof declaration === "object") {
    if (isKnownProviderPackage(declaration.name)) return true;
    const dependencyMaps = [
      declaration.dependencies,
      declaration.devDependencies,
      declaration.optionalDependencies,
      declaration.peerDependencies
    ];
    if (dependencyMaps.some((dependencies) =>
      dependencies && Object.entries(dependencies).some(([name, specifier]) =>
        isKnownProviderDependency(name, specifier)
      )
    )) return true;
    const aliasTarget = npmAliasTargetPackage(declaration.version);
    return aliasTarget === INVALID_NPM_ALIAS || isKnownProviderPackage(aliasTarget);
  }
  return false;
}

function hasKnownProviderImport(source) {
  const staticImports = source.matchAll(/\bimport\s+(?:(?:[\s\S]*?)\s+from\s+)?["']([^"']+)["']/g);
  for (const [, specifier] of staticImports) {
    if (isKnownProviderPackage(specifier)) return true;
  }
  const reExports = source.matchAll(/\bexport\s+(?:\*|\{[\s\S]*?\})\s+from\s+["']([^"']+)["']/g);
  for (const [, specifier] of reExports) {
    if (isKnownProviderPackage(specifier)) return true;
  }
  const dynamicImports = source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g);
  for (const [, specifier] of dynamicImports) {
    if (isKnownProviderPackage(specifier)) return true;
  }
  const requires = source.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g);
  for (const [, specifier] of requires) {
    if (isKnownProviderPackage(specifier)) return true;
  }
  return false;
}

function hasDependencyDeclaration(source) {
  try {
    const manifest = JSON.parse(source);
    const dependencyMaps = [
      manifest.dependencies,
      manifest.devDependencies,
      manifest.optionalDependencies,
      manifest.peerDependencies
    ];
    for (const dependencies of dependencyMaps) {
      if (
        dependencies &&
        Object.entries(dependencies).some(([dependencyName, declaration]) =>
          isKnownProviderDependency(dependencyName, declaration)
        )
      ) return true;
    }
    if (manifest.packages && typeof manifest.packages === "object") {
      for (const [packagePath, packageInfo] of Object.entries(manifest.packages)) {
        const packagePathParts = packagePath.replace(/^node_modules\//, "").split("/node_modules/").pop().split("/");
        const packageName = packagePathParts[0]?.startsWith("@")
          ? packagePathParts.slice(0, 2).join("/")
          : packagePathParts[0];
        if (isKnownProviderDependency(packageName, packageInfo)) return true;
      }
    }
  } catch {
    // A malformed fixture is not an AI dependency declaration; JSON validity
    // remains the responsibility of the repository's existing package checks.
  }
  return false;
}

async function hasAiFunctionDeclaration(source) {
  if (source.trim() === "") return false;
  let ast;
  try {
    ast = await parse(source);
  } catch {
    return true;
  }
  return ast.stmts.some(({ stmt }) => {
    const functionStatement = stmt.CreateFunctionStmt;
    if (!functionStatement) return false;
    const functionName = functionStatement.funcname.at(-1)?.String?.sval;
    return typeof functionName === "string" && /^ai_/i.test(functionName);
  });
}

async function findAiProhibitionRule(source, rules) {
  if (rules.includes("dependency-declarations")) {
    if (hasDependencyDeclaration(source)) return "dependency-declarations";
  }
  if (rules.includes("imports") && hasKnownProviderImport(source)) return "imports";
  if (
    rules.includes("provider-endpoints") &&
    AI_PROHIBITION_SCAN_CONTRACT.providerEndpointHosts.some((pattern) => pattern.test(source))
  ) return "provider-endpoints";
  if (
    rules.includes("provider-bindings") &&
    AI_PROHIBITION_SCAN_CONTRACT.providerBindings.some((pattern) => pattern.test(source))
  ) return "provider-bindings";
  if (
    rules.includes("ai-schema-objects") &&
    AI_PROHIBITION_SCAN_CONTRACT.aiSchemaObjects.some((pattern) => pattern.test(source))
  ) return "ai-schema-objects";
  if (rules.includes("ai-schema-objects") && await hasAiFunctionDeclaration(source)) {
    return "ai-schema-objects";
  }
  return null;
}

async function scanAiProhibition(rootDir) {
  const violations = [];
  const resolvedRootDir = path.resolve(rootDir);
  for (const surface of AI_PROHIBITION_SCAN_CONTRACT.surfaces) {
    for (const root of surface.roots) {
      const absoluteRoot = path.resolve(resolvedRootDir, root);
      for (const file of await listProductFiles(absoluteRoot, resolvedRootDir)) {
        const relativeFile = path.relative(resolvedRootDir, file).split(path.sep).join("/");
        if (isExcluded(relativeFile)) continue;
        if (surface.rules.includes("dependency-declarations") && !isDependencyManifest(relativeFile)) continue;
        const source = await readFile(file, "utf8").catch(() => "");
        const rule = await findAiProhibitionRule(source, surface.rules);
        if (rule) violations.push({ surface: surface.id, rule, file: relativeFile });
      }
    }
  }
  return violations;
}

const aiScanRoot = process.argv[2] === "--ai-scan-root" ? process.argv[3] : null;
if (aiScanRoot) {
  const violations = await scanAiProhibition(path.resolve(aiScanRoot));
  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`AI prohibition violation [${violation.surface}/${violation.rule}]: ${violation.file}`);
    }
    process.exit(1);
  }
  console.log("AI prohibition scanner OK: product surfaces are free of provider implementation markers.");
  process.exit(0);
}

const scanRoot = process.cwd();
for (const surface of AI_PROHIBITION_SCAN_CONTRACT.surfaces) {
  for (const root of surface.roots) {
    const absoluteRoot = path.resolve(scanRoot, root);
    for (const file of await listProductFiles(absoluteRoot, scanRoot)) {
      const relativeFile = path.relative(scanRoot, file).split(path.sep).join("/");
      if (isExcluded(relativeFile)) continue;
      if (surface.rules.includes("dependency-declarations") && !isDependencyManifest(relativeFile)) continue;
      const source = await readFile(file, "utf8").catch(() => "");
      const rule = await findAiProhibitionRule(source, surface.rules);
      if (rule) errors.push(`AI implementation marker remains in ${surface.id}/${rule}: ${relativeFile}`);
    }
  }
}

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
for (const endpointLiteral of ["| `AI_PROVIDER_ENDPOINT` |", "| `AI_API_ENDPOINT` |"]) {
  if ((contents["docs/08-operations/environment-variables.md"] ?? "").includes(endpointLiteral)) {
    errors.push(`AI endpoint must not be registered before owner approval: ${endpointLiteral}`);
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
