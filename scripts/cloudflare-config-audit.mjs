import { execFile } from "node:child_process";
import { appendFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const workerName = process.env.MECCHA_WORKER_NAME || "meccha-manual";
const healthUrl = process.env.MECCHA_WORKER_HEALTH_URL || "https://meccha-manual.tattoo-studio-crm.workers.dev/health/config";
const requiredSecrets = ["DISCORD_PUBLIC_KEY", "GITHUB_ISSUE_TOKEN"];
const requiredRuntimeFlags = [
  "hasPublicKey",
  "hasIssueToken",
  "hasIssueRepository",
  "hasInteractionStore",
  "hasAllowedGuildIds",
  "hasAllowedChannelIds"
];

function requireCloudflareAuth() {
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required.");
  }
}

async function runWrangler(args) {
  const { stdout } = await execFileAsync("npx", ["wrangler", ...args], {
    env: process.env,
    maxBuffer: 1024 * 1024 * 4
  });

  return stdout;
}

function parseJsonOutput(stdout, label) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${label} output was not valid JSON: ${error.message}`);
  }
}

async function fetchHealth() {
  const response = await fetch(healthUrl, {
    headers: {
      "user-agent": "meccha-manual-cloudflare-config-audit"
    }
  });

  if (!response.ok) {
    throw new Error(`health endpoint returned HTTP ${response.status}`);
  }

  return response.json();
}

function okMark(value) {
  return value ? "OK" : "NG";
}

function tableRow(cells) {
  return `| ${cells.join(" | ")} |`;
}

function buildReport({ secrets, kvNamespaces, health, warnings }) {
  const secretNames = new Set(secrets.map((secret) => secret.name).filter(Boolean));
  const discordConfig = health?.config?.discord || {};
  const missingSecrets = requiredSecrets.filter((name) => !secretNames.has(name));
  const missingRuntimeFlags = requiredRuntimeFlags.filter((name) => !discordConfig[name]);
  const hasDiscordKv = kvNamespaces.some((namespace) => /discord|interaction/i.test(namespace.title || ""));
  const status = missingSecrets.length === 0 && missingRuntimeFlags.length === 0 && hasDiscordKv ? "OK" : "要確認";

  const lines = [
    "# Cloudflare設定監査",
    "",
    `結果: ${status}`,
    `Worker: ${workerName}`,
    `Health URL: ${healthUrl}`,
    "",
    "## Worker secrets",
    "",
    tableRow(["Secret", "状態"]),
    tableRow(["---", "---"]),
    ...requiredSecrets.map((name) => tableRow([name, okMark(secretNames.has(name))])),
    "",
    "## Discord runtime",
    "",
    tableRow(["項目", "状態"]),
    tableRow(["---", "---"]),
    ...requiredRuntimeFlags.map((name) => tableRow([name, okMark(Boolean(discordConfig[name]))])),
    "",
    "## KV namespaces",
    "",
    tableRow(["Title", "ID"]),
    tableRow(["---", "---"]),
    ...(kvNamespaces.length > 0
      ? kvNamespaces.map((namespace) => tableRow([namespace.title || "(no title)", namespace.id || "(no id)"]))
      : [tableRow(["(none)", "(none)"])]),
    "",
    "## Codex所感",
    "",
    hasDiscordKv
      ? "Discord interaction用と思われるKV namespaceは見つかっています。`wrangler.jsonc` へbinding IDを固定すると、次回deployで設定が落ちにくくなります。"
      : "Discord interaction用KV namespaceが見当たりません。Dashboardで作成済みなら名前を確認し、未作成なら先にKV namespaceを作る必要があります。",
    missingRuntimeFlags.length === 0
      ? "Runtime側のDiscord bridge設定はそろっています。"
      : `Runtime側で不足があります: ${missingRuntimeFlags.join(", ")}`,
    missingSecrets.length === 0
      ? "必要なWorker secret名は確認できています。"
      : `不足しているWorker secretがあります: ${missingSecrets.join(", ")}`,
    "",
    "## 注意",
    "",
    "- この監査はsecretの値を出力しません。",
    "- Discord guild/channel IDはsecretではありませんが、health endpointでは値ではなく設定有無だけ確認します。",
    "- PR mergeはDiscordボタンだけでは実行せず、GitHubのチェックとユーザー承認を正とします。"
  ];

  if (warnings.length > 0) {
    lines.push("", "## Warnings", "", ...warnings.map((warning) => `- ${warning}`));
  }

  return {
    ok: status === "OK",
    markdown: `${lines.join("\n")}\n`
  };
}

requireCloudflareAuth();

const warnings = [];
let secrets = [];
let kvNamespaces = [];
let health = null;

try {
  secrets = parseJsonOutput(await runWrangler(["secret", "list", "--name", workerName, "--format", "json"]), "wrangler secret list");
} catch (error) {
  warnings.push(`Worker secret list failed: ${error.message}`);
}

try {
  kvNamespaces = parseJsonOutput(await runWrangler(["kv", "namespace", "list"]), "wrangler kv namespace list");
} catch (error) {
  warnings.push(`KV namespace list failed: ${error.message}`);
}

try {
  health = await fetchHealth();
} catch (error) {
  warnings.push(`Health endpoint failed: ${error.message}`);
}

const report = buildReport({
  secrets: Array.isArray(secrets) ? secrets : [],
  kvNamespaces: Array.isArray(kvNamespaces) ? kvNamespaces : [],
  health: health || {},
  warnings
});

await writeFile("cloudflare-config-audit.md", report.markdown);

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, report.markdown);
}

console.log(report.markdown);

if (!report.ok) {
  process.exitCode = 1;
}
