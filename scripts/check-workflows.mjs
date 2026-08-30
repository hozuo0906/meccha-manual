import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const workflowDir = ".github/workflows";
const files = (await readdir(workflowDir)).filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"));
const errors = [];
const retiredWorkflowFiles = new Set(["phase1-rls-live.yml", "phase1-rls-live.yaml", "cloudflare-config-audit.yml", "cloudflare-config-audit.yaml"]);
const forbiddenLegacyRlsWorkflowPatterns = [
  ["legacy workflow name", /Phase 1 RLS Live Gate/],
  ["legacy RLS secrets", /\bMECCHA_RLS_/],
  ["legacy live RLS command", /\bnpm run test:rls\b/],
  ["legacy live RLS runner", /\bscripts\/rls-negative-test\.mjs\b/],
  ["legacy config audit workflow", /\bCloudflare Config Audit\b/],
  ["legacy config audit runner", /\bscripts\/cloudflare-config-audit\.mjs\b/]
];

for (const file of files) {
  const path = join(workflowDir, file);
  if (retiredWorkflowFiles.has(file)) errors.push(`Retired Supabase live workflow must not exist: ${path}`);
  const content = await readFile(path, "utf8");
  for (const [label, pattern] of forbiddenLegacyRlsWorkflowPatterns) {
    if (pattern.test(content)) errors.push(`Workflow contains retired Supabase live path (${label}): ${path}`);
  }
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.includes("cat <<'")) continue;

    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    const marker = line.match(/<<'([^']+)'/)?.[1];
    if (!marker) continue;

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor];
      if (candidate.trim() === marker) break;
      if (candidate.trim() && (candidate.match(/^\s*/)?.[0].length ?? 0) < indent) {
        errors.push(`${path}:${cursor + 1} heredoc content must stay indented inside the YAML run block.`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Workflow files OK: ${files.length} files checked.`);

const retiredAuditScriptPath = "scripts/cloudflare-config-audit.mjs";
const retiredAuditScript = await readFile(retiredAuditScriptPath, "utf8");
for (const [label, pattern] of [
  ["child process execution", /execFileAsync/],
  ["legacy health URL input", /MECCHA_WORKER_HEALTH_URL/],
  ["live health fetch", /fetch\(healthUrl/],
  ["live secret inventory", /wrangler.+secret.+list/s],
  ["live KV inventory", /wrangler.+kv.+namespace.+list/s]
]) {
  if (pattern.test(retiredAuditScript)) errors.push(`Retired config audit script contains ${label}: ${retiredAuditScriptPath}`);
}
if (!retiredAuditScript.includes("Cloudflare Config Audit is retired")) {
  errors.push(`Retired config audit script must fail closed: ${retiredAuditScriptPath}`);
}
