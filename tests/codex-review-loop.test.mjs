import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildRepairPrompt,
  evaluateReviewContext,
  markerFor,
  MAX_REPAIR_ROUNDS,
  publicationState,
  remoteHeadMatches,
  safePushArguments,
  shouldRunTargetedTests,
  trustedMarkers
} from "../scripts/codex-review-loop.mjs";

const SHA = "a".repeat(40);
function event(overrides = {}) {
  const base = {
    action: "submitted",
    review: { id: 42, commit_id: SHA, user: { login: "chatgpt-codex-connector[bot]" } },
    pull_request: { number: 7, state: "open", base: { ref: "main", repo: { full_name: "o/r" } }, head: { sha: SHA, ref: "codex/fix", repo: { full_name: "o/r", fork: false } } }
  };
  return { ...base, ...overrides, review: { ...base.review, ...overrides.review }, pull_request: { ...base.pull_request, ...overrides.pull_request, base: { ...base.pull_request.base, ...overrides.pull_request?.base }, head: { ...base.pull_request.head, ...overrides.pull_request?.head } } };
}
function thread({ severity = "P1", resolved = false, author = "chatgpt-codex-connector[bot]", id = "T1" } = {}) {
  return { id, isResolved: resolved, path: "src/a.js", line: 4, comments: { nodes: [{ databaseId: 99, body: `${severity}: fix the checked boundary`, author: { login: author } }] } };
}

test("Codex bot review with one P1 requests repair", () => assert.equal(evaluateReviewContext({ event: event(), threads: [thread()] }).run, true));
test("clean Codex review is a no-op", () => assert.equal(evaluateReviewContext({ event: event(), threads: [] }).reason, "clean_review"));
test("non-Codex reviewer is a no-op", () => assert.equal(evaluateReviewContext({ event: event({ review: { user: { login: "human" } } }), threads: [thread()] }).reason, "untrusted_reviewer"));
test("fork PR is a no-op", () => assert.equal(evaluateReviewContext({ event: event({ pull_request: { head: { repo: { full_name: "fork/r", fork: true } } } }), threads: [thread()] }).reason, "fork_or_cross_repo"));
test("non-main base is a no-op", () => assert.equal(evaluateReviewContext({ event: event({ pull_request: { base: { ref: "release" } } }), threads: [thread()] }).reason, "base_not_main"));
test("processing marker resumes the same review instead of suppressing it", () => {
  const marker = markerFor({ prNumber: 7, reviewId: 42, headSha: SHA });
  const decision = evaluateReviewContext({ event: event(), markers: [marker], threads: [thread()] });
  assert.equal(decision.run, true);
  assert.equal(decision.isResume, true);
});
test("completed review marker is a duplicate no-op", () => {
  const marker = markerFor({ prNumber: 7, reviewId: 42, headSha: SHA, state: "completed" });
  assert.equal(evaluateReviewContext({ event: event(), markers: [marker], threads: [thread()] }).reason, "duplicate_review");
});
test("stale remote head fails exact comparison", () => assert.equal(remoteHeadMatches(SHA, "b".repeat(40)), false));
test("maximum completed repair rounds stop a new Codex run", () => {
  const markers = Array.from({ length: MAX_REPAIR_ROUNDS }, (_, i) => markerFor({ prNumber: 7, reviewId: 100 + i, headSha: String(i + 1).repeat(40).slice(0, 40) }));
  assert.equal(evaluateReviewContext({ event: event(), markers, threads: [thread()] }).reason, "round_limit");
});
test("P2 trusted thread is included", () => assert.equal(evaluateReviewContext({ event: event(), threads: [thread({ severity: "P2" })] }).findings[0].severity, "P2"));
test("resolved thread is excluded", () => assert.equal(evaluateReviewContext({ event: event(), threads: [thread({ resolved: true })] }).reason, "clean_review"));
test("arbitrary user review comment is excluded from prompt input", () => assert.equal(evaluateReviewContext({ event: event(), threads: [thread({ author: "attacker" })] }).reason, "clean_review"));
test("reviewed SHA mismatch prevents repair", () => assert.equal(evaluateReviewContext({ event: event({ review: { commit_id: "b".repeat(40) } }), threads: [thread()] }).reason, "reviewed_sha_mismatch"));
test("repair prompt is bounded and contains only supplied trusted findings", () => {
  const prompt = buildRepairPrompt({ repository: "o/r", prNumber: 7, headSha: SHA, changedPaths: ["src/a.js"], findings: [{ severity: "P1", path: "src/a.js", line: 4, body: "trusted finding" }] });
  assert.match(prompt, /trusted finding/);
  assert.doesNotMatch(prompt, /arbitrary user discussion/);
  assert.ok(prompt.length < 24_000);
});
test("targeted test selection recognizes extension and D1/auth paths", () => assert.deepEqual(shouldRunTargetedTests(["apps/extension/a.js", "apps/worker/src/infra/d1/a.ts", "apps/worker/src/access-identity.ts"]), { extension: true, d1: true, auth: true }));
test("trusted publication uses same branch fast-forward syntax and rejects main", () => {
  assert.deepEqual(safePushArguments("codex/fix"), ["push", "origin", "HEAD:refs/heads/codex/fix"]);
  assert.throws(() => safePushArguments("main"), /Unsafe push branch/);
});
test("only trusted current-PR repair markers influence review state", () => {
  const good = markerFor({ prNumber: 7, reviewId: 42, headSha: SHA });
  const other = markerFor({ prNumber: 8, reviewId: 42, headSha: SHA });
  const comments = [
    { user: { login: "github-actions[bot]" }, body: good },
    { user: { login: "attacker" }, body: good },
    { user: { login: "github-actions[bot]" }, body: other }
  ];
  assert.deepEqual(trustedMarkers(comments, 7), [good]);
});
test("post-push retry accepts only the tested direct-child tree", () => {
  const child = "b".repeat(40);
  const tree = "c".repeat(40);
  assert.equal(publicationState({ reviewedSha: SHA, currentSha: child, currentParentSha: SHA, testedTree: tree, currentTree: tree }), "published");
  assert.throws(() => publicationState({ reviewedSha: SHA, currentSha: child, currentParentSha: SHA, testedTree: tree, currentTree: "d".repeat(40) }), /STALE_HEAD/);
  assert.throws(() => publicationState({ reviewedSha: SHA, currentSha: child, currentParentSha: "e".repeat(40), testedTree: tree, currentTree: tree }), /STALE_HEAD/);
});

