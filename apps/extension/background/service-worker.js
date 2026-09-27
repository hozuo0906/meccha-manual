import { normalizeCaptureEvent } from "../capture/privacy.js";
import { captureWithMaskBoundary, installSensitiveMasks, removeSensitiveMasks, verifySensitiveMasks } from "../capture/screenshot.js";
import { VIEWPORTS } from "../responsive/viewports.js";
import { applyResponsiveViewport, originalWindowSnapshot, restoreOriginalWindow } from "../responsive/window-lifecycle.js";
import { draftStore } from "../storage/draft-store.js";
import { captureLiveStore as importedCaptureLiveStore } from "../storage/capture-live-store.js";
import { mergeCaptureEvents } from "./event-merge.js";
import { nextRecoveryJournal } from "./recovery-journal.js";
import { recoverWindowSession } from "./session-recovery.js";
import { CLOUD_CLAIM_MAX_ASSETS, handleExternalCloudClaimMessage } from "./cloud-claim.js";
import { STAGING_ONBOARDING_ORIGIN } from "../onboarding-config.js";
import { handoffReadyStorageKey, handoffStorageKey, withHandoffReadyLock } from "../editor/handoff.js";

const SESSION_KEY = "activeCaptureSession";
const RECOVERY_KEY = "captureRecoveryJournal";
let sessionOperation = Promise.resolve();
let reinjectionFailureSessionId = null;
let navigationFallback = null;
let lastStepScreenshotAt = 0;
const captureEventGenerations = new Map();
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

async function persistRecoveryJournal(sessionId, events = [], phase) {
  const current = await readRecoveryJournal();
  const next = nextRecoveryJournal(current, { sessionId, events, phase });
  await chrome.storage.local.set({ [RECOVERY_KEY]: next });
  if (phase && phase !== "reinjection_failed") clearReinjectionFailureMarker(sessionId);
  return next;
}

async function clearRecoveryJournal(sessionId) {
  const current = await readRecoveryJournal();
  if (!current || !sessionId || current.sessionId === sessionId) await chrome.storage.local.remove(RECOVERY_KEY);
}

async function clearLiveCapture(sessionId) {
  if (!sessionId) return;
  await captureLiveStore.clear(sessionId).catch(() => undefined);
}

async function getSession() {
  let session = (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY] ?? null;
  if (!session) {
    clearNavigationFallback();
    return null;
  }
  if (session.id === reinjectionFailureSessionId) session = { ...session, phase: "reinjection_failed", reinjectionFailed: true };
  const recovery = await readRecoveryJournal();
  if (recovery?.sessionId === session.id) session = mergeCaptureEvents(session, recovery.events || []);
  if (navigationFallback?.sessionId === session.id) session = mergeCaptureEvents(session, navigationFallback.events || []);
  else clearNavigationFallback();
  if (recovery?.sessionId === session.id && recovery.phase && session.id !== reinjectionFailureSessionId) {
    return { ...session, phase: recovery.phase, finishFailed: recovery.phase === "finish_failed" || session.finishFailed };
  }
  return session;
}

async function setSession(session) {
  if (session) {
    await chrome.storage.session.set({ [SESSION_KEY]: session });
    clearNavigationFallback(session.id);
    if (session.phase !== "reinjection_failed") clearReinjectionFailureMarker(session.id);
  } else {
    await chrome.storage.session.remove(SESSION_KEY);
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

async function stopRecorder(tabId) {
  const results = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: () => globalThis.__mecchaManualRecorder?.() }).catch(() => []);
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
  lastStepScreenshotAt = 0;
  await clearRecoveryJournal();
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

async function takeMaskedScreenshot(session) {
  return captureWithMaskBoundary({
    applyMasks: async () => (await chrome.scripting.executeScript({ target: { tabId: session.tabId }, func: installSensitiveMasks }))[0]?.result,
    waitForPaint: async () => {
      const tab = await chrome.tabs.get(session.tabId);
      if (!tab.active || tab.windowId !== session.windowId) throw new Error("TARGET_TAB_NOT_VISIBLE");
      const [paintResult] = await chrome.scripting.executeScript({
        target: { tabId: session.tabId },
        func: () => new Promise((resolve, reject) => {
          if (document.visibilityState === "hidden") {
            reject(new Error("TARGET_TAB_NOT_VISIBLE"));
            return;
          }
          let settled = false;
          const fail = (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            reject(error);
          };
          const finish = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            resolve(true);
          };
          const timeout = setTimeout(() => fail(new Error("SCREENSHOT_PAINT_TIMEOUT")), 1000);
          if (typeof requestAnimationFrame !== "function") {
            fail(new Error("SCREENSHOT_PAINT_UNAVAILABLE"));
            return;
          }
          try {
            requestAnimationFrame(() => {
              try {
                requestAnimationFrame(finish);
              } catch (error) {
                fail(error);
              }
            });
          } catch (error) {
            fail(error);
          }
        })
      });
      if (paintResult?.result !== true) throw new Error("SCREENSHOT_PAINT_UNAVAILABLE");
    },
    capture: async () => {
      const tab = await chrome.tabs.get(session.tabId);
      if (!tab.active || tab.windowId !== session.windowId) throw new Error("TARGET_TAB_NOT_VISIBLE");
      return chrome.tabs.captureVisibleTab(session.windowId, { format: "jpeg", quality: 75 });
    },
    verifyMasks: async (token) => Boolean((await chrome.scripting.executeScript({
      target: { tabId: session.tabId },
      func: verifySensitiveMasks,
      args: [token]
    }))[0]?.result),
    removeMasks: async () => { await chrome.scripting.executeScript({ target: { tabId: session.tabId }, func: removeSensitiveMasks }).catch(() => undefined); }
  });
}

