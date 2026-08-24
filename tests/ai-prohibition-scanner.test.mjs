import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const scannerPath = path.join(repositoryRoot, "scripts/check-harness-docs.mjs");
const fixturesRoot = path.join(repositoryRoot, "tests/fixtures/ai-prohibition");
const parserCorpusRoot = path.join(fixturesRoot, "parser-adoption");

function runFixture(name) {
  return runScanRoot(path.join(fixturesRoot, name));
}

function runScanRoot(root) {
  return spawnSync(process.execPath, [scannerPath, "--ai-scan-root", root], {
    cwd: repositoryRoot,
    encoding: "utf8"
  });
}

test("AI SDK dependency declarations fail", () => {
  const result = runFixture("dependency-declaration");
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(`${result.stdout}${result.stderr}`, /dependency-manifests\/dependency-declarations/);
});

test("nested product dependency declarations fail with rule and path only", () => {
  const result = runFixture("nested-ai-dependency");
  const output = `${result.stdout}${result.stderr}`;
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(output, /dependency-manifests\/dependency-declarations/);
  assert.match(output, /apps\/manual-editor\/package\.json/);
  assert.doesNotMatch(output, /openai|@ai-sdk|anthropic|\"ai\"/i);
});

test("each dependency declaration field is independently rejected", async () => {
  const fields = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "ai-prohibition-dependency-fields-"));
  try {
    for (const field of fields) {
      const manifestDirectory = path.join(temporaryRoot, "apps", field);
      await mkdir(manifestDirectory, { recursive: true });
      await writeFile(
        path.join(manifestDirectory, "package.json"),
        JSON.stringify({ [field]: { openai: "1.0.0" } })
      );
      const result = runScanRoot(temporaryRoot);
      const output = `${result.stdout}${result.stderr}`;
      assert.notEqual(result.status, 0, `${field}: ${output}`);
      assert.match(output, /dependency-manifests\/dependency-declarations/);
      assert.match(output, new RegExp(`apps/${field}/package\\.json`));
      assert.doesNotMatch(output, /openai/i);
      await rm(manifestDirectory, { recursive: true, force: true });
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("ordinary nested dependency manifest passes", () => {
  const result = runFixture("nested-ordinary-manifest");
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

test("nested generated and development-only manifests remain excluded", () => {
  const result = runFixture("nested-exclusions");
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

test("nested product scripts remain inside the scan surface", () => {
  const result = runFixture("nested-product-scripts");
  const output = `${result.stdout}${result.stderr}`;
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(output, /product-source-runtime-config\/provider-bindings/);
  assert.match(output, /apps\/manual-editor\/scripts\/provider-config\.ts/);
  assert.doesNotMatch(output, /AI_ENDPOINT/);
});

test("npm aliases to unscoped and scoped AI packages fail without logging specs", () => {
  const result = runFixture("alias-ai-dependency");
  const output = `${result.stdout}${result.stderr}`;
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(output, /dependency-manifests\/dependency-declarations/);
  assert.match(output, /package\.json/);
  assert.doesNotMatch(output, /npm:openai|@openai|4\.0\.0/i);
});

test("npm aliases in lockfile metadata fail without logging specs", () => {
  const result = runFixture("alias-ai-lockfile");
  const output = `${result.stdout}${result.stderr}`;
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(output, /dependency-manifests\/dependency-declarations/);
  assert.match(output, /package-lock\.json/);
  assert.doesNotMatch(output, /npm:openai|4\.0\.0/i);
});

test("non-AI npm aliases pass even when the dependency key is descriptive", () => {
  const result = runFixture("alias-ordinary-dependency");
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

test("static, dynamic, and side-effect provider imports fail", () => {
  const result = runFixture("imports");
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(`${result.stdout}${result.stderr}`, /product-source-runtime-config\/imports/);
});

test("provider re-export imports fail", () => {
  const result = runFixture("imports");
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(`${result.stdout}${result.stderr}`, /product-source-runtime-config\/imports/);
});

test("known provider endpoint and binding fail without logging values", () => {
  const result = runFixture("provider-endpoint-binding");
  const output = `${result.stdout}${result.stderr}`;
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(output, /product-source-runtime-config\/provider-endpoints/);
  assert.match(output, /product-source-runtime-config\/provider-bindings/);
  assert.doesNotMatch(output, /api\.openai\.com|OPENAI_API_KEY/);
});

test("legacy assistive-generation marker fails without logging its value", () => {
  const result = runFixture("legacy-assistive-marker");
  const output = `${result.stdout}${result.stderr}`;
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(output, /product-source-runtime-config\/provider-bindings/);
  assert.match(output, /feature-flag\.ts/);
  assert.doesNotMatch(output, /ai\.assistiveGeneration\.enabled/);
});

test("legacy generic endpoint marker fails without logging its value", () => {
  const result = runFixture("legacy-endpoint-marker");
  const output = `${result.stdout}${result.stderr}`;
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(output, /product-source-runtime-config\/provider-bindings/);
  assert.match(output, /provider-config\.ts/);
  assert.doesNotMatch(output, /AI_ENDPOINT/);
});

test("underscore-delimited legacy endpoint marker fails without logging its value", () => {
  const result = runFixture("legacy-endpoint-underscore-marker");
  const output = `${result.stdout}${result.stderr}`;
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(output, /product-source-runtime-config\/provider-bindings/);
  assert.match(output, /provider-config\.ts/);
  assert.doesNotMatch(output, /PUBLIC_AI_ENDPOINT_URL/);
});

test("AI-specific migration objects fail", () => {
  const result = runFixture("product-migration");
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(`${result.stdout}${result.stderr}`, /product-db-migrations\/ai-schema-objects/);
});

test("arbitrary AI migration object names fail", () => {
  const result = runFixture("product-migration");
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(`${result.stdout}${result.stderr}`, /product-db-migrations\/ai-schema-objects/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /ai_models|ai_credentials/);
});

test("AI function migrations fail across create modifiers and whitespace", () => {
  const result = runFixture("product-function-migration");
  const output = `${result.stdout}${result.stderr}`;
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(output, /product-db-migrations\/ai-schema-objects/);
  assert.doesNotMatch(output, /ai_summarize|ai_generate/);
});

test("qualified AI function migrations reject whitespace around schema dots", () => {
  const result = runFixture("product-qualified-function-migration");
  const output = `${result.stdout}${result.stderr}`;
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(output, /product-db-migrations\/ai-schema-objects/);
  assert.doesNotMatch(output, /ai_vectorize/);
});

test("quoted qualified AI function migrations are rejected", () => {
  const result = runFixture("product-quoted-qualified-function-migration");
  const output = `${result.stdout}${result.stderr}`;
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(output, /product-db-migrations\/ai-schema-objects/);
  assert.doesNotMatch(output, /ai_vectorize/);
});

test("parser adoption corpus is enforced by the production scanner", async () => {
  const expectedStatus = new Map([
    ["001_plain.sql", false],
    ["002_or_replace.sql", false],
    ["003_qualified_spaced.sql", false],
    ["004_quoted_schema.sql", false],
    ["005_quoted_hyphen.sql", false],
    ["006_quoted_space.sql", false],
    ["007_doubled_quote.sql", false],
    ["008_line_comment.sql", false],
    ["009_block_comment.sql", false],
    ["010_nested_comment.sql", false],
    ["011_unterminated_comment.sql", false],
    ["012_malformed_header.sql", false],
    ["013_unknown_header.sql", false],
    ["014_ordinary_function.sql", true]
  ]);
  const fixtureFiles = (await readdir(parserCorpusRoot)).filter((file) => file.endsWith(".sql")).sort();
  assert.deepEqual(fixtureFiles, [...expectedStatus.keys()]);
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "ai-prohibition-parser-corpus-"));
  try {
    const migrationRoot = path.join(temporaryRoot, "supabase/migrations");
    await mkdir(migrationRoot, { recursive: true });
    for (const file of fixtureFiles) {
      await writeFile(path.join(migrationRoot, file), await readFile(path.join(parserCorpusRoot, file)));
    }
    const result = spawnSync(process.execPath, [scannerPath, "--ai-scan-root", temporaryRoot], {
      cwd: repositoryRoot,
      encoding: "utf8"
    });
    const output = `${result.stdout}${result.stderr}`;
    assert.notEqual(result.status, 0, "AI parser corpus must be rejected");
    assert.match(output, /product-db-migrations\/ai-schema-objects/);
    for (const file of fixtureFiles.filter((name) => !expectedStatus.get(name))) {
      assert.match(output, new RegExp(`supabase/migrations/${file.replace(".", "\\.")}`), `${file} must be rejected`);
    }
    assert.doesNotMatch(output, /ai_summarize|ai_generate|ai_vectorize|tenant-prod|tenant prod|tenant""prod/);

    const ordinaryRoot = path.join(temporaryRoot, "ordinary");
    const ordinaryMigrations = path.join(ordinaryRoot, "supabase/migrations");
    await mkdir(ordinaryMigrations, { recursive: true });
    await writeFile(path.join(ordinaryMigrations, "014_ordinary_function.sql"), await readFile(path.join(parserCorpusRoot, "014_ordinary_function.sql")));
    const ordinaryResult = spawnSync(process.execPath, [scannerPath, "--ai-scan-root", ordinaryRoot], {
      cwd: repositoryRoot,
      encoding: "utf8"
    });
    assert.equal(ordinaryResult.status, 0, `${ordinaryResult.stdout}${ordinaryResult.stderr}`);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("ordinary product code passes", () => {
  const result = runFixture("allowed-product");
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

test("development-only automation is explicitly outside the scan surface", () => {
  const result = runFixture("development-only");
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});
