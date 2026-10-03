import { normalizeCaptureEvent } from "../capture/privacy.js";
import { VIEWPORTS } from "../responsive/viewports.js";
import { applyResponsiveViewport, originalWindowSnapshot, restoreOriginalWindow } from "../responsive/window-lifecycle.js";
import { draftStore } from "../storage/draft-store.js";
import { captureLiveStore as importedCaptureLiveStore } from "../storage/capture-live-store.js";
import { mergeCaptureEvents } from "./event-merge.js";
import { nextRecoveryJournal } from "./recovery-journal.js";
import { recoverWindowSession } from "./session-recovery.js";
import { CLOUD_CLAIM_MAX_ASSETS, handleExternalCloudClaimMessage } from "./cloud-claim.js";
import { STAGING_ONBOARDING_ORIGIN } from "../onboarding-config.js";
import { buildContinueUrl, handoffReadyStorageKey, handoffStorageKey, withHandoffReadyLock } from "../editor/handoff.js";

const SESSION_KEY = "activeCaptureSession";
const RECOVERY_KEY = "captureRecoveryJournal";
const SCREENSHOT_TIMING_KEY = "captureScreenshotAt";
const PRIVACY_ALIAS_KEY = "capturePrivacyAliases";
let sessionOperation = Promise.resolve();
let reinjectionFailureSessionId = null;
let navigationFallback = null;
let lastStepScreenshotAt = 0;
const captureEventGenerations = new Map();
const captureEventIds = new Map();
const MIN_STEP_SCREENSHOT_INTERVAL_MS = 500;
const captureLiveStore = importedCaptureLiveStore;
const MAX_CAPTURE_STEPS = 200;

function clearNavigationFallback(sessionId) {
  if (!sessionId || navigationFallback?.sessionId === sessionId) navigationFallback = null;
}

function navigationFallbackEvents(sessionId, event) {
  const existing = navigationFallback?.sessionId === sessionId ? navigationFallback.events : [];
  return mergeCaptureEvents({ events: existing }, [event]).events;
}

function clearReinjectionFailureMarker(sessionId) {
  if (sessionId && sessionId === reinjectionFailureSessionId) reinjectionFailureSessionId = null;
}

function serializeSessionOperation(task) {
  const run = sessionOperation.then(task, task);
  sessionOperation = run.catch(() => undefined);
  return run;
}

async function readRecoveryJournal() {
  return (await chrome.storage.local.get(RECOVERY_KEY))[RECOVERY_KEY] ?? null;
}

async function persistRecoveryJournal(sessionId, events = [], phase, captureLimitReached) {
  const current = await readRecoveryJournal();
  const next = nextRecoveryJournal(current, { sessionId, events, phase });
  const limit = captureLimitReached || (current?.sessionId === sessionId ? current.captureLimitReached : undefined);
  if (limit) next.captureLimitReached = limit;
  await chrome.storage.local.set({ [RECOVERY_KEY]: next });
  if (phase && phase !== "reinjection_failed") clearReinjectionFailureMarker(sessionId);
  return next;
}

async function clearRecoveryJournal(sessionId) {
  const current = await readRecoveryJournal();
  if (!current || !sessionId || current.sessionId === sessionId) await chrome.storage.local.remove(RECOVERY_KEY);
}

async function clearLiveCapture(sessionId) {
  if (!sessionId) return true;
  try {
    await captureLiveStore.clear(sessionId);
    return true;
  } catch {
    return false;
  }
}

async function retainCancelFailure(session) {
  const failedSession = {
    ...session,
    phase: "cancel_failed",
    finishFailed: false,
    failureCategory: "cancel_cleanup_failed",
    restorePending: Boolean(session.restorePending)
  };
  const journalSaved = await persistRecoveryJournal(session.id, failedSession.events || [], "cancel_failed").then(() => true, () => false);
  const sessionSaved = await setSession(failedSession).then(() => true, () => false);
  if (!journalSaved && !sessionSaved) throw new Error("キャンセルした記録の一時画像を削除できませんでした。対象タブを閉じずに、もう一度キャンセルしてください。");
  return failedSession;
}

async function finalizeCancelledSession(session) {
  try {
    await clearRecoveryJournal(session.id);
    await setSession(null);
    return true;
  } catch {
    await retainCancelFailure(session);
    return false;
  }
}

async function getSession() {
  let session = (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY] ?? null;
  const recovery = await readRecoveryJournal();
  if (!session && recovery?.phase === "cancel_failed" && typeof recovery.sessionId === "string" && recovery.sessionId) {
    return {
      id: recovery.sessionId,
      tabId: null,
      windowId: null,
      mode: "pc",
      phase: "cancel_failed",
      finishFailed: false,
      restorePending: false,
      events: recovery.events || [],
      stepImageRefs: []
    };
  }
  if (!session) {
    clearNavigationFallback();
    return null;
  }
  if (session.id === reinjectionFailureSessionId) session = { ...session, phase: "reinjection_failed", reinjectionFailed: true };
  if (recovery?.sessionId === session.id) {
    session = mergeCaptureEvents(session, recovery.events || []);
  }
  if (navigationFallback?.sessionId === session.id) session = mergeCaptureEvents(session, navigationFallback.events || []);
  else clearNavigationFallback();
  if (recovery?.sessionId === session.id && recovery.phase && session.id !== reinjectionFailureSessionId) {
    return {
      ...session,
      phase: recovery.phase,
      finishFailed: recovery.phase === "finish_failed" ? true : recovery.phase === "cancel_failed" ? false : session.finishFailed,
      ...(recovery.captureLimitReached ? { captureLimitReached: recovery.captureLimitReached } : {})
    };
  }
  return session;
}

async function setSession(session) {
  if (session) {
    await chrome.storage.session.set({ [SESSION_KEY]: session });
    clearNavigationFallback(session.id);
    if (session.phase !== "reinjection_failed") clearReinjectionFailureMarker(session.id);
  } else {
    await chrome.storage.session.remove([SESSION_KEY, PRIVACY_ALIAS_KEY]);
    clearNavigationFallback();
    clearReinjectionFailureMarker(reinjectionFailureSessionId);
  }
}

async function measureViewport(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: () => ({ innerWidth, innerHeight }) });
  return result;
}

async function injectRecorder(tabId) {
  const target = { tabId, allFrames: true };
  await chrome.scripting.executeScript({ target, world: "MAIN", files: ["content/history-bridge.js"] });
  return chrome.scripting.executeScript({ target, files: ["content/recorder.js"] });
}

async function stopRecorder(tabId, command = "drain") {
  const execute = () => chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: (recorderCommand) => {
      if (recorderCommand === "retain") {
        const recorder = globalThis.__mecchaManualRecorder;
        if (typeof recorder !== "function") return { retainAck: true, recorderPresent: false, events: [] };
        const events = recorder("retain");
        return { retainAck: true, recorderPresent: true, events };
      }
      if (recorderCommand !== "release") return globalThis.__mecchaManualRecorder?.(recorderCommand);
      const recorder = globalThis.__mecchaManualRecorder;
      if (typeof recorder !== "function") return { releaseAck: true };
      const result = recorder("release");
      return { releaseAck: globalThis.__mecchaManualRecorder === undefined, result };
    },
    args: [command]
  });
  if (command === "release") {
    const results = await execute();
    if (!Array.isArray(results) || results.length === 0 || results.some((entry) => entry?.result?.releaseAck !== true)) {
      throw new Error("RECORDER_RELEASE_UNCONFIRMED");
    }
    return [];
  }
  if (command === "retain") {
    const results = await execute();
    if (!Array.isArray(results) || results.length === 0 || results.some((entry) => entry?.result?.retainAck !== true || !Array.isArray(entry.result.events))) {
      throw new Error("RECORDER_RETAIN_UNCONFIRMED");
    }
    return results.flatMap(({ result }) => result.events);
  }
  const results = await execute().catch(() => []);
  return results.flatMap(({ result }) => Array.isArray(result) ? result : result ? [result] : []);
}

async function appendCaptureEvent(session, event) {
  if (!event) return session;
  const next = mergeCaptureEvents(session, [event]);
  if (next === session) return session;
  if (next.events.length > MAX_CAPTURE_STEPS) return markCaptureLimit(session, "steps");
  try {
    await setSession(next);
  } catch (error) {
    const recoveryEvents = navigationFallbackEvents(session.id, normalizeCaptureEvent(event));
    await persistRecoveryJournal(session.id, recoveryEvents);
    clearNavigationFallback(session.id);
    throw error;
  }
  return next;
}

