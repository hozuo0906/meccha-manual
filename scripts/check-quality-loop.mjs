import { readFile } from "node:fs/promises";

const files = {
  prTemplate: ".github/pull_request_template.md",
  workflow: ".github/workflows/quality-loop-gate.yml",
  autoPrWorkflow: ".github/workflows/auto-pr.yml",
  operation: "docs/09-delivery/subagent-quality-loop.md",
  reportTemplate: "docs/09-delivery/subagent-report-template.md",
  adr: "docs/03-architecture/adrs/ADR-0017-subagent-quality-loop.md",
  prGateWorkflow: ".github/workflows/pr-quality-gate.yml",
  prGateScript: "scripts/check-pr-quality-gate.mjs"
};

const requiredTerms = [
  "サブエージェント品質loop",
  "コーディング",
  "UIUX",
  "テスト",
  "辛口レビュー",
  "リファクタリング/コードレビュー",
  "ドキュメント記録",
  "P0/P1",
  "生思考",
  "最新コミットに対してCodex Review",
  "未解決review threadが0件",
  "マージ対象SHAとレビュー対象SHA"
];

const roleSections = [
  "## コーディング",
  "## UIUX",
  "## テスト",
  "## 辛口レビュー",
  "## リファクタリング/コードレビュー",
  "## ドキュメント記録"
];

async function read(path) {
  return readFile(path, "utf8");
}

const errors = [];
const contents = {};

for (const [key, path] of Object.entries(files)) {
  try {
    contents[key] = await read(path);
  } catch {
    errors.push(`Missing quality loop file: ${path}`);
  }
}

if (Object.keys(contents).length === Object.keys(files).length) {
  const combined = Object.values(contents).join("\n");

  for (const term of requiredTerms) {
    if (!combined.includes(term)) {
      errors.push(`Missing quality loop term: ${term}`);
    }
  }

  for (const section of roleSections) {
    if (!contents.reportTemplate.includes(section)) {
      errors.push(`Missing subagent report section: ${section}`);
    }
  }

  if (!contents.workflow.includes("npm run quality-loop:check")) {
    errors.push("Quality loop workflow must run npm run quality-loop:check.");
  }

  if (!contents.prTemplate.includes("サブエージェント品質loop")) {
    errors.push("Pull request template must include the quality loop checklist.");
  }

  if (!contents.autoPrWorkflow.includes("サブエージェント品質loop")) {
    errors.push("Auto PR workflow must include the quality loop checklist.");
  }

  if (!contents.prGateWorkflow.includes("node scripts/check-pr-quality-gate.mjs")) {
    errors.push("PR quality workflow must execute the runtime review gate.");
  }
  for (const snippet of ["reviewThreads(first:100", "hasNextPage", "review.commit_id === pr.head.sha", "apiPages"] ) {
    if (!contents.prGateScript.includes(snippet)) errors.push(`PR quality gate is missing: ${snippet}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Quality loop harness OK.");
