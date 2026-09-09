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
for (const token of ["approved-for-codex", "CODEX_ACCESS_TOKEN", "npm install -g @openai/codex", "codex exec", "--model \"$CODEX_MODEL\"", "gpt-5.6-luna", "model_reasoning_effort=$CODEX_REASONING_EFFORT", "CODEX_REASONING_EFFORT=\"high\"", "CODEX_APPROVAL_POLICY=\"never\"", "Codex runtime configuration:", "contents: write", "pull-requests: write"]) {
  if (!codexWorkflow.includes(token)) errors.push(`Codex issue implement workflow must include ${token}`);
}
if (codexWorkflow.includes("gpt-5.6-terra")) errors.push("Codex issue implement workflow must not use gpt-5.6-terra.");
if (/^concurrency:\s*$/m.test(codexWorkflow)) {
  errors.push("Codex issue implement workflow must not define root-level concurrency.");
}
const implementMarker = /^  implement:\r?\n/m.exec(codexWorkflow);
if (!implementMarker) {
  errors.push("Codex issue implement workflow must define the implement job.");
} else {
  const jobBodyStart = implementMarker.index + implementMarker[0].length;
  const remainingWorkflow = codexWorkflow.slice(jobBodyStart);
  const nextJobOffset = remainingWorkflow.search(/^  [A-Za-z0-9_-]+:/m);
  const implementJob = remainingWorkflow.slice(0, nextJobOffset === -1 ? remainingWorkflow.length : nextJobOffset);
  if (!/^    if:\s*\$\{\{\s*github\.event\.label\.name\s*==\s*'approved-for-codex'\s*&&\s*!github\.event\.issue\.pull_request\s*\}\}\s*$/m.test(implementJob)) {
    errors.push("Codex issue implement job must be gated by the approved-for-codex label.");
  }
  const concurrencyMatch = implementJob.match(/^    concurrency:\r?\n([\s\S]*?)(?=^    \S)/m);
  if (!concurrencyMatch) {
    errors.push("Codex issue implement job must define its shared concurrency settings.");
  } else {
    const concurrency = concurrencyMatch[1];
    const groupMatch = concurrency.match(/^      group:\s+([^\r\n]+)$/m);
    if (!groupMatch || groupMatch[1].trim() !== "codex-issue-implement") {
      errors.push("Codex issue implement job must use the repository-wide issue implementation concurrency group.");
    }
    if (!/^      cancel-in-progress:\s+false\s*$/m.test(concurrency)) {
      errors.push("Codex issue implement job must keep cancel-in-progress false.");
    }
    if (!/^      queue:\s+max\s*$/m.test(concurrency)) {
      errors.push("Codex issue implement job must use the standard max concurrency queue.");
    }
  }
}

const envDocs = await read("docs/08-operations/environment-variables.md");
if (!envDocs.includes("CODEX_ACCESS_TOKEN")) errors.push("environment-variables.md must document CODEX_ACCESS_TOKEN.");

const issueFlowDocs = await read("docs/08-operations/issue-to-pr-flow.md");
for (const token of ["approved-for-codex", "Astra high親PM", "商用リリース後はmergeごとにユーザーの事前承認", "Discordボタンから直接実行せず"]) {
  if (!issueFlowDocs.includes(token)) errors.push(`issue-to-pr-flow.md must include ${token}.`);
}

const automationDocs = await read("docs/08-operations/issue-event-codex-automation.md");
for (const token of ["--model gpt-5.6-luna", "--config model_reasoning_effort=high", "secret値やIssue本文・会話全文は証跡へ複製しない", "モデル設定の一致を確認できない実行は成功扱いにしない"]) {
  if (!automationDocs.includes(token)) errors.push(`issue-event-codex-automation.md must include ${token}.`);
}

const intakeReport = await read("scripts/issue-intake-report.mjs");
for (const token of ["Astra high親PM", "商用リリース後の外部反映はユーザーの事前承認", "商用リリース状態がIssue #70で確認できない場合", "親PMがread-only確認と提案を先に行う", "Discordボタンからの直接merge", "危険操作を必要な承認なしに開始しない"]) {
  if (!intakeReport.includes(token)) errors.push(`Issue intake report must include ${token}.`);
}
if (intakeReport.includes("ユーザー承認なしに実装、merge、本番deployしない")) {
  errors.push("Issue intake report must not use the superseded blanket approval wording.");
}

const workerSource = await read("apps/worker/src/index.ts");
for (const token of ["Discordボタンから直接実行せず", "Astra high親PM", "商用リリース後はmergeごとにユーザーの事前承認", "別承認境界に従います"]) {
  if (!workerSource.includes(token)) errors.push(`Worker merge guidance must include ${token}.`);
}
if (workerSource.includes("owner承認を確認してから行います") || workerSource.includes("レビュー、owner承認を確認してからmergeします")) {
  errors.push("Worker merge guidance must not use the superseded blanket owner-approval wording.");
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Issue Codex automation harness OK.");