async function attemptRestore(session) {
  if (session?.mode === "pc") return true;
  try {
    const result = await recoverWindowSession(session, { persist: setSession, restore: (original) => restoreOriginalWindow(original, chrome.windows) });
    return result.restored;
  } catch {
    try {
      await restoreOriginalWindow(session.originalWindow, chrome.windows);
      return true;
    } catch {
      return false;
    }
  }
}

async function windowStillExists(windowId) {
  try {
    await chrome.windows.get(windowId);
    return true;
  } catch {
    return false;
  }
}

async function recoverInterruptedStartingSession() {
  const session = await getSession();
  if (session?.phase !== "starting") return;
  await stopRecorder(session.tabId);
  if (!(await windowStillExists(session.windowId))) {
    await setSession(null);
    await clearRecoveryJournal(session.id);
    return;
  }
  const restored = await attemptRestore(session);
  if (restored) {
    await setSession(null);
    await clearRecoveryJournal(session.id);
  }
}

async function startCapture(tabId, mode) {
  if (await getSession()) throw new Error("既に操作を記録しています");
  const viewport = VIEWPORTS[mode];
  if (!viewport) throw new TypeError("表示モードが不正です");
  const tab = await chrome.tabs.get(tabId);
  const window = await chrome.windows.get(tab.windowId);
  const session = {
    id: crypto.randomUUID(),
    tabId,
    windowId: tab.windowId,
    mode,
    phase: "starting",
    restorePending: false,
    originalWindow: originalWindowSnapshot(window),
    events: [],
    stepImageRefs: [],
    startedAt: Date.now()
  };
  captureEventIds.delete(tabId);
  captureEventGenerations.delete(tabId);
  await clearRecoveryJournal();
  await chrome.storage.session.remove(PRIVACY_ALIAS_KEY);
  await setSession(session);
  try {
    if (mode !== "pc") await applyResponsiveViewport({ windowId: tab.windowId, tabId, viewport, windowsApi: chrome.windows, measure: measureViewport });
    await injectRecorder(tabId);
    await setSession({ ...session, phase: "recording" });
    return { sessionId: session.id, modeLabel: viewport.label };
  } catch {
    await stopRecorder(tabId);
    const restored = await attemptRestore(session);
    if (restored) await setSession(null);
    throw new Error(restored ? "記録を開始できませんでした。下書きは変更されていません。" : "画面サイズを元に戻せませんでした。記録データと復元情報は残っています。もう一度復元してください。");
  }
}

async function visibleCaptureTab(session) {
  let tab;
  try { tab = await chrome.tabs.get(session.tabId); }
  catch { throw new Error("TARGET_TAB_UNAVAILABLE"); }
  if (!tab.active || tab.windowId !== session.windowId) throw new Error("TARGET_TAB_NOT_VISIBLE");
  return tab;
}

async function currentClickTarget(session, event) {
  if (event?.kind !== "click" || event.clickTarget?.topFrame !== true) return null;
  try {
    const [result] = await chrome.scripting.executeScript({ target: { tabId: session.tabId },
      func: (eventId) => globalThis.__mecchaManualRecorder?.("click-target", eventId), args: [event.eventId] });
    const current = result?.result;
    const keys = ["x", "y", "width", "height", "viewportWidth", "viewportHeight", "devicePixelRatio", "scrollX", "scrollY", "topFrame"];
    return current && keys.every((key) => current[key] === event.clickTarget[key]) ? current : null;
  } catch { return null; }
}

// This key is separate from the public capture session/status and is never
// copied into a draft, recovery journal, event, image, handoff or network body.
// storage.session remains at Chrome's default TRUSTED_CONTEXTS access level.
async function readCapturePrivacyAliases(session) {
  const existing = (await chrome.storage.session.get(PRIVACY_ALIAS_KEY))[PRIVACY_ALIAS_KEY];
  if (existing) {
    if (existing.recordId !== session.id || existing.version !== 1 || !/^[a-f0-9]{64}$/.test(existing.secret)) throw new Error("SCREENSHOT_MASK_FAILED");
    return existing;
  }
  const state = { version: 1, recordId: session.id, namespace: crypto.randomUUID(),
    secret: Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join(""),
    allocations: [], next: 0 };
  await chrome.storage.session.set({ [PRIVACY_ALIAS_KEY]: state });
  return state;
}

async function persistCapturePrivacyAliases(state, result) {
  const next = result?.privateAliasAllocations;
  if (!next || next.namespace !== state.namespace || !Array.isArray(next.allocations) || next.allocations.length > 512
    || next.next !== next.allocations.length || next.next < state.next
    || next.allocations.some((entry, index) => !Array.isArray(entry) || entry.length !== 2
      || !/^[a-f0-9]{64}$/.test(entry[0]) || entry[1] !== index + 1
      || (index < state.next && (entry[0] !== state.allocations[index][0] || entry[1] !== state.allocations[index][1])))
    || new Set(next.allocations.map(([key]) => key)).size !== next.allocations.length) throw new Error("SCREENSHOT_MASK_FAILED");
  await chrome.storage.session.set({ [PRIVACY_ALIAS_KEY]: { ...state, allocations: next.allocations, next: next.next } });
}

async function clearCapturePrivacy(session) {
  if ((await chrome.storage.session.get(PRIVACY_ALIAS_KEY))[PRIVACY_ALIAS_KEY]) await chrome.storage.session.remove(PRIVACY_ALIAS_KEY);
}

