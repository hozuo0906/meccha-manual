const checkOnly = process.argv.includes("--check");
if (checkOnly) {
  console.log("PR quality gate harness OK: runtime GitHub API access is not used by npm run check.");
  process.exit(0);
}

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const prNumber = Number(process.env.PR_NUMBER);
if (!repository || !token || !Number.isInteger(prNumber) || prNumber < 1) {
  throw new Error("GITHUB_REPOSITORY, GITHUB_TOKEN, and PR_NUMBER are required.");
}

const [owner, repo] = repository.split("/");
const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
const headers = {
  "accept": "application/vnd.github+json",
  "authorization": `Bearer ${token}`,
  "x-github-api-version": "2022-11-28"
};
async function api(path) {
  const response = await fetch(`${apiBase}${path}`, { headers });
  if (!response.ok) throw new Error(`GitHub API failed: ${path} HTTP ${response.status}`);
  return response.json();
}
async function apiPages(path) {
  const values = [];
  for (let page = 1; ; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const batch = await api(`${path}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw new Error(`Paginated GitHub API did not return an array: ${path}`);
    values.push(...batch);
    if (batch.length < 100) return values;
  }
}

const requiredChecks = [
  "AGENTS.mdを確認した", "自己レビューを実施した", "npm ciを実行した",
  "npm run checkが成功した", "git diff --checkが成功した", "必要な個別テストが成功した",
  "最新コミットに対してCodex Reviewを実行した", "P0が0件である", "P1が0件である",
  "P2の対応状況を確認した", "未解決review threadが0件である",
  "マージ対象SHAとレビュー対象SHAが一致している", "未実行テストと理由を記載した",
  "秘密値・個人情報・本番設定を含んでいない", "production変更を含んでいない"
];
const requiredQualityLoopChecks = [
  "コーディング担当の結論、リスク、未決を確認した",
  "UIUX担当の日本語UI、状態、アクセシビリティ観点を確認した",
  "テスト担当の自動テスト、手動確認、未実施理由を確認した",
  "辛口レビュー担当のP0/P1指摘が0件である",
  "リファクタリング/コードレビュー担当の命名、定数、責務、再利用性、依存方向を確認した",
  "ドキュメント記録担当がADR、decision-log、Issue、テスト条件の整合を確認した",
  "サブエージェントの生思考や会話全文をPR、docs、ログへ記録していない"
];
const pr = await api(`/pulls/${prNumber}`);
const body = pr.body || "";
const missing = [...requiredChecks, ...requiredQualityLoopChecks].filter((label) =>
  !new RegExp(`^- \\[x\\] ${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}。?$`, "mi").test(body)
);
if (missing.length) throw new Error(`PR checklist is incomplete: ${missing.join(", ")}`);

const comments = await apiPages(`/issues/${prNumber}/comments`);
const reviewRequest = [...comments].reverse().find((comment) =>
  /@codex\s+review/i.test(comment.body || "") && (comment.body || "").includes(pr.head.sha)
);
if (!reviewRequest) throw new Error("Latest head SHA is not named in an @codex review request.");

const reviews = await apiPages(`/pulls/${prNumber}/reviews`);
const CODEX_BOT_LOGINS = new Set(["chatgpt-codex-connector", "chatgpt-codex-connector[bot]"]);
const isCodexBot = (user) => CODEX_BOT_LOGINS.has(user?.login || "") && user?.type === "Bot";
const codexReview = reviews.some((review) =>
  isCodexBot(review.user)
    && ["COMMENTED", "APPROVED", "CHANGES_REQUESTED"].includes(review.state)
    && review.commit_id === pr.head.sha
);
let codexApprovalReaction = false;
if (!codexReview) {
  const [commentReactions, prReactions] = await Promise.all([
    apiPages(`/issues/comments/${reviewRequest.id}/reactions`),
    apiPages(`/issues/${prNumber}/reactions`)
  ]);
  codexApprovalReaction = [...commentReactions, ...prReactions].some((reaction) =>
    isCodexBot(reaction.user) && reaction.content === "+1"
      && new Date(reaction.created_at) >= new Date(reviewRequest.created_at)
  );
}
if (!codexReview && !codexApprovalReaction) {
  throw new Error("Latest head has neither a Codex review nor a post-request Codex approval reaction.");
}

const graphqlHeaders = { ...headers, "content-type": "application/json" };
let cursor = null;
let unresolved = 0;
do {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: graphqlHeaders,
    body: JSON.stringify({
      query: `query($owner:String!,$repo:String!,$number:Int!,$cursor:String){repository(owner:$owner,name:$repo){pullRequest(number:$number){reviewThreads(first:100,after:$cursor){nodes{isResolved}pageInfo{hasNextPage endCursor}}}}}`,
      variables: { owner, repo, number: prNumber, cursor }
    })
  });
  if (!response.ok) throw new Error(`GitHub GraphQL failed: HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error("GitHub GraphQL returned errors while reading review threads.");
  const threads = payload.data.repository.pullRequest.reviewThreads;
  unresolved += threads.nodes.filter((thread) => !thread.isResolved).length;
  cursor = threads.pageInfo.hasNextPage ? threads.pageInfo.endCursor : null;
} while (cursor);
if (unresolved > 0) throw new Error(`Unresolved review threads remain: ${unresolved}`);

console.log(`PR quality gate OK: PR #${prNumber}, head ${pr.head.sha}, unresolved threads 0.`);
