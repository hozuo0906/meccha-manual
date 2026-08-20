import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { handleManualRoute } from "../apps/worker/src/manual-router.ts";
import { inspectSupabaseConfig } from "../apps/worker/src/server-config.ts";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const MANUAL_ID = "33333333-3333-4333-8333-333333333333";
const DRAFT_ID = "44444444-4444-4444-8444-444444444444";
const APP_ORIGIN = "https://app.example.test";
const SUPABASE_ORIGIN = "https://spjowmulvoyxxkfeyjkr.supabase.co";
const ENV = {
  SUPABASE_URL: SUPABASE_ORIGIN,
  SUPABASE_ANON_KEY: "public-anon-key"
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers }
  });
}

function manualRow(index = 0) {
  const suffix = index.toString(16).padStart(12, "0").slice(-12);
  return {
    id: `33333333-3333-4333-8333-${suffix}`,
    workspace_id: WORKSPACE_ID,
    folder_id: null,
    title: `手順書 ${index}`,
    status: "draft",
    current_draft_revision_id: DRAFT_ID,
    current_published_revision_id: null,
    updated_at: "2026-08-14T00:00:00.000Z"
  };
}

function request(method = "GET", body, headers = {}) {
  const init = {
    method,
    headers: {
      cookie: "__Host-mm_access=access-token; __Host-mm_refresh=refresh-token",
      ...(method === "POST" ? { origin: APP_ORIGIN, "content-type": "application/json" } : {}),
      ...headers
    },
    body
  };
  if (body instanceof ReadableStream) init.duplex = "half";
  return new Request(`${APP_ORIGIN}/api/workspaces/${WORKSPACE_ID}/manuals`, init);
}

function installFetch(sequence) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const next = sequence.shift();
    assert.ok(next, `Unexpected fetch: ${url}`);
    return typeof next === "function" ? next(url, init) : next;
  };
  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
      assert.equal(sequence.length, 0, "Expected fetch responses were not consumed");
    }
  };
}

function authOk() {
  return json({ id: USER_ID });
}

function memberOk() {
  return json(true);
}

function editorOk() {
  return json(true);
}

test("member can list manuals with validated exact count", async () => {
  const mock = installFetch([
    authOk(),
    memberOk(),
    json([manualRow(1)], 200, { "content-range": "0-0/1" })
  ]);
  try {
    const response = await handleManualRoute(request(), ENV);
    assert.equal(response?.status, 200);
    const body = await response.json();
    assert.equal(body.manuals.length, 1);
    assert.equal(body.manuals[0].title, "手順書 1");
  } finally {
    mock.restore();
  }
});

test("non-member workspace is hidden as 404 before manual query", async () => {
  const mock = installFetch([authOk(), json(false)]);
  try {
    const response = await handleManualRoute(request(), ENV);
    assert.equal(response?.status, 404);
    assert.equal((await response.json()).code, "MANUALS_NOT_FOUND");
    assert.equal(mock.calls.length, 2);
  } finally {
    mock.restore();
  }
});

test("viewer cannot create a manual", async () => {
  const mock = installFetch([authOk(), memberOk(), json(false)]);
  try {
    const response = await handleManualRoute(
      request("POST", JSON.stringify({ title: "保存手順" })),
      ENV
    );
    assert.equal(response?.status, 403);
    assert.equal((await response.json()).code, "MANUAL_CREATE_FORBIDDEN");
    assert.equal(mock.calls.length, 3);
  } finally {
    mock.restore();
  }
});

test("editor creates manual through create_manual RPC", async () => {
  const mock = installFetch([authOk(), memberOk(), editorOk(), json(MANUAL_ID)]);
  try {
    const response = await handleManualRoute(
      request("POST", JSON.stringify({ title: " 保存手順 ", description: "説明" })),
      ENV
    );
    assert.equal(response?.status, 201);
    assert.deepEqual(await response.json(), { manualId: MANUAL_ID });
    const rpcCall = mock.calls[3];
    assert.match(rpcCall.url, /\/rest\/v1\/rpc\/create_manual$/);
    assert.deepEqual(JSON.parse(String(rpcCall.init.body)), {
      target_workspace_id: WORKSPACE_ID,
      target_folder_id: null,
      manual_title: "保存手順",
      manual_description: "説明"
    });
  } finally {
    mock.restore();
  }
});

test("manual description over 10,000 code points is rejected before create RPC", async () => {
  const mock = installFetch([authOk(), memberOk(), editorOk()]);
  try {
    const response = await handleManualRoute(
      request("POST", JSON.stringify({ title: "説明上限", description: "あ".repeat(10_001) })),
      ENV
    );
    assert.equal(response?.status, 400);
    assert.equal((await response.json()).code, "MANUAL_DESCRIPTION_INVALID");
    assert.equal(mock.calls.length, 3);
  } finally {
    mock.restore();
  }
});

