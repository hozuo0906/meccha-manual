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
test("secret-bearing repair prompt permits edits but forbids all PR-controlled execution", () => {
  const prompt = buildRepairPrompt({ repository: "o/r", prNumber: 7, headSha: SHA, changedPaths: ["src/a.js"], findings: [{ severity: "P1", body: "fix it" }] });
  for (const prohibited of ["dependency lifecycle hooks", "package-manager commands", "tests", "checks", "Git hooks", "executable supplied by the checkout"]) assert.match(prompt, new RegExp(prohibited));
  assert.match(prompt, /inspect and edit candidate files only/);
  assert.match(prompt, /Do not install dependencies or run targeted tests or repository checks/);
  assert.doesNotMatch(prompt, /Run required targeted tests and repository checks/);
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
  const codexStep = workflow.slice(workflow.indexOf("Run credential-isolated Codex repair"), workflow.indexOf("Detect and authorize repair changes"));
  assert.match(codexStep, /GH_TOKEN: ""/);
  assert.match(codexStep, /GITHUB_TOKEN: ""/);
  assert.match(codexStep, /unset GH_TOKEN GITHUB_TOKEN/);
  assert.ok(workflow.indexOf("Run repository checks") < workflow.indexOf("Fast-forward existing PR branch"));
  assert.match(workflow, /git diff --cached --check HEAD[\s\S]*npm run check/);
  assert.match(workflow, /push origin/);
  assert.doesNotMatch(workflow, /push[^\n]*--force|push[^\n]*-f\b/);
});

test("secret-bearing repair runner executes no PR-controlled setup before Codex and testing happens on a fresh job", async () => {
  const workflow = await readFile(new URL("../.github/workflows/codex-review-loop.yml", import.meta.url), "utf8");
  const repairJob = workflow.slice(workflow.indexOf("  repair:"), workflow.indexOf("  test_repair:"));
  const beforeCodex = repairJob.slice(0, repairJob.indexOf("Run credential-isolated Codex repair"));
  assert.doesNotMatch(beforeCodex, /npm ci/);
  assert.doesNotMatch(beforeCodex, /npm run issue-codex:check/);
  assert.ok(beforeCodex.indexOf("Install Codex CLI before PR checkout") < beforeCodex.indexOf("Checkout exact reviewed head without credentials"));
  const testJob = workflow.slice(workflow.indexOf("  test_repair:"), workflow.indexOf("  publish:"));
  assert.match(testJob, /Install dependencies after secret-bearing job has ended[\s\S]*npm ci/);
  assert.match(testJob, /Validate automation contract on fresh runner[\s\S]*npm run issue-codex:check/);
  assert.match(testJob, /npm run check/);
});

test("fresh runner revalidates the immutable candidate after every PR-controlled command", async () => {
  const workflow = await readFile(new URL("../.github/workflows/codex-review-loop.yml", import.meta.url), "utf8");
  const testJob = workflow.slice(workflow.indexOf("  test_repair:"), workflow.indexOf("  publish:"));
  assert.match(workflow, /candidate_tree:.*steps\.candidate\.outputs\.candidate_tree/);
  assert.match(testJob, /candidate_paths_sha256/);
  for (const command of ["npm ci", "npm run issue-codex:check", "npm run extension:test", "npm run test:d1-workspace", "npm run test:d1-binding", "npm run test:access-identity", "npm run app:auth:test", "npm run check"]) {
    const following = testJob.slice(testJob.indexOf(command) + command.length);
    assert.match(following, /^\s*validate_candidate/m, `${command} must be followed immediately by candidate validation`);
  }
  assert.match(testJob, /\/usr\/bin\/git rev-parse HEAD/);
  assert.match(testJob, /\/usr\/bin\/git write-tree/);
  assert.match(testJob, /\/usr\/bin\/git diff --quiet/);
  assert.match(testJob, /--name-only -z HEAD/);
});

test("publication metadata bypasses the untrusted test artifact and is revalidated by the publisher", async () => {
  const workflow = await readFile(new URL("../.github/workflows/codex-review-loop.yml", import.meta.url), "utf8");
  const candidateArtifact = workflow.slice(workflow.indexOf("Store candidate patch for fresh-runner testing"), workflow.indexOf("  test_repair:"));
  const testedArtifact = workflow.slice(workflow.indexOf("Store tested patch"), workflow.indexOf("  publish:"));
  const publisher = workflow.slice(workflow.indexOf("  publish:"));
  assert.doesNotMatch(candidateArtifact, /codex-review-metadata\.json/);
  assert.doesNotMatch(testedArtifact, /codex-review-metadata\.json/);
  assert.match(publisher, /Restore trusted publication metadata[\s\S]*codex-review-request-/);
  for (const identity of ["EXPECTED_REPOSITORY", "EXPECTED_PR_NUMBER", "EXPECTED_HEAD_SHA", "EXPECTED_HEAD_REF", "EXPECTED_REVIEW_ID", "TESTED_TREE"]) assert.match(publisher, new RegExp(identity));
});

