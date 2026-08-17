import assert from "node:assert/strict";
import test from "node:test";

import { handleManualEditRoute } from "../apps/worker/src/manual-edit-router.ts";

const APP_ORIGIN = "https://app.example.test";
const SUPABASE_ORIGIN = "https://project.supabase.co";
const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const MANUAL_ID = "33333333-3333-4333-8333-333333333333";
const DRAFT_ID = "44444444-4444-4444-8444-444444444444";
const STEP_ID = "55555555-5555-4555-8555-555555555555";
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

function authOk() {
  return json({ id: USER_ID });
}

function memberOk(value = true) {
  return json(value);
}

function editorOk(value = true) {
  return json(value);
}

function manualRow(draftId = DRAFT_ID) {
  return {
    id: MANUAL_ID,
    workspace_id: WORKSPACE_ID,
    title: "保存手順",
    status: draftId ? "draft" : "published",
    current_draft_revision_id: draftId,
    current_published_revision_id: draftId ? null : "66666666-6666-4666-8666-666666666666",
    updated_at: "2026-08-14T00:00:00.000Z"
  };
}

function draftRow() {
  return {
    id: DRAFT_ID,
    workspace_id: WORKSPACE_ID,
    manual_id: MANUAL_ID,
    revision_no: 1,
    state: "draft",
    title: "保存手順",
    description: "受付担当者向け",
    updated_at: "2026-08-14T00:00:01.000Z"
  };
}

function stepRow(overrides = {}) {
  return {
    id: STEP_ID,
    workspace_id: WORKSPACE_ID,
    revision_id: DRAFT_ID,
    position: 0,
    type: "action",
    title: "保存する",
    instruction: "手修正済みです。",
    action_type: "click",
    target_text: "保存ボタン",
    url: null,
    asset_id: null,
    annotation: {},
    masking: {},
    updated_at: "2026-08-14T00:00:02.000Z",
    ...overrides
  };
}

function detailSnapshot(draftId = DRAFT_ID, steps = [stepRow()], canEdit = true) {
  return {
    can_edit: canEdit,
    manual: manualRow(draftId),
    draft: draftId ? draftRow() : null,
    steps: draftId ? steps : []
  };
}

