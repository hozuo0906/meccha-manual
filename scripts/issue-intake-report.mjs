import { appendFile, readFile, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const argSet = new Set(args);
const checkOnly = argSet.has("--check") || process.env.ISSUE_INTAKE_CHECK === "true";
const outputPath = valueAfter("--output") || process.env.ISSUE_INTAKE_REPORT_PATH || "issue-intake-report.md";
const maxIssues = Number(valueAfter("--max") || process.env.ISSUE_INTAKE_MAX || 30);

const requiredLabels = [
  "from-discord",
  "user-request",
  "needs-triage",
  "status/triage",
  "status/ready",
  "status/in-progress",
  "status/review",
  "status/blocked",
  "status/done",
  "approval-required",
  "blocked-from-discord"
];

const priorityLabels = ["priority/P0", "priority/P1", "priority/P2", "priority/P3"];
const statusLabels = ["status/triage", "status/ready", "status/in-progress", "status/review", "status/blocked", "status/done"];

function valueAfter(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
}

function labelNames(issue) {
  return (issue.labels || []).map((label) => typeof label === "string" ? label : label.name).filter(Boolean);
}

function hasAny(labels, names) {
  return names.some((name) => labels.includes(name));
}

function githubRequest(path) {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;

  if (!token || !repository) {
    throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required unless --check is used.");
  }

  return fetch(`https://api.github.com/repos/${repository}${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "meccha-manual-issue-intake",
      "x-github-api-version": "2022-11-28"
    }
  }).then(async (response) => {
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const message = payload?.message || response.statusText;
      throw new Error(`GitHub API GET ${path} failed: HTTP ${response.status} ${message}`);
    }

    return payload;
  });
}

async function listOpenIssues() {
  const issues = [];

  for (let page = 1; page <= 10; page += 1) {
    const payload = await githubRequest(`/issues?state=open&per_page=100&page=${page}`);
    issues.push(...payload.filter((issue) => !issue.pull_request));
    if (payload.length < 100) break;
  }

  return issues;
}

function intakeScore(issue) {
  const labels = labelNames(issue);
  let score = 0;

  if (labels.includes("needs-triage")) score += 5;
  if (labels.includes("from-discord")) score += 4;
  if (labels.includes("approval-required")) score += 3;
  if (labels.includes("blocked-from-discord")) score += 3;
  if (!hasAny(labels, statusLabels)) score += 2;
  if (!hasAny(labels, priorityLabels)) score += 2;
  if (!issue.assignee) score += 1;

  return score;
}

function recommendation(issue) {
  const labels = labelNames(issue);

  if (labels.includes("blocked-from-discord") || labels.includes("approval-required")) {
    return "危険操作を含む可能性あり。親セッションで承認条件を確認してから作業する。";
  }

  if (labels.includes("needs-triage")) {
    return "要件を整理し、type/* と status/ready を付けてから作業ブランチを切る。";
  }

  if (labels.includes("status/ready")) {
    return "作業可能。PR本文に Closes #番号 を入れて、レビューloopへ進める。";
  }

  if (labels.includes("status/in-progress") || labels.includes("status/review")) {
    return "進行中。PR、テスト、レビュー結果との対応を確認する。";
  }

  return "状態ラベルを確認し、次アクションを親セッションで決める。";
}

function renderReport(issues) {
  const targets = issues
    .filter((issue) => intakeScore(issue) > 0)
    .sort((a, b) => intakeScore(b) - intakeScore(a) || new Date(a.created_at) - new Date(b.created_at))
    .slice(0, maxIssues);

  const lines = [
    "# めっちゃマニュアル Issue intake report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## 概要",
    "",
    `- open issues: ${issues.length}`,
    `- intake targets: ${targets.length}`,
    "",
    "## 次に見るIssue",
    ""
  ];

  if (targets.length === 0) {
    lines.push("- 対応待ちのIssueはありません。");
  }

  for (const issue of targets) {
    const labels = labelNames(issue);
    lines.push(
      `### #${issue.number} ${issue.title}`,
      "",
      `- URL: ${issue.html_url}`,
      `- labels: ${labels.length > 0 ? labels.join(", ") : "(none)"}`,
      `- assignee: ${issue.assignee?.login || "(none)"}`,
      `- created_at: ${issue.created_at}`,
      `- updated_at: ${issue.updated_at}`,
      `- recommendation: ${recommendation(issue)}`,
      ""
    );
  }

  lines.push(
    "## 運用ルール",
    "",
    "- Discord由来Issueは、最初に `needs-triage` と `status/triage` を持つ。",
    "- 作業に入る前に `type/*` と `priority/P*` を確認する。",
    "- PR本文には対応Issueを `Closes #番号` で明記する。",
    "- `approval-required` または `blocked-from-discord` があるIssueは、ユーザー承認なしに実装、merge、本番deployしない。"
  );

  return `${lines.join("\n")}\n`;
}

async function checkLabelDefinitions() {
  const labels = JSON.parse(await readFile(".github/issue-labels.json", "utf8"));
  const labelNames = new Set(labels.map((label) => label.name));
  const missing = [...requiredLabels, ...priorityLabels].filter((label) => !labelNames.has(label));

  if (missing.length > 0) {
    throw new Error(`Missing issue labels: ${missing.join(", ")}`);
  }
}

await checkLabelDefinitions();

if (checkOnly) {
  console.log("Issue intake report harness OK.");
  process.exit(0);
}

const issues = await listOpenIssues();
const report = renderReport(issues);

await writeFile(outputPath, report, "utf8");
console.log(report);

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, report, "utf8");
}
