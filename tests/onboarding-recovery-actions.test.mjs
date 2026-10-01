import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { ONBOARDING_JS } from "../apps/worker/src/onboarding-assets.ts";
import { handleExternalCloudClaimMessage } from "../apps/extension/background/cloud-claim.js";
import { buildContinueUrl, createHandoffMetadata, findRecoverableHandoff, fingerprintDraft, handoffStorageKey } from "../apps/extension/editor/handoff.js";

const ORIGIN = "https://meccha-manual-staging.meccha-iiyatsu.com";
function memoryIndexedDb(drafts) {
  return { open() { const request = {}; queueMicrotask(() => {
    request.result = { close() {}, transaction() {
      const tx = { objectStore() { return {
        get(id) { const r = {}; queueMicrotask(() => { r.result = structuredClone(drafts.get(id)); r.onsuccess?.(); queueMicrotask(() => tx.oncomplete?.()); }); return r; },
        put(value) { drafts.set(value.id, structuredClone(value)); const r = {}; queueMicrotask(() => { r.onsuccess?.(); queueMicrotask(() => tx.oncomplete?.()); }); return r; }
      }; } }; return tx;
    } }; request.onsuccess?.();
  }); return request; } };
}
async function runRecovery({ requestedAction, changed = false, serverStatus = "completed", withBranding = false }) {
  const previous = { chrome: globalThis.chrome, indexedDB: globalThis.indexedDB, OffscreenCanvas: globalThis.OffscreenCanvas, createImageBitmap: globalThis.createImageBitmap };
  const storage = new Map();
  const original = { id: "pending-local", title: "保存応答が失われた手順書", description: "", updatedAt: "2026-10-01T00:00:00.000Z", selectedStepId: "step-17", steps: [], screenshots: [] };
  const logoBytes = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
  if (withBranding) {
    original.branding = { themeColor: "#A14EBA", logoDataUrl: "data:image/png;base64,AQ==" };
    original.steps = [{ id: "natural", order: 17, instruction: "  保存を確認する\n次の行" }, { id: "empty", order: 18, instruction: " " }, { id: "long", order: 19, instruction: "😀".repeat(200) }];
    globalThis.createImageBitmap = async (blob) => { assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), new Uint8Array([1])); return { width: 4000, height: 2000, close() {} }; };
    globalThis.OffscreenCanvas = class {
      constructor(width, height) { assert.ok(width * height <= 4_000_000); this.width = width; this.height = height; }
      getContext() { return { clearRect() {}, drawImage() {} }; }
      async convertToBlob() { return new Blob([logoBytes], { type: "image/png" }); }
    };
  }
  const current = changed ? { ...original, title: "保存後に追加した新しい編集" } : original;
  const drafts = new Map([[original.id, current]]);
  const local = {
    async get(key) { return key === null ? Object.fromEntries(storage) : { [key]: structuredClone(storage.get(key)) }; },
    async set(entries) { for (const [key, value] of Object.entries(entries)) storage.set(key, structuredClone(value)); }
  };
  globalThis.chrome = { storage: { local } };
  globalThis.indexedDB = memoryIndexedDb(drafts);
  try {
    const oldFingerprint = await fingerprintDraft(original);
    const pending = { ...createHandoffMetadata(original.id, "save", Date.now(), "a".repeat(32), original.updatedAt, oldFingerprint), status: "finalize-pending", operationId: "O".repeat(43), claimIntentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
    storage.set(handoffStorageKey(pending.handoffId), pending);
    const recovered = await findRecoverableHandoff(original.id, await fingerprintDraft(current), local, requestedAction);
    assert.equal(recovered.handoffId, pending.handoffId);
    const url = new URL(buildContinueUrl(ORIGIN, recovered.handoffId, "a".repeat(32), recovered, requestedAction));
    const cloudRef = { workspaceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", manualId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", revisionId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", updatedAt: "2026-10-01T00:01:00.000Z", contentVersion: "a".repeat(32) };
    const session = new Map(); const messages = []; const requests = [];
    const button = { textContent: "", listeners: new Map(), addEventListener(type, callback) { this.listeners.set(type, callback); }, removeEventListener(type) { this.listeners.delete(type); } };
    const status = { textContent: "", className: "" };
    const location = { hash: url.hash, pathname: url.pathname, search: url.search, href: url.href };
    const context = {
      document: { querySelector(selector) { return selector === "#onboarding" ? { dataset: { bootstrapEnabled: "true" } } : selector === "#status" ? status : button; } },
      window: { addEventListener() {} }, location,
      history: { replaceState() { location.hash = ""; } },
      sessionStorage: { getItem(key) { return session.get(key) ?? null; }, setItem(key, value) { session.set(key, value); } },
      chrome: { runtime: { async sendMessage(_id, message) { messages.push(structuredClone(message)); return handleExternalCloudClaimMessage(message, { url: ORIGIN + "/onboarding/continue" }); } } },
      async fetch(path, options) {
        requests.push({ path, method: options.method, ...(options.method === "POST" ? { body: JSON.parse(options.body) } : {}) });
        if (withBranding && options.method === "PUT" && path === `/api/onboarding/claim-intents/${pending.claimIntentId}/branding/logo`) {
          assert.deepEqual(new Uint8Array(await options.body.arrayBuffer()), logoBytes, "only the freshly rasterized logo reaches the web");
          assert.equal(options.headers["X-Claim-Operation-Id"], pending.operationId);
          assert.equal(options.headers["X-Asset-Byte-Length"], String(logoBytes.length));
          return Response.json({ status: "ready", logoId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" });
        }
        if (options.method === "GET" && path === `/api/onboarding/claims/${pending.claimIntentId}?operationId=${pending.operationId}`) {
          return Response.json(serverStatus === "completed" ? { status: "completed", manualId: cloudRef.manualId, cloudRef } : { status: "pending", expiresAt: pending.expiresAt });
        }
        if (options.method === "POST" && path === `/api/onboarding/claims/${pending.claimIntentId}` && serverStatus === "pending" && !changed) return Response.json({ status: "claimed", manualId: cloudRef.manualId, cloudRef });
        throw new Error("Unexpected cloud write: " + path);
      },
      crypto, URL, URLSearchParams, Date, TextEncoder, TextDecoder, Uint8Array, Blob, btoa, atob
    };
    runInNewContext(ONBOARDING_JS, context);
    assert.equal(typeof button.listeners.get("click"), "function", status.textContent);
    await button.listeners.get("click")();
    assert.ok(messages.every((message) => message.action === "save"), "every recovery/claim message preserves the original save action");
    assert.equal(requests.filter((request) => request.path === "/api/onboarding/claim-intents").length, 0);
    assert.equal(requests.filter((request) => request.path === "/api/onboarding/bootstrap").length, 0);
    assert.equal(drafts.get(original.id).title, current.title);
    assert.equal(drafts.get(original.id).selectedStepId, "step-17");
    if (serverStatus === "completed" || !changed) {
      assert.equal(drafts.get(original.id).cloudRef.manualId, cloudRef.manualId);
      assert.equal(button.textContent, requestedAction === "share" ? "共有設定を開く" : "保存した手順書を開く");
      button.onclick();
      assert.equal(location.href, requestedAction === "share" ? `/manuals?shareManualId=${cloudRef.manualId}` : "/manuals");
    } else {
      assert.equal(requests.length, 1, "changed local data never overwrites the old pending snapshot");
      assert.equal(storage.get(handoffStorageKey(pending.handoffId)).status, "finalize-pending");
      assert.equal(drafts.get(original.id).cloudRef, undefined);
    }
    return requests;
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
}

test("Save response loss then Share recovers the old manual using GET only and preserves requested share destination", async () => {
  const calls = await runRecovery({ requestedAction: "share" });
  assert.deepEqual(calls.map((call) => call.method), ["GET"]);
});
test("Save response loss then local edit then Save recovers the old snapshot while preserving all new local edits", async () => {
  const calls = await runRecovery({ requestedAction: "save", changed: true });
  assert.deepEqual(calls.map((call) => call.method), ["GET"]);
});
test("pending Save then Share retries only the existing claim when the old snapshot still matches", async () => {
  const calls = await runRecovery({ requestedAction: "share", serverStatus: "pending" });
  assert.deepEqual(calls.map((call) => call.method), ["GET", "POST"]);
});
test("pending old snapshot with newer local edits blocks writes until the original result is known", async () => {
  await runRecovery({ requestedAction: "share", changed: true, serverStatus: "pending" });
});


test("onboarding transfers rasterized per-manual branding and uses natural bounded titles for new local steps", async () => {
  const requests = await runRecovery({ requestedAction: "save", serverStatus: "pending", withBranding: true });
  assert.deepEqual(requests.map((row) => row.method), ["GET", "PUT", "POST"]);
  const manual = requests.at(-1).body.manual;
  assert.deepEqual(manual.branding, { themeColor: "#a14eba", logoId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" });
  assert.equal(manual.steps[0].title, "保存を確認する");
  assert.equal(manual.steps[1].title, "操作の説明");
  assert.equal(Array.from(manual.steps[2].title).length, 128);
  assert.equal(JSON.stringify(manual).includes("logoDataUrl"), false);
});
