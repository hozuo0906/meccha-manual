import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const command = process.argv[2];
const temp = process.env.RUNNER_TEMP || ".cloud-runner";
const jobPath = path.join(temp, "business-os-job.json");
const promptFile = ".business-os-codex-prompt.md";
const promptPath = path.join(process.env.GITHUB_WORKSPACE || process.cwd(), promptFile);

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

async function api(pathname, body) {
  const base = required("BUSINESS_OS_URL").replace(/\/$/, "");
  const response = await fetch(`${base}${pathname}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${required("BUSINESS_OS_RUNNER_TOKEN")}`,
      "cf-access-client-id": required("CF_ACCESS_CLIENT_ID"),
      "cf-access-client-secret": required("CF_ACCESS_CLIENT_SECRET"),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Business OS ${pathname} failed (${response.status}): ${result?.error?.code ?? "unknown"}`);
  return result;
}

async function appendOutput(values) {
  const { appendFile } = await import("node:fs/promises");
  const output = required("GITHUB_OUTPUT");
  await appendFile(output, Object.entries(values).map(([key, value]) => `${key}=${value ?? ""}\n`).join(""));
}

async function claim() {
  const result = await api("/api/v1/cloud-runners/jobs/claim", {
    targetId: required("TARGET_ID"),
    jobId: required("JOB_ID"),
    repository: required("GITHUB_REPOSITORY"),
    workflowRunId: required("GITHUB_RUN_ID"),
  });
  const job = result.job;
  const expectedSignature = createHmac("sha256", required("BUSINESS_OS_JOB_SIGNING_SECRET")).update(canonicalJson(job)).digest("hex");
  const actualSignature = Buffer.from(String(result.signature || ""));
  const expectedBuffer = Buffer.from(expectedSignature);
  if (actualSignature.length !== expectedBuffer.length || !timingSafeEqual(actualSignature, expectedBuffer)) throw new Error("Cloud job signature mismatch");
  if (job.repository.toLowerCase() !== required("GITHUB_REPOSITORY").toLowerCase()) throw new Error("Claimed repository mismatch");
  if (job.executionTargetId !== required("TARGET_ID") || job.id !== required("JOB_ID")) throw new Error("Claimed job identity mismatch");
  if (!["read_only", "code_change"].includes(job.permissions.operation)) throw new Error("Unsupported cloud job operation");
  const expiresAt = Date.parse(job.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error("Cloud job expired");
  if (job.permissions.allowProductionDeploy !== false || !job.branchName.startsWith("codex/")) throw new Error("Unsafe job permissions");
  if (job.permissions.operation === "code_change" && (job.permissions.allowPush !== true || job.permissions.allowDraftPr !== true)) {
    throw new Error("Publishing permissions denied");
  }
  await mkdir(temp, { recursive: true });
  await writeFile(jobPath, JSON.stringify(job), { mode: 0o600 });
  const criteria = job.acceptanceCriteria.map((item, index) => `${index + 1}. ${item}`).join("\n");
  const prompt = `Implement this approved Business OS job.\n\nTask:\n${job.taskBrief}\n\nAcceptance criteria:\n${criteria}\n\nSecurity boundaries:\n- Work only in ${job.repository}.\n- Use branch ${job.branchName}; never push to main.\n- Writable roots: ${job.permissions.writableRoots.join(", ") || "none"}.\n- Do not deploy production, change secrets, or broaden permissions.\n- Do not push or create a pull request; a separate trusted job handles publication.\n`;
  await writeFile(promptPath, prompt, { mode: 0o640 });
  await appendOutput({
    operation: job.permissions.operation,
    branch_name: job.branchName,
    base_branch: job.baseBranch,
    model: job.model ?? "",
    effort: job.effort,
    allow_push: String(job.permissions.allowPush === true),
    allow_draft_pr: String(job.permissions.allowDraftPr === true),
    prompt_path: promptFile,
  });
}

async function event() {
  const job = JSON.parse(await readFile(jobPath, "utf8"));
  const metadata = process.env.EVENT_METADATA ? JSON.parse(process.env.EVENT_METADATA) : {};
  await api("/api/v1/cloud-runners/events", {
    eventId: randomUUID(),
    jobId: job.id,
    codexRunId: job.codexRunId,
    executionTargetId: job.executionTargetId,
    repository: job.repository,
    workflowRunId: required("GITHUB_RUN_ID"),
    sequence: Number(required("EVENT_SEQUENCE")),
    type: required("EVENT_TYPE"),
    summary: (process.env.EVENT_SUMMARY || "").slice(0, 4_000),
    occurredAt: new Date().toISOString(),
    metadata,
  });
}

async function probe() {
  await api("/api/v1/cloud-runners/probe", {
    targetId: required("TARGET_ID"),
    repository: required("GITHUB_REPOSITORY"),
    workflowRef: required("WORKFLOW_REF"),
  });
}

async function validateDiff() {
  const job = JSON.parse(await readFile(jobPath, "utf8"));
  const roots = job.permissions.writableRoots.map((root) => root.replace(/^\.\//, "").replace(/\/$/, ""));
  const output = execFileSync("git", ["-c", "core.hooksPath=/dev/null", "diff", "HEAD", "--name-only", "-z", "--no-renames", "--no-ext-diff", "--no-textconv"], { encoding: "utf8" });
  const files = output.split("\0").filter(Boolean);
  const raw = execFileSync("git", ["-c", "core.hooksPath=/dev/null", "diff", "HEAD", "--raw", "-z", "--no-renames", "--no-ext-diff", "--no-textconv"], { encoding: "utf8" });
  if (/:(?:120000|160000) [0-7]{6}|:[0-7]{6} (?:120000|160000)/.test(raw)) throw new Error("Symlinks and submodules are not allowed in cloud runner patches");
  if (job.permissions.operation === "code_change" && files.length === 0) throw new Error("Codex produced no code changes");
  for (const file of files) {
    if (file === ".github" || file.startsWith(".github/") || file === ".git" || file.startsWith(".git/")) throw new Error(`Protected path changed: ${file}`);
    if (file.split("/").some((part) => part === ".env" || part.startsWith(".env.") || part === ".dev.vars" || /\.(?:pem|key|p12|pfx)$/i.test(part))) throw new Error(`Secret-bearing path changed: ${file}`);
    if (!roots.some((root) => file === root || file.startsWith(`${root}/`))) throw new Error(`Path outside writable roots: ${file}`);
  }
  console.log(`Validated ${files.length} changed files against approved writable roots.`);
}

await mkdir(temp, { recursive: true });
if (command === "claim") await claim();
else if (command === "event") await event();
else if (command === "probe") await probe();
else if (command === "validate-diff") await validateDiff();
else throw new Error("Expected claim, event, probe, or validate-diff");

if (command !== "claim") await chmod(jobPath, 0o600).catch(() => undefined);