async function takeScreenshot(session, assertCurrent = () => undefined, event) {
  let clickTarget = null;
  await visibleCaptureTab(session);
  assertCurrent();
  let paintResult;
  try {
    [paintResult] = await chrome.scripting.executeScript({
      target: { tabId: session.tabId },
      func: () => new Promise((resolve) => {
        if (document.visibilityState === "hidden") { resolve({ ready: false, reason: "TARGET_TAB_NOT_VISIBLE" }); return; }
        let settled = false;
        const finish = (reason = null) => { if (settled) return; settled = true; clearTimeout(timeout); resolve({ ready: !reason, reason }); };
        const timeout = setTimeout(() => finish("SCREENSHOT_PAINT_TIMEOUT"), 1000);
        if (typeof requestAnimationFrame !== "function") { finish("SCREENSHOT_PAINT_UNAVAILABLE"); return; }
        try { requestAnimationFrame(() => { try { requestAnimationFrame(() => finish()); } catch { finish("SCREENSHOT_PAINT_UNAVAILABLE"); } }); }
        catch { finish("SCREENSHOT_PAINT_UNAVAILABLE"); }
      })
    });
  } catch { throw new Error("SCREENSHOT_PAINT_UNAVAILABLE"); }
  if (paintResult?.result?.ready !== true) {
    const reason = paintResult?.result?.reason;
    throw new Error(["TARGET_TAB_NOT_VISIBLE", "SCREENSHOT_PAINT_TIMEOUT", "SCREENSHOT_PAINT_UNAVAILABLE"].includes(reason) ? reason : "SCREENSHOT_PAINT_UNAVAILABLE");
  }
  assertCurrent();
  await visibleCaptureTab(session);
  assertCurrent();
  clickTarget = await currentClickTarget(session, event);
  assertCurrent();
  try { await chrome.storage.session.set({ [SCREENSHOT_TIMING_KEY]: { pending: true } }); }
  catch { throw new Error("SCREENSHOT_STORAGE_FAILED"); }
  assertCurrent();
  lastStepScreenshotAt = Date.now();
  let dataUrl;
  try { dataUrl = await chrome.tabs.captureVisibleTab(session.windowId, { format: "jpeg", quality: 75 }); }
  finally {
    try { await chrome.storage.session.set({ [SCREENSHOT_TIMING_KEY]: { completedAt: Date.now() } }); }
    catch { throw new Error("SCREENSHOT_STORAGE_FAILED"); }
  }
  if (clickTarget && await currentClickTarget(session, event)) {
    const annotation = {
      id: crypto.randomUUID(), type: "rectangle", x: clickTarget.x / clickTarget.viewportWidth,
      y: clickTarget.y / clickTarget.viewportHeight, width: clickTarget.width / clickTarget.viewportWidth,
      height: clickTarget.height / clickTarget.viewportHeight, color: "#dc2626", strokeWidth: 3
    };
    return { dataUrl, annotations: [annotation] };
  }
  return dataUrl;
  /* Previous automatic DOM masking implementation intentionally removed. */
  /*
    return legacyCaptureBoundary({
      waitForPaint: async () => {
      await visibleCaptureTab(session);
      let paintResult;
      try {
        [paintResult] = await chrome.scripting.executeScript({
          target: { tabId: session.tabId },
          func: () => new Promise((resolve) => {
            if (document.visibilityState === "hidden") {
              resolve({ ready: false, reason: "TARGET_TAB_NOT_VISIBLE" });
              return;
            }
            let settled = false;
            const finish = (reason = null) => {
              if (settled) return;
              settled = true;
              clearTimeout(timeout);
              resolve({ ready: !reason, reason });
            };
            const timeout = setTimeout(() => finish("SCREENSHOT_PAINT_TIMEOUT"), 1000);
            if (typeof requestAnimationFrame !== "function") {
              finish("SCREENSHOT_PAINT_UNAVAILABLE");
              return;
            }
            try {
              requestAnimationFrame(() => {
                try { requestAnimationFrame(() => finish()); }
                catch { finish("SCREENSHOT_PAINT_UNAVAILABLE"); }
              });
            } catch { finish("SCREENSHOT_PAINT_UNAVAILABLE"); }
          })
        });
      } catch { throw new Error("SCREENSHOT_PAINT_UNAVAILABLE"); }
      if (paintResult?.result?.ready !== true) {
        const reason = paintResult?.result?.reason;
        throw new Error(["TARGET_TAB_NOT_VISIBLE", "SCREENSHOT_PAINT_TIMEOUT", "SCREENSHOT_PAINT_UNAVAILABLE"].includes(reason) ? reason : "SCREENSHOT_PAINT_UNAVAILABLE");
      }
    },
    capture: async () => {
      assertCurrent();
      await visibleCaptureTab(session);
      assertCurrent();
      clickTarget = await currentClickTarget(session, event);
      assertCurrent();
      try { await chrome.storage.session.set({ [SCREENSHOT_TIMING_KEY]: { pending: true } }); }
      catch { throw new Error("SCREENSHOT_STORAGE_FAILED"); }
      assertCurrent();
      lastStepScreenshotAt = Date.now();
      try {
        return await chrome.tabs.captureVisibleTab(session.windowId, { format: "jpeg", quality: 75 });
      } finally {
        // A completed-call timestamp also protects the quota across MV3 restarts.
        // A pending marker forces a fresh interval when completion is unknown.
        try { await chrome.storage.session.set({ [SCREENSHOT_TIMING_KEY]: { completedAt: Date.now() } }); }
        catch { throw new Error("SCREENSHOT_STORAGE_FAILED"); }
      }
    },
    verifyMasks: async (token) => {
      try { return Boolean((await chrome.scripting.executeScript({ target: { tabId: session.tabId }, func: legacyVerifyMasks, args: [token] }))[0]?.result); }
      catch { throw new Error("SCREENSHOT_MASK_INVALIDATED"); }
    },
    removeMasks: async () => { await chrome.scripting.executeScript({ target: { tabId: session.tabId }, func: legacyRemoveMasks }).catch(() => undefined); }
      });
  */
}

function instructionFor(event) {
  const semanticLabels = new Set(["ボタン", "リンク", "メニュー", "入力欄", "選択欄", "ファイル選択", "保護された入力欄", "操作対象"]);
  const semanticLabel = semanticLabels.has(event.label) ? event.label : "操作対象";
  if (event.kind === "scroll") {
    const label = { up: "上", down: "下", left: "左", right: "右" }[event.direction] || "指定方向";
    return `画面を${label}へスクロールする`;
  }
  if (event.kind === "navigation") return "次のページへ移動する";
  if (event.kind === "input") return `${semanticLabel}に入力する`;
  if (event.kind === "click" && event.label && (event.labelSource === "caption" || !semanticLabels.has(event.label))) return `【${event.label}】をクリック`;
  return `${semanticLabel}を操作する`;
}

async function prepareRetryViewport(session) {
  if (session.phase !== "finish_failed" || session.restorePending || session.mode === "pc") return;
  const viewport = VIEWPORTS[session.mode];
  if (!viewport) return;
  await applyResponsiveViewport({ windowId: session.windowId, tabId: session.tabId, viewport, windowsApi: chrome.windows, measure: measureViewport });
}

async function finishCapture() {
  let session = await getSession();
  if (!session || !["recording", "paused", "finish_failed", "reinjection_failed"].includes(session.phase)) throw new Error("終了できる記録がありません");
  let draftId;
  let imageCount = 0;
  let missingImageCount = 0;
  let readyImageCountKnown = false;
  let reviewImageCount = 0;
  let drainedPendingEvents;
  try {
    await prepareRetryViewport(session);
    const readyImages = await readyImageCount(session);
    if (readyImages === null) throw new Error("CAPTURE_LIVE_READ_FAILED");
    readyImageCountKnown = true;
    if (readyImages >= CLOUD_CLAIM_MAX_ASSETS && session.captureLimitReached !== "images") session = await markCaptureLimit(session, "images");
    const pendingEvents = await stopRecorder(session.tabId, "retain");
    drainedPendingEvents = pendingEvents;
    const acceptedPendingEvents = pendingEventsForSession(session, pendingEvents);
    for (const event of acceptedPendingEvents) session = await recordEventWithoutImage(session, event);
    if (acceptedPendingEvents.length) await persistRecoveryJournal(session.id, acceptedPendingEvents).catch(() => undefined);
    await setSession(session);
    let liveImages;
    try {
      liveImages = await captureLiveStore.list(session.id);
    } catch {
      throw new Error("CAPTURE_LIVE_READ_FAILED");
    }
    const existingDraft = await draftStore.get(session.id);
    if (existingDraft?.id === session.id) {
      draftId = existingDraft.id;
      imageCount = existingDraft.screenshots.length;
      missingImageCount = (existingDraft.steps || []).filter((step) => !step.screenshotId && !["none", "protected"].includes(step.imageState?.status)).length;
      reviewImageCount = (existingDraft.steps || []).filter((step) => step.imageState?.status === "protected").length;
    } else {
      const stateByEventId = new Map(liveImages.map((image) => [image.eventId, image]));
      const refsByEventId = new Map((session.stepImageRefs || []).map((ref) => [ref.eventId, ref]));
      const imageByEventId = new Map(liveImages.filter((image) => {
        const ref = refsByEventId.get(image.eventId);
        return image.status === "ready" && image.dataUrl && (!ref || (ref.version || 1) <= (image.version || 1));
      }).map((image) => [image.eventId, image]));
      const screenshots = session.events
        .map((event) => imageByEventId.get(event.eventId))
        .filter(Boolean)
        .map((image) => ({ id: image.id, dataUrl: image.dataUrl, masks: [], ...(image.annotations ? { annotations: image.annotations } : {}) }));
      if (!session.events.length) {
        await waitForScreenshotSlot(session);
        const result = await takeScreenshot(session);
        const dataUrl = typeof result === "string" ? result : result.dataUrl;
        screenshots.push({ id: crypto.randomUUID(), dataUrl, masks: [] });
      }
      const draft = {
        id: session.id,
        title: "新しい手順書",
        description: "",
        displayMode: session.mode,
        createdAt: new Date(session.startedAt).toISOString(),
        updatedAt: new Date().toISOString(),
        steps: session.events.map((event, index) => ({
          id: crypto.randomUUID(),
          order: index + 1,
          instruction: instructionFor(event),
          ...(imageByEventId.has(event.eventId) ? { screenshotId: imageByEventId.get(event.eventId).id } : {}),
          ...event,
          imageState: finalStepImageState(stateByEventId.get(event.eventId), refsByEventId.get(event.eventId))
        })),
        screenshots
      };
      imageCount = screenshots.length;
      reviewImageCount = draft.steps.filter((step) => step.imageState.status === "protected").length;
      missingImageCount = draft.steps.filter((step) => ["failed", "unavailable"].includes(step.imageState.status)).length;
      await draftStore.put(draft);
      draftId = draft.id;
    }
    await captureLiveStore.clear(session.id);
    await stopRecorder(session.tabId, "release");
    await clearCapturePrivacy(session);
  } catch {
    const retryBase = readyImageCountKnown && drainedPendingEvents !== undefined ? mergePendingEventsWithoutImages(session, drainedPendingEvents) : session;
    const retrySession = { ...retryBase, phase: "finish_failed", finishFailed: true, failureCategory: "draft_finish_failed" };
    const journalSaved = await persistRecoveryJournal(session.id, retrySession.events, "finish_failed").then(() => true, () => false);
    const restored = await attemptRestore(retrySession);
    const sessionSaved = await setSession({ ...retrySession, restorePending: !restored }).then(() => true, () => false);
    if ((journalSaved || sessionSaved) && readyImageCountKnown && drainedPendingEvents !== undefined) await stopRecorder(session.tabId, "release");
    if (!journalSaved && !sessionSaved) throw new Error("端末の保存領域へ記録を保存できませんでした。記録の復旧を保証できません。対象タブを閉じずに空き容量を確認してください。");
    throw new Error(restored
      ? "記録内容はこの端末に保持しています。対象タブを開いて、もう一度「記録を終了して編集」をお試しください。"
      : "記録内容はこの端末に保持しています。画面サイズを元に戻せませんでした。先に復元してから、もう一度お試しください。");
  }
  const restored = await attemptRestore(session);
  if (restored) await setSession(null);
  await clearRecoveryJournal(session.id);
  return { draftId, restorePending: !restored, imageCount, missingImageCount, reviewImageCount };
}

