import assert from "node:assert/strict";
import test from "node:test";

import phase2Worker from "../apps/worker/src/index-phase2.ts";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const MANUAL_ID = "33333333-3333-4333-8333-333333333333";
const DRAFT_ID = "44444444-4444-4444-8444-444444444444";
const STEP_ID = "55555555-5555-4555-8555-555555555555";
const APP_ORIGIN = "https://app.example.test";
const SUPABASE_ORIGIN = "https://project.supabase.co";
const ENV = {
  SUPABASE_URL: SUPABASE_ORIGIN,
  SUPABASE_ANON_KEY: "public-anon-key"
};
const CTX = { waitUntil() {}, passThroughOnException() {} };

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers }
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

function get(path) {
  return new Request(`${APP_ORIGIN}${path}`, {
    method: "GET",
    headers: { cookie: "__Host-mm_access=access-token" }
  });
}

test("entry routes archived list to the list handler, not the detail handler", async () => {
  const row = {
    id: MANUAL_ID,
    workspace_id: WORKSPACE_ID,
    folder_id: null,
    title: "手順書 1",
    status: "archived",
    current_draft_revision_id: DRAFT_ID,
    current_published_revision_id: null,
    archived_at: "2026-11-09T00:00:00Z",
    updated_at: "2026-08-14T00:00:00.000Z"
  };
  const mock = installFetch([
    authOk(),
    memberOk(),
    json([row], 200, { "content-range": "0-0/1" })
  ]);
  try {
    const response = await phase2Worker.fetch(
      get(`/api/workspaces/${WORKSPACE_ID}/manuals/archived`),
      ENV,
      CTX
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.manuals.length, 1);
    assert.equal(body.manuals[0].status, "archived");
    assert.match(mock.calls[2].url, /\/rpc\/list_archived_manuals\?limit=1001$/);
  } finally {
    mock.restore();
  }
});

test("entry still routes a normal manual detail to the edit detail handler", async () => {
  const snapshot = {
    can_edit: true,
    manual: {
      id: MANUAL_ID,
      workspace_id: WORKSPACE_ID,
      title: "保存手順",
      status: "draft",
      current_draft_revision_id: DRAFT_ID,
      current_published_revision_id: null,
      updated_at: "2026-08-14T00:00:00.000Z"
    },
    draft: {
      id: DRAFT_ID,
      workspace_id: WORKSPACE_ID,
      manual_id: MANUAL_ID,
      revision_no: 1,
      state: "draft",
      content_version: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      title: "保存手順",
      description: "受付担当者向け",
      updated_at: "2026-08-14T00:00:01.000Z"
    },
    steps: [
      {
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
        updated_at: "2026-08-14T00:00:02.000Z"
      }
    ]
  };
  const mock = installFetch([authOk(), memberOk(), json(snapshot)]);
  try {
    const response = await phase2Worker.fetch(
      get(`/api/workspaces/${WORKSPACE_ID}/manuals/${MANUAL_ID}`),
      ENV,
      CTX
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.manual.id, MANUAL_ID);
    assert.match(mock.calls[2].url, /\/rest\/v1\/rpc\/get_manual_edit_detail$/);
  } finally {
    mock.restore();
  }
});
