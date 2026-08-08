import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

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
const findings = [];

function inspectContent(content, source) {
  for (const [label, pattern] of patterns) {
    if (pattern.test(content)) findings.push(`${source}: ${label}`);
  }
  if (hasServiceRoleJwt(content)) findings.push(`${source}: Supabase service_role JWT`);
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
    if (execFileSync("git", ["cat-file", "-t", sha], { encoding: "utf8" }).trim() !== "blob") continue;
    const buffer = execFileSync("git", ["cat-file", "blob", sha], { encoding: null, maxBuffer: 20 * 1024 * 1024 });
    if (buffer.includes(0)) continue;
    inspectContent(buffer.toString("utf8"), `PR履歴blob ${sha.slice(0, 12)} ${pathParts.join(" ") || "(pathなし)"}`);
  }
}

if (findings.length > 0) {
  console.error(`秘密値候補を検出しました（値は表示しません）:\n${findings.join("\n")}`);
  process.exit(1);
}

console.log(`Sensitive values OK: ${files.length} tracked files checked without printing values.`);