async function cancelCapture() {
  const session = await getSession();
  if (!session) return { cancelled: true, restorePending: false };
  const cancelSession = { ...session, finishFailed: false, failureCategory: "cancel" };
  await retainCancelFailure({ ...cancelSession, restorePending: session.mode !== "pc" || Boolean(session.restorePending) });
  if (Number.isInteger(session.tabId)) await stopRecorder(session.tabId);
  await clearCapturePrivacy(session);
  const shouldRestore = session.mode !== "pc"
    && await windowStillExists(session.windowId);
  const restored = shouldRestore ? await attemptRestore(cancelSession) : true;
  const cleared = await clearLiveCapture(session.id);
  if (!restored || !cleared) {
    await retainCancelFailure({ ...cancelSession, restorePending: !restored });
    throw new Error(!restored
      ? "対象ウィンドウを復元できないため、キャンセルを完了できませんでした。もう一度キャンセルしてください。"
      : "キャンセルした記録の一時画像を削除できませんでした。もう一度キャンセルしてください。");
  }
  if (!await finalizeCancelledSession({ ...cancelSession, restorePending: false })) throw new Error("キャンセルした記録の削除完了を確認できませんでした。もう一度キャンセルしてください。");
  return { cancelled: true, restorePending: false };
}

async function retryRestore() {
  const session = await getSession();
  if (!session?.restorePending && session?.phase !== "starting") return { restored: true };
  const retainAfterCancel = session.phase === "cancel_failed";
  const retainAfterRestore = !retainAfterCancel && Boolean(session.finishFailed);
  const restored = await attemptRestore(session);
  if (restored) {
    if (retainAfterRestore) await setSession({ ...session, phase: "finish_failed", restorePending: false });
    else if (retainAfterCancel) await setSession({ ...session, phase: "cancel_failed", restorePending: false });
    else {
      await setSession(null);
      await clearRecoveryJournal(session.id);
    }
  }
  return { restored };
}

async function pauseCapture() {
  const session = await getSession();
  if (!session || session.phase !== "recording") throw new Error("一時停止できる記録がありません");
  const readyImages = await readyImageCount(session);
  if (readyImages === null) throw new Error("CAPTURE_LIVE_READ_FAILED");
  const pausedIntent = {
    ...session,
    phase: "paused",
    paused: true,
    ...(readyImages >= CLOUD_CLAIM_MAX_ASSETS ? { captureLimitReached: "images" } : {})
  };
  const journalSaved = await persistRecoveryJournal(pausedIntent.id, pausedIntent.events, "paused", pausedIntent.captureLimitReached).then(() => true, () => false);
  const sessionSaved = await setSession(pausedIntent).then(() => true, () => false);
  if (!journalSaved && !sessionSaved) throw new Error("PAUSE_STATE_UNAVAILABLE");
  const pendingEvents = await stopRecorder(session.tabId, "retain");
  let pausedSession = pausedIntent;
  pausedSession = mergePendingEventsWithoutImages(pausedSession, pendingEvents);
  const finalJournalSaved = await persistRecoveryJournal(pausedSession.id, pausedSession.events, "paused", pausedSession.captureLimitReached).then(() => true, () => false);
  const finalSessionSaved = await setSession({ ...pausedSession, paused: true }).then(() => true, () => false);
  if (!finalJournalSaved && !finalSessionSaved) {
    navigationFallback = { sessionId: pausedSession.id, events: pausedSession.events };
    throw new Error("PAUSE_STATE_UNAVAILABLE");
  }
  await stopRecorder(session.tabId, "release");
  return { paused: true };
}

const IMAGE_STATES = new Set(["queued", "capturing", "ready", "unavailable", "failed", "protected", "none"]);
const IMAGE_REASONS = new Set([
  "screen_changed", "navigation_changed", "tab_not_visible", "tab_unavailable", "mask_failed", "mask_invalidated",
  "paint_timeout", "paint_unavailable", "capture_failed", "privacy_budget_exceeded", "storage_failed",
  "capture_interrupted", "capture_not_requested", "protected_region", "protection_too_broad",
  "unsupported_canvas", "unsupported_iframe", "unsupported_closed_shadow", "unsupported_editable", "unknown_field_semantics"
]);

function imageStateFor(value, fallbackStatus = "unavailable") {
  const status = IMAGE_STATES.has(value?.status) ? value.status : fallbackStatus;
  return {
    status,
    reason: IMAGE_REASONS.has(value?.reason) ? value.reason : ["ready", "none", "queued", "capturing"].includes(status) ? null : "capture_interrupted",
    attempts: Number.isSafeInteger(value?.attempts) && value.attempts >= 0 ? value.attempts : 0,
    version: Number.isSafeInteger(value?.version) && value.version > 0 ? value.version : 1
  };
}

function finalStepImageState(stored, ref) {
  const source = ref && (ref.version || 1) > (stored?.version || 1) ? ref : stored || ref;
  const state = imageStateFor(source);
  if (["queued", "capturing"].includes(state.status)) return { ...state, status: "unavailable", reason: "capture_interrupted" };
  if (state.status === "ready" && !stored?.dataUrl) return { ...state, status: "failed", reason: "storage_failed" };
  return state;
}

function imageRefsWithStatus(session, eventId, status, details = {}) {
  const previous = (session.stepImageRefs || []).find((ref) => ref.eventId === eventId);
  const refs = (session.stepImageRefs || []).filter((ref) => ref.eventId !== eventId);
  refs.push({ eventId, ...imageStateFor({ ...previous, ...details, status }) });
  return { ...session, stepImageRefs: refs };
}

function nextCaptureEventGeneration(tabId, eventId, reason = "screen_changed") {
  const ids = captureEventIds.get(tabId) || new Set();
  if (eventId && ids.has(eventId)) return captureEventGenerations.get(tabId);
  if (eventId) {
    ids.add(eventId);
    if (ids.size > MAX_CAPTURE_STEPS) ids.delete(ids.values().next().value);
    captureEventIds.set(tabId, ids);
  }
  const next = { generation: (captureEventGenerations.get(tabId)?.generation || 0) + 1, reason };
  captureEventGenerations.set(tabId, next);
  return next;
}

function assertCaptureGeneration(tabId, generation) {
  if (captureEventGenerations.get(tabId) !== generation) {
    throw new Error(captureEventGenerations.get(tabId)?.reason === "navigation_changed" ? "CAPTURE_NAVIGATION_CHANGED" : "CAPTURE_SCREEN_CHANGED");
  }
}

