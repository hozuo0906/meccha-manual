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

test("YAML tag付きblock scalar secret値を値を表示せず拒否する", async () => {
  const repository = await mkdtemp(path.join(tmpdir(), "meccha-secret-scan-"));
  temporaryDirectories.push(repository);
  const secretName = ["SUPABASE", "DB", "PASSWORD"].join("_");
  const literalValue = "literalvalue987";
  const secretFile = path.join(repository, "settings.yml");

  assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: repository }).status, 0);
  await writeFile(secretFile, `${secretName}: &credential !!str |\n  ${literalValue}\n`);
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

test("YAML aliasを既知secretへ代入した場合は参照名が短くても拒否する", async () => {
  const repository = await mkdtemp(path.join(tmpdir(), "meccha-secret-scan-"));
  temporaryDirectories.push(repository);
  const secretName = ["SUPABASE", "DB", "PASSWORD"].join("_");
  const literalValue = "literalvalue654";
  const secretFile = path.join(repository, "settings.yml");

  assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: repository }).status, 0);
  await writeFile(secretFile, `credential: &dbpass ${literalValue}\n${secretName}: *dbpass\n`);
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
  assert.match(result.stderr, /known secret name has a literal-looking assigned value/);
  assert.doesNotMatch(result.stderr, new RegExp(literalValue));
});

test("YAML multiline quoted secretの短い先頭断片も拒否する", async () => {
  const repository = await mkdtemp(path.join(tmpdir(), "meccha-secret-scan-"));
  temporaryDirectories.push(repository);
  const secretName = ["SUPABASE", "DB", "PASSWORD"].join("_");
  const literalValue = "literalvalue321";
  const secretFile = path.join(repository, "settings.yml");

  assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: repository }).status, 0);
  await writeFile(secretFile, `${secretName}: "short\n  ${literalValue}"\n`);
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
  assert.match(result.stderr, /known secret name has a literal-looking assigned value/);
  assert.doesNotMatch(result.stderr, new RegExp(literalValue));
});

test("JSON Unicode escapeで分断された既知secretキーも拒否する", async () => {
  const repository = await mkdtemp(path.join(tmpdir(), "meccha-secret-scan-"));
  temporaryDirectories.push(repository);
  const escapedSecretName = "SUPABASE\\u005fDB_PASSWORD";
  const literalValue = "literalvalue852";
  const secretFile = path.join(repository, "settings.json");

  assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: repository }).status, 0);
  await writeFile(secretFile, `{\n  "${escapedSecretName}": "${literalValue}"\n}\n`);
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

for (const [label, escapedSeparator] of [
  ["YAML x escape", "\\x5f"],
  ["YAML U escape", "\\U0000005f"]
]) {
  test(`${label}で分断された既知secretキーも拒否する`, async () => {
    const repository = await mkdtemp(path.join(tmpdir(), "meccha-secret-scan-"));
    temporaryDirectories.push(repository);
    const escapedSecretName = `SUPABASE${escapedSeparator}DB_PASSWORD`;
    const literalValue = "literalvalue963";
    const secretFile = path.join(repository, "settings.yml");

    assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: repository }).status, 0);
    await writeFile(secretFile, `"${escapedSecretName}": ${literalValue}\n`);
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
    assert.match(result.stderr, /known secret name has a literal-looking assigned value/);
    assert.doesNotMatch(result.stderr, new RegExp(literalValue));
  });
}

test("既知secret参照の後ろに平文fallbackがある場合は拒否する", async () => {
  const repository = await mkdtemp(path.join(tmpdir(), "meccha-secret-scan-"));
  temporaryDirectories.push(repository);
  const secretName = ["SUPABASE", "DB", "PASSWORD"].join("_");
  const literalValue = "literalvalue741";
  const secretFile = path.join(repository, "settings.md");

  assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: repository }).status, 0);
  await writeFile(secretFile, `${secretName} = process.env.SAFE_VALUE || "${literalValue}"\n`);
  assert.equal(spawnSync("git", ["add", "settings.md"], { cwd: repository }).status, 0);

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

test("GitHub Secrets式の内側に平文fallbackがある場合は拒否する", async () => {
  const repository = await mkdtemp(path.join(tmpdir(), "meccha-secret-scan-"));
  temporaryDirectories.push(repository);
  const secretName = ["SUPABASE", "DB", "PASSWORD"].join("_");
  const literalValue = "literalvalue159";
  const secretFile = path.join(repository, "workflow.yml");

  assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: repository }).status, 0);
  await writeFile(secretFile, `${secretName}: \${{ secrets.DB_PASSWORD || '${literalValue}' }}\n`);
  assert.equal(spawnSync("git", ["add", "workflow.yml"], { cwd: repository }).status, 0);

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

test("単一のGitHub Secrets参照は許可する", async () => {
  const repository = await mkdtemp(path.join(tmpdir(), "meccha-secret-scan-"));
  temporaryDirectories.push(repository);
  const secretName = ["SUPABASE", "DB", "PASSWORD"].join("_");
  const secretFile = path.join(repository, "workflow.yml");

  assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: repository }).status, 0);
  await writeFile(secretFile, `${secretName}: \${{ secrets.DB_PASSWORD }}\n`);
  assert.equal(spawnSync("git", ["add", "workflow.yml"], { cwd: repository }).status, 0);

  const result = spawnSync(process.execPath, [scannerPath], {
    cwd: repository,
    encoding: "utf8",
    env: {
      ...process.env,
      SECRET_SCAN_BASE_SHA: ""
    }
  });

  assert.equal(result.status, 0, result.stderr);
});

test("空文字列secretの閉じ区切りだけは許可し、非空値とfallback連結は拒否する", async () => {
  const secretName = ["CLOUDFLARE", "API", "TOKEN"].join("_");
  const cases = [
    ["empty", `const config = { ${secretName}: \"\" };\n`, 0],
    ["literal", `const config = { ${secretName}: \"literal-value\" };\n`, 1],
    ["fallback", `const config = { ${secretName}: \"\" || \"fallback-value\" };\n`, 1],
  ];
  for (const [name, content, expectedStatus] of cases) {
    const repository = await mkdtemp(path.join(tmpdir(), `meccha-secret-scan-${name}-`));
    temporaryDirectories.push(repository);
    const secretFile = path.join(repository, "settings.js");
    assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: repository }).status, 0);
    await writeFile(secretFile, content);
    assert.equal(spawnSync("git", ["add", "settings.js"], { cwd: repository }).status, 0);
    const result = spawnSync(process.execPath, [scannerPath], {
      cwd: repository,
      encoding: "utf8",
      env: { ...process.env, SECRET_SCAN_BASE_SHA: "" },
    });
    assert.equal(result.status, expectedStatus, `${name}: ${result.stderr}`);
    if (expectedStatus === 1) assert.match(result.stderr, /known secret name has a literal-looking assigned value/);
  }
});
