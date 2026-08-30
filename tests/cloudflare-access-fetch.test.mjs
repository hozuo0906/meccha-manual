import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  createCloudflareAccessHeaders,
  fetchWithCloudflareAccess
} from "../scripts/cloudflare-access-fetch.mjs";

const clientIdName = ["CF", "ACCESS", "CLIENT", "ID"].join("_");
const clientSecretName = ["CF", "ACCESS", "CLIENT", "SECRET"].join("_");
const clientIdFixture = ["client", "identifier", "fixture"].join("-");
const clientSecretFixture = ["client", "credential", "fixture"].join("-");
const previewOrigin = "https://immutable-preview.example.invalid";

function accessEnvironment(overrides = {}) {
  return {
    [clientIdName]: clientIdFixture,
    [clientSecretName]: clientSecretFixture,
    ...overrides
  };
}

test("Access service token headersを既存headerへ追加してredirectを拒否する", async () => {
  let captured;
  const expectedResponse = { ok: true };
  const response = await fetchWithCloudflareAccess(
    `${previewOrigin}/health/config`,
    {
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        origin: previewOrigin,
        cookie: "session=fixture",
        "cf-access-client-id": "caller-supplied-value"
      }
    },
    {
      expectedOrigin: previewOrigin,
      environment: accessEnvironment(),
      fetchImpl: async (input, init) => {
        captured = { input, init };
        return expectedResponse;
      }
    }
  );

  assert.equal(response, expectedResponse);
  assert.equal(captured.input.origin, previewOrigin);
  assert.equal(captured.init.headers.get("accept"), "application/json");
  assert.equal(captured.init.headers.get("content-type"), "application/json");
  assert.equal(captured.init.headers.get("origin"), previewOrigin);
  assert.equal(captured.init.headers.get("cookie"), "session=fixture");
  assert.equal(captured.init.headers.get("cf-access-client-id"), clientIdFixture);
  assert.equal(captured.init.headers.get("cf-access-client-secret"), clientSecretFixture);
  assert.equal(captured.init.redirect, "error");
});

test("Access資格情報はpair必須で、片方だけなら値を表示せず拒否する", () => {
  assert.throws(
    () => createCloudflareAccessHeaders({}, { [clientIdName]: clientIdFixture }),
    (error) => {
      assert.match(error.message, /configuration is incomplete/);
      assert.doesNotMatch(error.message, new RegExp(clientIdFixture));
      return true;
    }
  );
});

test("Access資格情報なしではcaller由来のAccess headerも送らない", () => {
  const headers = createCloudflareAccessHeaders({
    accept: "application/json",
    "cf-access-client-id": "caller-supplied-value",
    "cf-access-client-secret": "caller-supplied-value"
  }, {});
  assert.equal(headers.get("accept"), "application/json");
  assert.equal(headers.has("cf-access-client-id"), false);
  assert.equal(headers.has("cf-access-client-secret"), false);
});

test("Access資格情報を別originまたはHTTPへ送らない", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true };
  };

  await assert.rejects(
    fetchWithCloudflareAccess(
      "https://different-origin.example.invalid/health/config",
      {},
      { expectedOrigin: previewOrigin, environment: accessEnvironment(), fetchImpl }
    ),
    /cannot be sent outside/
  );
  await assert.rejects(
    fetchWithCloudflareAccess(
      "http://immutable-preview.example.invalid/health/config",
      {},
      {
        expectedOrigin: "http://immutable-preview.example.invalid",
        environment: accessEnvironment(),
        fetchImpl
      }
    ),
    /require HTTPS/
  );
  assert.equal(calls, 0);
});

test("RLS runnerとworkflowがAccess境界・非公開ログ契約へ固定されている", async () => {
  const [runner, workflow, wranglerText, sensitiveValueScanner] = await Promise.all([
    readFile(new URL("../scripts/rls-negative-test.mjs", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/phase1-rls-live.yml", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
    readFile(new URL("../scripts/check-sensitive-values.mjs", import.meta.url), "utf8")
  ]);
  const wrangler = JSON.parse(wranglerText);

  assert.equal(wrangler.preview_urls, true);
  assert.match(runner, /fetchWithCloudflareAccess/);
  assert.equal([...runner.matchAll(/\bfetch\s*\(\s*`\$\{appOrigin\}/gs)].length, 0);
  assert.equal([...runner.matchAll(/\bappFetch\s*\(/g)].length, 17);
  assert.equal([...runner.matchAll(/\bfetch\s*\(\s*`\$\{supabase\.url\}/gs)].length, 9);
  assert.match(runner, /hostname === "localhost"/);
  assert.doesNotMatch(runner, /appOrigin\.includes\("localhost"\)/);
  assert.doesNotMatch(runner, /status: "ok",\s*appOrigin/);
  const resultLog = runner.slice(runner.lastIndexOf("console.log(JSON.stringify({"));
  assert.doesNotMatch(resultLog, /\bslug\b/);
  assert.doesNotMatch(runner, /JSON\.stringify\(payload\)/);
  assert.doesNotMatch(runner, /actor\.email/);

  assert.ok(workflow.includes(`${clientIdName}: ` + "${{ secrets." + clientIdName + " }}"));
  assert.ok(workflow.includes(`${clientSecretName}: ` + "${{ secrets." + clientSecretName + " }}"));
  assert.match(workflow, /fetchWithCloudflareAccess/);
  assert.match(workflow, /accessDeniedStatuses\.has\(unauthenticatedResponse\.status\)/);
  assert.match(workflow, />"\$WRANGLER_UPLOAD_LOG_PATH" 2>&1/);
  assert.match(workflow, /npx --no-install wrangler versions upload/);
  assert.doesNotMatch(workflow, /steps\.worker_preview\.outputs\.preview_url/);
  assert.doesNotMatch(workflow, /GITHUB_OUTPUT/);
  assert.doesNotMatch(workflow, /::add-mask::/);

  assert.match(sensitiveValueScanner, /"CF_ACCESS_CLIENT_ID"/);
  assert.match(sensitiveValueScanner, /"CF_ACCESS_CLIENT_SECRET"/);
});