test("streamed JSON body over 64 KiB fails with 413 before create RPC", async () => {
  const largeJson = JSON.stringify({ title: "手順", description: "x".repeat(70 * 1024) });
  const bytes = new TextEncoder().encode(largeJson);
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.slice(0, 30000));
      controller.enqueue(bytes.slice(30000));
      controller.close();
    }
  });
  const mock = installFetch([authOk(), memberOk(), editorOk()]);
  try {
    const response = await handleManualRoute(request("POST", body), ENV);
    assert.equal(response?.status, 413);
    assert.equal((await response.json()).code, "JSON_BODY_TOO_LARGE");
    assert.equal(mock.calls.length, 3);
  } finally {
    mock.restore();
  }
});

test("manual count over limit fails as 409 even when response is truncated to 1001 rows", async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => manualRow(index + 1));
  const mock = installFetch([
    authOk(),
    memberOk(),
    json(rows, 200, { "content-range": "0-1000/1200" })
  ]);
  try {
    const response = await handleManualRoute(request(), ENV);
    assert.equal(response?.status, 409);
    assert.equal((await response.json()).code, "MANUALS_LIMIT_EXCEEDED");
  } finally {
    mock.restore();
  }
});

test("create RPC role revocation is a determinate 403", async () => {
  const mock = installFetch([
    authOk(), memberOk(), editorOk(), json({ message: "workspace editor role required" }, 400)
  ]);
  try {
    const response = await handleManualRoute(
      request("POST", JSON.stringify({ title: "保存手順" })),
      ENV
    );
    assert.equal(response?.status, 403);
    assert.equal((await response.json()).code, "MANUAL_CREATE_FORBIDDEN");
    assert.equal(mock.calls.length, 4);
  } finally {
    mock.restore();
  }
});

test("create upstream 5xx is result-unknown and does not invite immediate retry", async () => {
  const mock = installFetch([authOk(), memberOk(), editorOk(), json({ message: "upstream failed" }, 500)]);
  try {
    const response = await handleManualRoute(
      request("POST", JSON.stringify({ title: "保存手順" })),
      ENV
    );
    assert.equal(response?.status, 502);
    const body = await response.json();
    assert.equal(body.code, "MANUAL_CREATE_RESULT_UNKNOWN");
    assert.match(body.message, /重ねて作成せず/);
  } finally {
    mock.restore();
  }
});


test("Supabase bindings are normalized through the single server config module", async () => {
  assert.deepEqual(
    inspectSupabaseConfig({ SUPABASE_URL: " https://spjowmulvoyxxkfeyjkr.supabase.co/// ", SUPABASE_ANON_KEY: " key " }),
    {
      configured: true,
      hasUrl: true,
      hasAnonKey: true,
      projectRef: "spjowmulvoyxxkfeyjkr",
      config: { url: "https://spjowmulvoyxxkfeyjkr.supabase.co", anonKey: "key" }
    }
  );
  const [indexSource, manualSource, configSource] = await Promise.all([
    readFile("apps/worker/src/index.ts", "utf8"),
    readFile("apps/worker/src/manual-router.ts", "utf8"),
    readFile("apps/worker/src/server-config.ts", "utf8")
  ]);
  assert.doesNotMatch(indexSource, /env\.SUPABASE_(?:URL|ANON_KEY)/);
  assert.doesNotMatch(manualSource, /env\.SUPABASE_(?:URL|ANON_KEY)/);
  assert.match(configSource, /env\.SUPABASE_URL/);
  assert.match(configSource, /env\.SUPABASE_ANON_KEY/);
});

test("manual title over 64 code points is rejected before create RPC", async () => {
  const mock = installFetch([authOk(), memberOk(), editorOk()]);
  try {
    const response = await handleManualRoute(
      request("POST", JSON.stringify({ title: "あ".repeat(65) })),
      ENV
    );
    assert.equal(response?.status, 400);
    assert.equal((await response.json()).code, "MANUAL_TITLE_INVALID");
    assert.equal(mock.calls.length, 3);
  } finally {
    mock.restore();
  }
});

test("malformed escaped workspace path is hidden as 404", async () => {
  const response = await handleManualRoute(
    new Request(`${APP_ORIGIN}/api/workspaces/%ZZ/manuals`),
    ENV
  );
  assert.equal(response?.status, 404);
  assert.equal((await response.json()).code, "MANUALS_NOT_FOUND");
});

test("Supabase deadline remains active while response body is consumed", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, delay, ...args) => originalSetTimeout(callback, Math.min(Number(delay), 20), ...args);
  const mock = installFetch([
    authOk(),
    memberOk(),
    (_url, init) => new Response(new ReadableStream({
      start(controller) {
        const fail = () => controller.error(new DOMException("Aborted", "AbortError"));
        if (init.signal?.aborted) fail();
        else init.signal?.addEventListener("abort", fail, { once: true });
      }
    }), {
      status: 200,
      headers: { "content-type": "application/json", "content-range": "0-0/1" }
    })
  ]);
  try {
    const response = await handleManualRoute(request(), ENV);
    assert.equal(response?.status, 502);
    assert.equal((await response.json()).code, "MANUALS_RESPONSE_INVALID");
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    mock.restore();
  }
});

