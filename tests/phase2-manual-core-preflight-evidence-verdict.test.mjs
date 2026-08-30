import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHECKER = path.join(ROOT, "scripts/check-phase2-manual-core-preflight.mjs");
const FIXTURE_DIR = path.join(ROOT, "tests/fixtures/phase2-manual-core-preflight");

test("rejects PASS evidence when represented checks are not all PASS", async () => {
  for (const collection of ["preflight-gates", "manual-core-matrix", "publication-flow"]) {
    const directory = await mkdtemp(path.join(os.tmpdir(), "phase2-evidence-verdict-"));
    const copiedFixtures = path.join(directory, "fixtures");
    await cp(FIXTURE_DIR, copiedFixtures, { recursive: true });
    const file = path.join(copiedFixtures, "valid-blocked.json");
    const fixture = JSON.parse(await readFile(file, "utf8"));
    fixture.evidence.events = fixture.evidence.events.map((event) => ({ ...event, collection, verdict: "PASS" }));
    await writeFile(file, JSON.stringify(fixture), "utf8");
    try {
      assert.throws(() => execFileSync(process.execPath, [CHECKER, `--fixtures-dir=${copiedFixtures}`], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: "pipe"
      }), collection);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

test("preserves PASS evidence for an allowed collection outside this correlation scope", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "phase2-evidence-safety-"));
  const copiedFixtures = path.join(directory, "fixtures");
  await cp(FIXTURE_DIR, copiedFixtures, { recursive: true });
  const file = path.join(copiedFixtures, "valid-blocked.json");
  const fixture = JSON.parse(await readFile(file, "utf8"));
  fixture.evidence.events = fixture.evidence.events.map((event) => ({ ...event, collection: "evidence-safety", verdict: "PASS" }));
  await writeFile(file, JSON.stringify(fixture), "utf8");
  try {
    assert.doesNotThrow(() => execFileSync(process.execPath, [CHECKER, `--fixtures-dir=${copiedFixtures}`], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "pipe"
    }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects evidence counts that do not match each represented collection", async () => {
  const expectedCounts = new Map([
    ["preflight-gates", 6],
    ["manual-core-matrix", 96],
    ["publication-flow", 8],
    ["evidence-safety", 6]
  ]);
  for (const [collection, expectedCount] of expectedCounts) {
    const directory = await mkdtemp(path.join(os.tmpdir(), "phase2-evidence-count-"));
    const copiedFixtures = path.join(directory, "fixtures");
    await cp(FIXTURE_DIR, copiedFixtures, { recursive: true });
    const file = path.join(copiedFixtures, "valid-blocked.json");
    const fixture = JSON.parse(await readFile(file, "utf8"));
    fixture.evidence.events = fixture.evidence.events.map((event) => ({
      ...event,
      collection,
      count: expectedCount + 1,
      verdict: "FAIL"
    }));
    await writeFile(file, JSON.stringify(fixture), "utf8");
    try {
      assert.throws(
        () => execFileSync(process.execPath, [CHECKER, `--fixtures-dir=${copiedFixtures}`], {
          cwd: ROOT,
          encoding: "utf8",
          stdio: "pipe"
        }),
        (error) => {
          const output = [error.message, error.stdout, error.stderr]
            .filter((value) => typeof value === "string")
            .join("\n");
          assert.match(output, /count does not match represented collection/);
          return true;
        }
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});
