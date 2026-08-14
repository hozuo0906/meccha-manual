import assert from "node:assert/strict";
import test from "node:test";

import { handleManualRoute } from "../apps/worker/src/manual-router.ts";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const MANUAL_ID = "33333333-3333-4333-8333-333333333333";
const DRAFT_ID = "44444444-4444-4444-8444-444444444444";
const APP_ORIGIN = "https://app.example.test";
const SUPABASE_ORIGIN = "https://project.supabase.co";
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
  return new Request(`${APP_ORIGIN}/api/workspaces/${WORKSPACE_ID}/manuals`, {
    method,
    headers: {
      cookie: "__Host-mm_access=access-token; __Host-mm_refresh=refresh-token",
      ...(method === "POST" ? { origin: APP_ORIGIN, "content-type": "application/json" } : {}),
      ...headers
    },
    body
  });
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

test("chunked JSON body over 16 KiB fails with 413 before create RPC", async () => {
  const largeJson = JSON.stringify({ title: "手順", description: "x".repeat(20 * 1024) });
  const bytes = new TextEncoder().encode(largeJson);
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.slice(0, 9000));
      controller.enqueue(bytes.slice(9000));
      controller.close();
    }
  });
  const mock = installFetch([authOk(), memberOk(), editorOk()]);
  try {
    const response = await handleManualRoute(
      request("POST", body, { "transfer-encoding": "chunked" }),
      ENV
    );
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