function captureFailureState(error) {
  const reasons = {
    CAPTURE_SCREEN_CHANGED: ["unavailable", "screen_changed"],
    CAPTURE_NAVIGATION_CHANGED: ["unavailable", "navigation_changed"],
    TARGET_TAB_NOT_VISIBLE: ["unavailable", "tab_not_visible"],
    TARGET_TAB_UNAVAILABLE: ["unavailable", "tab_unavailable"],
    SCREENSHOT_MASK_FAILED: ["failed", "mask_failed"],
    SCREENSHOT_MASK_INVALIDATED: ["failed", "mask_invalidated"],
    SCREENSHOT_PAINT_TIMEOUT: ["failed", "paint_timeout"],
    SCREENSHOT_PAINT_UNAVAILABLE: ["failed", "paint_unavailable"],
    SCREENSHOT_BUDGET_EXCEEDED: ["protected", "privacy_budget_exceeded"],
    SCREENSHOT_STORAGE_FAILED: ["failed", "storage_failed"]
  };
  const [status, reason] = reasons[error?.code || error?.message] || ["failed", "capture_failed"];
  return { status, reason };
}

// A queued image is only taken while the original visible scene is still known.
// This short-lived lease stores no DOM text and never rewrites application data.
function screenshotSceneLease(command, token) {
  const key = "__mecchaManualScreenshotScene";
  if (command === "begin") {
    globalThis[key]?.dispose();
    let changed = false;
    const invalidate = () => { changed = true; };
    // Ignore content-only churn inside a subtree proved display:none at lease
    // creation and still hidden now. Attribute/stylesheet changes still break
    // the lease: they can reveal content or affect the visible layout.
    const hiddenRoots = [];
    if (typeof document.querySelectorAll === "function" && typeof getComputedStyle === "function") {
      let visited = 0;
      for (const element of document.querySelectorAll("*")) {
        if (++visited > 4096) break;
        if (["HTML", "HEAD", "STYLE", "LINK", "SCRIPT"].includes(element.tagName)) continue;
        if (hiddenRoots.some((root) => root.contains(element))) continue;
        if (getComputedStyle(element).display === "none") hiddenRoots.push(element);
      }
    }
    const stylingNode = (node) => {
      const element = node?.nodeType === 3 ? node.parentElement : node;
      return Boolean(element?.closest?.("style,link,head") || element?.matches?.("style,link") || element?.querySelector?.("style,link"));
    };
    const contentStayedHidden = (record) => record.type !== "attributes" && !stylingNode(record.target)
      && ![...record.addedNodes || [], ...record.removedNodes || []].some(stylingNode)
      && hiddenRoots.some((root) => root.isConnected && root.contains(record.target)
        && getComputedStyle(root).display === "none");
    const inspectMutations = (records) => { if (records.some((record) => !contentStayedHidden(record))) changed = true; };
    const observer = new MutationObserver(inspectMutations);
    observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    for (const name of ["scroll", "resize", "input", "click", "pagehide"]) globalThis.addEventListener(name, invalidate, true);
    const state = { token, document, width: innerWidth, height: innerHeight, dispose: () => {
      observer.disconnect();
      for (const name of ["scroll", "resize", "input", "click", "pagehide"]) globalThis.removeEventListener(name, invalidate, true);
      clearTimeout(state.timeout);
      if (globalThis[key] === state) delete globalThis[key];
    }, valid: () => { inspectMutations(observer.takeRecords()); return !changed && state.document === document && state.width === innerWidth && state.height === innerHeight; } };
    state.timeout = setTimeout(state.dispose, 1500);
    globalThis[key] = state;
    return true;
  }
  const state = globalThis[key];
  const valid = Boolean(state?.token === token && state.valid());
  state?.dispose();
  return valid;
}

async function waitForScreenshotSlot(session, assertCurrent = () => undefined) {
  assertCurrent();
  const timing = (await chrome.storage.session.get(SCREENSHOT_TIMING_KEY))[SCREENSHOT_TIMING_KEY];
  if (timing?.pending) lastStepScreenshotAt = Date.now();
  else if (Number.isFinite(timing?.completedAt) && timing.completedAt > lastStepScreenshotAt) lastStepScreenshotAt = timing.completedAt;
  const remaining = Math.min(MIN_STEP_SCREENSHOT_INTERVAL_MS, Math.max(0, MIN_STEP_SCREENSHOT_INTERVAL_MS - (Date.now() - lastStepScreenshotAt)));
  if (!lastStepScreenshotAt || !remaining) return;
  const token = crypto.randomUUID();
  let leaseStarted = false;
  try {
    const [lease] = await chrome.scripting.executeScript({ target: { tabId: session.tabId }, func: screenshotSceneLease, args: ["begin", token] });
    leaseStarted = lease?.result === true;
    if (!leaseStarted) throw new Error("CAPTURE_SCREEN_CHANGED");
    await new Promise((resolve) => setTimeout(resolve, remaining));
    assertCurrent();
    const [verified] = await chrome.scripting.executeScript({ target: { tabId: session.tabId }, func: screenshotSceneLease, args: ["verify", token] });
    leaseStarted = false;
    if (verified?.result !== true) throw new Error("CAPTURE_SCREEN_CHANGED");
  } finally {
    if (leaseStarted) await chrome.scripting.executeScript({ target: { tabId: session.tabId }, func: screenshotSceneLease, args: ["dispose", token] }).catch(() => undefined);
  }
  assertCurrent();
}

async function persistStepImageState(session, eventId, state, image = {}) {
  let next = imageRefsWithStatus(session, eventId, state.status, state);
  const ref = next.stepImageRefs.find((entry) => entry.eventId === eventId);
  try {
    await captureLiveStore.put({ ...image, ...ref, sessionId: session.id });
  } catch {
    next = imageRefsWithStatus(next, eventId, "failed", { reason: "storage_failed" });
    const failure = next.stepImageRefs.find((entry) => entry.eventId === eventId);
    await captureLiveStore.put({ ...failure, sessionId: session.id }).catch(() => undefined);
  }
  await setSession(next);
  return next;
}

async function markCaptureLimit(session, limit) {
  const limited = { ...session, phase: "paused", paused: true, captureLimitReached: limit };
  const journalSaved = await persistRecoveryJournal(limited.id, limited.events || [], "paused", limit).then(() => true, () => false);
  const sessionSaved = await setSession(limited).then(() => true, () => false);
  if (!journalSaved && !sessionSaved) throw new Error("CAPTURE_LIMIT_STATE_UNAVAILABLE");
  if (Number.isInteger(session.tabId)) await stopRecorder(session.tabId);
  return limited;
}

async function readyImageCount(session) {
  try {
    return await captureLiveStore.count(session.id);
  } catch {
    return null;
  }
}

function pendingEventsForSession(session, events) {
  if (session.captureLimitReached === "images" || session.events.length >= MAX_CAPTURE_STEPS) return [];
  return events;
}

function mergePendingEventsWithoutImages(session, events) {
  const accepted = pendingEventsForSession(session, events);
  if (!accepted.length) return session;
  let next = session;
  let reachedStepLimit = false;
  for (const event of accepted) {
    const merged = mergeCaptureEvents(next, [event]);
    if (merged === next) continue;
    if (merged.events.length > MAX_CAPTURE_STEPS) {
      reachedStepLimit = true;
      continue;
    }
    const normalized = merged.events.find((candidate) => candidate.eventId === event.eventId)
      || merged.events.find((candidate) => candidate.at === event.at);
    next = normalized
      ? imageRefsWithStatus(merged, normalized.eventId || `event:${normalized.at}`, "unavailable", { reason: "capture_not_requested" })
      : merged;
  }
  if (reachedStepLimit) next = { ...next, phase: "paused", paused: true, captureLimitReached: "steps" };
  return next;
}

async function recordStepImage(session, eventId, eventGeneration = captureEventGenerations.get(session.tabId)) {
  const previous = session.stepImageRefs?.find((ref) => ref.eventId === eventId);
  const version = (previous?.version || 0) + 1;
  let attempts = previous?.attempts || 0;
  let pendingSession = imageRefsWithStatus(session, eventId, "queued", { reason: null, attempts, version });
  await setSession(pendingSession).catch(() => undefined);
  const assertCurrent = () => assertCaptureGeneration(session.tabId, eventGeneration);
  let state;
  let image = {};
  try {
    await waitForScreenshotSlot(session, assertCurrent);
    assertCurrent();
    attempts += 1;
    pendingSession = imageRefsWithStatus(pendingSession, eventId, "capturing", { attempts });
    await setSession(pendingSession).catch(() => undefined);
    const result = await takeScreenshot(session, assertCurrent, session.events.find((event) => event.eventId === eventId));
    assertCurrent();
    const dataUrl = typeof result === "string" ? result : result.dataUrl;
    state = { status: "ready", reason: null };
    image = { id: crypto.randomUUID(), dataUrl, ...(result.annotations ? { annotations: result.annotations } : {}) };
  } catch (error) {
    // A later screen is never used to silently retry an earlier operation.
    state = captureFailureState(error);
  }
  return persistStepImageState(pendingSession, eventId, { ...state, attempts, version }, image);
}