function instructionFor(event) {
  const semanticLabel = {
    "ボタン": "ボタン",
    "リンク": "リンク",
    "メニュー": "メニュー",
    "入力欄": "入力欄",
    "選択欄": "選択欄",
    "ファイル選択": "ファイル選択",
    "保護された入力欄": "保護された入力欄",
    "操作対象": "操作対象"
  }[event.label] || "操作対象";
  if (event.kind === "scroll") {
    const label = { up: "上", down: "下", left: "左", right: "右" }[event.direction] || "指定方向";
    return `画面を${label}へスクロールする`;
  }
  if (event.kind === "navigation") return "次のページへ移動する";
  if (event.kind === "input") return `${semanticLabel}に入力する`;
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
  try {
    await prepareRetryViewport(session);
    const pendingEvents = await stopRecorder(session.tabId);
    for (const event of pendingEvents) session = await recordEventWithoutImage(session, event);
    if (pendingEvents.length) await persistRecoveryJournal(session.id, pendingEvents).catch(() => undefined);
    await setSession(session);
    let liveImages;
    try {
      liveImages = (await captureLiveStore.list(session.id)).filter((image) => image.status === "ready" && image.dataUrl);
    } catch {
      throw new Error("CAPTURE_LIVE_READ_FAILED");
    }
    const existingDraft = await draftStore.get(session.id);
    if (existingDraft?.id === session.id) {
      draftId = existingDraft.id;
      imageCount = existingDraft.screenshots.length;
      missingImageCount = Math.max(0, session.events.length - imageCount);
    } else {
      const imageByEventId = new Map(liveImages.map((image) => [image.eventId, image]));
      const screenshots = session.events
        .map((event) => imageByEventId.get(event.eventId))
        .filter(Boolean)
        .map((image) => ({ id: image.id, dataUrl: image.dataUrl, masks: [] }));
      if (!session.events.length) {
        const dataUrl = await takeMaskedScreenshot(session);
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
          ...event
        })),
        screenshots
      };
      imageCount = screenshots.length;
      missingImageCount = Math.max(0, session.events.length - imageCount);
      await draftStore.put(draft);
      draftId = draft.id;
    }
    await captureLiveStore.clear(session.id).catch(() => undefined);
  } catch {
    const pendingEvents = await stopRecorder(session.tabId);
    for (const event of pendingEvents) session = await recordEventWithoutImage(session, event);
    const retrySession = { ...session, phase: "finish_failed", finishFailed: true, failureCategory: "draft_finish_failed" };
    const journalSaved = await persistRecoveryJournal(session.id, retrySession.events, "finish_failed").then(() => true, () => false);
    const restored = await attemptRestore(retrySession);
    const sessionSaved = await setSession({ ...retrySession, restorePending: !restored }).then(() => true, () => false);
    if (!journalSaved && !sessionSaved) throw new Error("端末の保存領域へ記録を保存できませんでした。記録の復旧を保証できません。対象タブを閉じずに空き容量を確認してください。");
    throw new Error(restored
      ? "記録内容はこの端末に保持しています。対象タブを開いて、もう一度「記録を終了して編集」をお試しください。"
      : "記録内容はこの端末に保持しています。画面サイズを元に戻せませんでした。先に復元してから、もう一度お試しください。");
  }
  const restored = await attemptRestore(session);
  if (restored) await setSession(null);
  await clearRecoveryJournal(session.id);
  return { draftId, restorePending: !restored, imageCount, missingImageCount };
}

async function cancelCapture() {
  const session = await getSession();
  if (!session) return { cancelled: true, restorePending: false };
  await stopRecorder(session.tabId);
  const cancelSession = { ...session, finishFailed: false, failureCategory: "cancel" };
  const restored = await attemptRestore(cancelSession);
  await clearLiveCapture(session.id);
  if (restored) {
    await setSession(null);
    await clearRecoveryJournal(session.id);
  }
  return { cancelled: true, restorePending: !restored };
}

