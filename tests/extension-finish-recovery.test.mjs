import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { mergeCaptureEvents } from "../apps/extension/background/event-merge.js";
import { nextRecoveryJournal } from "../apps/extension/background/recovery-journal.js";
import { normalizeCaptureEvent } from "../apps/extension/capture/privacy.js";

const source = (await readFile(new URL("../apps/extension/background/service-worker.js", import.meta.url), "utf8")).replace(/^import .*;\r?$/gm, "");

async function harness({ screenshotFails = false, localFails = true, sessionFails = false, injectionFails = false } = {}) {
  let session = { id: "capture-1", tabId: 1, windowId: 2, mode: "pc", phase: "recording", events: [], startedAt: 1 };
  let journal;
  let drained = false;
  let draft;
  let restoreCalls = 0;
  let onRemoved;
  let onUpdated;
  const injections = [];
  const pending = [{ kind: "input", at: 2, eventId: "document:1", target: { tagName: "input" } }];
  const context = {
    crypto, Date, Promise, mergeCaptureEvents, nextRecoveryJournal, normalizeCaptureEvent,
    installSensitiveMasks() {}, removeSensitiveMasks() {}, verifySensitiveMasks() {},
    captureWithMaskBoundary: async () => { if (screenshotFails) throw new Error("mask failed"); return "data:image/jpeg;base64,AA"; },
    draftStore: { put: async (value) => { draft = value; } },
    recoverWindowSession: async () => { restoreCalls++; return { restored: true }; },
    chrome: {
      storage: {
        session: { get: async () => ({ activeCaptureSession: session }), set: async (value) => { if (sessionFails) throw new Error("session unavailable"); session = value.activeCaptureSession; }, remove: async () => { session = null; } },
        local: { get: async () => ({ captureRecoveryJournal: journal }), set: async (value) => { if (localFails) throw new Error("local storage unavailable"); journal = value.captureRecoveryJournal; }, remove: async () => { journal = null; } }
      },
      scripting: { executeScript: async (options) => { if (options.files) { injections.push(...options.files); if (injectionFails) throw new Error("injection denied"); return []; } const result = drained ? [] : pending; drained = true; return [{ result }]; } },
      runtime: { onMessage: { addListener() {} } },
      tabs: { onUpdated: { addListener(callback) { onUpdated = callback; } }, onRemoved: { addListener(callback) { onRemoved = callback; } } },
      windows: { get: async () => { throw new Error("must not query a closing window"); } }
    }
  };
  vm.runInNewContext(source + "\nglobalThis.finish = finishCapture; globalThis.status = captureStatus; globalThis.restore = retryRestore; globalThis.settle = () => sessionOperation;", context);
  await context.settle();
  return { finish: () => context.finish(), session: () => session, draft: () => draft, restoreCalls: () => restoreCalls,
    injections, status: () => context.status(), restore: () => context.restore(),
    navigate: async () => { onUpdated(1, { status: "complete" }); await context.settle(); },
    close: async () => { session.mode = "tabletPortrait"; onRemoved(1, { isWindowClosing: true }); await context.settle(); } };
}

test("local journal failure does not discard the first drained batch when session storage works", async () => {
  const capture = await harness();
  await capture.finish();
  assert.equal(capture.draft().steps.length, 1);
  assert.equal(capture.draft().steps[0].eventId, "document:1");
  assert.equal(capture.session(), null);
});

test("navigation reinjects the recorder even when both persistence writes fail", async () => {
  const capture = await harness({ sessionFails: true, localFails: true });
  await capture.navigate();
  assert.deepEqual(capture.injections, ["content/history-bridge.js", "content/recorder.js"]);
});

test("failed reinjection remains visible when both persistence writes fail", async () => {
  const capture = await harness({ sessionFails: true, localFails: true, injectionFails: true });
  await capture.navigate();
  const status = await capture.status();
  assert.equal(status.phase, "reinjection_failed");
  assert.equal(status.recording, false);
});

test("retained starting state exposes recovery and restore clears the session", async () => {
  const capture = await harness();
  capture.session().phase = "starting";
  capture.session().restorePending = false;
  assert.equal((await capture.status()).restorePending, true);
  assert.equal((await capture.restore()).restored, true);
  assert.equal(capture.session(), null);
});

test("failed screenshot plus failed journal preserves drained edits in the retry session", async () => {
  const capture = await harness({ screenshotFails: true });
  await assert.rejects(capture.finish());
  assert.equal(capture.session().phase, "finish_failed");
  assert.equal(capture.session().events[0].eventId, "document:1");
  assert.equal(capture.draft(), undefined);
});

test("closing the recording window clears recovery instead of attempting restoration", async () => {
  const capture = await harness({ localFails: false });
  await capture.close();
  assert.equal(capture.session(), null);
  assert.equal(capture.restoreCalls(), 0);
});
