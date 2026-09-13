import { readFile, writeFile } from "node:fs/promises";

export const TRUSTED_REVIEWERS = new Set(["chatgpt-codex-connector", "chatgpt-codex-connector[bot]"]);
export const ALLOWED_BRANCH_PREFIXES = ["codex/", "feature/issue-"];
export const MAX_REPAIR_ROUNDS = 3;
export const MAX_FINDINGS = 20;
export const MAX_FINDING_CHARS = 4_000;
export const MAX_PROMPT_CHARS = 24_000;

export function severityOf(body) {
  const match = String(body).match(/(?:^|\n|\s|\[|\()P([012])(?:\b|\]|\))/i);
  return match ? `P${match[1]}` : null;
}

export function markerFor({ prNumber, reviewId, headSha }) {
  return `<!-- codex-review-loop:pr=${prNumber}:review=${reviewId}:sha=${headSha} -->`;
}

export function evaluateReviewContext({ event, markers = [], threads = [] }) {
  const pr = event.pull_request;
  const review = event.review;
  if (!pr || !review || event.action !== "submitted") return { run: false, reason: "unsupported_event" };
  if (!TRUSTED_REVIEWERS.has(review.user?.login)) return { run: false, reason: "untrusted_reviewer" };
  if (pr.state !== "open") return { run: false, reason: "pr_not_open" };
  if (pr.base?.ref !== "main") return { run: false, reason: "base_not_main" };
  if (pr.head?.repo?.full_name !== pr.base?.repo?.full_name || pr.head?.repo?.fork) return { run: false, reason: "fork_or_cross_repo" };
  if (!ALLOWED_BRANCH_PREFIXES.some((prefix) => pr.head?.ref?.startsWith(prefix))) return { run: false, reason: "branch_not_allowed" };
  if (review.commit_id !== pr.head?.sha) return { run: false, reason: "reviewed_sha_mismatch" };

  const marker = markerFor({ prNumber: pr.number, reviewId: review.id, headSha: pr.head.sha });
  if (markers.includes(marker)) return { run: false, reason: "duplicate_review", marker };
  if (markers.length >= MAX_REPAIR_ROUNDS) return { run: false, reason: "round_limit", marker };

  const findings = threads
    .filter((thread) => !thread.isResolved)
    .map((thread) => ({ ...thread, top: thread.comments?.nodes?.[0] }))
    .filter(({ top }) => TRUSTED_REVIEWERS.has(top?.author?.login))
    .map(({ top, ...thread }) => ({
      threadId: thread.id,
      commentId: top.databaseId,
      path: thread.path || top.path || null,
      line: thread.line ?? thread.originalLine ?? top.line ?? top.originalLine ?? null,
      severity: severityOf(top.body),
      body: String(top.body || "").slice(0, MAX_FINDING_CHARS)
    }))
    .filter((finding) => finding.severity)
    .slice(0, MAX_FINDINGS);

  if (findings.length === 0) return { run: false, reason: "clean_review", marker };
  return { run: true, reason: "trusted_findings", marker, round: markers.length + 1, findings };
}

export function buildRepairPrompt({ repository, prNumber, headSha, changedPaths, findings }) {
  const scope = changedPaths.slice(0, 200).map((path) => `- ${path}`).join("\n");
  const trusted = findings.map((finding, index) => [
    `## Finding ${index + 1} (${finding.severity})`,
    `Path: ${finding.path || "not supplied"}`,
    `Line: ${finding.line ?? "not supplied"}`,
    finding.body
  ].join("\n")).join("\n\n");
  const prompt = `Repository:\n${repository}\n\nPR:\n${prNumber}\n\nCurrent exact HEAD:\n${headSha}\n\nInstruction:\nFix only the trusted unresolved Codex review findings supplied below.\nPreserve the PR's existing scope.\nRead AGENTS.md first.\n\nDo not:\n- broaden Product scope\n- change unrelated files\n- weaken tests\n- weaken branch protection\n- alter external environments\n- change billing\n- publish Chrome Web Store artifacts\n- perform destructive operations\n\nFor every finding:\n- verify it against current exact HEAD\n- fix root cause\n- add or adjust a regression test\n- do not blindly follow stale or outdated thread text\n\nRun required targeted tests and repository checks.\nDo not commit, push, comment, resolve threads, or use GitHub credentials; the trusted runner owns publication.\n\nCurrent PR changed-file scope:\n${scope}\n\nTrusted unresolved Codex findings:\n${trusted}\n`;
  if (prompt.length > MAX_PROMPT_CHARS) throw new Error("Repair prompt exceeds bounded size");
  return prompt;
}

