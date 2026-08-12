import { readFile } from "node:fs/promises";

const errors = [];

async function read(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    errors.push(`Missing required file: ${path}`);
    return "";
  }
}

const workflow = await read(".github/workflows/business-os-codex.yml");
for (const token of [
  "workflow_dispatch:",
  "mode:",
  "target_id:",
  "BUSINESS_OS_RUNNER_TOKEN",
  "CLOUD_RUNNER_JOB_SIGNING_SECRET",
  "CF_ACCESS_CLIENT_ID",
  "CF_ACCESS_CLIENT_SECRET",
  "persist-credentials: false",
  "openai/codex-action@v1",
  "safety-strategy: unprivileged-user",
  "Create draft pull request",
  "needs.agent.outputs.allow_push == 'true'",
  "needs.agent.outputs.allow_draft_pr == 'true'",
  "npm run check",
  "diff HEAD --binary",
]) {
  if (!workflow.includes(token)) errors.push(`Business OS workflow must include ${token}`);
}
for (const forbidden of ["deploy-production", "wrangler deploy", "supabase db push"]) {
  if (workflow.includes(forbidden)) errors.push(`Business OS workflow must not include ${forbidden}`);
}

const client = await read("scripts/cloud-runner-client.mjs");
for (const token of [
  "Cloud job signature mismatch",
  "Claimed repository mismatch",
  "Unsafe job permissions",
  "Protected path changed",
  "Secret-bearing path changed",
  "Path outside writable roots",
  "Cloud job expired",
  "Unsupported cloud job operation",
  "Publishing permissions denied",
  '"diff", "HEAD", "--name-only"',
  '"diff", "HEAD", "--raw"',
  "--no-renames",
]) {
  if (!client.includes(token)) errors.push(`Trusted runner client must include ${token}`);
}

const packageJson = JSON.parse(await read("package.json"));
if (packageJson.scripts?.["business-os-runner:check"] !== "node scripts/check-business-os-runner.mjs") {
  errors.push("package.json must define business-os-runner:check.");
}
if (!packageJson.scripts?.check?.includes("business-os-runner:check")) {
  errors.push("npm run check must include business-os-runner:check.");
}

const environmentDocs = await read("docs/08-operations/environment-variables.md");
for (const name of [
  "BUSINESS_OS_URL",
  "BUSINESS_OS_RUNNER_TOKEN",
  "CLOUD_RUNNER_JOB_SIGNING_SECRET",
  "CF_ACCESS_CLIENT_ID",
  "CF_ACCESS_CLIENT_SECRET",
  "OPENAI_API_KEY",
]) {
  if (!environmentDocs.includes(`${name}`)) errors.push(`environment-variables.md must document ${name}.`);
}

await read("docs/08-operations/business-os-cloud-runner.md");
await read("docs/03-architecture/adrs/ADR-0026-business-os-cloud-runner.md");

const apiContracts = await read("docs/05-api/api-contracts.md");
for (const token of ["/api/v1/cloud-runners/probe", "/api/v1/cloud-runners/jobs/claim", "/api/v1/cloud-runners/events", "HMAC-SHA256", "canonical JSON", "`read_only`", "`code_change`", "autoSequence"]) {
  if (!apiContracts.includes(token)) errors.push(`api-contracts.md must document ${token}.`);
}

const nonFunctional = await read("docs/01-product/non-functional-requirements.md");
if (!nonFunctional.includes("NFR-013")) errors.push("non-functional-requirements.md must define NFR-013.");

const traceability = await read("docs/01-product/requirements-traceability.md");
if (!traceability.includes("| NFR-013 |")) errors.push("requirements-traceability.md must trace NFR-013.");

const adrIndex = await read("docs/03-architecture/adrs/README.md");
if (!adrIndex.includes("| ADR-0026 |")) errors.push("ADR index must include ADR-0026.");

const decisionLog = await read("docs/09-delivery/decision-log.md");
if (!decisionLog.includes("| DEC-049 |")) errors.push("decision-log.md must include DEC-049.");

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Business OS cloud runner harness OK.");