async function recordEventWithImage(session, event, eventGeneration = captureEventGenerations.get(session.tabId)) {
  const merged = mergeCaptureEvents(session, [event]);
  if (merged === session) return session;
  const readyImages = await readyImageCount(session);
  if (readyImages === null) throw new Error("CAPTURE_LIVE_READ_FAILED");
  if (readyImages >= CLOUD_CLAIM_MAX_ASSETS) {
    return markCaptureLimit(session, "images");
  }
  const next = await appendCaptureEvent(session, event);
  if (next.captureLimitReached) return next;
  if (next === session) return next;
  const normalized = next.events.find((candidate) => candidate.eventId === event.eventId)
    || next.events.find((candidate) => candidate.at === event.at);
  if (!normalized) return next;
  return recordStepImage(next, normalized.eventId || `event:${normalized.at}`, eventGeneration);
}

async function recordEventWithoutImage(session, event) {
  const next = await appendCaptureEvent(session, event);
  if (next === session) return next;
  const normalized = next.events.find((candidate) => candidate.eventId === event.eventId)
    || next.events.find((candidate) => candidate.at === event.at);
  if (!normalized) return next;
  return persistStepImageState(next, normalized.eventId || `event:${normalized.at}`, { status: "unavailable", reason: "capture_not_requested", attempts: 0, version: 1 });
}

async function resumeCapture(tabId) {
  const session = await getSession();
  if (session?.captureLimitReached) throw new Error("CAPTURE_LIMIT_REACHED");
  if (!session || !["paused", "reinjection_failed"].includes(session.phase)) throw new Error("再開できる記録がありません");
  if (tabId !== session.tabId) throw new Error("記録対象のタブを開いてから再開してください");
  let retainedEvents;
  let resumeBase = session;
  try {
    retainedEvents = await stopRecorder(tabId, "retain");
    resumeBase = mergePendingEventsWithoutImages(session, retainedEvents);
    const resumedSession = { ...resumeBase, phase: "recording", paused: false, reinjectionFailed: false, failureCategory: undefined };
    await persistRecoveryJournal(session.id, resumedSession.events || [], "recording");
    await setSession(resumedSession);
    await stopRecorder(tabId, "release");
    await injectRecorder(tabId);
    await clearRecoveryJournal(session.id).catch(() => undefined);
    reinjectionFailureSessionId = null;
    return { resumed: true };
  } catch {
    const recoveredPending = retainedEvents === undefined
      ? undefined
      : await stopRecorder(tabId, "retain").catch(() => undefined);
    const recoveredSession = recoveredPending === undefined
      ? resumeBase
      : mergePendingEventsWithoutImages(resumeBase, recoveredPending);
    const failedSession = { ...recoveredSession, phase: "reinjection_failed", reinjectionFailed: true, failureCategory: "recorder_reinjection_failed" };
    reinjectionFailureSessionId = session.id;
    const journalSaved = await persistRecoveryJournal(session.id, failedSession.events || [], "reinjection_failed").then(() => true, () => false);
    const sessionSaved = await setSession(failedSession).then(() => true, () => false);
    if ((journalSaved || sessionSaved) && recoveredPending !== undefined) await stopRecorder(tabId, "release");
    else if (!journalSaved && !sessionSaved) navigationFallback = { sessionId: session.id, events: failedSession.events || [] };
    throw new Error("このページでは記録を再開できません。対応ページへ戻るか、ここまでの操作で記録を終了して、手順書を編集してください。");
  }
}

async function captureStatus() {
  const session = await getSession();
  return {
    recording: session?.phase === "recording",
    phase: session?.phase ?? null,
    mode: session?.mode,
    sessionId: session?.id,
    events: session?.events || [],
    stepImageRefs: session?.stepImageRefs || [],
    captureLimitReached: session?.captureLimitReached,
    restorePending: Boolean(session?.restorePending || session?.phase === "starting"),
    finishFailed: Boolean(session?.finishFailed),
    reinjectionFailed: Boolean(session?.reinjectionFailed)
  };
}

async function closeCaptureSidePanel(windowId) {
  if (!Number.isInteger(windowId) || !chrome.sidePanel?.close) return { closed: false };
  try {
    await chrome.sidePanel.close({ windowId });
    return { closed: true };
  } catch {
    return { closed: false };
  }
}

if (chrome.action?.onClicked?.addListener && chrome.sidePanel?.open) {
  chrome.action.onClicked.addListener((tab) => {
    if (!tab?.windowId) return;
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => undefined);
  });
}

serializeSessionOperation(recoverInterruptedStartingSession).catch(() => undefined);

const HANDOFF_PAGE_READY_SCHEMA = "meccha-manual/cloud-claim-v1";
const HANDOFF_PAGE_READY_TYPES = new Set(["save", "share"]);
const HANDOFF_PAGE_READY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HANDOFF_PAGE_READY_FINGERPRINT = /^[a-f0-9]{64}$/;
const HANDOFF_EXTENSION_ID_PATTERN = /^[a-p]{32}$/;
const HANDOFF_OPERATION_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HANDOFF_READY_KEY_PREFIX = "meccha-manual:handoff-ready:";
const handoffExternalOperations = new Map();

function recoveryMetadataForHandoff(metadata) {
  if (!metadata || typeof metadata !== "object") return null;
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(metadata.operationId || "") ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(metadata.claimIntentId || "") ||
    !HANDOFF_PAGE_READY_FINGERPRINT.test(metadata.draftFingerprint || "")) return null;
  return metadata;
}

function validHandoffAccessReturnSender(sender) {
  try {
    const url = new URL(sender?.url || "");
    return url.origin === STAGING_ONBOARDING_ORIGIN && url.pathname === "/onboarding/continue" && !url.username && !url.password && sender?.frameId === 0 && Number.isInteger(sender?.tab?.id);
  } catch {
    return false;
  }
}

async function handleInitialHandoffAccessReturn(sender, locked = false) {
  if (!validHandoffAccessReturnSender(sender)) return { ok: false, error: "HANDOFF_ACCESS_RETURN_REJECTED" };
  const values = await chrome.storage.local.get(null);
  const candidates = Object.entries(values || {}).filter(([key, ready]) => {
    if (!key.startsWith(HANDOFF_READY_KEY_PREFIX) || !ready || typeof ready !== "object") return false;
    if (ready.tabId !== sender.tab.id || !["auto", "manual"].includes(ready.activationPolicy) || ready.pageReadyAt ||
      !HANDOFF_PAGE_READY_PATTERN.test(ready.handoffId || "") || !HANDOFF_PAGE_READY_PATTERN.test(ready.launchId || "")) return false;
    return Number(ready.restoreAttempts || 0) < 3;
  });
  if (candidates.length !== 1) return { ok: false, error: "HANDOFF_ACCESS_RETURN_REJECTED" };
  const [readyKey, ready] = candidates[0];
  if (!locked) return withHandoffReadyLock(ready.handoffId, () => handleInitialHandoffAccessReturn(sender, true));
  const metadataKey = handoffStorageKey(ready.handoffId);
  const metadata = values?.[metadataKey];
  const readyExpiresAt = Date.parse(ready.expiresAt || "");
  const metadataExpiresAt = Date.parse(metadata?.expiresAt || "");
  const pendingRecovery = metadata?.status === "finalize-pending" || metadata?.status === "completion-pending";
  const validIdentity = !metadata?.operationId || /^[A-Za-z0-9_-]{16,128}$/.test(metadata.operationId);
  const validMetadata = metadata?.handoffId === ready.handoffId && HANDOFF_EXTENSION_ID_PATTERN.test(metadata.extensionId || "") &&
    HANDOFF_PAGE_READY_TYPES.has(metadata.outputAction) && HANDOFF_PAGE_READY_FINGERPRINT.test(metadata.draftFingerprint || "") &&
    Number.isFinite(readyExpiresAt) && Number.isFinite(metadataExpiresAt) && ready.expiresAt === metadata.expiresAt &&
    validIdentity && metadata.status !== "completed" &&
    (pendingRecovery ? recoveryMetadataForHandoff(metadata) !== null : metadataExpiresAt > Date.now());
  if (!validMetadata) return { ok: false, error: "HANDOFF_ACCESS_RETURN_REJECTED" };
  let pendingUrl;
  try {
    pendingUrl = buildContinueUrl(STAGING_ONBOARDING_ORIGIN, ready.handoffId, metadata.extensionId, recoveryMetadataForHandoff(metadata), ready.requestedAction ?? metadata.outputAction, ready.launchId);
  } catch {
    return { ok: false, error: "HANDOFF_ACCESS_RETURN_REJECTED" };
  }
  await chrome.storage.local.set({ [readyKey]: { ...ready, restoreAttempts: Number(ready.restoreAttempts || 0) + 1 } });
  try {
    await chrome.tabs.update(sender.tab.id, { url: pendingUrl });
  } catch {
    return { ok: false, error: "HANDOFF_ACCESS_RETURN_RETRYABLE" };
  }
  return { ok: true, status: pendingRecovery ? "recovery" : "restored" };
}

