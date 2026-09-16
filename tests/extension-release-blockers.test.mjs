import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { mergeCaptureEvents } from "../apps/extension/background/event-merge.js";
import { MAX_RECOVERY_EVENTS, mergeRecoveryEvents, nextRecoveryJournal } from "../apps/extension/background/recovery-journal.js";
import {
  captureWithMaskBoundary,
  installSensitiveMasks,
  removeSensitiveMasks,
  verifySensitiveMasks
} from "../apps/extension/capture/screenshot.js";
import { addMask, addStep } from "../apps/extension/editor/draft-model.js";

test("event merge preserves all four scroll directions", () => {
  const directions = ["up", "down", "left", "right"];
  const merged = mergeCaptureEvents({ id: "capture", events: [] }, directions.map((direction, at) => ({
    kind: "scroll", direction, at, eventId: `scroll:${at}`
  })));
  assert.deepEqual(merged.events.map(({ direction }) => direction), directions);
});

test("start failure immediately exposes retained window recovery controls", async () => {
  const source = (await readFile(new URL("../apps/extension/popup/popup.js", import.meta.url), "utf8"))
    .replace(/^import .*;\r?\n/m, "");
  const elements = new Map();
  const messages = [];
  let failed = false;
  const document = {
    querySelector(id) {
      if (!elements.has(id)) elements.set(id, {
        hidden: false, disabled: false, value: "current", textContent: "", listeners: {},
        addEventListener(type, handler) { this.listeners[type] = handler; },
        replaceChildren() {}, append() {}
      });
      return elements.get(id);
    }
  };
  vm.runInNewContext(source, {
    document, draftStore: { list: async () => [] },
    chrome: {
      tabs: { query: async () => [{ id: 1 }] },
      runtime: { sendMessage: async (message) => {
        messages.push(message.type);
        if (message.type === "capture:start") { failed = true; return { ok: false, error: "resize failed" }; }
        return { ok: true, value: failed ? { phase: "restore_pending", restorePending: true } : {} };
      } }
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  await elements.get("#start").listeners.click();
  assert.deepEqual(messages.slice(-2), ["capture:start", "capture:status"]);
  assert.equal(elements.get("#restore").hidden, false);
  assert.equal(elements.get("#start").hidden, true);
  assert.equal(elements.get("#mode").disabled, true);
  assert.match(elements.get("#status").textContent, /resize failed/);
});

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
  assert.equal(calls.length, 2);

  vm.runInNewContext(source, context);
  assert.equal(context.history.pushState, installedPush, "bridge installation must be idempotent");
});

test("service worker injects the SPA bridge in MAIN world before the isolated recorder", async () => {
  const source = await readFile(new URL("../apps/extension/background/service-worker.js", import.meta.url), "utf8");
  const bridge = source.indexOf('world: "MAIN", files: ["content/history-bridge.js"]');
  const recorder = source.indexOf('files: ["content/recorder.js"]');
  assert.ok(bridge >= 0);
  assert.ok(recorder > bridge);
});

test("event merge deduplicates and preserves cross-frame chronological order", () => {
  const session = {
    id: "capture",
    events: [{ kind: "click", at: 30, label: "ボタン", eventId: "top:2" }]
  };
  const merged = mergeCaptureEvents(session, [
    { kind: "input", at: 10, eventId: "frame:1", target: { tagName: "input", value: "secret" } },
    { kind: "input", at: 20, eventId: "frame:1", target: { tagName: "input" } },
    { kind: "scroll", at: 40, eventId: "frame:2", direction: "down" }
  ]);
  assert.deepEqual(merged.events.map(({ eventId }) => eventId), ["frame:1", "top:2", "frame:2"]);
  assert.equal(JSON.stringify(merged).includes("secret"), false);
  assert.equal(session.events.length, 1, "merge must not mutate the source snapshot");
});

test("bounded recovery journal survives duplicate drained events and keeps retry phase", () => {
  const first = nextRecoveryJournal(null, {
    sessionId: "capture",
    events: [{ kind: "scroll", at: 4, eventId: "f:2", direction: "down" }]
  });
  const second = nextRecoveryJournal(first, {
    sessionId: "capture",
    phase: "finish_failed",
    events: [
      { kind: "input", at: 2, eventId: "f:1", target: { tagName: "input", value: "secret" } },
      { kind: "scroll", at: 5, eventId: "f:2", direction: "down" }
    ]
  });
  assert.equal(second.phase, "finish_failed");
  assert.deepEqual(second.events.map(({ eventId }) => eventId), ["f:1", "f:2"]);
  assert.equal(JSON.stringify(second).includes("secret"), false);

  const many = Array.from({ length: MAX_RECOVERY_EVENTS + 20 }, (_, index) => ({ kind: "navigation", at: index, eventId: `n:${index}` }));
  const bounded = mergeRecoveryEvents([], many);
  assert.equal(bounded.length, MAX_RECOVERY_EVENTS);
  assert.equal(bounded[0].eventId, "n:20");
});

test("finish retains drained events before either persistence attempt", async () => {
  const source = await readFile(new URL("../apps/extension/background/service-worker.js", import.meta.url), "utf8");
  const finishStart = source.indexOf("async function finishCapture()");
  const journal = source.indexOf("await persistRecoveryJournal(session.id, pendingEvents)", finishStart);
  const merge = source.indexOf("session = mergeCaptureEvents(session, pendingEvents);", finishStart);
  const persist = source.indexOf("await setSession(session);", merge);
  assert.ok(finishStart >= 0 && merge > finishStart && journal > merge && persist > journal);
  assert.match(source, /chrome\.storage\.local\.set\(\{ \[RECOVERY_KEY\]: next \}\)/);
  assert.match(source, /recovery\?\.sessionId !== session\.id/);
  assert.match(source, /phase: "finish_failed"/);
});

test("successful recorder resume reconciles the durable recovery phase before reporting success", async () => {
  const source = await readFile(new URL("../apps/extension/background/service-worker.js", import.meta.url), "utf8");
  const start = source.indexOf("async function resumeCapture(tabId)");
  const end = source.indexOf("async function captureStatus()", start);
  const body = source.slice(start, end);
  const journalRecording = body.indexOf('await persistRecoveryJournal(session.id, resumedSession.events || [], "recording")');
  const persistSession = body.indexOf("await setSession(resumedSession)");
  const clearJournal = body.indexOf("await clearRecoveryJournal(session.id).catch(() => undefined)");
  const success = body.indexOf("return { resumed: true }");
  assert.ok(start >= 0 && journalRecording > 0 && persistSession > journalRecording && clearJournal > persistSession && success > clearJournal);
  assert.match(body, /persistRecoveryJournal\(session\.id, failedSession\.events \|\| \[\], "reinjection_failed"\)/);
  assert.match(body, /setSession\(failedSession\)\.catch/);
});

test("zero-event capture screenshot is claimed by the first added step and remains maskable", () => {
  const draft = {
    id: "draft-empty",
    title: "新しい手順書",
    description: "",
    steps: [],
    screenshots: [{ id: "shot-1", dataUrl: "data:image/jpeg;base64,AA", masks: [] }]
  };
  const step = addStep(draft, "最初の手順");
  assert.equal(step.screenshotId, "shot-1");
  assert.equal(draft.steps[0].screenshotId, "shot-1");
  addMask(draft, step.screenshotId, { x: 0.1, y: 0.1, width: 0.2, height: 0.2 });
  assert.equal(draft.screenshots[0].masks.length, 1);
});

test("navigation reinjection proceeds even when navigation event persistence fails", async () => {
  const source = await readFile(new URL("../apps/extension/background/service-worker.js", import.meta.url), "utf8");
  const updatedStart = source.indexOf("chrome.tabs.onUpdated.addListener");
  const updated = source.slice(updatedStart, source.indexOf("chrome.tabs.onRemoved.addListener", updatedStart));
  const persistenceCatch = updated.indexOf("await persistRecoveryJournal(session.id, [navigationEvent])");
  const injection = updated.indexOf("await injectRecorder(tabId)");
  assert.ok(persistenceCatch >= 0 && injection > persistenceCatch, "recorder reinjection must not depend on session persistence success");
  assert.match(updated, /failureCategory: "recorder_reinjection_failed"/);
});

test("PC mode restoration is a no-op so user window changes are not undone", async () => {
  const source = await readFile(new URL("../apps/extension/background/service-worker.js", import.meta.url), "utf8");
  const start = source.indexOf("async function attemptRestore(session)");
  const body = source.slice(start, source.indexOf("async function windowStillExists", start));
  assert.match(body, /if \(session\?\.mode === "pc"\) return true/);
});

test("recorder drains pending click/navigation operations and coalesces duplicate same-document navigation", async () => {
  const source = await readFile(new URL("../apps/extension/content/recorder.js", import.meta.url), "utf8");
  assert.match(source, /const trackedActions = new Map\(\)/);
  assert.match(source, /trackAndSend\("click", target\)/);
  assert.match(source, /let pendingNavigation/);
  assert.match(source, /navigationTimer = setTimeout\(flushNavigation, 40\)/);
  assert.match(source, /pendingEvents\.push\(\.\.\.trackedActions\.values\(\)\)/);
  assert.match(source, /if \(pendingNavigation\) pendingEvents\.push\(pendingNavigation\)/);
  assert.match(source, /Math\.max\(Math\.abs\(deltaX\), Math\.abs\(deltaY\)\)/);
  assert.match(source, /deltaX < 0 \? "left" : "right"/);
});

test("screenshot privacy disables transitions, verifies document identity, and restores inline style", async () => {
  const originalDocument = globalThis.document;
  const originalGetComputedStyle = globalThis.getComputedStyle;
  const originalMasks = globalThis.__mecchaManualScreenshotMasks;
  const originalChrome = globalThis.chrome;
  const originalHTMLElement = globalThis.HTMLElement;

  class FakeStyle {
    constructor() {
      this.values = new Map([["visibility", "visible"], ["transition", "visibility 2s"], ["animation", "pulse 1s"]]);
      this.priorities = new Map();
    }
    getPropertyValue(name) { return this.values.get(name) || ""; }
    getPropertyPriority(name) { return this.priorities.get(name) || ""; }
    setProperty(name, value, priority = "") { this.values.set(name, value); this.priorities.set(name, priority); }
    removeProperty(name) { this.values.delete(name); this.priorities.delete(name); }
  }

  const style = new FakeStyle();
  const element = {
    localName: "private-input",
    style,
    shadowRoot: null,
    matches: () => false,
    getBoundingClientRect: () => ({ left: 1, top: 1, width: 180, height: 32 })
  };
  const root = { querySelectorAll(selector) { return selector === "*" ? [element] : []; } };

  try {
    globalThis.HTMLElement = Object;
    globalThis.chrome = { dom: { openOrClosedShadowRoot: () => ({ mode: "closed" }) } };
    globalThis.document = root;
    globalThis.getComputedStyle = (target) => ({
      visibility: target.style.getPropertyValue("visibility") || "visible",
      display: target.style.getPropertyValue("display") || "block",
      opacity: target.style.getPropertyValue("opacity") || "1"
    });
    delete globalThis.__mecchaManualScreenshotMasks;
    const result = installSensitiveMasks();
    assert.equal(result.applied, true);
    assert.equal(typeof result.token, "string");
    assert.equal(style.getPropertyValue("transition"), "none");
    assert.equal(style.getPropertyValue("animation"), "none");
    assert.equal(style.getPropertyValue("visibility"), "hidden");
    assert.equal(style.getPropertyValue("opacity"), "0");
    assert.equal(verifySensitiveMasks(result.token), true);
    assert.equal(style.getPropertyValue("display"), "none");
    // Opacity alone cannot suppress a closed-shadow top-layer descendant.
    style.setProperty("display", "block");
    assert.equal(verifySensitiveMasks(result.token), false);
    style.setProperty("display", "none");
    assert.equal(verifySensitiveMasks("wrong-token"), false);
    removeSensitiveMasks();
    assert.equal(style.getPropertyValue("visibility"), "visible");
    assert.equal(style.getPropertyValue("transition"), "visibility 2s");
    assert.equal(style.getPropertyValue("animation"), "pulse 1s");
    assert.equal(style.getPropertyValue("opacity"), "");
    assert.equal(style.getPropertyValue("display"), "");
  } finally {
    if (originalChrome === undefined) delete globalThis.chrome; else globalThis.chrome = originalChrome;
    if (originalHTMLElement === undefined) delete globalThis.HTMLElement; else globalThis.HTMLElement = originalHTMLElement;
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
    if (originalGetComputedStyle === undefined) delete globalThis.getComputedStyle; else globalThis.getComputedStyle = originalGetComputedStyle;
    if (originalMasks === undefined) delete globalThis.__mecchaManualScreenshotMasks; else globalThis.__mecchaManualScreenshotMasks = originalMasks;
  }
});

test("captured image is discarded when mask identity is invalidated by document replacement", async () => {
  let removed = false;
  await assert.rejects(captureWithMaskBoundary({
    applyMasks: async () => ({ applied: true, token: "document-1" }),
    capture: async () => "data:image/jpeg;base64,AA",
    verifyMasks: async () => false,
    removeMasks: async () => { removed = true; }
  }), /SCREENSHOT_MASK_INVALIDATED/);
  assert.equal(removed, true);
});

test("missing privileged shadow inspection fails closed before screenshot capture", () => {
  assert.deepEqual(installSensitiveMasks(), { applied: false });
});