test("workflow isolates GitHub credentials from Codex and never pushes before tests", async () => {
  const workflow = await readFile(new URL("../.github/workflows/codex-review-loop.yml", import.meta.url), "utf8");
  const codexStep = workflow.slice(workflow.indexOf("Run credential-isolated Codex repair"), workflow.indexOf("Detect repair changes"));
  assert.match(codexStep, /GH_TOKEN: ""/);
  assert.match(codexStep, /GITHUB_TOKEN: ""/);
  assert.match(codexStep, /persist-credentials: false|unset GH_TOKEN GITHUB_TOKEN/);
  assert.ok(workflow.indexOf("Run repository checks") < workflow.indexOf("Fast-forward existing PR branch"));
  assert.match(workflow, /git diff --cached --check HEAD[\s\S]*npm run check/);
  assert.match(workflow, /push origin/);
  assert.doesNotMatch(workflow, /push[^\n]*--force|push[^\n]*-f\b/);
});

test("workflow stages new files into the tested patch and uses a CI-triggering isolated publisher token", async () => {
  const workflow = await readFile(new URL("../.github/workflows/codex-review-loop.yml", import.meta.url), "utf8");
  assert.match(workflow, /git add -A[\s\S]*git diff --cached --name-only/);
  assert.match(workflow, /git diff --cached --binary --full-index HEAD/);
  assert.match(workflow, /git write-tree/);
  assert.match(workflow, /CODEX_REVIEW_PUBLISH_TOKEN/);
  const publisher = workflow.slice(workflow.indexOf("Fast-forward existing PR branch"), workflow.indexOf("Select published head"));
  assert.doesNotMatch(publisher, /github\.token/);
});
