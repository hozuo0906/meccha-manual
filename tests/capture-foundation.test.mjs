import assert from "node:assert/strict";
import test from "node:test";

import { handleCaptureRoute } from "../apps/worker/src/capture-router.ts";
import { generateCaptureDraftSteps, normalizeCaptureEvents } from "../apps/worker/src/domain/capture/draft-generator.ts";

const ORIGIN = "https://app.example.test";
const SUPABASE = "https://project.supabase.co";
const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const ENV = { SUPABASE_URL: SUPABASE, SUPABASE_ANON_KEY: "public-anon-key" };

function request(path) {
  return new Request(`${ORIGIN}${path}`, { method: "POST", headers: { origin: ORIGIN, cookie: "__Host-mm_access=access-token" } });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function installFetch(editor = true) {
  const original = globalThis.fetch;
  const calls = [];
  const responses = [json({ id: USER_ID }), json(editor)];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    const response = responses.shift();
    assert.ok(response, `unexpected fetch ${input}`);
    return response;
  };
  return { calls, restore: () => { globalThis.fetch = original; assert.equal(responses.length, 0); } };
}

test("capture start fails closed before any Browser Run call", async () => {
  const mock = installFetch();
  try {
    const response = await handleCaptureRoute(request(`/api/workspaces/${WORKSPACE_ID}/capture-sessions`), ENV);
    assert.equal(response?.status, 503);
    assert.equal((await response.json()).code, "BROWSER_EGRESS_NOT_VERIFIED");
    assert.equal(mock.calls.length, 2);
    assert.ok(mock.calls.every((call) => call.url.startsWith(SUPABASE)));
  } finally { mock.restore(); }
});

test("navigate and mobile preview fail closed too", async () => {
  for (const path of [
    `/v1/workspaces/${WORKSPACE_ID}/capture-sessions/${SESSION_ID}/commands`,
    `/api/workspaces/${WORKSPACE_ID}/capture-sessions/${SESSION_ID}/live-url`,
    `/api/workspaces/${WORKSPACE_ID}/mobile-preview-sessions`,
    `/v1/workspaces/${WORKSPACE_ID}/mobile-preview-sessions`
  ]) {
    const mock = installFetch();
    try {
      const response = await handleCaptureRoute(request(path), ENV);
      assert.equal(response?.status, 503);
      assert.equal((await response.json()).code, "BROWSER_EGRESS_NOT_VERIFIED");
      assert.equal(mock.calls.length, 2);
    } finally { mock.restore(); }
  }
});

test("viewer is rejected without revealing the egress gate", async () => {
  const mock = installFetch(false);
  try {
    const response = await handleCaptureRoute(request(`/api/workspaces/${WORKSPACE_ID}/capture-sessions`), ENV);
    assert.equal(response?.status, 403);
    assert.equal((await response.json()).code, "CAPTURE_FORBIDDEN");
  } finally { mock.restore(); }
});

