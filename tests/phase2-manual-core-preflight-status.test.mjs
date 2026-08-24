import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHECKER = path.join(ROOT, "scripts/check-phase2-manual-core-preflight.mjs");
const TEMPLATE = path.join(ROOT, "tests/fixtures/phase2-manual-core-preflight/valid-blocked.json");

test("rejects a declared alpha failure when prerequisites are blocked", async () => {
  const fixture = JSON.parse(await readFile(TEMPLATE, "utf8"));
  fixture.internalAlphaVerdict = "FAIL";
  const directory = await mkdtemp(path.join(os.tmpdir(), "phase2-status-"));
  const file = path.join(directory, "contradictory-status.json");
  await writeFile(file, JSON.stringify(fixture), "utf8");
  try {
    assert.throws(() => execFileSync(process.execPath, [CHECKER, `--fixture=${file}`], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "pipe"
    }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
