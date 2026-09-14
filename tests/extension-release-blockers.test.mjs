import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { mergeCaptureEvents } from "../apps/extension/background/event-merge.js";
import { installSensitiveMasks, removeSensitiveMasks } from "../apps/extension/capture/screenshot.js";

test("MAIN-world history bridge emits a generic navigation event for pushState/replaceState without leaking URL", async () => {
  const source = await readFile(new URL("../apps/extension/content/history-bridge.js", import.meta.url), "utf8");
  const calls = [];
  const emitted = [];
  const context = {
    history: {
      pushState(...args) { calls.push(["push", ...args]); return "push-result"; },
      replaceState(...args) { calls.push(["replace", ...args]); return "replace-result"; }
    },
    dispatchEvent(event) { emitted.push(event); return true; },
    Event: class Event { constructor(type) { this.type = type; } },
    Reflect
  };

  vm.runInNewContext(source, context);
  const installedPush = context.history.pushState;
  assert.equal(context.history.pushState({ a: 1 }, "", "/private?token=secret"), "push-result");
  assert.equal(context.history.replaceState({ b: 2 }, "", "/other?email=user@example.com"), "replace-result");
  assert.deepEqual(emitted.map(({ type }) => type), ["meccha-manual:history-navigation", "meccha-manual:history-navigation"]);
  assert.equal(JSON.stringify(emitted).includes("secret"), false);
  assert.equal(JSON.stringify(emitted).includes("user@example.com"), false);
  assert.equal(calls.length, 2, "original page history methods must still execute");

  vm.runInNewContext(source, context);
  assert.equal(context.history.pushState, installedPush, "bridge installation must be idempotent");
});

test("service worker injects the SPA bridge in MAIN world before the isolated recorder", async () => {
  const source = await readFile(new URL("../apps/extension/background/service-worker.js", import.meta.url), "utf8");
  const bridge = source.indexOf('world: "MAIN", files: ["content/history-bridge.js"]');
  const recorder = source.indexOf('files: ["content/recorder.js"]');
  assert.ok(bridge >= 0, "MAIN-world bridge injection is required");
  assert.ok(recorder > bridge, "MAIN-world bridge must be installed before the isolated recorder");
  const recorderSource = await readFile(new URL("../apps/extension/content/recorder.js", import.meta.url), "utf8");
  assert.match(recorderSource, /addEventListener\(HISTORY_EVENT, historyNavigation, true\)/);
  assert.doesNotMatch(recorderSource, /history\.pushState =/);
  assert.doesNotMatch(recorderSource, /history\.replaceState =/);
});

test("pending recorder events are normalized and deduplicated as one in-memory batch before persistence", () => {
  const session = {
    id: "capture",
    events: [{ kind: "click", at: 1, label: "ボタン", eventId: "existing:1" }]
  };
  const merged = mergeCaptureEvents(session, [
    { kind: "input", at: 2, eventId: "frame:1", target: { tagName: "input", type: "text", ariaLabel: "secret value" } },
    { kind: "input", at: 3, eventId: "frame:1", target: { tagName: "input", type: "text" } },
    { kind: "scroll", at: 4, eventId: "frame:2", direction: "down" }
  ]);
  assert.equal(merged.events.length, 3);
  assert.deepEqual(merged.events.map(({ eventId }) => eventId), ["existing:1", "frame:1", "frame:2"]);
  assert.equal(JSON.stringify(merged).includes("secret value"), false);
  assert.equal(session.events.length, 1, "merge must not partially mutate the source snapshot");
});

test("finish assigns the complete drained batch before its single session persistence attempt and carries it into retry state", async () => {
  const source = await readFile(new URL("../apps/extension/background/service-worker.js", import.meta.url), "utf8");
  const finishStart = source.indexOf("async function finishCapture()");
  const merge = source.indexOf("session = mergeCaptureEvents(session, pendingEvents);", finishStart);
  const persist = source.indexOf("await setSession(session);", merge);
  const retry = source.indexOf("const retrySession = { ...session", merge);
  assert.ok(finishStart >= 0 && merge > finishStart && persist > merge, "drained batch must exist in memory before persistence");
  assert.ok(retry > merge, "retry snapshot must be derived from the in-memory batch, never the stale pre-drain session");
  assert.doesNotMatch(source.slice(finishStart, source.indexOf("async function cancelCapture", finishStart)), /for \(const event of pendingEvents/);
});

test("screenshot privacy masks targets in-place so transforms/top-layer coordinate spaces cannot displace the mask", () => {
  const originalDocument = globalThis.document;
  const originalGetComputedStyle = globalThis.getComputedStyle;
  const originalMasks = globalThis.__mecchaManualScreenshotMasks;

  class FakeStyle {
    constructor() { this.values = new Map([["visibility", "visible"]]); this.priorities = new Map(); }
    getPropertyValue(name) { return this.values.get(name) || ""; }
    getPropertyPriority(name) { return this.priorities.get(name) || ""; }
    setProperty(name, value, priority = "") { this.values.set(name, value); this.priorities.set(name, priority); }
    removeProperty(name) { this.values.delete(name); this.priorities.delete(name); }
  }

  const style = new FakeStyle();
  const element = {
    localName: "input",
    style,
    shadowRoot: null,
    matches: () => true,
    getBoundingClientRect: () => ({ left: 900, top: 700, width: 180, height: 32 })
  };
  const root = {
    querySelectorAll(selector) { return selector === "*" ? [] : [element]; }
  };

  try {
    globalThis.document = root;
    globalThis.getComputedStyle = () => ({ visibility: "visible", display: "block", opacity: "1" });
    delete globalThis.__mecchaManualScreenshotMasks;
    const result = installSensitiveMasks();
    assert.deepEqual(result, { applied: true, count: 1 });
    assert.equal(style.getPropertyValue("visibility"), "hidden");
    assert.equal(style.getPropertyPriority("visibility"), "important");
    removeSensitiveMasks();
    assert.equal(style.getPropertyValue("visibility"), "visible", "original inline visibility must be restored exactly");
  } finally {
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
    if (originalGetComputedStyle === undefined) delete globalThis.getComputedStyle; else globalThis.getComputedStyle = originalGetComputedStyle;
    if (originalMasks === undefined) delete globalThis.__mecchaManualScreenshotMasks; else globalThis.__mecchaManualScreenshotMasks = originalMasks;
  }
});

test("screenshot masking no longer relies on viewport-coordinate overlays inside transformed top-layer ancestors", async () => {
  const source = await readFile(new URL("../apps/extension/capture/screenshot.js", import.meta.url), "utf8");
  assert.match(source, /element\.style\.setProperty\("visibility", "hidden", "important"\)/);
  assert.match(source, /previousVisibility/);
  assert.match(source, /previousPriority/);
  assert.doesNotMatch(source, /position:\s*"fixed"/);
  assert.doesNotMatch(source, /topLayerAncestor\.append/);
});
