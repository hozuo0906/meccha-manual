import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const checkedExtensions = new Set([
  ".json",
  ".md",
  ".mjs",
  ".sql",
  ".ts",
  ".yml",
  ".yaml"
]);
const ignoredDirectories = new Set([
  ".git",
  ".wrangler",
  "node_modules"
]);
const ignoredFiles = new Set([
  "scripts/check-encoding.mjs"
]);
const mojibakePatterns = [
  /繧[ぁ-んァ-ン一-龠]?/,
  /縺[ぁ-んァ-ン一-龠]?/,
  /譛[ぁ-んァ-ン一-龠]?/,
  /蜈[ぁ-んァ-ン一-龠]?/,
  /螳[ぁ-んァ-ン一-龠]?/,
  /莠[ぁ-んァ-ン一-龠]?/,
  /鬆[ぁ-んァ-ン一-龠]?/
];

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath));
      continue;
    }

    if (entry.isFile() && checkedExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

const errors = [];
const files = await listFiles(root);

for (const file of files) {
  const content = await readFile(file, "utf8");
  const relativePath = path.relative(root, file).replaceAll("\\", "/");
  if (ignoredFiles.has(relativePath)) continue;

  for (const pattern of mojibakePatterns) {
    if (pattern.test(content)) {
      errors.push(`Possible mojibake detected in ${relativePath}: ${pattern}`);
      break;
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Encoding OK: ${files.length} files checked.`);
