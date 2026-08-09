import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";

const scannerPath = fileURLToPath(new URL("../scripts/check-sensitive-values.mjs", import.meta.url));
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {
    recursive: true,
    force: true
  })));
});

test("引用符付きの既知secretキーへ代入されたリテラルを値を表示せず拒否する", async () => {
  const repository = await mkdtemp(path.join(tmpdir(), "meccha-secret-scan-"));
  temporaryDirectories.push(repository);
  const secretName = ["SUPABASE", "DB", "PASSWORD"].join("_");
  const literalValue = "literalvalue123";
  const secretFile = path.join(repository, "settings.json");

  assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: repository }).status, 0);
  await writeFile(secretFile, JSON.stringify({ [secretName]: literalValue }, null, 2));
  assert.equal(spawnSync("git", ["add", "settings.json"], { cwd: repository }).status, 0);

  const result = spawnSync(process.execPath, [scannerPath], {
    cwd: repository,
    encoding: "utf8",
    env: {
      ...process.env,
      SECRET_SCAN_BASE_SHA: ""
    }
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /known secret name has a literal-looking assigned value/);
  assert.doesNotMatch(result.stderr, new RegExp(literalValue));
});

test("YAML block scalarの既知secret値を値を表示せず拒否する", async () => {
  const repository = await mkdtemp(path.join(tmpdir(), "meccha-secret-scan-"));
  temporaryDirectories.push(repository);
  const secretName = ["SUPABASE", "DB", "PASSWORD"].join("_");
  const literalValue = "literalvalue456";
  const secretFile = path.join(repository, "settings.yml");

  assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: repository }).status, 0);
  await writeFile(secretFile, `${secretName}: |\n  ${literalValue}\n`);
  assert.equal(spawnSync("git", ["add", "settings.yml"], { cwd: repository }).status, 0);

  const result = spawnSync(process.execPath, [scannerPath], {
    cwd: repository,
    encoding: "utf8",
    env: {
      ...process.env,
      SECRET_SCAN_BASE_SHA: ""
    }
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /known secret name has a literal-looking YAML block value/);
  assert.doesNotMatch(result.stderr, new RegExp(literalValue));
});

test("YAML sequence内のblock scalar secret値を値を表示せず拒否する", async () => {
  const repository = await mkdtemp(path.join(tmpdir(), "meccha-secret-scan-"));
  temporaryDirectories.push(repository);
  const secretName = ["SUPABASE", "DB", "PASSWORD"].join("_");
  const literalValue = "literalvalue789";
  const secretFile = path.join(repository, "settings.yml");

  assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: repository }).status, 0);
  await writeFile(secretFile, `secrets:\n  - ${secretName}: |-\n      ${literalValue}\n`);
  assert.equal(spawnSync("git", ["add", "settings.yml"], { cwd: repository }).status, 0);

  const result = spawnSync(process.execPath, [scannerPath], {
    cwd: repository,
    encoding: "utf8",
    env: {
      ...process.env,
      SECRET_SCAN_BASE_SHA: ""
    }
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /known secret name has a literal-looking YAML block value/);
  assert.doesNotMatch(result.stderr, new RegExp(literalValue));
});