async function retryRestore() {
  const session = await getSession();
  if (!session?.restorePending && session?.phase !== "starting") return { restored: true };
  const retainAfterRestore = Boolean(session.finishFailed);
  const restored = await attemptRestore(session);
  if (restored) {
    if (retainAfterRestore) await setSession({ ...session, phase: "finish_failed", restorePending: false });
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
  const pendingEvents = await stopRecorder(session.tabId);
  let pausedSession = { ...session, phase: "paused" };
  for (const event of pendingEvents) pausedSession = await recordEventWithoutImage(pausedSession, event);
  await persistRecoveryJournal(pausedSession.id, pausedSession.events, "paused");
  await setSession({ ...pausedSession, paused: true });
  return { paused: true };
}

function imageRefsWithStatus(session, eventId, status) {
  const refs = (session.stepImageRefs || []).filter((ref) => ref.eventId !== eventId);
  refs.push({ eventId, status });
  return { ...session, stepImageRefs: refs };
}

function nextCaptureEventGeneration(tabId) {
  const next = (captureEventGenerations.get(tabId) || 0) + 1;
  captureEventGenerations.set(tabId, next);
  return next;
}

async function markCaptureLimit(session, limit) {
  const limited = { ...session, phase: "paused", paused: true, captureLimitReached: limit };
  await setSession(limited).catch(() => undefined);
  return limited;
}

async function recordStepImage(session, eventId, eventGeneration = captureEventGenerations.get(session.tabId)) {
  let pendingSession = imageRefsWithStatus(session, eventId, "capturing");
  await setSession(pendingSession).catch(() => undefined);
  try {
    const elapsed = Date.now() - lastStepScreenshotAt;
    if (lastStepScreenshotAt && elapsed < MIN_STEP_SCREENSHOT_INTERVAL_MS) {
      pendingSession = imageRefsWithStatus(pendingSession, eventId, "unavailable");
      await setSession(pendingSession).catch(() => undefined);
      return pendingSession;
    }
    lastStepScreenshotAt = Date.now();
    const dataUrl = await takeMaskedScreenshot(session);
    if (captureEventGenerations.get(session.tabId) !== eventGeneration) {
      pendingSession = imageRefsWithStatus(pendingSession, eventId, "unavailable");
      await setSession(pendingSession).catch(() => undefined);
      return pendingSession;
    }
    await captureLiveStore.put({ id: crypto.randomUUID(), dataUrl, status: "ready", eventId, sessionId: session.id });
    pendingSession = imageRefsWithStatus(pendingSession, eventId, "ready");
  } catch {
    pendingSession = imageRefsWithStatus(pendingSession, eventId, "failed");
  }
  await setSession(pendingSession).catch(() => undefined);
  return pendingSession;
}

async function recordEventWithImage(session, event, eventGeneration = captureEventGenerations.get(session.tabId)) {
  const merged = mergeCaptureEvents(session, [event]);
  if (merged === session) return session;
  if (session.stepImageRefs?.length >= CLOUD_CLAIM_MAX_ASSETS) return markCaptureLimit(session, "images");
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
  const unavailable = imageRefsWithStatus(next, normalized.eventId || `event:${normalized.at}`, "unavailable");
  await setSession(unavailable);
  return unavailable;
}

async function resumeCapture(tabId) {
  const session = await getSession();
  if (session?.captureLimitReached) throw new Error("CAPTURE_LIMIT_REACHED");
  if (!session || !["paused", "reinjection_failed"].includes(session.phase)) throw new Error("再開できる記録がありません");
  if (tabId !== session.tabId) throw new Error("記録対象のタブを開いてから再開してください");
  try {
    await injectRecorder(tabId);
    const resumedSession = { ...session, phase: "recording", paused: false, reinjectionFailed: false, failureCategory: undefined };
    await persistRecoveryJournal(session.id, resumedSession.events || [], "recording");
    await setSession(resumedSession);
    await clearRecoveryJournal(session.id).catch(() => undefined);
    reinjectionFailureSessionId = null;
    return { resumed: true };
  } catch {
    const failedSession = { ...session, phase: "reinjection_failed", reinjectionFailed: true, failureCategory: "recorder_reinjection_failed" };
    await persistRecoveryJournal(session.id, failedSession.events || [], "reinjection_failed").catch(() => undefined);
    await setSession(failedSession).catch(() => undefined);
    throw new Error("このページでは記録を再開できません。対応ページへ戻るか、ここまでの内容を終了して編集してください。");
  }
}

async function captureStatus() {
  await sessionOperation.catch(() => undefined);
  const session = await getSession();
  return {
    recording: session?.phase === "recording",
    phase: session?.phase ?? null,
    mode: session?.mode,
    sessionId: session?.id,
    events: session?.events || [],
    stepImageRefs: session?.stepImageRefs || [],
    restorePending: Boolean(session?.restorePending || session?.phase === "starting"),
    finishFailed: Boolean(session?.finishFailed),
    reinjectionFailed: Boolean(session?.reinjectionFailed)
  };
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
const handoffExternalOperations = new Map();

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
    if (Number.isFinite(Date.parse(ready?.pageReadyAt || "")) && Number.isFinite(Date.parse(ready?.activatedAt || ""))) return { ok: true, status: "ready" };
    if (ready?.activationPolicy === "cancelled") return { ok: false, error: "HANDOFF_PAGE_READY_REJECTED" };
    const activationDeadlineAt = Date.parse(ready?.activationDeadlineAt || "");
    if (ready?.activationPolicy === "manual" || (Number.isFinite(activationDeadlineAt) && activationDeadlineAt < Date.now())) return { ok: true, status: "manual" };
    try {
      await chrome.tabs.update(sender.tab.id, { active: true });
    } catch {
      return { ok: false, error: "HANDOFF_PAGE_READY_REJECTED" };
    }
    const latest = (await chrome.storage.local.get(key))?.[key];
    const latestReady = (await chrome.storage.local.get(readyKey))?.[readyKey];
    if (!latest || latest.handoffId !== message.handoffId || latest.outputAction !== message.action) return { ok: false, error: "HANDOFF_PAGE_READY_REJECTED" };
    if (!latestReady || latestReady.handoffId !== message.handoffId || latestReady.launchId !== message.launchId || latestReady.tabId !== sender.tab.id) return { ok: false, error: "HANDOFF_PAGE_READY_REJECTED" };
    const readyAt = new Date().toISOString();
    await chrome.storage.local.set({ [readyKey]: { ...latestReady, pageReadyAt: readyAt, activatedAt: readyAt } });
    return { ok: true, status: "ready" };
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    const fromExtensionPage = !sender.tab || sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`);
    if (message?.type === "capture:start" && fromExtensionPage) return serializeSessionOperation(() => startCapture(message.tabId, message.mode));
    if (message?.type === "capture:finish" && fromExtensionPage) return serializeSessionOperation(() => finishCapture());
    if (message?.type === "capture:pause" && fromExtensionPage) return serializeSessionOperation(() => pauseCapture());
    if (message?.type === "capture:cancel" && fromExtensionPage) return serializeSessionOperation(() => cancelCapture());
    if (message?.type === "capture:restore" && fromExtensionPage) return serializeSessionOperation(() => retryRestore());
    if (message?.type === "capture:resume" && fromExtensionPage) return serializeSessionOperation(() => resumeCapture(message.tabId));
    if (message?.type === "capture:status") return captureStatus();
    if (message?.type === "capture:event") {
      const eventGeneration = Number.isInteger(sender.tab?.id) ? nextCaptureEventGeneration(sender.tab.id) : undefined;
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
  const handler = message?.type === "handoff.page-ready" ? handleHandoffPageReady : handleExternalCloudClaimMessage;
  queueHandoffExternalOperation(message, sender, () => handler(message, sender)).then(sendResponse, () => sendResponse({ ok: false, error: "HANDOFF_FAILED" }));
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  serializeSessionOperation(async () => {
    const session = await getSession();
    if (session?.phase !== "recording" || session.tabId !== tabId) return;
    if (session.events.length >= MAX_CAPTURE_STEPS) {
      await markCaptureLimit(session, "steps");
      return;
    }
    if (session.stepImageRefs?.length >= CLOUD_CLAIM_MAX_ASSETS) {
      await markCaptureLimit(session, "images");
      return;
    }
    const eventGeneration = nextCaptureEventGeneration(tabId);
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
      await recordStepImage(withNavigation, navigationEvent.eventId, eventGeneration);
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
    }
  }).catch(() => undefined);
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  serializeSessionOperation(async () => {
    const session = await getSession();
    if (session?.tabId !== tabId) return;
    if (removeInfo?.isWindowClosing) {
      clearNavigationFallback(session.id);
      await clearLiveCapture(session.id);
      await setSession(null);
      await clearRecoveryJournal(session.id);
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
      await clearLiveCapture(session.id);
      await setSession(null);
      await clearRecoveryJournal(session.id);
      return;
    }
    await clearLiveCapture(session.id);
    const restored = await attemptRestore(session);
    if (restored) {
      await setSession(null);
      await clearRecoveryJournal(session.id);
    }
  }).catch(() => undefined);
});
