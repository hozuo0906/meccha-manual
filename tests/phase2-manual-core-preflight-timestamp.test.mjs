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

async function runFixtureWithTimestamp(timestamp) {
  const fixture = JSON.parse(await readFile(TEMPLATE, "utf8"));
  fixture.evidence.events = fixture.evidence.events.map((event) => ({ ...event, timestamp }));
  const directory = await mkdtemp(path.join(os.tmpdir(), "phase2-timestamp-"));
  const file = path.join(directory, "timestamp.json");
  await writeFile(file, JSON.stringify(fixture), "utf8");
  try {
    execFileSync(process.execPath, [CHECKER, `--fixture=${file}`], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "pipe"
    });
    return true;
  } catch {
    return false;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("accepts leap-day and UTC day-boundary timestamps", async () => {
  for (const timestamp of [
    "2024-02-29T23:59:59.999Z",
    "2024-04-30T00:00:00.000Z",
    "2024-12-31T23:59:59.000Z"
  ]) {
    assert.equal(await runFixtureWithTimestamp(timestamp), true, timestamp);
  }
});

test("rejects impossible month, day, and time values", async () => {
  for (const timestamp of [
    "2026-00-01T00:00:00.000Z",
    "2026-13-01T00:00:00.000Z",
    "2026-02-29T00:00:00.000Z",
    "2026-04-31T00:00:00.000Z",
    "2026-01-01T24:00:00.000Z",
    "2026-01-01T00:60:00.000Z",
    "2026-01-01T00:00:60.000Z"
  ]) {
    assert.equal(await runFixtureWithTimestamp(timestamp), false, timestamp);
  }
});