function request(path, method = "GET", body, headers = {}) {
  const mutating = ["POST", "PATCH", "PUT", "DELETE"].includes(method);
  const init = {
    method,
    headers: {
      cookie: "__Host-mm_access=access-token; __Host-mm_refresh=refresh-token",
      ...(mutating ? { origin: APP_ORIGIN } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers
    },
    body
  };
  if (body instanceof ReadableStream) init.duplex = "half";
  return new Request(`${APP_ORIGIN}${path}`, init);
}

function detailPath(suffix = "") {
  return `/api/workspaces/${WORKSPACE_ID}/manuals/${MANUAL_ID}${suffix}`;
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

test("viewer can load manual detail without edit permission", async () => {
  const mock = installFetch([
    authOk(),
    memberOk(),
    json(detailSnapshot(DRAFT_ID, [stepRow()], false))
  ]);
  try {
    const response = await handleManualEditRoute(request(detailPath()), ENV);
    assert.equal(response?.status, 200);
    const body = await response.json();
    assert.equal(body.manual.id, MANUAL_ID);
    assert.equal(body.draft.id, DRAFT_ID);
    assert.equal(body.steps.length, 1);
    assert.equal(body.steps[0].instruction, "手修正済みです。");
    assert.deepEqual(body.permissions, { canEdit: false });
    assert.equal("annotation" in body.steps[0], false);
    assert.match(mock.calls[2].url, /\/rest\/v1\/rpc\/get_manual_edit_detail$/);
    assert.equal(mock.calls[2].init.method, "POST");
    assert.deepEqual(JSON.parse(String(mock.calls[2].init.body)), {
      target_workspace_id: WORKSPACE_ID,
      target_manual_id: MANUAL_ID
    });
  } finally {
    mock.restore();
  }
});

test("manual without a current draft returns an empty editor state", async () => {
  const mock = installFetch([authOk(), memberOk(), json(detailSnapshot(null, [], false))]);
  try {
    const response = await handleManualEditRoute(request(detailPath()), ENV);
    assert.equal(response?.status, 200);
    const body = await response.json();
    assert.equal(body.draft, null);
    assert.deepEqual(body.steps, []);
    assert.equal(mock.calls.length, 3);
  } finally {
    mock.restore();
  }
});

test("non-member manual detail is hidden before data queries", async () => {
  const mock = installFetch([authOk(), memberOk(false)]);
  try {
    const response = await handleManualEditRoute(request(detailPath()), ENV);
    assert.equal(response?.status, 404);
    assert.equal((await response.json()).code, "MANUALS_NOT_FOUND");
    assert.equal(mock.calls.length, 2);
  } finally {
    mock.restore();
  }
});

test("viewer cannot patch a draft", async () => {
  const mock = installFetch([authOk(), memberOk(), editorOk(false)]);
  try {
    const response = await handleManualEditRoute(
      request(detailPath("/draft"), "PATCH", JSON.stringify({ title: "変更", description: "説明", expectedUpdatedAt: draftRow().updated_at })),
      ENV
    );
    assert.equal(response?.status, 403);
    assert.equal((await response.json()).code, "MANUAL_EDIT_FORBIDDEN");
  } finally {
    mock.restore();
  }
});

test("editor updates manual and draft metadata through one RPC", async () => {
  const mock = installFetch([
    authOk(), memberOk(), editorOk(), json([manualRow()]), json(DRAFT_ID)
  ]);
  try {
    const response = await handleManualEditRoute(
      request(detailPath("/draft"), "PATCH", JSON.stringify({ title: " 更新後 ", description: "新しい説明", expectedUpdatedAt: draftRow().updated_at })),
      ENV
    );
    assert.equal(response?.status, 200);
    assert.deepEqual(await response.json(), { draftId: DRAFT_ID });
    const rpc = mock.calls[4];
    assert.match(rpc.url, /\/rest\/v1\/rpc\/update_manual_draft$/);
    assert.deepEqual(JSON.parse(String(rpc.init.body)), {
      target_manual_id: MANUAL_ID,
      expected_draft_revision_id: DRAFT_ID,
      expected_draft_updated_at: draftRow().updated_at,
      draft_title: "更新後",
      draft_description: "新しい説明"
    });
  } finally {
    mock.restore();
  }
});

test("draft patch requires the version displayed by the editor", async () => {
  const mock = installFetch([authOk(), memberOk(), editorOk(), json([manualRow()])]);
  try {
    const response = await handleManualEditRoute(
      request(detailPath("/draft"), "PATCH", JSON.stringify({ title: "更新", description: "説明" })),
      ENV
    );
    assert.equal(response?.status, 400);
    assert.equal((await response.json()).code, "MANUAL_DRAFT_INPUT_REQUIRED");
    assert.equal(mock.calls.length, 4);
  } finally {
    mock.restore();
  }
});

test("stale draft metadata maps to a determinate 409 conflict", async () => {
  const mock = installFetch([
    authOk(), memberOk(), editorOk(), json([manualRow()]), json({ message: "manual draft changed concurrently" }, 400)
  ]);
  try {
    const response = await handleManualEditRoute(
      request(detailPath("/draft"), "PATCH", JSON.stringify({
        title: "古い画面の更新",
        description: "古い説明",
        expectedUpdatedAt: draftRow().updated_at
      })),
      ENV
    );
    assert.equal(response?.status, 409);
    assert.equal((await response.json()).code, "MANUAL_DRAFT_EDIT_CONFLICT");
  } finally {
    mock.restore();
  }
});

test("10,000 four-byte Japanese characters fit within the bounded request body", async () => {
  const description = "𠮷".repeat(10_000);
  const body = JSON.stringify({ title: "最大説明", description, expectedUpdatedAt: draftRow().updated_at });
  assert.ok(new TextEncoder().encode(body).byteLength < 64 * 1024);
  const mock = installFetch([
    authOk(), memberOk(), editorOk(), json([manualRow()]), json(DRAFT_ID)
  ]);
  try {
    const response = await handleManualEditRoute(
      request(detailPath("/draft"), "PATCH", body),
      ENV
    );
    assert.equal(response?.status, 200);
    assert.equal(JSON.parse(String(mock.calls[4].init.body)).draft_description, description);
  } finally {
    mock.restore();
  }
});

test("request bodies above 64 KiB are rejected before mutation RPC", async () => {
  const body = JSON.stringify({ title: "上限超過", description: "あ".repeat(22_000), expectedUpdatedAt: draftRow().updated_at });
  assert.ok(new TextEncoder().encode(body).byteLength > 64 * 1024);
  const mock = installFetch([authOk(), memberOk(), editorOk(), json([manualRow()])]);
  try {
    const response = await handleManualEditRoute(
      request(detailPath("/draft"), "PATCH", body),
      ENV
    );
    assert.equal(response?.status, 413);
    assert.equal((await response.json()).code, "JSON_BODY_TOO_LARGE");
    assert.equal(mock.calls.length, 4);
  } finally {
    mock.restore();
  }
});

test("step creation uses the local Japanese suggestion only when instruction is omitted", async () => {
  const mock = installFetch([
    authOk(), memberOk(), editorOk(), json([manualRow()]), json(STEP_ID)
  ]);
  try {
    const response = await handleManualEditRoute(
      request(detailPath("/steps"), "POST", JSON.stringify({
        type: "action",
        title: "保存する",
        actionType: "click",
        targetText: "保存ボタン"
      })),
      ENV
    );
    assert.equal(response?.status, 201);
    const rpcBody = JSON.parse(String(mock.calls[4].init.body));
    assert.equal(rpcBody.step_instruction, "［保存ボタン］をクリックします。");
    assert.equal(rpcBody.step_target_text, "保存ボタン");
    assert.equal("value" in rpcBody, false);
  } finally {
    mock.restore();
  }
});

test("explicit step instruction is preserved", async () => {
  const mock = installFetch([
    authOk(), memberOk(), editorOk(), json([manualRow()]), json(STEP_ID)
  ]);
  try {
    const response = await handleManualEditRoute(
      request(detailPath("/steps"), "POST", JSON.stringify({
        type: "action",
        title: "保存する",
        actionType: "click",
        targetText: "保存ボタン",
        instruction: "利用者が手修正した文章です。"
      })),
      ENV
    );
    assert.equal(response?.status, 201);
    assert.equal(JSON.parse(String(mock.calls[4].init.body)).step_instruction, "利用者が手修正した文章です。");
  } finally {
    mock.restore();
  }
});

test("WHATWG URLで有効なunderscore hostをstep RPCへ保持する", async () => {
  const mock = installFetch([
    authOk(), memberOk(), editorOk(), json([manualRow()]), json(STEP_ID)
  ]);
  try {
    const response = await handleManualEditRoute(
      request(detailPath("/steps"), "POST", JSON.stringify({
        type: "action",
        title: "社内画面を開く",
        actionType: "navigate",
        targetText: "社内画面",
        url: "https://service_name.example/"
      })),
      ENV
    );
    assert.equal(response?.status, 201);
    assert.equal(JSON.parse(String(mock.calls[4].init.body)).step_url, "https://service_name.example/");
  } finally {
    mock.restore();
  }
});

test("WHATWG URLで有効なゼロ埋めportを正規化してstep RPCへ渡す", async () => {
  const mock = installFetch([
    authOk(), memberOk(), editorOk(), json([manualRow()]), json(STEP_ID)
  ]);
  try {
    const response = await handleManualEditRoute(
      request(detailPath("/steps"), "POST", JSON.stringify({
        type: "action",
        title: "社内画面を開く",
        actionType: "navigate",
        targetText: "社内画面",
        url: "https://example.com:000080/"
      })),
      ENV
    );
    assert.equal(response?.status, 201);
    assert.equal(JSON.parse(String(mock.calls[4].init.body)).step_url, "https://example.com:80/");
  } finally {
    mock.restore();
  }
});

test("WHATWG URLで有効な空portを正規化してstep RPCへ渡す", async () => {
  const mock = installFetch([
    authOk(), memberOk(), editorOk(), json([manualRow()]), json(STEP_ID)
  ]);
  try {
    const response = await handleManualEditRoute(
      request(detailPath("/steps"), "POST", JSON.stringify({
        type: "action",
        title: "社内画面を開く",
        actionType: "navigate",
        targetText: "社内画面",
        url: "HTTPS://example.com:/"
      })),
      ENV
    );
    assert.equal(response?.status, 201);
    assert.equal(JSON.parse(String(mock.calls[4].init.body)).step_url, "https://example.com/");
  } finally {
    mock.restore();
  }
});

test("WHATWGが除去するURL内の空白・制御文字も入力境界で拒否する", async () => {
  const mock = installFetch([
    authOk(), memberOk(), editorOk(), json([manualRow()])
  ]);
  try {
    const response = await handleManualEditRoute(
      request(detailPath("/steps"), "POST", JSON.stringify({
        type: "action",
        title: "社内画面を開く",
        actionType: "navigate",
        targetText: "社内画面",
        url: "https://exa\tmple.com/"
      })),
      ENV
    );
    assert.equal(response?.status, 400);
    assert.equal((await response.json()).code, "MANUAL_STEP_URL_INVALID");
    assert.equal(mock.calls.length, 4, "invalid URL must not reach the mutation RPC");
  } finally {
    mock.restore();
  }
});

test("punycode hostnameはWorkerとdirect RPCで共通して非対応にする", async () => {
  const mock = installFetch([
    authOk(), memberOk(), editorOk(), json([manualRow()])
  ]);
  try {
    const response = await handleManualEditRoute(
      request(detailPath("/steps"), "POST", JSON.stringify({
        type: "action",
        title: "国際化ドメインを開く",
        actionType: "navigate",
        targetText: "確認画面",
        url: "https://xn--bcher-kva.example/"
      })),
      ENV
    );
    assert.equal(response?.status, 400);
    assert.equal((await response.json()).code, "MANUAL_STEP_URL_INVALID");
    assert.equal(mock.calls.length, 4, "invalid URL must not reach the mutation RPC");
  } finally {
    mock.restore();
  }
});

test("step patch requires the version displayed by the editor", async () => {
  const mock = installFetch([authOk(), memberOk(), editorOk(), json([manualRow()])]);
  try {
    const response = await handleManualEditRoute(
      request(detailPath(`/steps/${STEP_ID}`), "PATCH", JSON.stringify({ title: "更新" })),
      ENV
    );
    assert.equal(response?.status, 400);
    assert.equal((await response.json()).code, "MANUAL_STEP_VERSION_INVALID");
    assert.equal(mock.calls.length, 4);
  } finally {
    mock.restore();
  }
});

test("step patch keeps the saved instruction when target fields change", async () => {
  const mock = installFetch([
    authOk(), memberOk(), editorOk(), json([manualRow()]), json([stepRow()]), json(null)
  ]);
  try {
    const response = await handleManualEditRoute(
      request(detailPath(`/steps/${STEP_ID}`), "PATCH", JSON.stringify({
        expectedUpdatedAt: "2026-08-14T00:00:02.000Z",
        actionType: "select",
        targetText: "プラン選択"
      })),
      ENV
    );
    assert.equal(response?.status, 200);
    const rpc = mock.calls[5];
    assert.match(rpc.url, /\/rest\/v1\/rpc\/update_manual_step$/);
    const rpcBody = JSON.parse(String(rpc.init.body));
    assert.equal(rpcBody.expected_step_updated_at, "2026-08-14T00:00:02.000Z");
    assert.equal(rpcBody.step_instruction, "手修正済みです。");
    assert.equal(rpcBody.step_action_type, "select");
    assert.equal(rpcBody.step_target_text, "プラン選択");
    assert.equal(rpcBody.step_asset_id, null);
    assert.deepEqual(rpcBody.step_annotation, {});
    assert.deepEqual(rpcBody.step_masking, {});
  } finally {
    mock.restore();
  }
});

test("stale manual step update maps to a determinate 409 conflict", async () => {
  const mock = installFetch([
    authOk(), memberOk(), editorOk(), json([manualRow()]), json([stepRow()]),
    json({ message: "manual step changed concurrently" }, 400)
  ]);
  try {
    const response = await handleManualEditRoute(
      request(detailPath(`/steps/${STEP_ID}`), "PATCH", JSON.stringify({
        title: "競合更新",
        expectedUpdatedAt: "2026-08-14T00:00:01.000Z"
      })),
      ENV
    );
    assert.equal(response?.status, 409);
    const body = await response.json();
    assert.equal(body.code, "MANUAL_STEP_EDIT_CONFLICT");
    assert.equal(JSON.parse(String(mock.calls[5].init.body)).expected_step_updated_at, "2026-08-14T00:00:01.000Z");
    assert.match(body.message, /再読み込み/);
  } finally {
    mock.restore();
  }
});

test("step delete uses the soft-delete RPC", async () => {
  const mock = installFetch([
    authOk(), memberOk(), editorOk(), json([manualRow()]), json(null)
  ]);
  try {
    const response = await handleManualEditRoute(
      request(detailPath(`/steps/${STEP_ID}`), "DELETE"),
      ENV
    );
    assert.equal(response?.status, 200);
    assert.deepEqual(await response.json(), { stepId: STEP_ID, deleted: true });
    assert.match(mock.calls[4].url, /\/rest\/v1\/rpc\/soft_delete_manual_step$/);
  } finally {
    mock.restore();
  }
});

test("step reorder sends the complete canonical UUID order", async () => {
  const secondId = "66666666-6666-4666-8666-666666666666";
  const mock = installFetch([
    authOk(), memberOk(), editorOk(), json([manualRow()]), json(null)
  ]);
  try {
    const response = await handleManualEditRoute(
      request(detailPath("/steps/reorder"), "POST", JSON.stringify({
        orderedStepIds: [STEP_ID.toUpperCase(), secondId]
      })),
      ENV
    );
    assert.equal(response?.status, 200);
    assert.deepEqual(JSON.parse(String(mock.calls[4].init.body)).ordered_step_ids, [STEP_ID, secondId]);
  } finally {
    mock.restore();
  }
});

test("mutation upstream 5xx is result-unknown and does not invite retry", async () => {
  const mock = installFetch([
    authOk(), memberOk(), editorOk(), json([manualRow()]), json({ message: "upstream failed" }, 500)
  ]);
  try {
    const response = await handleManualEditRoute(
      request(detailPath("/draft"), "PATCH", JSON.stringify({ title: "変更", description: "説明", expectedUpdatedAt: draftRow().updated_at })),
      ENV
    );
    assert.equal(response?.status, 502);
    const body = await response.json();
    assert.equal(body.code, "MANUAL_DRAFT_UPDATE_RESULT_UNKNOWN");
    assert.match(body.message, /重ねて保存せず/);
  } finally {
    mock.restore();
  }
});

test("PATCH without a same-origin Origin is rejected before session lookup", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("unexpected fetch");
  };
  try {
    const response = await handleManualEditRoute(
      request(
        detailPath("/draft"),
        "PATCH",
        JSON.stringify({ title: "変更", description: "説明", expectedUpdatedAt: draftRow().updated_at }),
        { origin: "" }
      ),
      ENV
    );
    assert.equal(response?.status, 403);
    assert.equal((await response.json()).code, "ORIGIN_REQUIRED");
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("unexpected input-value fields are rejected and never reach the RPC", async () => {
  const mock = installFetch([
    authOk(), memberOk(), editorOk(), json([manualRow()])
  ]);
  try {
    const response = await handleManualEditRoute(
      request(detailPath("/steps"), "POST", JSON.stringify({
        title: "メール入力",
        actionType: "input",
        targetText: "メールアドレス欄",
        value: "person@example.com"
      })),
      ENV
    );
    assert.equal(response?.status, 400);
    assert.equal((await response.json()).code, "MANUAL_EDIT_FIELD_UNEXPECTED");
    assert.equal(mock.calls.length, 4);
  } finally {
    mock.restore();
  }
});

test("malformed manual UUID is hidden as 404 without upstream calls", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("unexpected fetch");
  };
  try {
    const response = await handleManualEditRoute(
      request(`/api/workspaces/${WORKSPACE_ID}/manuals/%ZZ`),
      ENV
    );
    assert.equal(response?.status, 404);
    assert.equal((await response.json()).code, "MANUAL_NOT_FOUND");
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("manual detail accepts 200 DB-valid rows after worst-case JSON escaping", async () => {
  const control = "\u0001";
  const steps = Array.from({ length: 200 }, (_, position) => ({
    id: `55555555-5555-4555-8555-${String(position + 1).padStart(12, "0")}`,
    workspace_id: WORKSPACE_ID,
    revision_id: DRAFT_ID,
    position,
    type: "action",
    title: control.repeat(128),
    instruction: control.repeat(4_000),
    action_type: "navigate",
    target_text: control.repeat(256),
    url: "https://" + control.repeat(2_048 - "https://".length),
    updated_at: "2026-08-14T00:00:02.000Z"
  }));
  const encodedBytes = new TextEncoder().encode(JSON.stringify(steps)).byteLength;
  assert.ok(encodedBytes > 6 * 1024 * 1024, "fixture must reproduce the former 6 MiB regression");
  assert.ok(encodedBytes < 8 * 1024 * 1024, "DB-valid maximum rows must remain inside the bounded 8 MiB budget");

  const mock = installFetch([
    authOk(), memberOk(), json(detailSnapshot(DRAFT_ID, steps))
  ]);
  try {
    const response = await handleManualEditRoute(request(detailPath()), ENV);
    assert.equal(response?.status, 200);
  } finally {
    mock.restore();
  }
});

test("manual detail refuses more than 200 active steps", async () => {
  const steps = Array.from({ length: 201 }, (_, position) => stepRow({
    id: `55555555-5555-4555-8555-${String(position + 1).padStart(12, "0")}`,
    position
  }));
  const mock = installFetch([
    authOk(), memberOk(), json(detailSnapshot(DRAFT_ID, steps))
  ]);
  try {
    const response = await handleManualEditRoute(request(detailPath()), ENV);
    assert.equal(response?.status, 409);
    assert.equal((await response.json()).code, "MANUAL_STEPS_LIMIT_EXCEEDED");
  } finally {
    mock.restore();
  }
});

test("step creation maps the database capacity guard to 409", async () => {
  const mock = installFetch([
    authOk(), memberOk(), editorOk(), json([manualRow()]),
    json({ message: "manual step limit exceeded" }, 400)
  ]);
  try {
    const response = await handleManualEditRoute(
      request(detailPath("/steps"), "POST", JSON.stringify({
        type: "note",
        title: "上限確認",
        instruction: "確認します。"
      })),
      ENV
    );
    assert.equal(response?.status, 409);
    assert.equal((await response.json()).code, "MANUAL_STEPS_LIMIT_EXCEEDED");
  } finally {
    mock.restore();
  }
});

test("step RPCのURL検証拒否を決定的な400へ変換する", async () => {
  const mock = installFetch([
    authOk(), memberOk(), editorOk(), json([manualRow()]),
    json({ message: "manual step url is invalid" }, 400)
  ]);
  try {
    const response = await handleManualEditRoute(
      request(detailPath("/steps"), "POST", JSON.stringify({
        type: "action",
        title: "URL境界確認",
        actionType: "navigate",
        targetText: "確認画面",
        url: "https://example.com/"
      })),
      ENV
    );
    assert.equal(response?.status, 400);
    assert.equal((await response.json()).code, "MANUAL_STEP_URL_INVALID");
  } finally {
    mock.restore();
  }
});

test("manual detail does not request hidden step mutation fields", async () => {
  const mock = installFetch([
    authOk(), memberOk(), json(detailSnapshot(DRAFT_ID, [{
      id: STEP_ID,
      workspace_id: WORKSPACE_ID,
      revision_id: DRAFT_ID,
      position: 0,
      type: "note",
      title: "確認",
      instruction: "確認します。",
      action_type: null,
      target_text: null,
      url: null,
      updated_at: "2026-08-14T00:00:02.000Z"
    }]))
  ]);
  try {
    const response = await handleManualEditRoute(request(detailPath()), ENV);
    assert.equal(response?.status, 200);
    assert.match(mock.calls[2].url, /\/rest\/v1\/rpc\/get_manual_edit_detail$/);
  } finally {
    mock.restore();
  }
});
