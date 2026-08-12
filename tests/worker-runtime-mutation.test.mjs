import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import worker from "../apps/worker/src/index.ts";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "public-anon-key"
};
const ctx = { waitUntil() {} };

function appRequest(path, init = {}) {
  return new Request(`https://app.example${path}`, init);
}

async function assertCriticalFailureContract(candidate) {
  const crossOrigin = await candidate.fetch(appRequest("/api/auth/logout", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil.example" },
    body: "{}"
  }), env, ctx);
  assert.equal(crossOrigin.status, 403, "異origin拒否が無効化されています");
  assert.equal((await crossOrigin.json()).code, "ORIGIN_MISMATCH");

  const oversizedBody = JSON.stringify({ padding: "a".repeat(16 * 1024) });
  const tooLarge = await candidate.fetch(appRequest("/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://app.example",
      "content-length": String(new TextEncoder().encode(oversizedBody).byteLength)
    },
    body: oversizedBody
  }), env, ctx);
  assert.equal(tooLarge.status, 413, "JSON body上限が無効化されています");
  assert.equal((await tooLarge.json()).code, "JSON_BODY_TOO_LARGE");
}

async function loadMutatedWorker(name, replacements) {
  const directory = await mkdtemp(join(tmpdir(), `meccha-manual-${name}-`));
  const indexPath = join(directory, "index.ts");
  const assetsPath = join(directory, "app-assets.ts");
  let source = await readFile("apps/worker/src/index.ts", "utf8");
  for (const [before, after] of replacements) {
    assert.ok(source.includes(before), `mutation target not found: ${before}`);
    source = source.replace(before, after);
  }
  await Promise.all([
    writeFile(indexPath, source, "utf8"),
    writeFile(assetsPath, await readFile("apps/worker/src/app-assets.ts", "utf8"), "utf8")
  ]);
  const module = await import(`${pathToFileURL(indexPath).href}?mutation=${Date.now()}-${name}`);
  return { worker: module.default, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test("現行Workerは重要な失敗条件契約を満たす", async () => {
  await assertCriticalFailureContract(worker);
});

test("異origin拒否を壊す変異は契約テストで検出できる", async () => {
  const mutation = await loadMutatedWorker("origin", [[
    "if (originUrl.origin !== requestUrl.origin) {",
    "if (false) {"
  ]]);
  try {
    await assert.rejects(() => assertCriticalFailureContract(mutation.worker), /異origin拒否/);
  } finally {
    await mutation.cleanup();
  }
});

test("JSON body上限を緩める変異は契約テストで検出できる", async () => {
  const mutation = await loadMutatedWorker("body-limit", [[
    "const MAX_JSON_BODY_BYTES = 16 * 1024;",
    "const MAX_JSON_BODY_BYTES = 32 * 1024;"
  ]]);
  try {
    await assert.rejects(() => assertCriticalFailureContract(mutation.worker), /JSON body上限/);
  } finally {
    await mutation.cleanup();
  }
});
