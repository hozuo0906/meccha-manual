import { appendFile, readFile } from "node:fs/promises";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const priorityLabels = ["priority/P0", "priority/P1", "priority/P2", "priority/P3"];
const statusLabels = ["status/triage", "status/ready", "status/in-progress", "status/review", "status/blocked", "status/done"];
const typeLabels = ["type/harness", "type/docs", "type/feature", "type/bug", "type/security", "type/test", "type/refactor", "type/uiux"];

const dangerousPatterns = [
  /production|本番|deploy|デプロイ|release|リリース/i,
  /migration|マイグレーション|DB|database|RLS|Supabase/i,
  /Stripe|課金|決済|返金|請求|billing|payment/i,
  /AI API|OpenAI API|API key|APIキー|secret|秘密|token|トークン/i,
  /共有リンク|公開リンク|public link|share link/i,
  /削除|delete|remove|drop|truncate/i
];

const testPatterns = [/テスト|疎通|確認|dry[- ]?run|smoke/i];
const harnessPatterns = [/Discord|GitHub Actions|workflow|CI|Cloudflare|Codex|ハーネス|通知|Issue/i];
const docsPatterns = [/docs|document|ADR|設計|資料|README|ドキュメント/i];
const bugPatterns = [/bug|fix|error|失敗|エラー|不具合|壊れ/i];
const uiuxPatterns = [/UI|UX|画面|デザイン|文言|アクセシビリティ/i];
const refactorPatterns = [/refactor|リファクタ|命名|定数|責務|再利用/i];

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function labelNames(issue) {
  return (issue.labels || []).map((label) => typeof label === "string" ? label : label.name).filter(Boolean);
}

function hasAny(labels, names) {
  return names.some((name) => labels.includes(name));
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function classifyIssue(issue) {
  const labels = labelNames(issue);
  const text = `${issue.title || ""}\n${issue.body || ""}`;
  const dangerous = matchesAny(text, dangerousPatterns);
  const additions = ["user-request"];

  if (!hasAny(labels, statusLabels)) additions.push("needs-triage", "status/triage");
  if (!hasAny(labels, priorityLabels)) additions.push(dangerous ? "priority/P1" : matchesAny(text, testPatterns) ? "priority/P3" : "priority/P2");

  if (!hasAny(labels, typeLabels)) {
    if (dangerous && /secret|秘密|token|トークン|API key|APIキー|RLS|公開リンク|共有リンク/i.test(text)) additions.push("type/security");
    else if (matchesAny(text, harnessPatterns)) additions.push("type/harness");
    else if (matchesAny(text, docsPatterns)) additions.push("type/docs");
    else if (matchesAny(text, bugPatterns)) additions.push("type/bug");
    else if (matchesAny(text, uiuxPatterns)) additions.push("type/uiux");
    else if (matchesAny(text, refactorPatterns)) additions.push("type/refactor");
    else if (matchesAny(text, testPatterns)) additions.push("type/test");
    else additions.push("type/feature");
  }

  if (dangerous) additions.push("approval-required", "blocked-from-discord");

  return {
    dangerous,
    additions: unique(additions.filter((label) => !labels.includes(label))),
    labels
  };
}

async function githubRequest(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;

  if (!token || !repository) {
    throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required unless --check is used.");
  }

  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "meccha-manual-issue-event-triage",
      "x-github-api-version": "2022-11-28",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`GitHub API ${options.method || "GET"} ${path} failed: HTTP ${response.status} ${payload?.message || response.statusText}`);
  }

  return payload;
}

async function loadEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error("GITHUB_EVENT_PATH is required.");
  return JSON.parse(await readFile(eventPath, "utf8"));
}

function renderComment(issue, result) {
  const lines = [
    "## めっちゃマニュアル Issue受付",
    "",
    "GitHub Issueイベントを受けて、自動トリアージしました。",
    "",
    `- 対象: #${issue.number} ${issue.title}`,
    `- 危険操作候補: ${result.dangerous ? "あり" : "なし"}`,
    `- 追加ラベル: ${result.additions.length > 0 ? result.additions.join(", ") : "なし"}`,
    ""
  ];

  if (result.dangerous) {
    lines.push(
      "このIssueは本番反映、DB migration、課金、AI API、共有リンク公開、secret操作などを含む可能性があります。",
      "`approval-required` と `blocked-from-discord` が残っている間は、自動実装へ進めません。"
    );
  } else {
    lines.push(
      "`approved-for-codex` ラベルを付けると、Codex利用枠を使う自動実装ワークフローの対象になります。",
      "不要なIssueや雑談Issueには承認ラベルを付けないでください。"
    );
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  if (checkOnly) {
    console.log("Issue event triage script OK.");
    return;
  }

  const event = await loadEvent();
  const issue = event.issue;
  if (!issue || issue.pull_request) {
    console.log("No issue payload to triage.");
    return;
  }

  const result = classifyIssue(issue);

  if (result.additions.length > 0) {
    await githubRequest(`/issues/${issue.number}/labels`, {
      method: "POST",
      body: JSON.stringify({ labels: result.additions })
    });
  }

  if (event.action === "opened" || event.action === "reopened") {
    await githubRequest(`/issues/${issue.number}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: renderComment(issue, result) })
    });
  }

  const summary = renderComment(issue, result);
  console.log(summary);

  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, summary, "utf8");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
