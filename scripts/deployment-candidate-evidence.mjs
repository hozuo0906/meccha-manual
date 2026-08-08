import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const mode = process.argv[2];
const candidate = process.env.CANDIDATE_SHA || "";
if (!/^[a-f0-9]{40}$/.test(candidate)) throw new Error("CANDIDATE_SHA must be a lowercase 40 character SHA.");

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

if (mode === "verify-candidate-ref") {
  execFileSync("git", ["fetch", "--no-tags", "origin", "main"], { stdio: "ignore" });
  execFileSync("git", ["cat-file", "-e", `${candidate}^{commit}`], { stdio: "ignore" });
  execFileSync("git", ["merge-base", "--is-ancestor", candidate, "origin/main"], { stdio: "ignore" });
  console.log("Deployment candidate was verified by trusted main code and is reachable from main.");
} else if (mode === "write-staging-evidence") {
  await mkdir("staging-evidence", { recursive: true });
  await writeFile("staging-evidence/evidence.json", JSON.stringify({
    candidateSha: candidate,
    repository: process.env.GITHUB_REPOSITORY,
    runId: process.env.GITHUB_RUN_ID,
    workflowSha: process.env.GITHUB_SHA,
    workflowRef: process.env.GITHUB_REF
  }));
  console.log("Staging evidence written without secrets.");
} else if (mode === "verify-staging-evidence") {
  const evidence = JSON.parse(await readFile("staging-evidence/evidence.json", "utf8"));
  const runId = String(process.env.STAGING_RUN_ID || "");
  if (!/^\d+$/.test(runId) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(process.env.GITHUB_REPOSITORY || "") || !process.env.GITHUB_TOKEN) {
    throw new Error("Valid staging run, repository, and GitHub token are required.");
  }
  if (evidence.candidateSha !== candidate || evidence.repository !== process.env.GITHUB_REPOSITORY || evidence.runId !== runId || evidence.workflowRef !== "refs/heads/main") {
    throw new Error("Staging evidence does not match the production candidate.");
  }
  const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/runs/${runId}`, {
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: "application/vnd.github+json" }
  });
  if (!response.ok) throw new Error(`Unable to verify staging workflow run: HTTP ${response.status}`);
  const run = await response.json();
  if (run.path !== ".github/workflows/deploy-staging.yml" || run.event !== "workflow_dispatch" || run.conclusion !== "success" || run.head_branch !== "main" || run.head_sha !== evidence.workflowSha) {
    throw new Error("Staging evidence did not come from a successful staging candidate workflow.");
  }
  console.log("Production candidate matches successful staging evidence.");
} else {
  throw new Error("Unknown deployment candidate evidence mode.");
}
