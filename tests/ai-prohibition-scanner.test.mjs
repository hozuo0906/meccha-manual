import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const scannerPath = path.join(repositoryRoot, "scripts/check-harness-docs.mjs");
const fixturesRoot = path.join(repositoryRoot, "tests/fixtures/ai-prohibition");

function runFixture(name) {
  return spawnSync(process.execPath, [scannerPath, "--ai-scan-root", path.join(fixturesRoot, name)], {
    cwd: repositoryRoot,
    encoding: "utf8"
  });
}

test("AI SDK dependency declarations fail", () => {
  const result = runFixture("dependency-declaration");
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(`${result.stdout}${result.stderr}`, /dependency-manifests\/dependency-declarations/);
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

test("ordinary product code passes", () => {
  const result = runFixture("allowed-product");
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

test("development-only automation is explicitly outside the scan surface", () => {
  const result = runFixture("development-only");
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});
