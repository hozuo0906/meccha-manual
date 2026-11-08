import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import worker from "../apps/worker/src/index.ts";
import { CLOUD_MANUAL_JS } from "../apps/worker/src/cloud-manual-assets.ts";
import { APP_ASSET_VERSION } from "../apps/worker/src/app-assets.ts";
import { MANUAL_SAMPLE_DETAIL, MANUAL_SAMPLE_IMAGE_PATHS } from "../apps/worker/src/manual-sample-assets.ts";

const origin = "https://meccha-manual-staging.meccha-iiyatsu.com";
function environment() {
  const calls = [];
  const deny = (name) => () => { calls.push(name); throw new Error("sample must not access business storage"); };
  return { calls, env: {
    APP_ENV: "staging", APP_BASE_URL: origin,
    GOOGLE_OIDC_CLIENT_ID: "sample-route-test", GOOGLE_OIDC_CLIENT_SECRET: "synthetic-secret",
    DB: { prepare: deny("D1"), batch: deny("D1 batch") },
    MANUAL_ASSETS: { get: deny("R2 read"), put: deny("R2 write") },
    ONBOARDING_RATE_LIMITER: { limit: deny("limiter") },
    ASSETS: { async fetch(request) {
      const path = new URL(request.url).pathname;
      assert.ok(Object.values(MANUAL_SAMPLE_IMAGE_PATHS).includes(path));
      return new Response(await readFile(new URL(`../apps/worker/brand-assets${path}`, import.meta.url)), { headers: { "content-type": "image/png" } });
    } }
  } };
}

test("sample page, assets and all fixture images are public static resources without identity or storage access", async () => {
  const { env, calls } = environment();
  const page = await worker.fetch(new Request(origin + "/manuals/sample"), env, {});
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.match(page.headers.get("content-security-policy"), /script-src 'self'/);
  const html = await page.text();
  assert.match(html, /サンプルの手順書（閲覧のみ）/);
  assert.match(html, /data-workspace-id="" data-editor-mode="sample"/);
  assert.doesNotMatch(html, /editor-tools\.js/);
  for (const name of ["js", "css"]) {
    const asset = await worker.fetch(new Request(`${origin}/assets/manual-sample.${name}?v=${APP_ASSET_VERSION}`), env, {});
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("cache-control"), /immutable/);
    assert.ok((await asset.text()).length > 0);
  }
  assert.equal(MANUAL_SAMPLE_DETAIL.steps.length, 6);
  assert.equal(Object.keys(MANUAL_SAMPLE_IMAGE_PATHS).length, 3);
  for (const path of new Set(MANUAL_SAMPLE_DETAIL.steps.map((step) => step.assetUrl))) {
    assert.ok(Object.hasOwn(MANUAL_SAMPLE_IMAGE_PATHS, path));
    const image = await worker.fetch(new Request(origin + path), env, {});
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/png");
    const bytes = Buffer.from(await image.arrayBuffer());
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(bytes.readUInt32BE(16), 800);
    assert.equal(bytes.readUInt32BE(20), 480);
  }
  const missing = await worker.fetch(new Request(origin + "/manuals/sample/images/unknown.png"), env, {});
  assert.equal(missing.status, 404);
  const noBinding = await worker.fetch(new Request(origin + Object.keys(MANUAL_SAMPLE_IMAGE_PATHS)[0]), { ...env, ASSETS: undefined }, {});
  assert.equal(noBinding.status, 404);
  assert.deepEqual(calls, []);
});

test("sample does not open protected pages or APIs and accepts no writes on its static routes", async () => {
  const { env, calls } = environment();
  const manual = "/api/workspaces/00000000-0000-4000-8000-000000000001/manuals/00000000-0000-4000-8000-000000000002";
  for (const path of ["/manuals", "/api/workspaces", manual]) {
    const response = await worker.fetch(new Request(origin + path, { headers: { accept: "application/json" } }), env, {});
    assert.equal(response.status, 401, path);
    assert.equal((await response.json()).code, "SESSION_REQUIRED", path);
  }
  const html = await worker.fetch(new Request(origin + "/manuals", { headers: { accept: "text/html" } }), env, {});
  assert.equal(html.status, 302);
  assert.equal(html.headers.get("location"), "/?return=%2Fmanuals");
  for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
    for (const path of ["/manuals/sample", ...Object.keys(MANUAL_SAMPLE_IMAGE_PATHS)]) {
      const response = await worker.fetch(new Request(origin + path, { method, headers: { origin } }), env, {});
      assert.equal(response.status, 404, `${method} ${path}`);
    }
  }
  assert.deepEqual(calls, []);
});

test("business request boundary rejects every method before fetch even when called directly in sample mode", async () => {
  const definitions = ["function requireCloudWrite", "function workspacePath", "async function json"]
    .map((name) => CLOUD_MANUAL_JS.split("\n").find((line) => line.trimStart().startsWith(name))).join("\n");
  let requests = 0;
  const create = (canWrite) => runInNewContext(definitions + "; ({ json, workspacePath })", {
    mode: Object.freeze({ canWrite }), workspaceId: "synthetic-workspace",
    fetch: async () => { requests++; return { ok: true, json: async () => ({ success: true }) }; }
  });
  const sample = create(false);
  assert.throws(() => sample.workspacePath(), /サンプル/);
  for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"]) {
    await assert.rejects(sample.json("/api/workspaces/synthetic-workspace/manuals", { method }), /サンプル/);
  }
  assert.equal(requests, 0);
  const cloud = create(true);
  assert.equal(cloud.workspacePath(), "/api/workspaces/synthetic-workspace");
  await cloud.json(cloud.workspacePath());
  assert.equal(requests, 1);
});
