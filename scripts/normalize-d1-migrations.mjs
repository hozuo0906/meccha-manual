import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const migrationPaths = [
  "migrations/0001_d1_identity_workspace.sql",
  "migrations/0002_d1_personal_workspace.sql",
  "migrations/0003_d1_onboarding_bootstrap.sql"
];
const root = process.cwd();

function gitBuffer(...args) {
  return execFileSync("git", args, { cwd: root, encoding: null, stdio: ["ignore", "pipe", "pipe"] });
}

function gitText(...args) {
  return gitBuffer(...args).toString("utf8");
}

function normalizeLf(bytes, source) {
  const normalized = [];
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 0x0d) {
      if (bytes[index + 1] !== 0x0a) throw new Error(`bare CR in ${source}`);
      index += 1;
    }
    normalized.push(bytes[index]);
  }
  return Buffer.from(normalized);
}

async function main() {
  const dirty = gitText("status", "--porcelain=v1", "--", ...migrationPaths).trim();
  if (dirty) {
    console.error("D1 migration files have uncommitted changes; preserve or commit them, then retry");
    process.exitCode = 2;
    return;
  }

  const plans = [];
  for (const migrationPath of migrationPaths) {
    const blob = gitBuffer("cat-file", "blob", `HEAD:${migrationPath}`);
    const worktreePath = path.join(root, migrationPath);
    const current = await readFile(worktreePath);
    const expected = normalizeLf(blob, `Git blob ${migrationPath}`);
    const actual = normalizeLf(current, migrationPath);
    if (!actual.equals(expected)) throw new Error(`working tree content differs from Git blob: ${migrationPath}`);
    plans.push({ migrationPath, worktreePath, expected });
  }

  for (const plan of plans) await writeFile(plan.worktreePath, plan.expected);

  for (const plan of plans) {
    const written = await readFile(plan.worktreePath);
    if (!written.equals(plan.expected) || written.includes(0x0d)) {
      throw new Error(`LF normalization verification failed: ${plan.migrationPath}`);
    }
  }
  console.log(`Normalized ${plans.length} D1 migrations to LF without semantic changes.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
