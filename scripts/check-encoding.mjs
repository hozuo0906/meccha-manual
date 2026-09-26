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

const d1MigrationFiles = [
  "migrations/0001_d1_identity_workspace.sql",
  "migrations/0002_d1_personal_workspace.sql",
  "migrations/0003_d1_onboarding_bootstrap.sql",
  "migrations/0004_d1_cloud_manual_claim.sql",
  "migrations/0005_d1_share_links.sql"
];

for (const relativePath of d1MigrationFiles) {
  const bytes = await readFile(path.join(root, relativePath));
  if (bytes.includes(0x0d)) {
    errors.push(`Cloudflare D1 migration must use LF line endings: ${relativePath}`);
  }
}

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
