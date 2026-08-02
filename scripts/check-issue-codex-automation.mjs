import { readFile } from "node:fs/promises";

const requiredFiles = [
  ".github/workflows/issue-event-triage.yml",
  ".github/workflows/codex-issue-implement.yml",
  "scripts/issue-event-triage.mjs",
  "scripts/build-codex-issue-prompt.mjs",
  "docs/08-operations/issue-event-codex-automation.md",
  "docs/03-architecture/adrs/ADR-0021-issue-event-codex-automation.md"
];

const errors = [];

async function read(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    errors.push(`Missing required file: ${path}`);
    return "";
  }
}

for (const path of requiredFiles) {
  await read(path);
}

const labels = JSON.parse(await read(".github/issue-labels.json"));
const labelNames = new Set(labels.map((label) => label.name));
for (const label of ["approved-for-codex", "approval-required", "blocked-from-discord", "status/triage", "status/review"]) {
  if (!labelNames.has(label)) errors.push(`Missing issue label: ${label}`);
}

const triageWorkflow = await read(".github/workflows/issue-event-triage.yml");
for (const token of ["issues:", "opened", "scripts/issue-event-triage.mjs", "issues: write", "DISCORD_NOTIFY_IMPRESSION"]) {
  if (!triageWorkflow.includes(token)) errors.push(`Issue event triage workflow must include ${token}`);
}

const codexWorkflow = await read(".github/workflows/codex-issue-implement.yml");
for (const token of ["approved-for-codex", "CODEX_ACCESS_TOKEN", "npm install -g @openai/codex", "codex exec", "contents: write", "pull-requests: write"]) {
  if (!codexWorkflow.includes(token)) errors.push(`Codex issue implement workflow must include ${token}`);
}

const envDocs = await read("docs/08-operations/environment-variables.md");
if (!envDocs.includes("CODEX_ACCESS_TOKEN")) errors.push("environment-variables.md must document CODEX_ACCESS_TOKEN.");

const issueFlowDocs = await read("docs/08-operations/issue-to-pr-flow.md");
if (!issueFlowDocs.includes("approved-for-codex")) errors.push("issue-to-pr-flow.md must mention approved-for-codex.");

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Issue Codex automation harness OK.");