export function shouldRunTargetedTests(paths) {
  return {
    extension: paths.some((path) => path.startsWith("apps/extension/") || path === "tests/extension-mvp.test.mjs"),
    d1: paths.some((path) => path.startsWith("apps/worker/src/infra/d1/") || path.startsWith("migrations/") || path.includes("d1-")),
    auth: paths.some((path) => path.includes("access-identity") || path.includes("auth"))
  };
}

export function remoteHeadMatches(expected, actual) {
  return /^[0-9a-f]{40}$/.test(expected) && expected === actual;
}

export function safePushArguments(headRef) {
  if (!ALLOWED_BRANCH_PREFIXES.some((prefix) => headRef.startsWith(prefix)) || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(headRef) || headRef.includes("..") || headRef.includes("@{") || headRef.endsWith("/") || headRef === "main") throw new Error("Unsafe push branch");
  return ["push", "origin", `HEAD:refs/heads/${headRef}`];
}

async function githubRequest(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    redirect: "error",
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "meccha-manual-codex-review-loop" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`GitHub API ${method} ${path} failed with ${response.status}`);
  return response.status === 204 ? null : response.json();
}

async function graphql(token, query, variables) {
  const result = await githubRequest("/graphql", { token, method: "POST", body: { query, variables } });
  if (result.errors?.length) throw new Error(`GitHub GraphQL failed: ${result.errors.map(({ type }) => type).join(",")}`);
  return result.data;
}

async function issueComments(repository, prNumber, token) {
  const comments = [];
  for (let page = 1; page <= 5; page += 1) {
    const batch = await githubRequest(`/repos/${repository}/issues/${prNumber}/comments?per_page=100&page=${page}`, { token });
    comments.push(...batch);
    if (batch.length < 100) return comments;
  }
  throw new Error("PR comment scan exceeded bounded pagination");
}

function assertExpectedTarget(metadata) {
  if (metadata.repository !== process.env.EXPECTED_REPOSITORY || String(metadata.prNumber) !== process.env.EXPECTED_PR_NUMBER) {
    throw new Error("Repair metadata target mismatch");
  }
}

function output(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  return writeFile(process.env.GITHUB_OUTPUT, `${name}=${String(value).replaceAll("\n", "%0A")}\n`, { flag: "a" });
}

async function inspect() {
  const token = process.env.GH_TOKEN;
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  const { repository } = event;
  const pr = event.pull_request;
  const comments = await issueComments(repository.full_name, pr.number, token);
  const markers = comments.map(({ body }) => String(body).match(/<!-- codex-review-loop:pr=\d+:review=\d+:sha=[0-9a-f]{40} -->/)?.[0]).filter(Boolean);
  const data = await graphql(token, `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){pageInfo{hasNextPage} nodes{id isResolved path line originalLine comments(first:1){nodes{databaseId body author{login} path line originalLine}}}} files(first:100){pageInfo{hasNextPage} nodes{path}}}}}`, { owner: repository.owner.login, name: repository.name, number: pr.number });
  const pullRequest = data.repository.pullRequest;
  if (pullRequest.reviewThreads.pageInfo.hasNextPage || pullRequest.files.pageInfo.hasNextPage) throw new Error("PR review scope exceeded bounded pagination");
  const decision = evaluateReviewContext({ event, markers, threads: pullRequest.reviewThreads.nodes });
  await output("run_repair", decision.run);
  await output("reason", decision.reason);
  await output("head_sha", pr.head.sha);
  await output("head_ref", pr.head.ref);
  await output("pr_number", pr.number);
  if (decision.reason === "round_limit") {
    await githubRequest(`/repos/${repository.full_name}/issues/${pr.number}/comments`, { token, method: "POST", body: { body: `${decision.marker}\nAutomatic Codex review repair reached the ${MAX_REPAIR_ROUNDS}-round limit. The PR remains open for parent PM inspection.` } });
    return;
  }
  if (!decision.run) return;
  await githubRequest(`/repos/${repository.full_name}/issues/${pr.number}/comments`, { token, method: "POST", body: { body: `${decision.marker}\nStarting automatic Codex review repair round ${decision.round}/${MAX_REPAIR_ROUNDS} for exact head \`${pr.head.sha}\`.` } });
  const prompt = buildRepairPrompt({ repository: repository.full_name, prNumber: pr.number, headSha: pr.head.sha, changedPaths: pullRequest.files.nodes.map(({ path }) => path), findings: decision.findings });
  await writeFile(process.env.REPAIR_PROMPT_PATH, prompt, { mode: 0o600 });
  await writeFile(process.env.REPAIR_METADATA_PATH, JSON.stringify({ repository: repository.full_name, prNumber: pr.number, headSha: pr.head.sha, headRef: pr.head.ref, findings: decision.findings }), { mode: 0o600 });
}