test("manual title migration fixes the same 64-character contract", async () => {
  const migration = await readFile("supabase/migrations/202608140005_phase2_manual_title_length.sql", "utf8");
  assert.match(migration, /manuals_title_length/);
  assert.match(migration, /manual_revisions_title_length/);
  assert.match(migration, /char_length\(title\) between 1 and 64/i);
  assert.match(migration, /manuals_title_nonblank/);
  assert.match(migration, /manual_revisions_title_nonblank/);
  assert.match(migration, /btrim\(\s*title/i);
  assert.match(migration, /chr\(160\)/);
});


test("status-only create failure cancels the unread Supabase body", async () => {
  let cancelled = false;
  const stalledFailure = new Response(new ReadableStream({
    cancel() {
      cancelled = true;
    }
  }), {
    status: 500,
    headers: { "content-type": "application/json" }
  });
  const mock = installFetch([authOk(), memberOk(), editorOk(), stalledFailure]);
  try {
    const startedAt = Date.now();
    const response = await handleManualRoute(
      request("POST", JSON.stringify({ title: "保存手順" })),
      ENV
    );
    assert.equal(response?.status, 502);
    assert.equal((await response.json()).code, "MANUAL_CREATE_RESULT_UNKNOWN");
    assert.equal(cancelled, true);
    assert.ok(Date.now() - startedAt < 1000, "unread body cancellation should not wait for the 5-second deadline");
  } finally {
    mock.restore();
  }
});


test("oversized Content-Length response cancels its unread body immediately", async () => {
  let cancelled = false;
  const oversized = new Response(new ReadableStream({
    cancel() {
      cancelled = true;
    }
  }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-length": "1200000",
      "content-range": "0-0/1"
    }
  });
  const mock = installFetch([authOk(), memberOk(), oversized]);
  try {
    const startedAt = Date.now();
    const response = await handleManualRoute(request(), ENV);
    assert.equal(response?.status, 502);
    assert.equal((await response.json()).code, "MANUALS_RESPONSE_INVALID");
    assert.equal(cancelled, true);
    assert.ok(Date.now() - startedAt < 1000, "oversized body cancellation should not wait for the 5-second deadline");
  } finally {
    mock.restore();
  }
});


test("1000 worst-case JSON-escaped titles fit the dedicated manual list budget", async () => {
  const title = "\u0001".repeat(64);
  const rows = Array.from({ length: 1000 }, (_, index) => ({
    ...manualRow(index + 1),
    title
  }));
  const serialized = JSON.stringify(rows);
  const serializedBytes = Buffer.byteLength(serialized);
  assert.ok(serializedBytes > 512 * 1024, "fixture must exceed the generic Supabase JSON budget");
  assert.ok(serializedBytes < 1024 * 1024, "fixture must fit the dedicated manual list budget");

  const mock = installFetch([
    authOk(),
    memberOk(),
    new Response(serialized, {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-length": String(serializedBytes),
        "content-range": "0-999/1000"
      }
    })
  ]);
  try {
    const response = await handleManualRoute(request(), ENV);
    assert.equal(response?.status, 200);
    const body = await response.json();
    assert.equal(body.manuals.length, 1000);
    assert.equal(body.manuals[0].title, title);
  } finally {
    mock.restore();
  }
});

test("uppercase workspace UUID is canonicalized before querying and comparing rows", async () => {
  const canonicalWorkspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const uppercaseWorkspaceId = canonicalWorkspaceId.toUpperCase();
  const row = { ...manualRow(1), workspace_id: canonicalWorkspaceId };
  const mock = installFetch([
    authOk(),
    memberOk(),
    json([row], 200, { "content-range": "0-0/1" })
  ]);
  try {
    const response = await handleManualRoute(
      new Request(
        `${APP_ORIGIN}/api/workspaces/${uppercaseWorkspaceId}/manuals`,
        { headers: { cookie: "__Host-mm_access=access-token; __Host-mm_refresh=refresh-token" } }
      ),
      ENV
    );
    assert.equal(response?.status, 200);
    assert.equal((await response.json()).manuals[0].id, row.id);
    assert.deepEqual(JSON.parse(String(mock.calls[1].init.body)), {
      target_workspace_id: canonicalWorkspaceId,
      target_user_id: USER_ID
    });
    assert.ok(
      mock.calls[2].url.includes(`workspace_id=eq.${canonicalWorkspaceId}`),
      "manual query must use the canonical lowercase workspace UUID"
    );
  } finally {
    mock.restore();
  }
});
