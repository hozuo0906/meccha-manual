import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { mergeCaptureEvents } from "../apps/extension/background/event-merge.js";
import { nextRecoveryJournal } from "../apps/extension/background/recovery-journal.js";
import { normalizeCaptureEvent } from "../apps/extension/capture/privacy.js";
import { VIEWPORTS } from "../apps/extension/responsive/viewports.js";
import { buildContinueUrl, handoffReadyStorageKey, handoffStorageKey, withHandoffReadyLock } from "../apps/extension/editor/handoff.js";

const source = (await readFile(new URL("../apps/extension/background/service-worker.js", import.meta.url), "utf8")).replace(/^import .*;\r?$/gm, "");

async function harness({ screenshotFails = false, draftPutFails = false, initialDraft, localFails = true, sessionFails = false, sessionRemoveFails = false, localRemoveFails = false, sessionFailsAfterLivePut = false, injectionFails = false, mode = "pc", restoreSucceeds = true, windowExists = false, clearFails = false, listFails = false, countFails = false, failBothAfterStop = false, releaseFails = false, releaseMissingAck = false, releaseEmptyResults = false, retainFails = false, retainMissingAck = false, retainEmptyResults = false, retainMissingEvents = false, retainFailsAfter = 0, screenshotDelayMs = 0, tabsUpdateFails = false, handoffRecords = {}, pendingEvents = [{ kind: "input", at: 2, eventId: "document:1", target: { tagName: "input" } }] } = {}) {
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
  let tabsUpdateFailure = tabsUpdateFails;
  let onRemoved;
  let onUpdated;
  let onMessage;
  let onMessageExternal;
  let handoffStorage = { ...handoffRecords };
  const tabUpdates = [];
  const injections = [];
  let context;
  const createContext = () => ({
    crypto, Date, Promise, URL, VIEWPORTS, CLOUD_CLAIM_MAX_ASSETS: 100, mergeCaptureEvents, nextRecoveryJournal, normalizeCaptureEvent,
    STAGING_ONBOARDING_ORIGIN: "https://meccha-manual-staging.meccha-iiyatsu.com", buildContinueUrl, handoffReadyStorageKey, handoffStorageKey, withHandoffReadyLock,
    navigator: { locks: { request: async (_name, callback) => callback({ name: "handoff" }) } },
    withHandoffReadyLock: (handoffId, callback) => withHandoffReadyLock(handoffId, callback, { locks: { request: async (_name, lockCallback) => lockCallback({ name: "handoff" }) } }),
    installSensitiveMasks() {}, removeSensitiveMasks() {}, verifySensitiveMasks() {},
    captureWithMaskBoundary: async () => { if (screenshotFailure) throw new Error("mask failed"); if (screenshotDelayMs) await new Promise((resolve) => setTimeout(resolve, screenshotDelayMs)); return "data:image/jpeg;base64,AA"; },
    applyResponsiveViewport: async () => { viewportApplied = true; },
    draftStore: { get: async (id) => (draft?.id === id ? draft : undefined), put: async (value) => { if (draftPutFailure) throw new Error("draft unavailable"); draft = value; } },
    recoverWindowSession: async () => { restoreCalls++; return { restored: restoreSuccess }; },
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
        session: { get: async () => ({ activeCaptureSession: session }), set: async (value) => { if (sessionStorageFailure) throw new Error("session unavailable"); session = value.activeCaptureSession; }, remove: async () => { if (sessionRemoveFailure) throw new Error("session remove unavailable"); session = null; } },
        local: { get: async (key) => {
          if (key === null) return { captureRecoveryJournal: journal, ...handoffStorage };
          if (Array.isArray(key)) return Object.fromEntries(key.filter((item) => Object.prototype.hasOwnProperty.call(handoffStorage, item)).map((item) => [item, handoffStorage[item]]));
          if (typeof key === "string" && Object.prototype.hasOwnProperty.call(handoffStorage, key)) return { [key]: handoffStorage[key] };
          return { captureRecoveryJournal: journal };
        }, set: async (value) => {
          if (localStorageFailure) throw new Error("local storage unavailable");
          if (Object.prototype.hasOwnProperty.call(value, "captureRecoveryJournal")) journal = value.captureRecoveryJournal;
          handoffStorage = { ...handoffStorage, ...value };
        }, remove: async (keys) => { if (localRemoveFailure) throw new Error("local remove unavailable"); for (const key of Array.isArray(keys) ? keys : [keys]) delete handoffStorage[key]; journal = null; } }
      },
      scripting: { executeScript: async (options) => { if (options.files) { injections.push(...options.files); if (injectionFailure) throw new Error("injection denied"); return []; } recorderStopCalls += 1; const command = options.args?.[0] || "drain"; if (command === "retain") { if (recorderRetainFailure || (recorderRetainFailureAfter > 0 && recorderStopCalls > recorderRetainFailureAfter)) throw new Error("recorder retain unavailable"); if (recorderRetainEmptyResults) return []; if (recorderRetainMissingAck) return [{ result: { events: [] } }]; if (recorderRetainMissingEvents) return [{ result: { retainAck: true } }]; if (!retainedPendingEvents && !drained) retainedPendingEvents = pendingEvents.slice(); drained = true; if (failBothAfterStop && recorderStopCalls === 1) { sessionStorageFailure = true; localStorageFailure = true; } return [{ result: { retainAck: true, recorderPresent: true, events: (retainedPendingEvents || []).slice() } }]; } if (command === "release") { recorderReleaseCalls += 1; if (recorderReleaseFailure) throw new Error("recorder release unavailable"); if (recorderReleaseMissingAck) return [{ result: { releaseAck: false } }]; if (recorderReleaseEmptyResults) return []; retainedPendingEvents = null; return [{ result: { releaseAck: true, result: [] } }]; } const result = retainedPendingEvents ? retainedPendingEvents.slice() : (drained ? [] : pendingEvents); retainedPendingEvents = null; drained = true; return [{ result }]; } },
      runtime: { onMessage: { addListener(callback) { onMessage = callback; } }, onMessageExternal: { addListener(callback) { onMessageExternal = callback; } } },
      tabs: { onUpdated: { addListener(callback) { onUpdated = callback; } }, onRemoved: { addListener(callback) { onRemoved = callback; } }, update: async (tabId, details) => { if (tabsUpdateFailure) throw new Error("tab update unavailable"); tabUpdates.push({ tabId, ...details }); return { id: tabId, ...details }; }, query: async () => windowExists ? [{ id: 2 }] : [] },
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
    injections, status: () => context.status(), restore: () => context.restore(), restart,
    setScreenshotFails: (value) => { screenshotFailure = value; }, setDraftPutFails: (value) => { draftPutFailure = value; }, setRestoreSucceeds: (value) => { restoreSuccess = value; }, setWindowExists: (value) => { windowExists = value; }, setLiveCleanupFails: (value) => { clearFails = value; }, setLiveReadFails: (value) => { liveStoreReadFailure = value; }, setLiveCountFails: (value) => { liveStoreCountFailure = value; }, setReleaseOutcome: (fails, missingAck = false, emptyResults = false) => { recorderReleaseFailure = fails; recorderReleaseMissingAck = missingAck; recorderReleaseEmptyResults = emptyResults; }, setRetainOutcome: (fails, missingAck = false, emptyResults = false, missingEvents = false, failureAfter = 0) => { recorderRetainFailure = fails; recorderRetainMissingAck = missingAck; recorderRetainEmptyResults = emptyResults; recorderRetainMissingEvents = missingEvents; recorderRetainFailureAfter = failureAfter; }, setInjectionFails: (value) => { injectionFailure = value; }, seedLiveImages: (entries) => { liveEntries = entries; }, liveImages: () => liveEntries,
    setTabsUpdateFails: (value) => { tabsUpdateFailure = value; }, setStorageFails: (sessionValue, localValue) => {
      sessionStorageFailure = sessionValue;
      localStorageFailure = localValue;
    }, setStorageRemoveFails: (sessionValue, localValue) => {
      sessionRemoveFailure = sessionValue;
      localRemoveFailure = localValue;
    }, dropSession: () => { session = null; }, viewportApplied: () => viewportApplied,
    navigate: async () => { await onUpdated(1, { status: "complete" }); await context.settle(); },
    accessReturn: async (messageOverrides = {}, senderOverrides = {}) => {
      const readyEntry = Object.values(handoffStorage).find((value) => value?.tabId === 17 && value?.handoffId && value?.launchId);
      const metadata = readyEntry ? handoffStorage[handoffStorageKey(readyEntry.handoffId)] : null;
      const response = await new Promise((resolve) => onMessageExternal({
        schema: "meccha-manual/cloud-claim-v1",
        type: "handoff.access-return",
        handoffId: readyEntry?.handoffId,
        launchId: readyEntry?.launchId,
        extensionId: metadata?.extensionId,
        operationId: metadata?.operationId || "O".repeat(43),
        action: metadata?.outputAction,
        draftFingerprint: metadata?.draftFingerprint,
        expiresAt: metadata?.expiresAt,
        ...messageOverrides
      }, { url: "https://meccha-manual-staging.meccha-iiyatsu.com/onboarding/continue", frameId: 0, tab: { id: 17 }, ...senderOverrides }, resolve));
      await context.settle();
      return response;
    },
    tabUpdates: () => tabUpdates,
    handoffStorage: () => handoffStorage,
    event: async (event) => new Promise((resolve) => onMessage({ type: "capture:event", event }, { tab: { id: 1 } }, async (response) => { await context.settle(); resolve(response); })),
    close: async (isWindowClosing = true) => { session.mode = "tabletPortrait"; onRemoved(1, { isWindowClosing }); await context.settle(); } };
}

