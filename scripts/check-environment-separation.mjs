import { readdir, readFile } from "node:fs/promises";

const paths = {
  docs: "docs/08-operations/environments-and-delivery.md",
  staging: ".github/workflows/deploy-staging.yml",
  production: ".github/workflows/deploy-production.yml"
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

for (const term of [
  "GitHub Environment",
  "Cloudflare Worker environment",
  "Supabase project",
  "R2 capture",
  "Stripe",
  "Discord通知",
  "GitHub Actions",
  "production候補",
  "required reviewers",
  "tattoo-studio-crm.workers.dev",
  "`BILLING_FEATURE_ENABLED=false`",
  "RLS negative test"
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
  if (!/^\s*candidate_sha:\s*$/m.test(workflow) || !/CANDIDATE_SHA.*inputs\.candidate_sha/s.test(workflow) || !/WORKFLOW_SHA.*github\.sha/s.test(workflow)) {
    errors.push(`${name} workflow must bind the requested immutable SHA to the workflow SHA.`);
  }
}

const deployPattern = /\b(?:wrangler\s+deploy|npm\s+run\s+deploy|supabase\s+db\s+push)\b/i;
if (deployPattern.test(staging) || deployPattern.test(production)) {
  errors.push("Candidate workflows must not enable external deploy or migration steps yet.");
}

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

console.log("Environment separation harness OK: production uses explicit dispatch, main-only SHA binding, and the production Environment reference; required reviewers remain an external setting.");
