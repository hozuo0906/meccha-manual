import assert from "node:assert/strict";
import { unlink } from "node:fs/promises";
import test from "node:test";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import {
  CLOUDFLARE_API_ORIGIN,
  buildReport,
  fetchCloudflareJson,
  validateResourceShape,
  validateAuditConfig,
} from "../scripts/cloudflare-config-audit.mjs";

const execFile = promisify(execFileCallback);

const accountId = "0123456789abcdef0123456789abcdef";
const token = "token-must-never-appear";
const sensitiveId = "0123456789abcdef0123456789abcdef";

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  };
}

test("audit config accepts only a narrow account and worker shape", () => {
  assert.equal(validateAuditConfig({ accountId, workerName: "meccha-manual", token }), true);
  assert.equal(validateAuditConfig({ accountId: "account/redirect", workerName: "meccha-manual", token }), false);
  assert.equal(validateAuditConfig({ accountId, workerName: "meccha manual", token }), false);
  assert.equal(validateAuditConfig({ accountId, workerName: "meccha-manual", token: "" }), false);
});

test("Cloudflare API requests are GET-only, fixed-host, bounded and classify forbidden responses", async () => {
  const calls = [];
  const result = await fetchCloudflareJson("/accounts/0123456789abcdef0123456789abcdef/d1/database", {
    token,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return response(JSON.stringify({ success: true, result: [], result_info: { total_count: 0 } }));
    },
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.startsWith(`${CLOUDFLARE_API_ORIGIN}/`), true);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${token}`);

  const arbitrary = await fetchCloudflareJson("/accounts/0123456789abcdef0123456789abcdef/https://example.invalid", {
    token,
    fetchImpl: async () => {
      throw new Error("must not be called");
    },
  });
  assert.deepEqual(arbitrary, { ok: false, classification: "内部設定不正" });

  for (const [status, classification] of [[401, "認証無効"], [403, "権限不足"], [404, "対象なし"]]) {
    const denied = await fetchCloudflareJson("/accounts/0123456789abcdef0123456789abcdef/r2/buckets", {
      token,
      fetchImpl: async () => response("sensitive raw error", status),
    });
    assert.deepEqual(denied, { ok: false, classification });
  }
});

test("timeout, malformed and oversized responses are safe classifications", async () => {
  const timeout = await fetchCloudflareJson("/accounts/0123456789abcdef0123456789abcdef/access/apps", {
    token,
    timeoutMs: 1,
    fetchImpl: (_url, init) => new Promise((_, reject) => {
      init.signal.addEventListener("abort", () => {
        const error = new Error("secret token and raw URL");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    }),
  });
  assert.deepEqual(timeout, { ok: false, classification: "タイムアウト" });

  const malformed = await fetchCloudflareJson("/accounts/0123456789abcdef0123456789abcdef/access/apps", {
    token,
    fetchImpl: async () => response("email@example.com raw body"),
  });
  assert.deepEqual(malformed, { ok: false, classification: "応答不正" });

  const oversized = await fetchCloudflareJson("/accounts/0123456789abcdef0123456789abcdef/access/apps", {
    token,
    fetchImpl: async () => response("x".repeat(256 * 1024 + 1)),
  });
  assert.deepEqual(oversized, { ok: false, classification: "応答上限超過" });
});

test("report contains only fixed labels, counts and allowlisted binding name/type", () => {
  const report = buildReport({
    settings: {
      ok: true,
      result: {
        bindings: [
          { name: "DB", type: "d1", id: sensitiveId },
          { name: "MANUAL_ASSETS", type: "r2_bucket", bucket_name: "private-sensitive-bucket" },
          { name: "UNKNOWN_SECRET_BINDING", type: "secret_text", text: token },
        ],
        raw: "raw response body",
      },
    },
    secrets: { ok: true, result: [{ name: "SECRET_EMAIL@example.com" }, { name: "another-secret" }] },
    d1: { ok: true, result: [{ uuid: sensitiveId }], resultInfo: { total_count: 1 } },
    r2: { ok: true, result: [{ name: "bucket-private-id" }], resultInfo: { count: 1 } },
    access: { ok: true, result: [{ id: sensitiveId, policies: [{ email: "user@example.com" }] }], resultInfo: { total_count: 1 } },
  });
  assert.match(report.markdown, /DB \| d1/);
  assert.match(report.markdown, /MANUAL_ASSETS \| r2_bucket/);
  assert.doesNotMatch(report.markdown, /UNKNOWN_SECRET_BINDING|secret_text|private-sensitive-bucket|raw response body/);
  assert.doesNotMatch(report.markdown, new RegExp(`${sensitiveId}|${token}|email@example\\.com|user@example\\.com`));
  assert.doesNotMatch(report.markdown, /Health URL|Discord runtime|KV namespace|https?:\/\//);
});

test("resource response shapes are normalized without exposing identifiers", () => {
  const r2 = validateResourceShape("r2", {
    ok: true,
    result: { buckets: [{ name: "private-bucket", creation_date: "sensitive" }] },
    resultInfo: { count: 1 },
  });
  assert.deepEqual(r2.result, [{ name: "private-bucket", creation_date: "sensitive" }]);
  assert.deepEqual(validateResourceShape("r2", { ok: true, result: [] }), { ok: false, classification: "応答不正" });
  assert.deepEqual(validateResourceShape("settings", { ok: true, result: { bindings: [] } }).result.bindings, []);
  assert.deepEqual(validateResourceShape("access", { ok: true, result: {} }), { ok: false, classification: "応答不正" });
});

test("CLI runs on Windows file URL entrypoint and fails safely when auth is absent", async () => {
  const env = { ...process.env, CLOUDFLARE_ACCOUNT_ID: "", CLOUDFLARE_API_TOKEN: "" };
  try {
    await execFile(process.execPath, ["scripts/cloudflare-config-audit.mjs"], { env });
    assert.fail("CLI should fail when credentials are absent");
  } catch (error) {
    assert.equal(error.code, 1);
    assert.match(error.stdout, /認証設定: 不足/);
    assert.doesNotMatch(`${error.stdout}${error.stderr}`, /token-must-never-appear|response body|https?:\/\//i);
  } finally {
    await unlink("cloudflare-config-audit.md").catch(() => {});
  }
});
