import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const migrationsDir = path.join(root, "supabase", "migrations");
const safetyDocPath = path.join(root, "docs", "08-operations", "db-migration-safety-harness.md");

const forbiddenPatterns = [
  { label: "DROP DATABASE", pattern: /\bdrop\s+database\b/i },
  { label: "DROP SCHEMA", pattern: /\bdrop\s+schema\b/i },
  { label: "TRUNCATE", pattern: /\btruncate(?:\s+table)?\b/i },
  { label: "RLS disable", pattern: /\bdisable\s+row\s+level\s+security\b/i },
  { label: "GRANT ALL", pattern: /\bgrant\s+all\b/i },
  { label: "database connection URL", pattern: /\bpostgres(?:ql)?:\/\//i }
];

const requiredDocTerms = [
  "DBへ接続せず",
  "Secretを読み取らず",
  "migrationを実行しません",
  "RLS negative test",
  "GitHub Environment `production`",
  "ユーザーの明示承認"
];

const entries = await readdir(migrationsDir, { withFileTypes: true });
const migrationFiles = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
  .map((entry) => entry.name)
  .sort();

const errors = [];
const timestamps = new Map();

for (const file of migrationFiles) {
  const nameMatch = file.match(/^(\d{12})_[a-z0-9_]+\.sql$/);
  if (!nameMatch) {
    errors.push(`Invalid migration filename: ${file}`);
    continue;
  }

  const timestamp = nameMatch[1];
  if (timestamps.has(timestamp)) {
    errors.push(`Duplicate migration timestamp ${timestamp}: ${timestamps.get(timestamp)}, ${file}`);
  } else {
    timestamps.set(timestamp, file);
  }

  const content = await readFile(path.join(migrationsDir, file), "utf8");
  for (const { label, pattern } of forbiddenPatterns) {
    if (pattern.test(content)) {
      errors.push(`Forbidden migration operation ${label} found in ${file}`);
    }
  }
}

const safetyDoc = await readFile(safetyDocPath, "utf8");
for (const term of requiredDocTerms) {
  if (!safetyDoc.includes(term)) {
    errors.push(`Missing migration safety term: ${term}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Migration safety OK: ${migrationFiles.length} SQL files statically checked; no database connection used.`);
