import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { mergeCaptureEvents } from "../apps/extension/background/event-merge.js";
import { nextRecoveryJournal } from "../apps/extension/background/recovery-journal.js";
import { normalizeCaptureEvent } from "../apps/extension/capture/privacy.js";
import { VIEWPORTS } from "../apps/extension/responsive/viewports.js";

const source = (await readFile(new URL("../apps/extension/background/service-worker.js", import.meta.url), "utf8")).replace(/^import .*;\r?$/gm, "");

async function harness({ screenshotFails = false, draftPutFails = false, initialDraft, localFails = true, sessionFails = false, sessionRemoveFails = false, localRemoveFails = false, sessionFailsAfterLivePut = false, injectionFails = false, mode = "pc", restoreSucceeds = true, windowExists = false, clearFails = false, listFails = false, countFails = false, failBothAfterStop = false, releaseFails = false, releaseMissingAck = false, releaseEmptyResults = false, retainFails = false, retainMissingAck = false, retainEmptyResults = false, retainMissingEvents = false, retainFailsAfter = 0, screenshotDelayMs = 0, screenshotError = "SCREENSHOT_MASK_FAILED", privacyReview, sceneValid = true, currentTarget = null, livePutFails = false, virtualTime = true, pendingEvents = [{ kind: "input", at: 2, eventId: "document:1", target: { tagName: "input" } }] } = {}) {
  let clock = 1000;
  let lastCaptureAt;
  const screenshotTimes = [];
  class CaptureDate extends Date { static now() { return virtualTime ? clock : Date.now(); } }
  let session = { id: "capture-1", tabId: 1, windowId: 2, mode, phase: "recording", events: [], startedAt: 1 };
  let journal;
  let drained = false;
  let retainedPendingEvents = null;
  let draft = initialDraft;
  let restoreCalls = 0;
  let viewportApplied = false;
  let liveEntries = [];
  let screenshotFailure = screenshotFails;
  let injectionFailure = injectionFails;
  let draftPutFailure = draftPutFails;
  let restoreSuccess = restoreSucceeds;
  let liveStoreReadFailure = listFails;
  let liveStoreCountFailure = countFails;
  let recorderStopCalls = 0;
  let recorderReleaseCalls = 0;
  let sessionStorageFailure = sessionFails;
  let sessionRemoveFailure = sessionRemoveFails;
  let failSessionAfterLivePut = sessionFailsAfterLivePut;
  let recorderReleaseFailure = releaseFails;
  let recorderReleaseEmptyResults = releaseEmptyResults;
  let recorderRetainFailure = retainFails;
  let recorderRetainFailureAfter = retainFailsAfter;
  let recorderRetainMissingAck = retainMissingAck;
  let recorderRetainEmptyResults = retainEmptyResults;
  let recorderRetainMissingEvents = retainMissingEvents;
  let recorderReleaseMissingAck = releaseMissingAck;
  let localStorageFailure = localFails;
  let localRemoveFailure = localRemoveFails;
  let onRemoved;
  let onUpdated;
  let onMessage;
  const injections = [];
  let context;
  const createContext = () => ({
    crypto, Date: CaptureDate, Promise, setTimeout: (callback, ms) => { if (virtualTime) clock += ms; return setTimeout(callback, virtualTime ? 0 : ms); }, clearTimeout, VIEWPORTS, CLOUD_CLAIM_MAX_ASSETS: 100, mergeCaptureEvents, nextRecoveryJournal, normalizeCaptureEvent,
    installSensitiveMasks() {}, removeSensitiveMasks() {}, verifySensitiveMasks() {},
    captureWithMaskBoundary: async (options) => { if (screenshotFailure) throw new Error(screenshotError); const dataUrl = await options.capture(); return privacyReview ? { dataUrl, privacyReview } : dataUrl; },
    applyResponsiveViewport: async () => { viewportApplied = true; },
    draftStore: { get: async (id) => (draft?.id === id ? draft : undefined), put: async (value) => { if (draftPutFailure) throw new Error("draft unavailable"); draft = value; } },
    recoverWindowSession: async () => { restoreCalls++; return { restored: restoreSuccess }; },
    importedCaptureLiveStore: {
      available: true,
      put: async (entry) => { if (livePutFails) throw new Error("storage unavailable"); liveEntries = [...liveEntries.filter((current) => current.eventId !== entry.eventId || current.sessionId !== entry.sessionId), entry]; if (failSessionAfterLivePut) sessionStorageFailure = true; },
      list: async (sessionId) => { if (liveStoreReadFailure) throw new Error("capture live read unavailable"); return liveEntries.filter((entry) => entry.sessionId === sessionId); },
      count: async (sessionId) => { if (liveStoreCountFailure) throw new Error("capture live count unavailable"); return liveEntries.filter((entry) => entry.sessionId === sessionId && ["ready", "protected"].includes(entry.status) && entry.dataUrl).length; },
      clear: async (sessionId) => {
        if (clearFails) throw new Error("capture live cleanup unavailable");
        liveEntries = liveEntries.filter((entry) => entry.sessionId !== sessionId);
      }
    },
    chrome: {
      storage: {
        session: { get: async () => ({ activeCaptureSession: session, captureScreenshotAt: lastCaptureAt }), set: async (value) => { if (sessionStorageFailure) throw new Error("session unavailable"); if ("captureScreenshotAt" in value) lastCaptureAt = value.captureScreenshotAt; else session = value.activeCaptureSession; }, remove: async () => { if (sessionRemoveFailure) throw new Error("session remove unavailable"); session = null; } },
        local: { get: async () => ({ captureRecoveryJournal: journal }), set: async (value) => { if (localStorageFailure) throw new Error("local storage unavailable"); journal = value.captureRecoveryJournal; }, remove: async () => { if (localRemoveFailure) throw new Error("local remove unavailable"); journal = null; } }
      },
      scripting: { executeScript: async (options) => { if (options.func?.toString().includes("click-target")) return [{ result: currentTarget }]; if (options.func?.name === "removeSensitiveMasks") return [{ result: true }]; if (options.func?.name === "screenshotSceneLease") return [{ result: options.args[0] === "begin" || sceneValid }]; if (options.files) { injections.push(...options.files); if (injectionFailure) throw new Error("injection denied"); return []; } recorderStopCalls += 1; const command = options.args?.[0] || "drain"; if (command === "retain") { if (recorderRetainFailure || (recorderRetainFailureAfter > 0 && recorderStopCalls > recorderRetainFailureAfter)) throw new Error("recorder retain unavailable"); if (recorderRetainEmptyResults) return []; if (recorderRetainMissingAck) return [{ result: { events: [] } }]; if (recorderRetainMissingEvents) return [{ result: { retainAck: true } }]; if (!retainedPendingEvents && !drained) retainedPendingEvents = pendingEvents.slice(); drained = true; if (failBothAfterStop && recorderStopCalls === 1) { sessionStorageFailure = true; localStorageFailure = true; } return [{ result: { retainAck: true, recorderPresent: true, events: (retainedPendingEvents || []).slice() } }]; } if (command === "release") { recorderReleaseCalls += 1; if (recorderReleaseFailure) throw new Error("recorder release unavailable"); if (recorderReleaseMissingAck) return [{ result: { releaseAck: false } }]; if (recorderReleaseEmptyResults) return []; retainedPendingEvents = null; return [{ result: { releaseAck: true, result: [] } }]; } const result = retainedPendingEvents ? retainedPendingEvents.slice() : (drained ? [] : pendingEvents); retainedPendingEvents = null; drained = true; return [{ result }]; } },
      runtime: { onMessage: { addListener(callback) { onMessage = callback; } } },
      tabs: { get: async () => ({ active: true, windowId: 2 }), captureVisibleTab: async () => { screenshotTimes.push(CaptureDate.now()); if (screenshotDelayMs) await new Promise((resolve) => setTimeout(resolve, screenshotDelayMs)); return "data:image/jpeg;base64,AA"; }, onUpdated: { addListener(callback) { onUpdated = callback; } }, onRemoved: { addListener(callback) { onRemoved = callback; } }, query: async () => windowExists ? [{ id: 2 }] : [] },
      windows: { get: async () => { if (windowExists) return {}; throw new Error("window is gone"); } }
    }
  });
  const restart = async () => {
    context = createContext();
    vm.runInNewContext(source + "\nglobalThis.start = startCapture; globalThis.finish = finishCapture; globalThis.pause = pauseCapture; globalThis.resume = resumeCapture; globalThis.cancel = cancelCapture; globalThis.settle = () => sessionOperation; globalThis.status = captureStatus; globalThis.restore = retryRestore;", context);
    await context.settle();
  };
  await restart();
  return { start: () => context.start(1, "pc"), recorderReleaseCalls: () => recorderReleaseCalls, finish: () => context.finish(), pause: () => context.pause(), resume: () => context.resume(1), cancel: () => context.cancel(), session: () => session, draft: () => draft, restoreCalls: () => restoreCalls, recorderStopCalls: () => recorderStopCalls,
    journal: () => journal,
    injections, screenshotTimes, setLivePutFails: (value) => { livePutFails = value; }, status: () => context.status(), restore: () => context.restore(), restart,
    setScreenshotFails: (value) => { screenshotFailure = value; }, setDraftPutFails: (value) => { draftPutFailure = value; }, setRestoreSucceeds: (value) => { restoreSuccess = value; }, setWindowExists: (value) => { windowExists = value; }, setLiveCleanupFails: (value) => { clearFails = value; }, setLiveReadFails: (value) => { liveStoreReadFailure = value; }, setLiveCountFails: (value) => { liveStoreCountFailure = value; }, setReleaseOutcome: (fails, missingAck = false, emptyResults = false) => { recorderReleaseFailure = fails; recorderReleaseMissingAck = missingAck; recorderReleaseEmptyResults = emptyResults; }, setRetainOutcome: (fails, missingAck = false, emptyResults = false, missingEvents = false, failureAfter = 0) => { recorderRetainFailure = fails; recorderRetainMissingAck = missingAck; recorderRetainEmptyResults = emptyResults; recorderRetainMissingEvents = missingEvents; recorderRetainFailureAfter = failureAfter; }, setInjectionFails: (value) => { injectionFailure = value; }, seedLiveImages: (entries) => { liveEntries = entries; }, liveImages: () => liveEntries,
    setStorageFails: (sessionValue, localValue) => {
      sessionStorageFailure = sessionValue;
      localStorageFailure = localValue;
    }, setStorageRemoveFails: (sessionValue, localValue) => {
      sessionRemoveFailure = sessionValue;
      localRemoveFailure = localValue;
    }, dropSession: () => { session = null; }, viewportApplied: () => viewportApplied,
    finishQueued: async () => new Promise((resolve) => onMessage({ type: "capture:finish" }, {}, resolve)),
    navigate: async (status = "complete") => { onUpdated(1, { status }); await context.settle(); },
    event: async (event) => new Promise((resolve) => onMessage({ type: "capture:event", event }, { tab: { id: 1 } }, async (response) => { await context.settle(); resolve(response); })),
    close: async (isWindowClosing = true) => { session.mode = "tabletPortrait"; onRemoved(1, { isWindowClosing }); await context.settle(); } };
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

test("resume does not release after inject failure when catch retain is unconfirmed", async () => {
  const capture = await harness({ localFails: false, sessionFails: false, injectionFails: true, retainFailsAfter: 1, pendingEvents: [{ kind: "click", at: 10, eventId: "retain-catch-failure:pending", target: { tagName: "button" } }] });
  capture.session().phase = "paused";
  await assert.rejects(capture.resume());
  assert.equal((await capture.status()).phase, "reinjection_failed");
  assert.equal(capture.recorderReleaseCalls(), 1);
});
test("resume rejects unconfirmed retain without releasing or injecting, then retries", async () => {
  for (const outcome of ["throw", "empty", "missing-ack", "missing-events"]) {
    const capture = await harness({ localFails: false, sessionFails: false, retainFails: outcome === "throw", retainEmptyResults: outcome === "empty", retainMissingAck: outcome === "missing-ack", retainMissingEvents: outcome === "missing-events", pendingEvents: [{ kind: "click", at: 10, eventId: `retain-resume-${outcome}:pending`, target: { tagName: "button" } }] });
    capture.session().phase = "paused";
    await assert.rejects(capture.resume());
    assert.equal((await capture.status()).phase, "reinjection_failed");
    assert.equal(capture.recorderReleaseCalls(), 0);
    capture.setRetainOutcome(false, false, false, false);
    assert.equal((await capture.resume()).resumed, true);
    await capture.finish();
    assert.equal(capture.draft().steps.some((step) => step.eventId === `retain-resume-${outcome}:pending`), true);
  }
});

test("pause rejects unconfirmed retain without releasing or dropping pending events", async () => {
  for (const outcome of ["throw", "empty", "missing-ack", "missing-events"]) {
    const capture = await harness({ localFails: false, sessionFails: false, retainFails: outcome === "throw", retainEmptyResults: outcome === "empty", retainMissingAck: outcome === "missing-ack", retainMissingEvents: outcome === "missing-events", pendingEvents: [{ kind: "click", at: 10, eventId: `retain-pause-${outcome}:pending`, target: { tagName: "button" } }] });
    await assert.rejects(capture.pause());
    assert.equal((await capture.status()).phase, "paused");
    assert.equal(capture.recorderReleaseCalls(), 0);
    capture.setRetainOutcome(false, false, false, false);
    await capture.finish();
    assert.equal(capture.draft().steps.some((step) => step.eventId === `retain-pause-${outcome}:pending`), true);
  }
});

test("finish rejects unconfirmed retain without releasing or saving an empty draft", async () => {
  for (const outcome of ["throw", "empty", "missing-ack", "missing-events"]) {
    const capture = await harness({ localFails: false, sessionFails: false, retainFails: outcome === "throw", retainEmptyResults: outcome === "empty", retainMissingAck: outcome === "missing-ack", retainMissingEvents: outcome === "missing-events", pendingEvents: [{ kind: "click", at: 10, eventId: `retain-finish-${outcome}:pending`, target: { tagName: "button" } }] });
    await assert.rejects(capture.finish());
    assert.equal((await capture.status()).phase, "finish_failed");
    assert.equal(capture.draft(), undefined);
    assert.equal(capture.recorderReleaseCalls(), 0);
    capture.setRetainOutcome(false, false, false, false);
    await capture.finish();
    assert.equal(capture.draft().steps.some((step) => step.eventId === `retain-finish-${outcome}:pending`), true);
  }
});
test("resume retains pending events when persistence fails before reinjection", async () => {
  for (const [label, storage] of [["journal", { localFails: true, sessionFails: false }], ["session", { localFails: false, sessionFails: true }], ["both", { localFails: true, sessionFails: true }]]) {
    const capture = await harness({ ...storage, pendingEvents: [{ kind: "click", at: 10, eventId: `resume-${label}:pending`, target: { tagName: "button" } }] });
    capture.session().phase = "paused";
    await assert.rejects(capture.resume());
    const failed = await capture.status();
    assert.equal(failed.phase, "reinjection_failed");
    assert.equal(failed.events.some((event) => event.eventId === `resume-${label}:pending`), true);
    assert.equal(capture.recorderStopCalls(), label === "both" ? 2 : 3);
    capture.setStorageFails(false, false);
    assert.equal((await capture.resume()).resumed, true);
    assert.equal((await capture.status()).phase, "recording");
  }
});

test("resume rejects when recorder release is not confirmed and retries cleanly", async () => {
  for (const outcome of ["throw", "missing-ack", "empty"]) {
    const capture = await harness({ localFails: false, sessionFails: false, releaseFails: outcome === "throw", releaseMissingAck: outcome === "missing-ack", releaseEmptyResults: outcome === "empty", pendingEvents: [{ kind: "click", at: 10, eventId: `release-${outcome}:pending`, target: { tagName: "button" } }] });
    capture.session().phase = "paused";
    await assert.rejects(capture.resume());
    const failed = await capture.status();
    assert.equal(failed.phase, "reinjection_failed");
    assert.equal(failed.events.some((event) => event.eventId === `release-${outcome}:pending`), true);
    capture.setReleaseOutcome(false, false);
    assert.equal((await capture.resume()).resumed, true);
    assert.equal((await capture.status()).phase, "recording");
  }
});

test("pause release failure keeps the retained batch for finish recovery", async () => {
  const capture = await harness({ localFails: false, sessionFails: false, releaseFails: true, pendingEvents: [{ kind: "click", at: 10, eventId: "pause-release-failure:pending", target: { tagName: "button" } }] });
  await assert.rejects(capture.pause());
  assert.equal((await capture.status()).phase, "paused");
  capture.setReleaseOutcome(false, false);
  await capture.finish();
  assert.equal(capture.draft().steps.some((step) => step.eventId === "pause-release-failure:pending"), true);
});

test("finish release failure keeps a retryable session and draft data", async () => {
  const capture = await harness({ localFails: false, sessionFails: false, releaseFails: true });
  await assert.rejects(capture.finish());
  assert.equal((await capture.status()).phase, "finish_failed");
  assert.equal(capture.draft().steps.length, 1);
  capture.setReleaseOutcome(false, false);
  await capture.finish();
  assert.equal(capture.session(), null);
  assert.equal(capture.draft().steps.length, 1);
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

test("rapid sequential events wait for a safe capture slot rather than losing the later image", async () => {
  const capture = await harness();
  const first = await capture.event({ kind: "click", at: 10, eventId: "click:1", target: { tagName: "button" } });
  const second = await capture.event({ kind: "click", at: 11, eventId: "click:2", target: { tagName: "button" } });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(capture.session().stepImageRefs.find((ref) => ref.eventId === "click:2")?.status, "ready");
  assert.equal(capture.liveImages().length, 2);
  assert.ok(capture.screenshotTimes[1] - capture.screenshotTimes[0] >= 500);
});

test("event arriving during screenshot capture cannot receive the earlier screen", async () => {
  const capture = await harness({ screenshotDelayMs: 25 });
  const first = capture.event({ kind: "click", at: 10, eventId: "click:1", target: { tagName: "button" } });
  const second = capture.event({ kind: "click", at: 11, eventId: "click:2", target: { tagName: "button" } });
  await Promise.all([first, second]);
  assert.equal(capture.liveImages().filter((entry) => entry.dataUrl).length, 1);
  assert.equal(capture.liveImages().find((entry) => entry.dataUrl).eventId, "click:2");
  assert.equal(capture.session().stepImageRefs.map((ref) => ref.status).join(","), "unavailable,ready");
  assert.equal(capture.session().stepImageRefs[0].reason, "screen_changed");
});

test("cancel clears live images without touching an existing draft", async () => {
  const capture = await harness({ initialDraft: { id: "existing-draft", title: "edited draft", description: "", screenshots: [], steps: [] } });
  await capture.event({ kind: "click", at: 10, eventId: "click:1", target: { tagName: "button" } });
  assert.equal(capture.liveImages().length, 1);
  await capture.cancel();
  assert.equal(capture.liveImages().length, 0);
  assert.equal(capture.session(), null);
  assert.equal(capture.draft().title, "edited draft");
});

test("cancel cleanup failure keeps a retryable session until the live images are removed", async () => {
  const capture = await harness({ clearFails: true, localFails: false, pendingEvents: [] });
  await capture.event({ kind: "click", at: 10, eventId: "cancel-failure:1", target: { tagName: "button" } });
  await assert.rejects(capture.cancel());
  assert.equal((await capture.status()).phase, "cancel_failed");
  assert.equal(capture.journal().phase, "cancel_failed");
  assert.equal(capture.liveImages().length, 1);
  capture.setLiveCleanupFails(false);
  await capture.cancel();
  assert.equal(capture.liveImages().length, 0);
  assert.equal(capture.session(), null);
});

test("cancel intent survives when only the recovery journal can be written", async () => {
  const capture = await harness({ sessionFails: true, clearFails: true, localFails: false, pendingEvents: [] });
  await capture.event({ kind: "click", at: 10, eventId: "journal-only-cancel-failure:1", target: { tagName: "button" } });
  await assert.rejects(capture.cancel());
  const status = await capture.status();
  assert.equal(status.phase, "cancel_failed");
  assert.equal(status.finishFailed, false);
  assert.equal(capture.journal().phase, "cancel_failed");
  await assert.rejects(capture.finish());
  capture.setStorageFails(false, false);
  capture.setLiveCleanupFails(false);
  await capture.cancel();
  assert.equal(capture.session(), null);
});

test("responsive cancel cleanup failure retries restoration before cleanup", async () => {
  const capture = await harness({ mode: "smartphonePortrait", restoreSucceeds: false, clearFails: true, windowExists: true, localFails: false, pendingEvents: [] });
  await capture.event({ kind: "click", at: 10, eventId: "responsive-cancel-failure:1", target: { tagName: "button" } });
  await assert.rejects(capture.cancel());
  assert.equal((await capture.status()).phase, "cancel_failed");
  assert.equal((await capture.status()).restorePending, true);
  capture.setRestoreSucceeds(true);
  capture.setLiveCleanupFails(false);
  await capture.cancel();
  assert.equal(capture.restoreCalls() >= 2, true);
  assert.equal(capture.liveImages().length, 0);
  assert.equal(capture.session(), null);
});

test("cancel restoration failure keeps cancel intent even after image cleanup succeeds", async () => {
  const capture = await harness({ mode: "smartphonePortrait", restoreSucceeds: false, windowExists: true, localFails: false, pendingEvents: [] });
  await capture.event({ kind: "click", at: 10, eventId: "responsive-cancel-restore-failure:1", target: { tagName: "button" } });
  await assert.rejects(capture.cancel());
  const status = await capture.status();
  assert.equal(status.phase, "cancel_failed");
  assert.equal(status.restorePending, true);
  assert.equal(capture.liveImages().length, 0);
  capture.setRestoreSucceeds(true);
  await capture.cancel();
  assert.equal(capture.session(), null);
});

test("window close cleanup failure keeps the session for a later cancel retry", async () => {
  const capture = await harness({ clearFails: true, localFails: false, pendingEvents: [] });
  await capture.event({ kind: "click", at: 10, eventId: "window-close-failure:1", target: { tagName: "button" } });
  await capture.close();
  assert.equal((await capture.status()).phase, "cancel_failed");
  assert.equal((await capture.status()).restorePending, false);
  assert.equal(capture.liveImages().length, 1);
  capture.setLiveCleanupFails(false);
  await capture.cancel();
  assert.equal(capture.liveImages().length, 0);
  assert.equal(capture.session(), null);
});

test("tab close with a remaining window preserves cleanup failure for cancel retry", async () => {
  const capture = await harness({ mode: "smartphonePortrait", restoreSucceeds: false, clearFails: true, windowExists: true, localFails: false, pendingEvents: [] });
  await capture.event({ kind: "click", at: 10, eventId: "tab-close-failure:1", target: { tagName: "button" } });
  await capture.close(false);
  assert.equal((await capture.status()).phase, "cancel_failed");
  assert.equal(capture.liveImages().length, 1);
  capture.setRestoreSucceeds(true);
  capture.setLiveCleanupFails(false);
  await capture.cancel();
  assert.equal(capture.liveImages().length, 0);
  assert.equal(capture.session(), null);
});

test("cancel retry skips stale restoration when the window disappeared", async () => {
  const capture = await harness({ mode: "smartphonePortrait", restoreSucceeds: false, clearFails: true, windowExists: true, localFails: false, pendingEvents: [] });
  await capture.event({ kind: "click", at: 10, eventId: "tab-close-window-gone:1", target: { tagName: "button" } });
  await capture.close(false);
  assert.equal((await capture.status()).phase, "cancel_failed");
  assert.equal((await capture.status()).restorePending, true);
  const restoreCallsBeforeRetry = capture.restoreCalls();
  capture.setWindowExists(false);
  capture.setLiveCleanupFails(false);
  await capture.cancel();
  assert.equal(capture.restoreCalls(), restoreCallsBeforeRetry);
  assert.equal(capture.session(), null);
});

test("cancel_failed survives worker restart and never returns to finish", async () => {
  const capture = await harness({ clearFails: true, sessionFails: true, localFails: false, pendingEvents: [] });
  await capture.event({ kind: "click", at: 10, eventId: "cancel-restart:1", target: { tagName: "button" } });
  await assert.rejects(capture.cancel());
  capture.session().phase = "finish_failed";
  capture.session().finishFailed = true;
  await capture.restart();
  const restarted = await capture.status();
  assert.equal(restarted.phase, "cancel_failed");
  assert.equal(restarted.finishFailed, false);
  await assert.rejects(capture.finish());
  capture.setStorageFails(false, false);
  capture.setLiveCleanupFails(false);
  await capture.cancel();
  assert.equal(capture.liveImages().length, 0);
  assert.equal(capture.session(), null);
});

test("journal-only responsive cancel retries restoration after worker restart", async () => {
  const capture = await harness({ mode: "smartphonePortrait", restoreSucceeds: false, windowExists: true, clearFails: true, sessionFails: true, localFails: false, pendingEvents: [] });
  await capture.event({ kind: "click", at: 10, eventId: "responsive-cancel-journal-only:1", target: { tagName: "button" } });
  await assert.rejects(capture.cancel());
  await capture.restart();
  const restarted = await capture.status();
  assert.equal(restarted.phase, "cancel_failed");
  assert.equal(restarted.restorePending, false);
  const restoreCallsBeforeRetry = capture.restoreCalls();
  capture.setRestoreSucceeds(true);
  capture.setStorageFails(false, false);
  capture.setLiveCleanupFails(false);
  await capture.cancel();
  assert.equal(capture.restoreCalls() > restoreCallsBeforeRetry, true);
  assert.equal(capture.session(), null);
});

test("browser restart rebuilds cancel_failed from the local journal without restoring the old tab", async () => {
  const existingDraft = { id: "unrelated-draft", screenshots: [{ id: "draft-image", dataUrl: "data:image/jpeg;base64,draft" }] };
  const capture = await harness({ clearFails: true, localFails: false, initialDraft: existingDraft, pendingEvents: [] });
  capture.seedLiveImages([{ id: "orphan-image", sessionId: "capture-1", eventId: "browser-restart:1", status: "ready", dataUrl: "data:image/jpeg;base64,orphan" }]);
  await assert.rejects(capture.cancel());
  assert.equal(capture.journal().phase, "cancel_failed");
  capture.dropSession();
  await capture.restart();
  assert.equal((await capture.status()).phase, "cancel_failed");
  await assert.rejects(capture.start());
  await assert.rejects(capture.finish());
  await assert.rejects(capture.resume());
  capture.setLiveCleanupFails(false);
  await capture.cancel();
  assert.equal(capture.restoreCalls(), 0);
  assert.equal(capture.liveImages().length, 0);
  assert.equal(capture.journal(), null);
  assert.equal(capture.session(), null);
  assert.equal(capture.draft(), existingDraft);
});

test("cancel cleanup retries after journal or session removal failure", async () => {
  const capture = await harness({ localFails: false, pendingEvents: [] });
  await capture.event({ kind: "click", at: 10, eventId: "cancel-remove-failure:1", target: { tagName: "button" } });
  capture.setStorageRemoveFails(false, true);
  await assert.rejects(capture.cancel());
  assert.equal((await capture.status()).phase, "cancel_failed");
  capture.setStorageRemoveFails(true, false);
  await assert.rejects(capture.cancel());
  assert.equal((await capture.status()).phase, "cancel_failed");
  capture.setStorageRemoveFails(false, false);
  await capture.cancel();
  assert.equal(capture.session(), null);
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
  await assert.rejects(capture.finish());
  capture.setLiveCleanupFails(false);
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

test("pause establishes a retryable paused intent when either persistence store fails", async () => {
  const journalFailure = await harness({ localFails: true, sessionFails: false, pendingEvents: [{ kind: "click", at: 10, eventId: "pause-journal-failure:1", target: { tagName: "button" } }] });
  await journalFailure.pause();
  assert.equal((await journalFailure.status()).phase, "paused");
  assert.equal((await journalFailure.status()).events.length, 1);
  assert.equal(journalFailure.recorderStopCalls(), 2);

  const sessionFailure = await harness({ localFails: false, sessionFails: true, pendingEvents: [{ kind: "click", at: 10, eventId: "pause-session-failure:1", target: { tagName: "button" } }] });
  await sessionFailure.pause();
  assert.equal((await sessionFailure.status()).phase, "paused");
  assert.equal((await sessionFailure.status()).events.length, 1);
  assert.equal(sessionFailure.recorderStopCalls(), 2);
});

test("pause refuses to stop the recorder when both persistence stores fail", async () => {
  const capture = await harness({ localFails: true, sessionFails: true, pendingEvents: [{ kind: "click", at: 10, eventId: "pause-both-failure:1", target: { tagName: "button" } }] });
  await assert.rejects(capture.pause());
  assert.equal(capture.recorderStopCalls(), 0);
  assert.equal(capture.session().phase, "recording");
});

test("pause keeps the pure-merged drained events in the existing fallback when final persistence fails", async () => {
  const capture = await harness({ localFails: false, sessionFails: false, failBothAfterStop: true, pendingEvents: [{ kind: "click", at: 10, eventId: "pause-final-failure:1", target: { tagName: "button" } }] });
  await assert.rejects(capture.pause());
  assert.equal((await capture.status()).phase, "paused");
  assert.equal((await capture.status()).events.length, 1);
  capture.setStorageFails(false, false);
  await capture.finish();
  assert.equal(capture.draft().steps.length, 1);
});

test("pause retained events survive a worker restart until finish saves them", async () => {
  const capture = await harness({ localFails: false, sessionFails: false, failBothAfterStop: true, pendingEvents: [{ kind: "click", at: 10, eventId: "pause-worker-restart:1", target: { tagName: "button" } }] });
  await assert.rejects(capture.pause());
  await capture.restart();
  assert.equal((await capture.status()).phase, "paused");
  capture.setStorageFails(false, false);
  await capture.finish();
  assert.equal(capture.draft().steps.some((step) => step.eventId === "pause-worker-restart:1"), true);
});

test("pause retained events survive a worker restart until resume releases them", async () => {
  const capture = await harness({ localFails: false, sessionFails: false, failBothAfterStop: true, pendingEvents: [{ kind: "click", at: 10, eventId: "pause-worker-restart-resume:1", target: { tagName: "button" } }] });
  await assert.rejects(capture.pause());
  await capture.restart();
  assert.equal((await capture.status()).phase, "paused");
  capture.setStorageFails(false, false);
  assert.equal((await capture.resume()).resumed, true);
  assert.equal((await capture.status()).events.some((event) => event.eventId === "pause-worker-restart-resume:1"), true);
});
test("pause at the image cap stops the recorder and drops pending events", async () => {
  const capture = await harness({ pendingEvents: [{ kind: "click", at: 101, eventId: "pause-image-cap:pending", target: { tagName: "button" } }] });
  const events = Array.from({ length: 100 }, (_, index) => ({ kind: "click", at: index + 1, eventId: `pause-image-cap:${index}`, target: { tagName: "button" } }));
  capture.session().events = events;
  capture.session().stepImageRefs = events.map((event) => ({ eventId: event.eventId, status: "ready" }));
  capture.seedLiveImages(events.map((event, index) => ({ id: `pause-image:${index}`, dataUrl: "data:image/jpeg;base64,AA", status: "ready", eventId: event.eventId, sessionId: "capture-1" })));
  await capture.pause();
  const status = await capture.status();
  assert.equal(status.captureLimitReached, "images");
  assert.equal(status.events.length, 100);
  assert.equal(capture.recorderStopCalls(), 2);
});

test("journal-only image limit rejects resume after session persistence fails", async () => {
  const capture = await harness({ localFails: false, sessionFails: true, pendingEvents: [] });
  const events = Array.from({ length: 100 }, (_, index) => ({ kind: "click", at: index + 1, eventId: `journal-image-cap:${index}`, target: { tagName: "button" } }));
  capture.session().events = events;
  capture.session().stepImageRefs = events.map((event) => ({ eventId: event.eventId, status: "ready" }));
  capture.seedLiveImages(events.map((event, index) => ({ id: `journal-image:${index}`, dataUrl: "data:image/jpeg;base64,AA", status: "ready", eventId: event.eventId, sessionId: "capture-1" })));
  const response = await capture.event({ kind: "click", at: 101, eventId: "journal-image-cap:pending", target: { tagName: "button" } });
  assert.equal(response.value.accepted, false);
  assert.equal((await capture.status()).captureLimitReached, "images");
  await assert.rejects(capture.resume());
  assert.equal(capture.journal().captureLimitReached, "images");
});

test("image limit refuses to stop the recorder when both persistence stores fail", async () => {
  const capture = await harness({ localFails: true, sessionFails: true, pendingEvents: [] });
  const events = Array.from({ length: 100 }, (_, index) => ({ kind: "click", at: index + 1, eventId: `blocked-image-cap:${index}`, target: { tagName: "button" } }));
  capture.session().events = events;
  capture.session().stepImageRefs = events.map((event) => ({ eventId: event.eventId, status: "ready" }));
  capture.seedLiveImages(events.map((event, index) => ({ id: `blocked-image:${index}`, dataUrl: "data:image/jpeg;base64,AA", status: "ready", eventId: event.eventId, sessionId: "capture-1" })));
  const response = await capture.event({ kind: "click", at: 101, eventId: "blocked-image-cap:pending", target: { tagName: "button" } });
  assert.equal(response.ok, false);
  assert.equal(capture.recorderStopCalls(), 0);
  assert.equal(capture.session().phase, "recording");
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
  assert.equal(capture.recorderStopCalls(), 1);
});

test("capture stops before the 201st step and exposes the limit", async () => {
  const capture = await harness();
  capture.session().events = Array.from({ length: 200 }, (_, index) => ({ kind: "click", at: index + 1, eventId: `existing:${index}` }));
  const blocked = await capture.event({ kind: "click", at: 201, eventId: "click:200", target: { tagName: "button" } });
  assert.equal(blocked.value.accepted, false);
  assert.equal(capture.session().phase, "paused");
  assert.equal(capture.session().captureLimitReached, "steps");
  assert.equal(capture.session().events.length, 200);
  assert.equal(capture.recorderStopCalls(), 1);
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
  assert.equal(capture.recorderStopCalls(), 2);
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
    if (index === 1) capture.setScreenshotFails(true);
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
  assert.equal(stepLimited.recorderStopCalls(), 1);

  const imageLimited = await harness();
  imageLimited.session().stepImageRefs = Array.from({ length: 100 }, (_, index) => ({ eventId: `existing:${index}`, status: "ready" }));
  imageLimited.seedLiveImages(Array.from({ length: 100 }, (_, index) => ({ id: `image:${index}`, dataUrl: "data:image/jpeg;base64,AA", status: "ready", eventId: `existing:${index}`, sessionId: "capture-1" })));
  await imageLimited.navigate();
  assert.equal(imageLimited.session().captureLimitReached, "images");
  assert.equal(imageLimited.liveImages().length, 100);
  assert.deepEqual(imageLimited.injections, []);
  assert.equal(imageLimited.recorderStopCalls(), 1);
});

test("closing the recording window clears recovery instead of attempting restoration", async () => {
  const capture = await harness({ localFails: false });
  await capture.close();
  assert.equal(capture.session(), null);
  assert.equal(capture.restoreCalls(), 0);
});

test("a burst coalesces only image work and keeps every operation with an explicit reason", async () => {
  const capture = await harness({ pendingEvents: [] });
  await Promise.all(Array.from({ length: 20 }, (_, index) => capture.event({ kind: "click", at: index + 1, eventId: `burst:${index}`, target: { tagName: "button" } })));
  assert.equal(capture.session().events.length, 20);
  assert.equal(capture.screenshotTimes.length, 1);
  assert.equal(capture.liveImages().find((entry) => entry.dataUrl).eventId, "burst:19");
  await capture.finish();
  assert.equal(capture.draft().steps.length, 20);
  assert.equal(capture.draft().steps.filter((step) => step.imageState.reason === "screen_changed").length, 19);
  assert.equal(capture.draft().steps.at(-1).imageState.status, "ready");
});

test("three failed images among twenty operations survive finish without losing steps", async () => {
  const capture = await harness({ pendingEvents: [] });
  for (let index = 0; index < 20; index += 1) {
    capture.setScreenshotFails([3, 7, 15].includes(index));
    await capture.event({ kind: "click", at: index + 1, eventId: `partial:${index}`, target: { tagName: "button" } });
  }
  const result = await capture.finish();
  assert.equal(result.imageCount, 17);
  assert.equal(result.missingImageCount, 3);
  assert.equal(capture.draft().steps.length, 20);
  assert.equal(capture.draft().steps.filter((step) => step.imageState.reason === "mask_failed").length, 3);
  for (const step of capture.draft().steps) {
    assert.equal(step.imageState.attempts, 1);
    assert.equal(step.imageState.version, 1);
  }
});

test("same generation cannot claim a delayed image when its scene lease changed", async () => {
  const capture = await harness({ pendingEvents: [], sceneValid: false });
  await capture.event({ kind: "click", at: 1, eventId: "scene:1", target: { tagName: "button" } });
  await capture.event({ kind: "click", at: 2, eventId: "scene:2", target: { tagName: "button" } });
  assert.equal(capture.screenshotTimes.length, 1);
  assert.equal(capture.session().stepImageRefs.at(-1).reason, "screen_changed");
  assert.equal(capture.session().stepImageRefs.at(-1).attempts, 0);
  await capture.finish();
  assert.equal(capture.draft().steps[1].screenshotId, undefined);
  assert.equal(capture.draft().steps[1].imageState.status, "unavailable");
});

test("navigation invalidates in-flight capture before its serialized handler runs", async () => {
  const capture = await harness({ pendingEvents: [], screenshotDelayMs: 20 });
  const event = capture.event({ kind: "click", at: 1, eventId: "before-navigation", target: { tagName: "button" } });
  while (!capture.screenshotTimes.length) await new Promise((resolve) => setTimeout(resolve, 0));
  await capture.navigate("loading");
  await event;
  assert.equal(capture.liveImages()[0].dataUrl, undefined);
  assert.equal(capture.liveImages()[0].reason, "navigation_changed");
  await capture.navigate("complete");
  await capture.finish();
  assert.equal(capture.draft().steps[0].imageState.reason, "navigation_changed");
  assert.equal(capture.draft().steps[1].imageState.status, "ready");
});

test("capture status reports pending work while finish waits for its final state", async () => {
  const capture = await harness({ pendingEvents: [], screenshotDelayMs: 20 });
  const event = capture.event({ kind: "click", at: 1, eventId: "pending-finish", target: { tagName: "button" } });
  while (!capture.screenshotTimes.length) await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal((await capture.status()).stepImageRefs[0].status, "capturing");
  const finish = capture.finishQueued();
  await event;
  assert.equal((await finish).ok, true);
  assert.equal(capture.draft().steps[0].imageState.status, "ready");
});

test("Chrome capture interval survives a service worker restart", async () => {
  const capture = await harness({ pendingEvents: [] });
  await capture.event({ kind: "click", at: 1, eventId: "restart:1", target: { tagName: "button" } });
  await capture.restart();
  await capture.event({ kind: "click", at: 2, eventId: "restart:2", target: { tagName: "button" } });
  assert.equal(capture.screenshotTimes.length, 2);
  assert.ok(capture.screenshotTimes[1] - capture.screenshotTimes[0] >= 500);
});

for (const [error, expectedStatus, reason] of [
  ["SCREENSHOT_MASK_FAILED", "failed", "mask_failed"],
  ["SCREENSHOT_MASK_INVALIDATED", "failed", "mask_invalidated"],
  ["SCREENSHOT_PAINT_TIMEOUT", "failed", "paint_timeout"],
  ["SCREENSHOT_PAINT_UNAVAILABLE", "failed", "paint_unavailable"],
  ["TARGET_TAB_NOT_VISIBLE", "unavailable", "tab_not_visible"],
  ["TARGET_TAB_UNAVAILABLE", "unavailable", "tab_unavailable"],
  ["SCREENSHOT_BUDGET_EXCEEDED", "protected", "privacy_budget_exceeded"],
  ["private page error text must not be saved", "failed", "capture_failed"]
]) {
  test(`finished draft keeps safe reason ${reason}`, async () => {
    const capture = await harness({ pendingEvents: [], screenshotFails: true, screenshotError: error });
    await capture.event({ kind: "click", at: 1, eventId: "reason:1", target: { tagName: "button" } });
    await capture.restart();
    await capture.finish();
    const state = capture.draft().steps[0].imageState;
    assert.equal(state.status, expectedStatus);
    assert.equal(state.reason, reason);
    assert.equal(state.attempts, 1);
    assert.equal(state.version, 1);
    assert.equal(capture.draft().steps[0].screenshotId, undefined);
    assert.equal(JSON.stringify(capture.draft()).includes("private page error"), false);
  });
}

test("image persistence failure leaves the step and a storage reason in the final draft", async () => {
  const capture = await harness({ pendingEvents: [], livePutFails: true });
  await capture.event({ kind: "click", at: 1, eventId: "storage:1", target: { tagName: "button" } });
  capture.setLivePutFails(false);
  await capture.finish();
  assert.equal(capture.draft().steps[0].imageState.reason, "storage_failed");
  assert.equal(capture.draft().screenshots.length, 0);
});

test("protected image keeps its review metadata and cannot count as normal success", async () => {
  const privacyReview = { replacementCount: 3, protectedRegionCount: 1, reviewRequired: true, reasonCodes: ["unsupported_canvas"] };
  const capture = await harness({ pendingEvents: [], privacyReview });
  await capture.event({ kind: "click", at: 1, eventId: "protected:1", target: { tagName: "button" } });
  const result = await capture.finish();
  assert.equal(result.reviewImageCount, 1);
  assert.equal(capture.draft().steps[0].imageState.status, "protected");
  assert.equal(capture.draft().steps[0].imageState.reason, "unsupported_canvas");
  assert.deepEqual(capture.draft().screenshots[0].privacyReview, privacyReview);
});

test("newer intentional no-image state wins over an older completed image", async () => {
  const capture = await harness({ pendingEvents: [] });
  await capture.event({ kind: "click", at: 1, eventId: "none:1", target: { tagName: "button" } });
  capture.session().stepImageRefs[0] = { eventId: "none:1", status: "none", reason: null, attempts: 1, version: 2 };
  await capture.finish();
  assert.equal(capture.draft().steps[0].imageState.status, "none");
  assert.equal(capture.draft().steps[0].imageState.version, 2);
  assert.equal(capture.draft().steps[0].screenshotId, undefined);
  assert.equal(capture.draft().screenshots.length, 0);
});

test("already committed user edits survive a finish retry without old image state overwrite", async () => {
  const draft = { id: "capture-1", screenshots: [], steps: [{ id: "edited", instruction: "変更済み", imageState: { status: "none", reason: null, attempts: 1, version: 4 } }] };
  const capture = await harness({ pendingEvents: [], initialDraft: draft });
  capture.session().events = [{ kind: "click", at: 1, eventId: "late:1" }];
  capture.seedLiveImages([{ sessionId: "capture-1", eventId: "late:1", status: "ready", dataUrl: "data:image/jpeg;base64,AA", version: 1 }]);
  await capture.finish();
  assert.equal(capture.draft().steps[0].id, "edited");
  assert.equal(capture.draft().steps[0].imageState.version, 4);
  assert.equal(capture.draft().screenshots.length, 0);
});

test("verified click target produces an editable normalized rectangle on its own screenshot", async () => {
  const clickTarget = { x: 80, y: 60, width: 120, height: 40, viewportWidth: 800, viewportHeight: 600, devicePixelRatio: 2, scrollX: 0, scrollY: 20, topFrame: true };
  const capture = await harness({ pendingEvents: [], currentTarget: clickTarget });
  await capture.event({ kind: "click", at: 1, eventId: "highlight:1", target: { tagName: "button", ariaLabel: "参照" }, clickTarget });
  await capture.finish();
  const [annotation] = capture.draft().screenshots[0].annotations;
  assert.equal(annotation.type, "rectangle");
  assert.equal(annotation.x, .1);
  assert.equal(annotation.y, .1);
  assert.equal(annotation.width, .15);
  assert.equal(annotation.height, 40 / 600);
  assert.equal(annotation.color, "#dc2626");
  assert.equal(capture.draft().steps[0].instruction, "【参照】をクリック");
});

test("stale, unknown and viewport-mismatched target geometry cannot produce a click rectangle", async () => {
  const clickTarget = { x: 80, y: 60, width: 120, height: 40, viewportWidth: 800, viewportHeight: 600, devicePixelRatio: 2, scrollX: 0, scrollY: 20, topFrame: true };
  for (const currentTarget of [null, { ...clickTarget, viewportWidth: 900 }, { ...clickTarget, scrollY: 40 }, { ...clickTarget, x: 85 }]) {
    const capture = await harness({ pendingEvents: [], currentTarget });
    await capture.event({ kind: "click", at: 1, eventId: "highlight:unknown", target: { tagName: "button" }, clickTarget });
    await capture.finish();
    assert.equal(capture.draft().screenshots[0].annotations, undefined);
  }
});

test("duplicate delivery does not invalidate a current image or add another capture", async () => {
  const capture = await harness({ pendingEvents: [], screenshotDelayMs: 20 });
  const event = { kind: "click", at: 1, eventId: "duplicate:1", target: { tagName: "button" } };
  const first = capture.event(event);
  while (!capture.screenshotTimes.length) await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.all([first, capture.event(event)]);
  assert.equal(capture.screenshotTimes.length, 1);
  assert.equal(capture.session().events.length, 1);
  assert.equal(capture.session().stepImageRefs[0].status, "ready");
});

test("bounded scene lease fails on mutation, interaction or document change and always cleans up", () => {
  const listeners = new Map();
  let observer;
  let expiry;
  const context = {
    document: {}, innerWidth: 800, innerHeight: 600,
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.records = []; this.disconnected = false; observer = this; }
      observe() {}
      takeRecords() { return this.records.splice(0); }
      disconnect() { this.disconnected = true; }
    },
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name) => listeners.delete(name),
    setTimeout: (callback) => { expiry = callback; return 1; }, clearTimeout() {}
  };
  vm.runInNewContext(source.slice(source.indexOf("function screenshotSceneLease("), source.indexOf("async function waitForScreenshotSlot(")) + "\nglobalThis.lease = screenshotSceneLease;", context);
  assert.equal(context.lease("begin", "stable"), true);
  assert.equal(context.lease("verify", "stable"), true);
  assert.equal(observer.disconnected, true);
  assert.equal(listeners.size, 0);
  context.lease("begin", "changed");
  observer.records.push({ type: "childList" });
  assert.equal(context.lease("verify", "changed"), false);
  context.lease("begin", "input");
  listeners.get("input")();
  assert.equal(context.lease("verify", "input"), false);
  context.lease("begin", "document");
  context.document = {};
  assert.equal(context.lease("verify", "document"), false);
  context.lease("begin", "expired");
  expiry();
  assert.equal(context.lease("verify", "expired"), false);
  assert.equal(listeners.size, 0);
});

test("durable capture store accepts terminal states but never attaches bytes to missing images", async () => {
  const storageSource = (await readFile(new URL("../apps/extension/storage/capture-live-store.js", import.meta.url), "utf8")).replace("export const captureLiveStore", "const captureLiveStore");
  const written = [];
  const context = { structuredClone, write: (entry) => written.push(entry) };
  vm.runInNewContext(storageSource + "\ntransact = async (_mode, action) => action({ put: write }); globalThis.store = captureLiveStore;", context);
  for (const status of ["ready", "unavailable", "failed", "protected", "none"]) {
    await context.store.put({ sessionId: "s", eventId: status, status, reason: null, attempts: 1, version: 1, ...(status === "ready" ? { dataUrl: "data:image/jpeg;base64,AA" } : {}) });
  }
  assert.equal(written.length, 5);
  assert.equal(written[1].key, "s:unavailable");
  await assert.rejects(context.store.put({ sessionId: "s", eventId: "unsafe", status: "failed", dataUrl: "data:image/jpeg;base64,AA" }));
  await assert.rejects(context.store.put({ sessionId: "s", eventId: "incomplete", status: "ready" }));
  await assert.rejects(context.store.put({ sessionId: "s", eventId: "pending", status: "capturing" }));
});

test("durable image count includes review images but excludes failure metadata and missing bytes", async () => {
  const storageSource = (await readFile(new URL("../apps/extension/storage/capture-live-store.js", import.meta.url), "utf8")).replace("export const captureLiveStore", "const captureLiveStore");
  const entries = [
    { status: "ready", dataUrl: "data:image/jpeg;base64,AA" },
    { status: "protected", dataUrl: "data:image/jpeg;base64,AA" },
    { status: "protected" }, { status: "failed" }, { status: "unavailable" }, { status: "none" }
  ];
  const db = {
    close() {},
    transaction() {
      const transaction = { objectStore: () => ({ openCursor() {
        const request = {};
        let index = 0;
        const next = () => queueMicrotask(() => {
          request.result = index < entries.length ? { value: entries[index++], continue: next } : null;
          request.onsuccess();
          if (!request.result) transaction.oncomplete();
        });
        next();
        return request;
      } }) };
      return transaction;
    }
  };
  const context = { IDBKeyRange: { bound: () => ({}) }, indexedDB: { open: () => {
    const request = { result: db };
    queueMicrotask(() => request.onsuccess());
    return request;
  } } };
  vm.runInNewContext(storageSource + "\nglobalThis.store = captureLiveStore;", context);
  assert.equal(await context.store.count("capture-1"), 2);
});

test("queued capture ignores proven hidden text churn but rejects reveal, styles and visible changes", async () => {
  const source = await readFile(new URL("../apps/extension/background/service-worker.js", import.meta.url), "utf8");
  let observer;
  const hidden = { tagName:"DIV", display:"none", isConnected:true, contains(node){ return node===this || node?.parentElement===this || node?.parentElement?.parentElement===this; }, closest(){return null}, matches(){return false}, querySelector(){return null} };
  const hiddenText = {nodeType:3,parentElement:hidden};
  const visible = {tagName:"DIV",display:"block",isConnected:true,contains(node){return node===this},closest(){return null},matches(){return false},querySelector(){return null}};
  const style = {tagName:"STYLE",parentElement:hidden,closest(){return this},matches(){return true},querySelector(){return null}};
  const context = {
    document:{querySelectorAll(){return [hidden,visible]}},innerWidth:800,innerHeight:600,
    getComputedStyle:node=>({display:node.display}),
    MutationObserver:class{constructor(callback){this.callback=callback;this.records=[];observer=this}observe(){}takeRecords(){return this.records.splice(0)}disconnect(){}},
    addEventListener(){},removeEventListener(){},setTimeout(){return 1},clearTimeout(){}
  };
  vm.runInNewContext(source.slice(source.indexOf("function screenshotSceneLease("),source.indexOf("async function waitForScreenshotSlot("))+"\nglobalThis.lease=screenshotSceneLease;",context);
  context.lease("begin","hidden");observer.callback([{type:"characterData",target:hiddenText}]);assert.equal(context.lease("verify","hidden"),true);
  context.lease("begin","visible");observer.records.push({type:"childList",target:visible});assert.equal(context.lease("verify","visible"),false);
  context.lease("begin","attributes");observer.records.push({type:"attributes",target:hidden});assert.equal(context.lease("verify","attributes"),false);
  context.lease("begin","styles");observer.records.push({type:"childList",target:hidden,addedNodes:[style]});assert.equal(context.lease("verify","styles"),false);
  context.lease("begin","reveal");hidden.display="block";observer.records.push({type:"characterData",target:hiddenText});assert.equal(context.lease("verify","reveal"),false);
});