test("workflow stages new files into the candidate patch and enforces trusted repair scope", async () => {
  const workflow = await readFile(new URL("../.github/workflows/codex-review-loop.yml", import.meta.url), "utf8");
  assert.match(workflow, /Capture trusted PR changed-file scope/);
  assert.match(workflow, /codex-review-scope\.json/);
  const detect = workflow.slice(workflow.indexOf("Detect and authorize repair changes"), workflow.indexOf("Export bounded candidate patch"));
  assert.match(detect, /git add -A/);
  assert.match(detect, /git diff[\s\S]*--cached[\s\S]*--name-only[\s\S]*-z/);
  assert.match(detect, /trustedScope\.has\(path\)/);
  assert.match(detect, /path\.startsWith\("tests\/"\)/);
  assert.match(detect, /!originalTreePaths\.has\(path\)/);
  assert.match(detect, /Repair changed paths outside the trusted PR scope/);
  assert.match(workflow, /git diff --cached --binary --full-index HEAD/);
  assert.match(workflow, /CODEX_REVIEW_PUBLISH_TOKEN/);
  const publisher = workflow.slice(workflow.indexOf("Fast-forward existing PR branch"), workflow.indexOf("Select published head"));
  assert.doesNotMatch(publisher, /github\.token/);
});

test("workflow fails closed if Codex moves HEAD before exporting a candidate patch", async () => {
  const workflow = await readFile(new URL("../.github/workflows/codex-review-loop.yml", import.meta.url), "utf8");
  const detect = workflow.slice(workflow.indexOf("Detect and authorize repair changes"), workflow.indexOf("Export bounded candidate patch"));
  assert.match(detect, /REVIEWED_SHA: \$\{\{ needs\.inspect\.outputs\.head_sha \}\}/);
  assert.match(detect, /test "\$\(git rev-parse HEAD\)" = "\$REVIEWED_SHA"/);
  assert.match(detect, /refusing to export a partial or mismatched repair patch/);
  assert.ok(detect.indexOf("git rev-parse HEAD") < detect.indexOf("git add -A"));
});

test("targeted test selection is derived from the validated staged diff, not mutable runner-temp state", async () => {
  const workflow = await readFile(new URL("../.github/workflows/codex-review-loop.yml", import.meta.url), "utf8");
  const targeted = workflow.slice(workflow.indexOf("- name: Run targeted checks"), workflow.indexOf("- name: Run repository checks"));
  assert.match(targeted, /validate_candidate[\s\S]*changed_paths="\$\(\/usr\/bin\/git diff --cached --name-only HEAD\)"/);
  assert.match(targeted, /\/usr\/bin\/printf[\s\S]*\/usr\/bin\/grep/);
  assert.doesNotMatch(targeted, /codex-review-changed-paths\.txt/);
});

test("every shell step after untrusted npm execution neutralizes cross-step shell injection", async () => {
  const workflow = await readFile(new URL("../.github/workflows/codex-review-loop.yml", import.meta.url), "utf8");
  const testJob = workflow.slice(workflow.indexOf("  test_repair:"), workflow.indexOf("  publish:"));
  for (const name of ["Validate automation contract on fresh runner", "Run targeted checks", "Run repository checks", "Export tested patch"]) {
    const start = testJob.indexOf(`- name: ${name}`);
    assert.notEqual(start, -1, `${name} must exist`);
    const next = testJob.indexOf("\n      - name:", start + 1);
    const step = testJob.slice(start, next === -1 ? undefined : next);
    assert.match(step, /BASH_ENV: ""/);
    assert.match(step, /ENV: ""/);
    assert.match(step, /RUNNER_TOOL_CACHE\/node/);
    assert.match(step, /export PATH="\$TRUSTED_NODE_BIN:\/usr\/bin:\/bin"/);
    assert.match(step, /unset BASH_ENV ENV/);
  }
});

test("publisher stages the downloaded patch and binds it to the exact tested tree before commit", async () => {
  const workflow = await readFile(new URL("../.github/workflows/codex-review-loop.yml", import.meta.url), "utf8");
  const applyStep = workflow.slice(workflow.indexOf("- name: Apply tested patch without executing it"), workflow.indexOf("- name: Commit tested repair"));
  assert.match(applyStep, /TESTED_TREE:/);
  assert.match(applyStep, /git -c core\.hooksPath=\/dev\/null add -A/);
  assert.match(applyStep, /applied_tree="\$\(git write-tree\)"/);
  assert.match(applyStep, /test "\$applied_tree" = "\$TESTED_TREE"/);
  const commitStep = workflow.slice(workflow.indexOf("- name: Commit tested repair"), workflow.indexOf("- name: Fast-forward existing PR branch"));
  assert.match(commitStep, /test "\$\(git write-tree\)" = "\$TESTED_TREE"/);
  assert.doesNotMatch(commitStep, /git -c core\.hooksPath=\/dev\/null add -A/);
});