async function handleHandoffAccessReturn(message, sender) {
  const initialMessage = message && typeof message === "object" && !Array.isArray(message) &&
    message.schema === HANDOFF_PAGE_READY_SCHEMA && message.type === "handoff.access-return" &&
    Object.keys(message).length === 2;
  if (initialMessage) return handleInitialHandoffAccessReturn(sender);
  const validMessage = message && typeof message === "object" && !Array.isArray(message) &&
    message.schema === HANDOFF_PAGE_READY_SCHEMA && message.type === "handoff.access-return" &&
    HANDOFF_PAGE_READY_PATTERN.test(message.handoffId || "") && HANDOFF_PAGE_READY_PATTERN.test(message.launchId || "") &&
    HANDOFF_EXTENSION_ID_PATTERN.test(message.extensionId || "") && HANDOFF_OPERATION_ID_PATTERN.test(message.operationId || "") &&
    HANDOFF_PAGE_READY_TYPES.has(message.action) && HANDOFF_PAGE_READY_FINGERPRINT.test(message.draftFingerprint || "") &&
    typeof message.expiresAt === "string" && Object.keys(message).every((key) => ["schema", "type", "handoffId", "launchId", "extensionId", "operationId", "action", "draftFingerprint", "expiresAt"].includes(key));
  if (!validMessage || !validHandoffAccessReturnSender(sender)) return { ok: false, error: "HANDOFF_ACCESS_RETURN_REJECTED" };
  const handoffId = message.handoffId;
  const readyKey = handoffReadyStorageKey(handoffId, message.launchId);
  const metadataKey = handoffStorageKey(handoffId);
  return withHandoffReadyLock(handoffId, async () => {
    const values = await chrome.storage.local.get([readyKey, metadataKey]);
    const ready = values?.[readyKey];
    const metadata = values?.[metadataKey];
    const readyExpiresAt = Date.parse(ready?.expiresAt || "");
    const metadataExpiresAt = Date.parse(metadata?.expiresAt || "");
    const pendingRecovery = metadata?.status === "finalize-pending" || metadata?.status === "completion-pending";
    const validExpiry = Number.isFinite(readyExpiresAt) && Number.isFinite(metadataExpiresAt) && ready.expiresAt === metadata.expiresAt && metadata.expiresAt === message.expiresAt;
    const validIdentity = !metadata?.operationId || metadata.operationId === message.operationId;
    if (!ready || ready.tabId !== sender.tab.id || ready.handoffId !== handoffId || ready.launchId !== message.launchId || ready.activationPolicy === "cancelled" || Number(ready.restoreAttempts || 0) >= 3 ||
      !metadata || metadata.handoffId !== handoffId || metadata.extensionId !== message.extensionId || metadata.outputAction !== message.action || metadata.draftFingerprint !== message.draftFingerprint || !validExpiry || !validIdentity || metadata.status === "completed" ||
      (!pendingRecovery && metadataExpiresAt <= Date.now())) return { ok: false, error: "HANDOFF_ACCESS_RETURN_REJECTED" };
    let pendingUrl;
    try {
      pendingUrl = buildContinueUrl(STAGING_ONBOARDING_ORIGIN, handoffId, metadata.extensionId, recoveryMetadataForHandoff(metadata), ready.requestedAction ?? metadata.outputAction, message.launchId);
    } catch {
      return { ok: false, error: "HANDOFF_ACCESS_RETURN_REJECTED" };
    }
    await chrome.storage.local.set({ [readyKey]: { ...ready, restoreAttempts: Number(ready.restoreAttempts || 0) + 1 } });
    try {
      await chrome.tabs.update(sender.tab.id, { url: pendingUrl });
    } catch {
      return { ok: false, error: "HANDOFF_ACCESS_RETURN_RETRYABLE" };
    }
    return { ok: true, status: pendingRecovery ? "recovery" : "restored" };
  });
}

function queueHandoffExternalOperation(message, sender, callback) {
  const handoffId = message?.handoffId;
  if (!HANDOFF_PAGE_READY_PATTERN.test(handoffId || "")) return callback();
  const senderTabId = Number.isInteger(sender?.tab?.id) ? sender.tab.id : "";
  const operationKey = message?.type === "handoff.page-ready"
    ? `${handoffId}:${message.launchId || ""}:${senderTabId}:${message.action || ""}`
    : `${handoffId}:${message.action || ""}`;
  const previous = handoffExternalOperations.get(operationKey) || Promise.resolve();
  const operation = previous.catch(() => undefined).then(callback);
  handoffExternalOperations.set(operationKey, operation);
  return operation.finally(() => {
    if (handoffExternalOperations.get(operationKey) === operation) handoffExternalOperations.delete(operationKey);
  });
}

function validHandoffPageReadySender(sender) {
  try {
    const url = new URL(sender?.url || "");
    return url.origin === STAGING_ONBOARDING_ORIGIN && url.pathname === "/onboarding/continue" && !url.username && !url.password && sender?.frameId === 0 && Number.isInteger(sender?.tab?.id);
  } catch {
    return false;
  }
}

