import { readFile } from "node:fs/promises";

const requiredFiles = [
  ".devcontainer/devcontainer.json",
  "AGENTS.md",
  "docs/08-operations/cloud-harness.md",
  "docs/08-operations/codex-cloud-environment.md",
  "docs/03-architecture/adrs/ADR-0020-cloud-codex-working-environment.md",
  "docs/09-delivery/codex-cloud-task-template.md"
];

const requiredTerms = [
  "Codex Cloud",
  "Codex web",
  "GitHub Codespaces",
  "PCの電源",
  "GitHubを正本",
  "mainへ直接pushしない",
  "secret",
  "npm run check",
  "サブエージェント品質loop",
  "ユーザー承認"
];

const forbiddenTermsInDevcontainer = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_JWT_SECRET",
  "OPENAI_API_KEY",
  "DISCORD_WEBHOOK_URL"
];

const errors = [];
const contents = {};

for (const file of requiredFiles) {
  try {
    contents[file] = await readFile(file, "utf8");
  } catch {
    errors.push(`Missing cloud Codex environment file: ${file}`);
  }
}

const devcontainerText = contents[".devcontainer/devcontainer.json"] || "";
let devcontainer = {};

try {
  devcontainer = JSON.parse(devcontainerText);
} catch {
  errors.push(".devcontainer/devcontainer.json must be valid JSON.");
}

const combined = Object.values(contents).join("\n");

for (const term of requiredTerms) {
  if (!combined.includes(term)) {
    errors.push(`Missing cloud Codex environment term: ${term}`);
  }
}

if (!String(devcontainer.image || "").includes("node")) {
  errors.push("devcontainer image must use a Node-capable image.");
}

if (!String(devcontainer.postCreateCommand || "").includes("npm ci")) {
  errors.push("devcontainer postCreateCommand must run npm ci.");
}

if (!String(devcontainer.postCreateCommand || "").includes("codex-cloud:check")) {
  errors.push("devcontainer postCreateCommand must run codex-cloud:check.");
}

for (const port of [5173, 8787]) {
  if (!Array.isArray(devcontainer.forwardPorts) || !devcontainer.forwardPorts.includes(port)) {
    errors.push(`devcontainer must forward port ${port}.`);
  }
}

for (const forbidden of forbiddenTermsInDevcontainer) {
  if (devcontainerText.includes(forbidden)) {
    errors.push(`devcontainer must not contain secret name/value: ${forbidden}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Cloud Codex environment OK.");
