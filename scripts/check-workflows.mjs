import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const workflowDir = ".github/workflows";
const files = (await readdir(workflowDir)).filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"));
const errors = [];

for (const file of files) {
  const path = join(workflowDir, file);
  const lines = (await readFile(path, "utf8")).split(/\r?\n/);

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