async function handleHandoffPageReady(message, sender) {
  const validMessage = message && typeof message === "object" && !Array.isArray(message) &&
    message.schema === HANDOFF_PAGE_READY_SCHEMA && message.type === "handoff.page-ready" &&
    HANDOFF_PAGE_READY_PATTERN.test(message.handoffId || "") && HANDOFF_PAGE_READY_PATTERN.test(message.launchId || "") &&
    HANDOFF_PAGE_READY_TYPES.has(message.action) && Object.keys(message).every((key) => ["schema", "type", "handoffId", "launchId", "action"].includes(key));
  if (!validMessage || !validHandoffPageReadySender(sender)) return { ok: false, error: "HANDOFF_PAGE_READY_REJECTED" };
  const key = handoffStorageKey(message.handoffId);
  const readyKey = handoffReadyStorageKey(message.handoffId, message.launchId);
  return withHandoffReadyLock(message.handoffId, async () => {
    const stored = (await chrome.storage.local.get(key))?.[key];
    const ready = (await chrome.storage.local.get(readyKey))?.[readyKey];
    const expiresAt = Date.parse(stored?.expiresAt || "");
    if (!stored || stored.handoffId !== message.handoffId || stored.outputAction !== message.action || !HANDOFF_PAGE_READY_FINGERPRINT.test(stored.draftFingerprint || "") || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return { ok: false, error: "HANDOFF_PAGE_READY_REJECTED" };
    if (!ready || ready.handoffId !== message.handoffId || ready.launchId !== message.launchId || ready.tabId !== sender.tab.id) return { ok: false, error: "HANDOFF_PAGE_READY_REJECTED" };
    if (Number.isFinite(Date.parse(ready?.pageReadyAt || "")) && Number.isFinite(Date.parse(ready?.activatedAt || ""))) return { ok: true, status: "ready", extensionId: stored.extensionId, draftFingerprint: stored.draftFingerprint, expiresAt: stored.expiresAt };
    if (ready?.activationPolicy === "cancelled") return { ok: false, error: "HANDOFF_PAGE_READY_REJECTED" };
    const activationDeadlineAt = Date.parse(ready?.activationDeadlineAt || "");
    if (ready?.activationPolicy === "manual" || (Number.isFinite(activationDeadlineAt) && activationDeadlineAt < Date.now())) return { ok: true, status: "manual", extensionId: stored.extensionId, draftFingerprint: stored.draftFingerprint, expiresAt: stored.expiresAt };
    if (Number.isFinite(Date.parse(ready?.pageReadyAt || ""))) return { ok: true, status: "ready", extensionId: stored.extensionId, draftFingerprint: stored.draftFingerprint, expiresAt: stored.expiresAt };
    const latest = (await chrome.storage.local.get(key))?.[key];
    const latestReady = (await chrome.storage.local.get(readyKey))?.[readyKey];
    if (!latest || latest.handoffId !== message.handoffId || latest.outputAction !== message.action) return { ok: false, error: "HANDOFF_PAGE_READY_REJECTED" };
    if (!latestReady || latestReady.handoffId !== message.handoffId || latestReady.launchId !== message.launchId || latestReady.tabId !== sender.tab.id) return { ok: false, error: "HANDOFF_PAGE_READY_REJECTED" };
    const readyAt = new Date().toISOString();
    await chrome.storage.local.set({ [readyKey]: { ...latestReady, pageReadyAt: readyAt, activatedAt: null } });
    return { ok: true, status: "ready", extensionId: latest.extensionId, draftFingerprint: latest.draftFingerprint, expiresAt: latest.expiresAt };
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    const fromExtensionPage = !sender.tab || sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`);
    if (message?.schema === HANDOFF_PAGE_READY_SCHEMA && message?.type === "handoff.access-return") return handleHandoffAccessReturn(message, sender);
    if (message?.type === "capture:start" && fromExtensionPage) return serializeSessionOperation(() => startCapture(message.tabId, message.mode));
    if (message?.type === "capture:finish" && fromExtensionPage) return serializeSessionOperation(() => finishCapture());
    if (message?.type === "capture:pause" && fromExtensionPage) return serializeSessionOperation(() => pauseCapture());
    if (message?.type === "capture:cancel" && fromExtensionPage) return serializeSessionOperation(() => cancelCapture());
    if (message?.type === "capture:restore" && fromExtensionPage) return serializeSessionOperation(() => retryRestore());
    if (message?.type === "capture:resume" && fromExtensionPage) return serializeSessionOperation(() => resumeCapture(message.tabId));
    if (message?.type === "capture:close-panel" && fromExtensionPage) return closeCaptureSidePanel(message.windowId);
    if (message?.type === "editor:ready" && fromExtensionPage) return { ready: message.ready === true };
    if (message?.type === "capture:status") return captureStatus();
    if (message?.type === "capture:event") {
      const eventGeneration = Number.isInteger(sender.tab?.id) ? nextCaptureEventGeneration(sender.tab.id, message.event?.eventId) : undefined;
      return serializeSessionOperation(async () => {
        const session = await getSession();
        if (session?.phase !== "recording" || sender.tab?.id !== session.tabId) return { accepted: false };
        const recorded = await recordEventWithImage(session, message.event, eventGeneration);
        return recorded.captureLimitReached
          ? { accepted: false, error: "CAPTURE_LIMIT_REACHED" }
          : { accepted: true };
      });
    }
    throw new TypeError("不正なメッセージです");
  })().then((value) => sendResponse({ ok: true, value }), () => sendResponse({ ok: false, error: "操作を完了できませんでした。記録データはこの端末に残っています。もう一度お試しください。" }));
  return true;
});

chrome.runtime.onMessageExternal?.addListener((message, sender, sendResponse) => {
  const handler = message?.type === "handoff.page-ready" ? handleHandoffPageReady : message?.type === "handoff.access-return" ? handleHandoffAccessReturn : handleExternalCloudClaimMessage;
  queueHandoffExternalOperation(message, sender, () => handler(message, sender)).then(sendResponse, () => sendResponse({ ok: false, error: "HANDOFF_FAILED" }));
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading" || changeInfo.status === "complete" || changeInfo.url) nextCaptureEventGeneration(tabId, undefined, "navigation_changed");
  if (changeInfo.status !== "complete") return;
  const eventGeneration = captureEventGenerations.get(tabId);
  serializeSessionOperation(async () => {
    const session = await getSession();
    if (session?.phase !== "recording" || session.tabId !== tabId) return;
    if (session.events.length >= MAX_CAPTURE_STEPS) {
      await markCaptureLimit(session, "steps");
      return;
    }
    const readyImages = await readyImageCount(session);
    if (readyImages === null) {
      reinjectionFailureSessionId = session.id;
      const failedSession = {
        ...session,
        phase: "reinjection_failed",
        reinjectionFailed: true,
        failureCategory: "capture_live_read_failed"
      };
      await persistRecoveryJournal(session.id, failedSession.events || [], "reinjection_failed").catch(() => undefined);
      await setSession(failedSession).catch(() => undefined);
      return;
    }
    if (readyImages >= CLOUD_CLAIM_MAX_ASSETS) {
      await markCaptureLimit(session, "images");
      return;
    }
    const navigationEvent = { kind: "navigation", at: Date.now(), eventId: `navigation:${crypto.randomUUID()}` };
    const withNavigation = mergeCaptureEvents(session, [navigationEvent]);
    try {
      await setSession(withNavigation);
    } catch {
      const events = navigationFallbackEvents(session.id, navigationEvent);
      try {
        await persistRecoveryJournal(session.id, events);
        clearNavigationFallback(session.id);
      } catch {
        navigationFallback = { sessionId: session.id, events };
      }
    }
    try {
      await injectRecorder(tabId);
    } catch {
      reinjectionFailureSessionId = session.id;
      const failedSession = {
        ...withNavigation,
        phase: "reinjection_failed",
        reinjectionFailed: true,
        failureCategory: "recorder_reinjection_failed"
      };
      try {
        await setSession(failedSession);
      } catch {
        await persistRecoveryJournal(session.id, [], "reinjection_failed").catch(() => undefined);
      }
      return;
    }
    try {
      await recordStepImage(withNavigation, navigationEvent.eventId, eventGeneration);
    } catch {
      await persistRecoveryJournal(session.id, navigationFallbackEvents(session.id, navigationEvent), "recording").catch(() => undefined);
    }
  }).catch(() => undefined);
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  nextCaptureEventGeneration(tabId, undefined, "navigation_changed");
  captureEventIds.delete(tabId);
  serializeSessionOperation(async () => {
    const session = await getSession();
    if (session?.tabId !== tabId) return;
    if (removeInfo?.isWindowClosing) {
      clearNavigationFallback(session.id);
      const cancelSession = { ...session, finishFailed: false, failureCategory: "cancel" };
      await retainCancelFailure({ ...cancelSession, restorePending: false });
      if (!await clearLiveCapture(session.id)) {
        return;
      }
      await finalizeCancelledSession({ ...cancelSession, restorePending: false });
      return;
    }
    let windowExists = true;
    try {
      await chrome.windows.get(session.windowId);
      const remainingTabs = await chrome.tabs.query({ windowId: session.windowId });
      if (remainingTabs.length === 0) windowExists = false;
    } catch {
      windowExists = false;
    }
    if (!windowExists) {
      const cancelSession = { ...session, finishFailed: false, failureCategory: "cancel" };
      await retainCancelFailure({ ...cancelSession, restorePending: false });
      if (!await clearLiveCapture(session.id)) {
        return;
      }
      await finalizeCancelledSession({ ...cancelSession, restorePending: false });
      return;
    }
    const cancelSession = { ...session, finishFailed: false, failureCategory: "cancel" };
    await retainCancelFailure({ ...cancelSession, restorePending: session.mode !== "pc" || Boolean(session.restorePending) });
    if (!await clearLiveCapture(session.id)) {
      const restored = session.mode === "pc" ? true : await attemptRestore(cancelSession);
      await retainCancelFailure({ ...cancelSession, restorePending: !restored });
      return;
    }
    const restored = session.mode === "pc" ? true : await attemptRestore(cancelSession);
    if (restored) {
      await finalizeCancelledSession({ ...cancelSession, restorePending: false });
    } else {
      await retainCancelFailure({ ...cancelSession, restorePending: true });
    }
  }).catch(() => undefined);
});