test("Access認証から戻ったhandoff対象タブへfragmentを復元する", async () => {
  const handoffId = "A".repeat(43);
  const launchId = "B".repeat(43);
  const readyKey = handoffReadyStorageKey(handoffId, launchId);
  const handoffKey = handoffStorageKey(handoffId);
  const metadata = {
    handoffId,
    draftId: "synthetic-draft",
    outputAction: "save",
    extensionId: "a".repeat(32),
    draftFingerprint: "b".repeat(64),
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  };
  const ready = {
    handoffId,
    launchId,
    tabId: 17,
    expiresAt: metadata.expiresAt,
    activationPolicy: "manual",
    pageReadyAt: null,
    activatedAt: null
  };
  const capture = await harness({ localFails: false, handoffRecords: { [handoffKey]: metadata, [readyKey]: ready } });
  await capture.accessReturn();
  const updates = capture.tabUpdates();
  assert.equal(updates.length, 1);
  assert.equal(updates[0].tabId, 17);
  assert.equal(updates[0].active, undefined, "Access recovery must preserve the tab's current active state");
  assert.match(updates[0].url, /^https:\/\/meccha-manual-staging\.meccha-iiyatsu\.com\/onboarding\/continue#handoff=A{43}&extensionId=a{32}&launchId=B{43}$/);
  assert.equal(capture.handoffStorage()[readyKey].restoreAttempts, 1);

  assert.equal(capture.tabUpdates().length, 1, "fragment付き遷移は再度書き換えない");
});

test("Access復帰のタブ更新失敗時は回復マーカーを残して再試行できる", async () => {
  const handoffId = "E".repeat(43);
  const launchId = "F".repeat(43);
  const readyKey = handoffReadyStorageKey(handoffId, launchId);
  const handoffKey = handoffStorageKey(handoffId);
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const metadata = {
    handoffId,
    draftId: "synthetic-draft-update-retry",
    outputAction: "save",
    extensionId: "c".repeat(32),
    draftFingerprint: "d".repeat(64),
    expiresAt
  };
  const ready = {
    handoffId,
    launchId,
    tabId: 17,
    expiresAt,
    activationPolicy: "manual",
    pageReadyAt: new Date().toISOString(),
    activatedAt: new Date().toISOString()
  };
  const capture = await harness({ localFails: false, tabsUpdateFails: true, handoffRecords: { [handoffKey]: metadata, [readyKey]: ready } });
  await capture.accessReturn();
  assert.equal(capture.tabUpdates().length, 0);
  assert.equal(capture.handoffStorage()[readyKey].restoreAttempts, 1, "再送回数はタブ更新試行時点で記録する");

  capture.setTabsUpdateFails(false);
  await capture.accessReturn();
  assert.equal(capture.tabUpdates().length, 1, "保持したマーカーで次の復帰を再試行できる");
  assert.equal(capture.handoffStorage()[readyKey].restoreAttempts, 2);
});

test("hashless return restores an activated tab and rejects invalid or completed handoffs", async () => {
  const handoffId = "C".repeat(43);
  const launchId = "D".repeat(43);
  const readyKey = handoffReadyStorageKey(handoffId, launchId);
  const handoffKey = handoffStorageKey(handoffId);
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const metadata = {
    handoffId,
    draftId: "synthetic-draft-activated",
    outputAction: "save",
    extensionId: "b".repeat(32),
    draftFingerprint: "c".repeat(64),
    expiresAt
  };
  const ready = {
    handoffId,
    launchId,
    tabId: 17,
    expiresAt,
    activationPolicy: "manual",
    pageReadyAt: new Date().toISOString(),
    activatedAt: new Date().toISOString()
  };
  const capture = await harness({ localFails: false, handoffRecords: { [handoffKey]: metadata, [readyKey]: ready } });
  await capture.accessReturn();
  assert.equal(capture.tabUpdates().length, 1, "activated tabs still need the fragment after an Access redirect");

  const completed = await harness({ localFails: false, handoffRecords: {
    [handoffKey]: { ...metadata, status: "completed", completedManualId: "manual-1" },
    [readyKey]: ready
  } });
  await completed.accessReturn();
  assert.equal(completed.tabUpdates().length, 0, "completed handoffs must not be reopened");

  const malformedExpiry = await harness({ localFails: false, handoffRecords: {
    [handoffKey]: { ...metadata, expiresAt: "invalid" },
    [readyKey]: ready
  } });
  await malformedExpiry.accessReturn();
  assert.equal(malformedExpiry.tabUpdates().length, 0, "invalid metadata expiry must fail closed");

  const expiredAt = new Date(Date.now() - 1).toISOString();
  const expiredPending = await harness({ localFails: false, handoffRecords: {
    [handoffKey]: { ...metadata, expiresAt: expiredAt, status: "finalize-pending", operationId: "O".repeat(43), claimIntentId: "01234567-89ab-4cde-8fab-0123456789ab" },
    [readyKey]: { ...ready, expiresAt: expiredAt }
  } });
  await expiredPending.accessReturn();
  assert.equal(expiredPending.tabUpdates().length, 1, "期限切れでもfinalize-pendingは結果回収用に復帰できる");
  assert.match(expiredPending.tabUpdates()[0].url, /operationId=O{43}/);

  const expiredOrdinary = await harness({ localFails: false, handoffRecords: {
    [handoffKey]: { ...metadata, expiresAt: expiredAt },
    [readyKey]: { ...ready, expiresAt: expiredAt }
  } });
  await expiredOrdinary.accessReturn();
  assert.equal(expiredOrdinary.tabUpdates().length, 0, "期限切れの通常handoffは復帰させない");

  const wrongFrame = await harness({ localFails: false, handoffRecords: { [handoffKey]: metadata, [readyKey]: ready } });
  await wrongFrame.accessReturn({}, { frameId: 1 });
  assert.equal(wrongFrame.tabUpdates().length, 0, "subframeからの復帰通知は拒否する");

  const wrongTab = await harness({ localFails: false, handoffRecords: { [handoffKey]: metadata, [readyKey]: ready } });
  await wrongTab.accessReturn({}, { tab: { id: 18 } });
  assert.equal(wrongTab.tabUpdates().length, 0, "別tabからの復帰通知は拒否する");

  const wrongOrigin = await harness({ localFails: false, handoffRecords: { [handoffKey]: metadata, [readyKey]: ready } });
  await wrongOrigin.accessReturn({}, { url: "https://example.invalid/onboarding/continue" });
  assert.equal(wrongOrigin.tabUpdates().length, 0, "別originからの復帰通知は拒否する");

  const mismatchedExpiry = await harness({ localFails: false, handoffRecords: {
    [handoffKey]: { ...metadata, expiresAt: new Date(Date.now() + 120_000).toISOString() },
    [readyKey]: ready
  } });
  await mismatchedExpiry.accessReturn();
  assert.equal(mismatchedExpiry.tabUpdates().length, 0, "ready and metadata expiry must refer to the same handoff");
});

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