test("capture normalization drops values, unknown fields, and navigation URLs", () => {
  const secret = "do-not-store-input-value";
  const events = normalizeCaptureEvents([
    { sequence: 4, type: "scroll", occurredAt: "2026-08-18T00:00:04Z", direction: "down", value: secret },
    { sequence: 1, type: "click", occurredAt: "2026-08-18T00:00:01Z", targetText: "4111 1111 1111 1111", cookie: secret },
    { sequence: 2, type: "input_complete", occurredAt: "2026-08-18T00:00:02Z", targetText: "4111 1111 1111 1111", value: secret },
    { sequence: 3, type: "navigation", occurredAt: "2026-08-18T00:00:03Z", url: `https://example.test/payments/4111111111111111?private_value=${secret}#detail` }
  ]);
  assert.deepEqual(events.map((event) => event.sequence), [1, 2, 3, 4]);
  assert.equal(events[0].targetText, "対象");
  assert.equal(events[1].targetText, "入力欄");
  assert.equal(events[2].location, undefined);
  assert.doesNotMatch(JSON.stringify(events), /do-not-store|private_value=|#detail|cookie|value|4111|example\.test/);

  const steps = generateCaptureDraftSteps(events);
  assert.equal(steps.length, 4);
  assert.equal(steps[1].actionType, "input");
  assert.equal(steps[2].url, null);
  assert.doesNotMatch(JSON.stringify(steps), /do-not-store|private_value=|#detail|4111|example\.test/);
});

test("duplicate sequences are all rejected independent of input order", () => {
  const duplicated = [
    { sequence: 1, type: "click", occurredAt: "2026-08-18T00:00:01Z", targetText: "先の候補" },
    { sequence: 1, type: "click", occurredAt: "2026-08-18T00:00:02Z", targetText: "後の候補" },
    { sequence: 2, type: "click", occurredAt: "2026-08-18T00:00:03Z", targetText: "一意" }
  ];
  assert.deepEqual(normalizeCaptureEvents(duplicated), normalizeCaptureEvents([...duplicated].reverse()));
  assert.deepEqual(normalizeCaptureEvents(duplicated).map((event) => event.sequence), [2]);
});

test("invalid string sequences do not suppress valid numeric events", () => {
  const events = normalizeCaptureEvents([
    { sequence: 1, type: "click", occurredAt: "2026-08-18T00:00:01Z", targetText: "有効" },
    { sequence: "1", type: "click", occurredAt: "2026-08-18T00:00:02Z", targetText: "無効" }
  ]);
  assert.deepEqual(events.map((event) => event.sequence), [1]);
});

test("structurally invalid events do not suppress valid duplicate sequences", () => {
  const events = normalizeCaptureEvents([
    { sequence: 1, type: "click", occurredAt: "2026-08-18T00:00:01Z", targetText: "有効" },
    { sequence: 1, type: "unknown", occurredAt: "invalid" },
    { sequence: 2, type: "scroll", occurredAt: "2026-08-18T00:00:02Z" }
  ]);
  assert.deepEqual(events.map((event) => event.sequence), [1]);
});

test("invalid calendar timestamps do not suppress valid duplicate sequences", () => {
  const events = normalizeCaptureEvents([
    { sequence: 1, type: "click", occurredAt: "2026-02-28T00:00:00Z", targetText: "有効" },
    { sequence: 1, type: "click", occurredAt: "2026-02-30T00:00:00Z", targetText: "無効日付" }
  ]);
  assert.deepEqual(events.map((event) => event.sequence), [1]);
  assert.equal(events[0].occurredAt, "2026-02-28T00:00:00.000Z");
});

test("sub-millisecond ISO timestamps are deterministically normalized", () => {
  const events = normalizeCaptureEvents([
    { sequence: 1, type: "click", occurredAt: "2026-08-18T00:00:00.123456Z", targetText: "対象" }
  ]);
  assert.equal(events[0].occurredAt, "2026-08-18T00:00:00.123Z");
});

test("scroll events without a valid direction are rejected", () => {
  const events = normalizeCaptureEvents([
    { sequence: 1, type: "scroll", occurredAt: "2026-08-18T00:00:01Z", direction: "down" },
    { sequence: 2, type: "scroll", occurredAt: "2026-08-18T00:00:02Z" },
    { sequence: 3, type: "scroll", occurredAt: "2026-08-18T00:00:03Z", direction: "down" }
  ]);
  assert.deepEqual(events.map((event) => event.sequence), [1, 3]);
  assert.equal(generateCaptureDraftSteps(events).length, 1);
});

test("draft generation is deterministic and collapses consecutive scroll summaries", () => {
  const events = normalizeCaptureEvents([
    { sequence: 2, type: "scroll", occurredAt: "2026-08-18T00:00:02Z", direction: "down" },
    { sequence: 1, type: "scroll", occurredAt: "2026-08-18T00:00:01Z", direction: "down" },
    { sequence: 3, type: "click", occurredAt: "2026-08-18T00:00:03Z", targetText: "次へ" }
  ]);
  assert.deepEqual(generateCaptureDraftSteps(events), generateCaptureDraftSteps([...events].reverse()));
  assert.equal(generateCaptureDraftSteps(events).length, 2);
});