async function verifyHead() {
  const metadata = JSON.parse(await readFile(process.env.REPAIR_METADATA_PATH, "utf8"));
  assertExpectedTarget(metadata);
  const pr = await githubRequest(`/repos/${metadata.repository}/pulls/${metadata.prNumber}`, { token: process.env.GH_TOKEN });
  if (!remoteHeadMatches(metadata.headSha, pr.head.sha)) throw new Error(`STALE_HEAD: expected ${metadata.headSha}, found ${pr.head.sha}`);
}

async function complete() {
  const metadata = JSON.parse(await readFile(process.env.REPAIR_METADATA_PATH, "utf8"));
  assertExpectedTarget(metadata);
  const token = process.env.GH_TOKEN;
  const newSha = process.env.NEW_HEAD_SHA;
  if (!/^[0-9a-f]{40}$/.test(newSha)) throw new Error("Invalid published head SHA");
  const [owner, name] = metadata.repository.split("/");
  const current = await graphql(token, `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){headRefOid reviewThreads(first:100){pageInfo{hasNextPage} nodes{id isResolved comments(first:1){nodes{databaseId author{login}}}}}}}}`, { owner, name, number: metadata.prNumber });
  const pullRequest = current.repository.pullRequest;
  if (pullRequest.headRefOid !== newSha || pullRequest.reviewThreads.pageInfo.hasNextPage) throw new Error("Published head or review-thread scope mismatch");
  const trustedThreads = new Map(pullRequest.reviewThreads.nodes.filter((thread) => !thread.isResolved && TRUSTED_REVIEWERS.has(thread.comments.nodes[0]?.author?.login)).map((thread) => [thread.id, thread.comments.nodes[0]?.databaseId]));
  for (const finding of metadata.findings) {
    if (!trustedThreads.has(finding.threadId) || trustedThreads.get(finding.threadId) !== finding.commentId) throw new Error("Trusted review thread changed before completion");
    if (finding.commentId) await githubRequest(`/repos/${metadata.repository}/pulls/${metadata.prNumber}/comments/${finding.commentId}/replies`, { token, method: "POST", body: { body: `Fixed and regression-tested in ${newSha}.` } });
    await graphql(token, `mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{id isResolved}}}`, { id: finding.threadId });
  }
  await githubRequest(`/repos/${metadata.repository}/issues/${metadata.prNumber}/comments`, { token, method: "POST", body: { body: `<!-- codex-review-loop:rereview-sha=${newSha} -->\n@codex review ${newSha}\n\nExact-head re-review requested after the tested fast-forward repair. If the Codex integration ignores comments authored by github-actions[bot], this marker records that manual/API-native re-review remains required; Latest Review Gate is not bypassed.` } });
}

const command = process.argv[2];
if (command === "inspect") await inspect();
else if (command === "verify-head") await verifyHead();
else if (command === "complete") await complete();
else if (import.meta.url === `file://${process.argv[1]}`) throw new Error("Expected inspect, verify-head, or complete");
