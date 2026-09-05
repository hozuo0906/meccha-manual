import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const workflowDir = ".github/workflows";
const files = (await readdir(workflowDir)).filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"));
const errors = [];
const retiredWorkflowFiles = new Set(["phase1-rls-live.yml", "phase1-rls-live.yaml"]);
const forbiddenLegacyRlsWorkflowPatterns = [
  ["legacy workflow name", /Phase 1 RLS Live Gate/],
  ["legacy RLS secrets", /\bMECCHA_RLS_/],
  ["legacy live RLS command", /\bnpm run test:rls\b/],
  ["legacy live RLS runner", /\bscripts\/rls-negative-test\.mjs\b/]
];

for (const file of files) {
  const path = join(workflowDir, file);
  const isLegacyRlsGate = retiredWorkflowFiles.has(file);
  if (isLegacyRlsGate && file !== "phase1-rls-live.yml") errors.push(`The preserved RLS live gate must use the canonical filename: ${path}`);
  const content = await readFile(path, "utf8");
  for (const [label, pattern] of forbiddenLegacyRlsWorkflowPatterns) {
    if (!isLegacyRlsGate && pattern.test(content)) errors.push(`Workflow contains retired Supabase live path (${label}): ${path}`);
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

if (!files.includes("phase1-rls-live.yml")) {
  errors.push("The accepted Phase 1 RLS live gate must remain available until the Issue #176 M5 replacement gate lands.");
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Workflow files OK: ${files.length} files checked.`);
