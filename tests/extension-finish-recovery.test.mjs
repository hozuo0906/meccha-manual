import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { mergeCaptureEvents } from "../apps/extension/background/event-merge.js";
import { nextRecoveryJournal } from "../apps/extension/background/recovery-journal.js";
import { normalizeCaptureEvent } from "../apps/extension/capture/privacy.js";
import { VIEWPORTS } from "../apps/extension/responsive/viewports.js";

const source = (await readFile(new URL("../apps/extension/background/service-worker.js", import.meta.url), "utf8")).replace(/^import .*;\r?$/gm, "");

async function harness({ screenshotFails = false, draftPutFails = false, localFails = true, sessionFails = false, sessionFailsAfterLivePut = false, injectionFails = false, mode = "pc", restoreSucceeds = true, clearFails = false, listFails = false, countFails = false, screenshotDelayMs = 0, pendingEvents = [{ kind: "input", at: 2, eventId: "document:1", target: { tagName: "input" } }] } = {}) {
  let session = { id: "capture-1", tabId: 1, windowId: 2, mode, phase: "recording", events: [], startedAt: 1 };
  let journal;
  let drained = false;
  let draft;
  let restoreCalls = 0;
  let viewportApplied = false;
  let liveEntries = [];
  let screenshotFailure = screenshotFails;
  let draftPutFailure = draftPutFails;
  let liveStoreReadFailure = listFails;
  let liveStoreCountFailure = countFails;
  let sessionStorageFailure = sessionFails;
  let failSessionAfterLivePut = sessionFailsAfterLivePut;
  let localStorageFailure = localFails;
  let onRemoved;
  let onUpdated;
  let onMessage;
  const injections = [];
  const context = {
    crypto, Date, Promise, VIEWPORTS, CLOUD_CLAIM_MAX_ASSETS: 100, mergeCaptureEvents, nextRecoveryJournal, normalizeCaptureEvent,
    installSensitiveMasks() {}, removeSensitiveMasks() {}, verifySensitiveMasks() {},
    captureWithMaskBoundary: async () => { if (screenshotFailure) throw new Error("mask failed"); if (screenshotDelayMs) await new Promise((resolve) => setTimeout(resolve, screenshotDelayMs)); return "data:image/jpeg;base64,AA"; },
    applyResponsiveViewport: async () => { viewportApplied = true; },
    draftStore: { get: async (id) => (draft?.id === id ? draft : undefined), put: async (value) => { if (draftPutFailure) throw new Error("draft unavailable"); draft = value; } },
    recoverWindowSession: async () => { restoreCalls++; return { restored: restoreSucceeds }; },
    importedCaptureLiveStore: {
      available: true,
      put: async (entry) => { liveEntries.push(entry); if (failSessionAfterLivePut) sessionStorageFailure = true; },
      list: async (sessionId) => { if (liveStoreReadFailure) throw new Error("capture live read unavailable"); return liveEntries.filter((entry) => entry.sessionId === sessionId); },
      count: async (sessionId) => { if (liveStoreCountFailure) throw new Error("capture live count unavailable"); return liveEntries.filter((entry) => entry.sessionId === sessionId && entry.status === "ready" && entry.dataUrl).length; },
      clear: async (sessionId) => {
        if (clearFails) throw new Error("capture live cleanup unavailable");
        liveEntries = liveEntries.filter((entry) => entry.sessionId !== sessionId);
      }
    },
    chrome: {
      storage: {
        session: { get: async () => ({ activeCaptureSession: session }), set: async (value) => { if (sessionStorageFailure) throw new Error("session unavailable"); session = value.activeCaptureSession; }, remove: async () => { session = null; } },
        local: { get: async () => ({ captureRecoveryJournal: journal }), set: async (value) => { if (localStorageFailure) throw new Error("local storage unavailable"); journal = value.captureRecoveryJournal; }, remove: async () => { journal = null; } }
      },
      scripting: { executeScript: async (options) => { if (options.files) { injections.push(...options.files); if (injectionFails) throw new Error("injection denied"); return []; } const result = drained ? [] : pendingEvents; drained = true; return [{ result }]; } },
      runtime: { onMessage: { addListener(callback) { onMessage = callback; } } },
      tabs: { onUpdated: { addListener(callback) { onUpdated = callback; } }, onRemoved: { addListener(callback) { onRemoved = callback; } } },
      windows: { get: async () => { throw new Error("must not query a closing window"); } }
    }
  };
  vm.runInNewContext(source + "\nglobalThis.finish = finishCapture; globalThis.pause = pauseCapture; globalThis.resume = resumeCapture; globalThis.status = captureStatus; globalThis.restore = retryRestore; globalThis.settle = () => sessionOperation;", context);
  await context.settle();
  return { finish: () => context.finish(), pause: () => context.pause(), resume: () => context.resume(1), session: () => session, draft: () => draft, restoreCalls: () => restoreCalls,
    journal: () => journal,
    injections, status: () => context.status(), restore: () => context.restore(),
    setScreenshotFails: (value) => { screenshotFailure = value; }, setDraftPutFails: (value) => { draftPutFailure = value; }, setLiveCleanupFails: (value) => { clearFails = value; }, setLiveReadFails: (value) => { liveStoreReadFailure = value; }, setLiveCountFails: (value) => { liveStoreCountFailure = value; }, seedLiveImages: (entries) => { liveEntries = entries; }, liveImages: () => liveEntries,
    setStorageFails: (sessionValue, localValue) => {
      sessionStorageFailure = sessionValue;
      localStorageFailure = localValue;
    }, viewportApplied: () => viewportApplied,
    navigate: async () => { onUpdated(1, { status: "complete" }); await context.settle(); },
    event: async (event) => new Promise((resolve) => onMessage({ type: "capture:event", event }, { tab: { id: 1 } }, async (response) => { await context.settle(); resolve(response); })),
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

test("navigation fallback merges once after repeated storage failures and reaches the final draft", async () => {
  const capture = await harness({ sessionFails: true, localFails: true });
  await capture.navigate();
  await capture.navigate();
  capture.setStorageFails(false, false);
  await capture.finish();
  const navigationSteps = capture.draft().steps.filter((step) => step.kind === "navigation");
  assert.equal(navigationSteps.length, 2);
  assert.equal(new Set(navigationSteps.map((step) => step.eventId)).size, 2);
});

test("recovered journal retains navigation fallback when session storage is still unavailable", async () => {
  const capture = await harness({ sessionFails: true, localFails: true });
  await capture.navigate();
  capture.setStorageFails(true, false);
  const response = await capture.event({ kind: "click", at: 3, eventId: "click:1", target: { tagName: "button", ariaLabel: "保存" } });
  assert.equal(response.ok, false);
  assert.equal(capture.journal().events.filter((event) => event.kind === "navigation").length, 1);
  capture.setStorageFails(false, false);
  await capture.finish();
  assert.equal(capture.draft().steps.filter((step) => step.kind === "navigation").length, 1);
});

test("navigation count failure enters retryable reinjection state and resumes recording", async () => {
  const capture = await harness({ localFails: false, pendingEvents: [] });
  const first = await capture.event({ kind: "click", at: 1, eventId: "before-navigation-count-failure", target: { tagName: "button" } });
  assert.equal(first.value.accepted, true);
  capture.setLiveCountFails(true);
  await capture.navigate();
  const failed = await capture.status();
  assert.equal(failed.phase, "reinjection_failed");
  assert.equal(failed.reinjectionFailed, true);
  assert.equal(failed.events.length, 1);
  assert.equal(capture.injections.length, 0);

  capture.setLiveCountFails(false);
  assert.equal((await capture.resume()).resumed, true);
  assert.equal((await capture.status()).phase, "recording");
  const resumed = await capture.event({ kind: "click", at: 2, eventId: "after-navigation-count-recovery", target: { tagName: "button" } });
  assert.equal(resumed.value.accepted, true);
});

test("finish recovery pure-merges drained events when session persistence fails", async () => {
  const capture = await harness({ mode: "smartphonePortrait", sessionFails: true, localFails: false });
  await assert.rejects(capture.finish());
  assert.equal(capture.restoreCalls(), 1);
  assert.equal(capture.session().events.length, 0);
  assert.equal(capture.journal().phase, "finish_failed");
  assert.equal(capture.journal().events.length, 1);

  capture.setStorageFails(false, false);
  await capture.finish();
  assert.equal(capture.draft().steps.length, 1);
  assert.equal(capture.draft().screenshots.length, 0);
});

test("finish recovery preserves existing steps while rejecting pending steps over 200", async () => {
  const capture = await harness({ sessionFails: true, localFails: false, pendingEvents: [
    { kind: "click", at: 0, eventId: "older-pending", target: { tagName: "button" } },
    { kind: "click", at: 300, eventId: "over-limit-pending", target: { tagName: "button" } }
  ] });
  capture.session().events = Array.from({ length: 199 }, (_, index) => ({ kind: "click", at: index + 10, eventId: `existing:${index}`, target: { tagName: "button" } }));
  await assert.rejects(capture.finish());
  assert.equal(capture.journal().events.length, 200);
  assert.equal(capture.journal().events.some((event) => event.eventId === "older-pending"), true);
  assert.equal(capture.journal().events.some((event) => event.eventId === "over-limit-pending"), false);

  capture.setStorageFails(false, false);
  await capture.finish();
  assert.equal(capture.draft().steps.length, 200);
  assert.equal(capture.draft().steps.some((step) => step.eventId === "older-pending"), true);
  assert.equal(capture.draft().steps.some((step) => step.eventId === "over-limit-pending"), false);
});

test("failed reinjection remains visible when both persistence writes fail", async () => {
  const capture = await harness({ sessionFails: true, localFails: true, injectionFails: true });
  await capture.navigate();
  const status = await capture.status();
  assert.equal(status.phase, "reinjection_failed");
  assert.equal(status.recording, false);
});

test("durable reinjection failure marker clears after finish_failed is persisted", async () => {
  const capture = await harness({ mode: "tabletPortrait", draftPutFails: true, injectionFails: true });
  await capture.navigate();
  assert.equal((await capture.status()).phase, "reinjection_failed");

  await assert.rejects(capture.finish());
  assert.equal(capture.session().phase, "finish_failed");
  capture.setDraftPutFails(false);
  await capture.finish();
  assert.equal(capture.viewportApplied(), true);
});

for (const mode of ["smartphonePortrait", "tabletPortrait"]) {
  test(`${mode} retry restores its phase after a reinjection-related finish failure`, async () => {
    const capture = await harness({ mode, sessionFails: true, localFails: true, draftPutFails: true, injectionFails: true });
    await capture.navigate();
    assert.equal((await capture.status()).phase, "reinjection_failed");

    capture.setStorageFails(false, false);
    await assert.rejects(capture.finish());
    assert.equal(capture.session().phase, "finish_failed");
    assert.equal(capture.viewportApplied(), false);

    capture.setDraftPutFails(false);
    await capture.finish();
    assert.equal(capture.viewportApplied(), true);
    assert.equal(capture.draft().displayMode, mode);
    assert.equal(capture.session(), null);
  });
}

test("retained starting state exposes recovery and restore clears the session", async () => {
  const capture = await harness();
  capture.session().phase = "starting";
  capture.session().restorePending = false;
  assert.equal((await capture.status()).restorePending, true);
  assert.equal((await capture.restore()).restored, true);
  assert.equal(capture.session(), null);
});

test("failed live image read plus failed journal preserves drained edits in the retry session", async () => {
  const capture = await harness({ listFails: true });
  await assert.rejects(capture.finish());
  assert.equal(capture.session().phase, "finish_failed");
  assert.equal(capture.session().events[0].eventId, "document:1");
  assert.equal(capture.draft(), undefined);
});

test("rapid events keep the later event image explicitly unavailable", async () => {
  const capture = await harness();
  const first = await capture.event({ kind: "click", at: 10, eventId: "click:1", target: { tagName: "button" } });
  const second = await capture.event({ kind: "click", at: 11, eventId: "click:2", target: { tagName: "button" } });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(capture.session().stepImageRefs.find((ref) => ref.eventId === "click:2")?.status, "unavailable");
  assert.equal(capture.liveImages().length, 1);
});

test("event arriving during screenshot capture cannot receive the earlier screen", async () => {
  const capture = await harness({ screenshotDelayMs: 25 });
  const first = capture.event({ kind: "click", at: 10, eventId: "click:1", target: { tagName: "button" } });
  const second = capture.event({ kind: "click", at: 11, eventId: "click:2", target: { tagName: "button" } });
  await Promise.all([first, second]);
  assert.equal(capture.liveImages().length, 0);
  assert.equal(capture.session().stepImageRefs.map((ref) => ref.status).join(","), "unavailable,unavailable");
});

test("cancel clears live images without touching an existing draft", async () => {
  const capture = await harness();
  await capture.event({ kind: "click", at: 10, eventId: "click:1", target: { tagName: "button" } });
  assert.equal(capture.liveImages().length, 1);
  await capture.close();
  assert.equal(capture.liveImages().length, 0);
});

test("retry after restore failure preserves the already stored draft image", async () => {
  const capture = await harness({ mode: "smartphonePortrait", restoreSucceeds: false });
  await capture.event({ kind: "click", at: 10, eventId: "click:1", target: { tagName: "button" } });
  await capture.finish();
  assert.equal(capture.draft().screenshots.length, 1);
  await capture.finish();
  assert.equal(capture.draft().screenshots.length, 1);
  assert.equal(capture.draft().screenshots[0].dataUrl, "data:image/jpeg;base64,AA");
});

test("retry after restore failure preserves an edited draft with no image", async () => {
  const capture = await harness({ mode: "smartphonePortrait", restoreSucceeds: false, clearFails: true });
  capture.session().events = [{ kind: "click", at: 10, eventId: "click:1", label: "button" }];
  await capture.finish();
  capture.draft().title = "利用者が編集した手順書";
  await capture.finish();
  assert.equal(capture.draft().title, "利用者が編集した手順書");
  assert.equal(capture.draft().screenshots.length, 0);
});

test("live image read failure keeps the retry session instead of saving an empty draft", async () => {
  const capture = await harness({ listFails: true });
  await capture.event({ kind: "click", at: 10, eventId: "click:1", target: { tagName: "button" } });
  await assert.rejects(capture.finish());
  assert.equal(capture.session().phase, "finish_failed");
  assert.equal(capture.draft(), undefined);
  capture.setLiveReadFails(false);
  await capture.finish();
  assert.equal(capture.draft().screenshots.length, 1);
});

test("live image count failure keeps drained events in recovery without appending them", async () => {
  const capture = await harness({ countFails: true, localFails: false, pendingEvents: [{ kind: "click", at: 10, eventId: "count-failure:1", target: { tagName: "button" } }] });
  await assert.rejects(capture.finish());
  assert.equal(capture.session().events.length, 0);
  assert.equal(capture.journal().events.length, 0);
  capture.setLiveCountFails(false);
  await capture.finish();
  assert.equal(capture.draft().steps.length, 1);
  assert.equal(capture.draft().screenshots.length, 0);
});

test("pause does not drain recorder events while live image count is unknown", async () => {
  const capture = await harness({ countFails: true, localFails: false, pendingEvents: [{ kind: "click", at: 10, eventId: "pause-count-failure:1", target: { tagName: "button" } }] });
  await assert.rejects(capture.pause());
  assert.equal(capture.session().phase, "recording");
  capture.setLiveCountFails(false);
  await capture.pause();
  assert.equal(capture.session().phase, "paused");
  assert.equal(capture.session().events.length, 1);
});

test("ready live image remains authoritative when final session persistence fails", async () => {
  const capture = await harness({ pendingEvents: [], sessionFailsAfterLivePut: true });
  const existingEvents = Array.from({ length: 99 }, (_, index) => ({ kind: "click", at: index + 1, eventId: `existing:${index}`, target: { tagName: "button" } }));
  capture.session().events = existingEvents;
  capture.session().stepImageRefs = existingEvents.map((event) => ({ eventId: event.eventId, status: "ready" }));
  capture.seedLiveImages(existingEvents.map((event, index) => ({ id: `image:${index}`, dataUrl: "data:image/jpeg;base64,AA", status: "ready", eventId: event.eventId, sessionId: "capture-1" })));

  const first = await capture.event({ kind: "click", at: 100, eventId: "click:100", target: { tagName: "button" } });
  assert.equal(first.ok, false);
  assert.equal(capture.liveImages().length, 100);

  capture.setStorageFails(false, false);
  const blocked = await capture.event({ kind: "click", at: 101, eventId: "click:101", target: { tagName: "button" } });
  assert.equal(blocked.value.accepted, false);
  assert.equal(blocked.value.error, "CAPTURE_LIMIT_REACHED");
  assert.equal(capture.session().captureLimitReached, "images");

  await capture.finish();
  assert.equal(capture.draft().steps.length, 100);
  assert.equal(capture.draft().screenshots.length, 100);
});

test("capture stops before the 101st image and exposes the limit", async () => {
  const capture = await harness();
  for (let index = 0; index < 100; index += 1) {
    await capture.event({ kind: "click", at: index + 1, eventId: `click:${index}`, target: { tagName: "button" } });
  }
  capture.session().stepImageRefs = Array.from({ length: 100 }, (_, index) => ({ eventId: `click:${index}`, status: "ready" }));
  capture.seedLiveImages(Array.from({ length: 100 }, (_, index) => ({ id: `image:${index}`, dataUrl: "data:image/jpeg;base64,AA", status: "ready", eventId: `click:${index}`, sessionId: "capture-1" })));
  const blocked = await capture.event({ kind: "click", at: 101, eventId: "click:100", target: { tagName: "button" } });
  assert.equal(blocked.value.accepted, false);
  assert.equal(capture.session().phase, "paused");
  assert.equal(capture.session().captureLimitReached, "images");
  assert.equal(capture.session().events.length, 100);
  assert.equal((await capture.status()).captureLimitReached, "images");
});

test("capture stops before the 201st step and exposes the limit", async () => {
  const capture = await harness();
  capture.session().events = Array.from({ length: 200 }, (_, index) => ({ kind: "click", at: index + 1, eventId: `existing:${index}` }));
  const blocked = await capture.event({ kind: "click", at: 201, eventId: "click:200", target: { tagName: "button" } });
  assert.equal(blocked.value.accepted, false);
  assert.equal(capture.session().phase, "paused");
  assert.equal(capture.session().captureLimitReached, "steps");
  assert.equal(capture.session().events.length, 200);
});

test("an image-limited session can still save all 100 recorded images", async () => {
  const capture = await harness({ pendingEvents: [] });
  const events = Array.from({ length: 100 }, (_, index) => ({ kind: "click", at: index + 1, eventId: `click:${index}`, target: { tagName: "button" } }));
  capture.session().events = events;
  capture.session().stepImageRefs = events.map((event) => ({ eventId: event.eventId, status: "ready" }));
  capture.session().phase = "paused";
  capture.session().captureLimitReached = "images";
  capture.seedLiveImages(events.map((event, index) => ({ id: `image:${index}`, dataUrl: "data:image/jpeg;base64,AA", status: "ready", eventId: event.eventId, sessionId: "capture-1" })));
  const status = await capture.status();
  assert.equal(status.captureLimitReached, "images");
  assert.equal(status.events.length, 100);
  await capture.finish();
  assert.equal(capture.draft().steps.length, 100);
  assert.equal(capture.draft().screenshots.length, 100);
  assert.equal(capture.session(), null);
});

test("a step-limited session can still save all 200 recorded steps", async () => {
  const capture = await harness({ pendingEvents: [] });
  capture.session().events = Array.from({ length: 200 }, (_, index) => ({ kind: "click", at: index + 1, eventId: `existing:${index}` }));
  capture.session().phase = "paused";
  capture.session().captureLimitReached = "steps";
  await capture.finish();
  assert.equal(capture.draft().steps.length, 200);
  assert.equal(capture.draft().screenshots.length, 0);
  assert.equal(capture.session(), null);
});

test("failed and unavailable images do not consume the image cap before the 200-step limit", async () => {
  const capture = await harness({ pendingEvents: [] });
  for (let index = 0; index < 200; index += 1) {
    const response = await capture.event({ kind: "click", at: index + 1, eventId: `mixed:${index}`, target: { tagName: "button" } });
    assert.equal(response.value.accepted, true);
  }
  assert.equal(capture.session().events.length, 200);
  assert.equal(capture.session().stepImageRefs.filter((ref) => ref.status === "ready").length, 1);
  assert.equal((await capture.status()).captureLimitReached, undefined);
  await capture.finish();
  assert.equal(capture.draft().steps.length, 200);
});

test("an image-cap rejected pending event is not appended during finish", async () => {
  const capture = await harness();
  capture.session().events = Array.from({ length: 100 }, (_, index) => ({ kind: "click", at: index + 1, eventId: `ready:${index}` }));
  capture.session().stepImageRefs = Array.from({ length: 100 }, (_, index) => ({ eventId: `ready:${index}`, status: "ready" }));
  capture.seedLiveImages(Array.from({ length: 100 }, (_, index) => ({ id: `image:${index}`, dataUrl: "data:image/jpeg;base64,AA", status: "ready", eventId: `ready:${index}`, sessionId: "capture-1" })));
  const blocked = await capture.event({ kind: "click", at: 101, eventId: "rejected:101", target: { tagName: "button" } });
  assert.equal(blocked.value.accepted, false);
  assert.equal(capture.session().captureLimitReached, "images");
  const status = await capture.status();
  assert.equal(status.captureLimitReached, "images");
  assert.equal(status.events.length, 100);
  await capture.finish();
  assert.equal(capture.draft().steps.length, 100);
  assert.equal(capture.draft().steps.some((step) => step.eventId === "rejected:101"), false);
});

test("an over-limit pending event is discarded without blocking the capped draft save", async () => {
  const capture = await harness();
  capture.session().events = Array.from({ length: 200 }, (_, index) => ({ kind: "click", at: index + 1, eventId: `existing:${index}` }));
  capture.session().phase = "paused";
  capture.session().captureLimitReached = "steps";
  await capture.finish();
  assert.equal(capture.draft().steps.length, 200);
  assert.equal(capture.session(), null);
});

test("navigation honors the step and image limits before recording a new event", async () => {
  const stepLimited = await harness();
  stepLimited.session().events = Array.from({ length: 200 }, (_, index) => ({ kind: "click", at: index + 1, eventId: `existing:${index}` }));
  await stepLimited.navigate();
  assert.equal(stepLimited.session().captureLimitReached, "steps");
  assert.equal(stepLimited.session().events.length, 200);
  assert.deepEqual(stepLimited.injections, []);

  const imageLimited = await harness();
  imageLimited.session().stepImageRefs = Array.from({ length: 100 }, (_, index) => ({ eventId: `existing:${index}`, status: "ready" }));
  imageLimited.seedLiveImages(Array.from({ length: 100 }, (_, index) => ({ id: `image:${index}`, dataUrl: "data:image/jpeg;base64,AA", status: "ready", eventId: `existing:${index}`, sessionId: "capture-1" })));
  await imageLimited.navigate();
  assert.equal(imageLimited.session().captureLimitReached, "images");
  assert.equal(imageLimited.liveImages().length, 100);
  assert.deepEqual(imageLimited.injections, []);
});

test("closing the recording window clears recovery instead of attempting restoration", async () => {
  const capture = await harness({ localFails: false });
  await capture.close();
  assert.equal(capture.session(), null);
  assert.equal(capture.restoreCalls(), 0);
});
