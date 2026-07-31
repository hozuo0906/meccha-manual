import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "README.md",
  "AGENTS.md",
  "docs/README.md",
  "docs/00-foundation/project-charter.md",
  "docs/00-foundation/coding-guidelines.md",
  "docs/01-product/product-requirements.md",
  "docs/01-product/non-functional-requirements.md",
  "docs/03-architecture/system-overview.md",
  "docs/04-data/table-definitions.md",
  "docs/05-api/api-contracts.md",
  "docs/07-quality/test-strategy.md",
  "docs/09-delivery/issue-map.md",
  "docs/09-delivery/open-questions.md"
];

const forbiddenMarkers = ["TODO", "TBD", "FIXME"];

async function listMarkdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

async function main() {
  const errors = [];

  for (const relativePath of requiredFiles) {
    try {
      await readFile(path.join(root, relativePath), "utf8");
    } catch {
      errors.push(`Missing required file: ${relativePath}`);
    }
  }

  const markdownFiles = await listMarkdownFiles(root);
  for (const file of markdownFiles) {
    const content = await readFile(file, "utf8");
    const relativePath = path.relative(root, file).replaceAll("\\", "/");

    if (content.trim().length === 0) {
      errors.push(`Empty markdown file: ${relativePath}`);
    }

    for (const marker of forbiddenMarkers) {
      if (content.includes(marker)) {
        errors.push(`Forbidden marker ${marker} found in ${relativePath}`);
      }
    }

    if (!content.match(/^# /m)) {
      errors.push(`Missing H1 heading: ${relativePath}`);
    }
  }

  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exit(1);
  }

  console.log(`Docs OK: ${markdownFiles.length} markdown files checked.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
