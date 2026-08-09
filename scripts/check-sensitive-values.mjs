import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const patterns = [
  ["Stripe secret", /\b(?:sk_(?:live|test)|rk_(?:live|test))_[A-Za-z0-9]{12,}\b/],
  ["Stripe webhook secret", /\bwhsec_[A-Za-z0-9]{12,}\b/],
  ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ["GitHub token", /\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[opusr]_[A-Za-z0-9]{20,})\b/],
  ["Discord webhook URL", /https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+/i],
  ["Discord bot token", /\b(?:mfa\.[A-Za-z0-9_-]{20,}|[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{6,8}\.[A-Za-z0-9_-]{25,})\b/],
  ["Discord bot token assignment", /\bDISCORD_BOT_TOKEN\s*[:=]\s*["']?[A-Za-z0-9_.-]{20,}/],
  ["database URL", /\b(?:postgres|postgresql):\/\/[^\s"'`]+/i],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/]
];
const forbiddenTrackedBasenames = new Set([
  ".env",
  ".dev.vars",
  ".npmrc",
  ".netrc"
]);
const forbiddenTrackedSuffixes = [
  ".pem",
  ".key",
  ".p12",
  ".pfx",
  ".jks",
  ".keystore",
  ".der"
];
const knownSecretNames = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_JWT_SECRET",
  "CLOUDFLARE_API_TOKEN",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "AI_PROVIDER_API_KEY",
  "DISCORD_WEBHOOK_URL",
  "MECCHA_DISCORD_WEBHOOK_URL",
  "DISCORD_DEVELOPMENT_WEBHOOK_URL",
  "DISCORD_STAGING_WEBHOOK_URL",
  "DISCORD_PRODUCTION_WEBHOOK_URL",
  "DISCORD_BOT_TOKEN",
  "GITHUB_ISSUE_TOKEN",
  "CODEX_ACCESS_TOKEN"
];
const knownSecretAssignmentPattern = new RegExp(
  `(?:^|[^A-Za-z0-9_])["']?(?:${knownSecretNames.join("|")})["']?\\s*[:=]\\s*([^\\r\\n]+)`,
  "g"
);
const knownSecretYamlBlockPattern = new RegExp(
  `^(\\s*)["']?(?:${knownSecretNames.join("|")})["']?\\s*:\\s*[|>](?:[1-9][+-]?|[+-][1-9]?)?\\s*(?:#.*)?\\r?\\n((?:(?:\\1[ \\t]+)[^\\r\\n]*(?:\\r?\\n|$))+)`,
  "gm"
);
const findings = new Set();

function inspectPath(file, source) {
  const normalized = file.replaceAll("\\\\", "/");
  const basename = path.posix.basename(normalized);
  const lower = normalized.toLowerCase();

  if (
    forbiddenTrackedBasenames.has(basename) ||
    basename.startsWith(".env.") && basename !== ".env.example" ||
    basename.startsWith(".dev.vars.")
  ) {
    findings.add(`${source}: local environment file must not be tracked`);
  }

  if (forbiddenTrackedSuffixes.some((suffix) => lower.endsWith(suffix))) {
    findings.add(`${source}: private key or credential container must not be tracked`);
  }
}

function inspectContent(content, source) {
  for (const [label, pattern] of patterns) {
    if (pattern.test(content)) findings.add(`${source}: ${label}`);
  }
  if (hasServiceRoleJwt(content)) findings.add(`${source}: Supabase service_role JWT`);
  for (const match of content.matchAll(knownSecretAssignmentPattern)) {
    if (isLiteralSecretValue(match[1])) {
      findings.add(`${source}: known secret name has a literal-looking assigned value`);
    }
  }
  for (const match of content.matchAll(knownSecretYamlBlockPattern)) {
    if (isLiteralYamlSecretBlock(match[2])) {
      findings.add(`${source}: known secret name has a literal-looking YAML block value`);
    }
  }
}

function isLiteralSecretValue(value) {
  const assigned = value.trim().replace(/^['"]|['"],?$/g, "");
  const isReference = /^(?:\$\{\{|\$[A-Za-z_(]|process\.env\.|env\.|secrets\.|<|\[)/.test(assigned);
  const isPlaceholder = /^(?:REDACTED|CHANGEME|YOUR[_-]|EXAMPLE[_-])/i.test(assigned);
  return !isReference && !isPlaceholder && assigned.length >= 8;
}

function isLiteralYamlSecretBlock(value) {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.some(isLiteralSecretValue) || isLiteralSecretValue(lines.join(""));
}

function hasServiceRoleJwt(content) {
  for (const match of content.matchAll(/\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+\b/g)) {
    try {
      const payload = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
      if (payload.role === "service_role") return true;
    } catch {
      // JWTではない文字列は他のpatternへ委ねる。
    }
  }
  return false;
}

for (const file of files) {
  inspectPath(file, file);
  const buffer = await readFile(file);
  if (buffer.includes(0)) continue;
  const content = buffer.toString("utf8");
  inspectContent(content, file);
}

const baseSha = process.env.SECRET_SCAN_BASE_SHA || "";
if (/^[a-f0-9]{40}$/.test(baseSha) && !/^0+$/.test(baseSha)) {
  const objects = execFileSync("git", ["rev-list", "--objects", `${baseSha}..HEAD`], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  for (const objectLine of objects) {
    const [sha, ...pathParts] = objectLine.split(" ");
    const objectPath = pathParts.join(" ");
    if (objectPath) inspectPath(objectPath, `PR履歴blob ${sha.slice(0, 12)} ${objectPath}`);
    if (execFileSync("git", ["cat-file", "-t", sha], { encoding: "utf8" }).trim() !== "blob") continue;
    const blobResult = spawnSync("git", ["cat-file", "blob", sha], {
      encoding: null,
      maxBuffer: 20 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"]
    });
    if (blobResult.error || blobResult.status !== 0 || !Buffer.isBuffer(blobResult.stdout)) {
      findings.add(`PR履歴blob ${sha.slice(0, 12)}: 内容を表示せず検査失敗`);
      continue;
    }
    const buffer = blobResult.stdout;
    if (buffer.includes(0)) continue;
    inspectContent(buffer.toString("utf8"), `PR履歴blob ${sha.slice(0, 12)} ${pathParts.join(" ") || "(pathなし)"}`);
  }
}

if (findings.size > 0) {
  console.error(`秘密値候補を検出しました（値は表示しません）:\n${[...findings].join("\n")}`);
  process.exit(1);
}

console.log(`Sensitive values OK: ${files.length} tracked files checked without printing values.`);
