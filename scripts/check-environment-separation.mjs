import { readdir, readFile } from "node:fs/promises";

const paths = {
  docs: "docs/08-operations/environments-and-delivery.md",
  staging: ".github/workflows/deploy-staging.yml",
  production: ".github/workflows/deploy-production.yml",
  evidence: "scripts/deployment-candidate-evidence.mjs"
};
const errors = [];

async function read(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    errors.push(`Missing environment separation file: ${path}`);
    return "";
  }
}

const docs = await read(paths.docs);
const staging = await read(paths.staging);
const production = await read(paths.production);
const evidence = await read(paths.evidence);

for (const term of [
  "GitHub Environment",
  "Cloudflare Worker environment",
  "Cloudflare Access",
  "Cloudflare D1",
  "staging D1",
  "production D1",
  "Access JWT",
  "R2 capture",
  "Stripe",
  "Discord通知",
  "GitHub Actions",
  "production候補",
  "required reviewers",
  "tattoo-studio-crm.workers.dev",
  "`BILLING_FEATURE_ENABLED=false`",
  "Issue #176 M5",
  "Superseded",
  "prelaunch"
]) {
  if (!docs.includes(term)) errors.push(`Missing environment separation term: ${term}`);
}

if (!/^\s*environment:\s*staging\s*$/m.test(staging)) {
  errors.push("Staging workflow must use the staging GitHub Environment.");
}
if (!/^\s*environment:\s*production\s*$/m.test(production)) {
  errors.push("Production workflow must use the literal production GitHub Environment.");
}
if (/^\s*push:\s*$/m.test(production)) {
  errors.push("Production workflow must not run from a push trigger.");
}
if (!/^\s*workflow_dispatch:\s*$/m.test(production)) {
  errors.push("Production workflow must require explicit workflow dispatch.");
}
if (!/^\s*if:\s*github\.ref\s*==\s*['\"]refs\/heads\/main['\"]\s*$/m.test(production)) {
  errors.push("Production workflow must reject candidates outside the main branch.");
}
for (const [name, workflow] of [["Staging", staging], ["Production", production]]) {
  if (!/^\s*candidate_sha:\s*$/m.test(workflow) || !/CANDIDATE_SHA.*inputs\.candidate_sha/s.test(workflow)
    || !/^\s*ref:\s*\$\{\{ inputs\.candidate_sha \}\}\s*$/m.test(workflow)
    || !/^\s*fetch-depth:\s*0\s*$/m.test(workflow)) {
    errors.push(`${name} workflow must checkout and verify the requested immutable SHA.`);
  }
}

const allowedUses = new Set([
  "actions/checkout@v4", "actions/setup-node@v4",
  "actions/upload-artifact@v4", "actions/download-artifact@v4"
]);
const allowedRuns = new Set([
  "node scripts/deployment-candidate-evidence.mjs verify-candidate-ref",
  "test \"$(git rev-parse HEAD)\" = \"$CANDIDATE_SHA\"",
  "node scripts/deployment-candidate-evidence.mjs write-staging-evidence",
  "node scripts/deployment-candidate-evidence.mjs verify-staging-evidence",
  "npm ci", "npm run check"
]);
for (const [name, workflow] of [["Staging", staging], ["Production", production]]) {
  for (const match of workflow.matchAll(/^\s*uses:\s*(\S+)\s*$/gm)) {
    if (!allowedUses.has(match[1])) errors.push(`${name} candidate workflow uses a non-allowlisted action: ${match[1]}`);
  }
  for (const match of workflow.matchAll(/^\s*run:\s*(.+)\s*$/gm)) {
    if (!allowedRuns.has(match[1])) errors.push(`${name} candidate workflow runs a non-allowlisted command: ${match[1]}`);
  }
  if (/^\s*run:\s*[|>]\s*$/m.test(workflow)) errors.push(`${name} candidate workflow must not use unparsed multiline run blocks.`);
}

for (const snippet of ["merge-base", "origin/main", "evidence.candidateSha", "deploy-staging.yml", "run.conclusion !== \"success\"", "run.head_branch !== \"main\"", "evidence.workflowRef !== \"refs/heads/main\""]) {
  if (!evidence.includes(snippet)) errors.push(`Deployment evidence verifier is missing: ${snippet}`);
}
for (const [name, workflow, trustedJob] of [
  ["Staging", staging, "verify-staging-candidate"],
  ["Production", production, "verify-production-candidate"]
]) {
  if (!workflow.includes(`${trustedJob}:`) || !workflow.includes("ref: main") || !workflow.includes(`needs: ${trustedJob}`)) {
    errors.push(`${name} workflow must verify candidate ancestry from trusted main before its Environment job.`);
  }
}
if (!/staging_run_id:/m.test(production) || !/actions\/download-artifact@v4/.test(production)) {
  errors.push("Production candidate workflow must require and download matching staging evidence.");
}
for (const snippet of [
  "name: staging-evidence-${{ inputs.candidate_sha }}",
  "path: staging-evidence/evidence.json",
  "retention-days: 30"
]) {
  if (!staging.includes(snippet)) errors.push(`Staging evidence upload is missing: ${snippet}`);
}
for (const snippet of [
  "name: staging-evidence-${{ inputs.candidate_sha }}",
  "path: staging-evidence",
  "run-id: ${{ inputs.staging_run_id }}",
  "github-token: ${{ github.token }}"
]) {
  if (!production.includes(snippet)) errors.push(`Production evidence download is missing: ${snippet}`);
}

const deployPattern = /\b(?:wrangler\s+deploy|npm\s+run\s+deploy|supabase\s+db\s+push)\b/i;

const workflowFiles = (await readdir(".github/workflows"))
  .filter((file) => /\.ya?ml$/.test(file));
const allWorkflows = await Promise.all(workflowFiles.map((file) => read(`.github/workflows/${file}`)));
for (let index = 0; index < workflowFiles.length; index += 1) {
  const workflow = allWorkflows[index];
  if (!deployPattern.test(workflow) || !/production/i.test(workflow)) continue;
  if (!/^\s*environment:\s*production\s*$/m.test(workflow) || /^\s*push:\s*$/m.test(workflow)) {
    errors.push(`Production deploy path is not manually gated: .github/workflows/${workflowFiles[index]}`);
  }
}

const docsFiles = (await readdir("docs", { recursive: true }))
  .filter((file) => file.endsWith(".md"));
const allDocs = await Promise.all(docsFiles.map((file) => read(`docs/${file}`)));
const inspected = [...allDocs, ...allWorkflows].join("\n");
const secretValuePatterns = [
  /\bsk_(?:live|test)_[A-Za-z0-9]{12,}\b/,
  /\bwhsec_[A-Za-z0-9]{12,}\b/,
  /\bgh[opusr]_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+/i,
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /\b(?:postgres|postgresql):\/\/[^\s]+/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/
];
for (const pattern of secretValuePatterns) {
  if (pattern.test(inspected)) errors.push(`Possible secret value found by pattern: ${pattern}`);
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Environment separation harness OK: candidate SHA, staging evidence, command allowlists, and production Environment are statically verified; required reviewers remain an external setting.");
