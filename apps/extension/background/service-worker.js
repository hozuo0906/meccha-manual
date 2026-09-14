import { normalizeCaptureEvent } from "../capture/privacy.js";
import { captureWithMaskBoundary, installSensitiveMasks, removeSensitiveMasks, verifySensitiveMasks } from "../capture/screenshot.js";
import { VIEWPORTS } from "../responsive/viewports.js";
import { applyResponsiveViewport, originalWindowSnapshot, restoreOriginalWindow } from "../responsive/window-lifecycle.js";
import { draftStore } from "../storage/draft-store.js";
import { mergeCaptureEvents } from "./event-merge.js";
import { nextRecoveryJournal } from "./recovery-journal.js";
import { recoverWindowSession } from "./session-recovery.js";

const SESSION_KEY = "activeCaptureSession";
const RECOVERY_KEY = "captureRecoveryJournal";
let sessionOperation = Promise.resolve();

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
  return next;
}

async function clearRecoveryJournal(sessionId) {
  const current = await readRecoveryJournal();
  if (!current || !sessionId || current.sessionId === sessionId) await chrome.storage.local.remove(RECOVERY_KEY);
}

async function getSession() {
  const session = (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY] ?? null;
  if (!session) return null;
  const recovery = await readRecoveryJournal();
  if (recovery?.sessionId !== session.id) return session;
  const merged = mergeCaptureEvents(session, recovery.events || []);
  return recovery.phase ? { ...merged, phase: recovery.phase, finishFailed: recovery.phase === "finish_failed" || merged.finishFailed } : merged;
}

async function setSession(session) {
  if (session) await chrome.storage.session.set({ [SESSION_KEY]: session });
  else await chrome.storage.session.remove(SESSION_KEY);
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
  try {
    await setSession(next);
  } catch (error) {
    await persistRecoveryJournal(session.id, [normalizeCaptureEvent(event)]);
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
    startedAt: Date.now()
  };
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
  if (event.kind === "scroll") {
    const label = { up: "上", down: "下", left: "左", right: "右" }[event.direction] || "指定方向";
    return `画面を${label}へスクロールする`;
  }
  if (event.kind === "navigation") return "次のページへ移動する";
  if (event.kind === "input") return `${event.label}に入力する`;
  return `${event.label}を操作する`;
}

async function prepareRetryViewport(session) {
  if (session.phase !== "finish_failed" || session.restorePending || session.mode === "pc") return;
  const viewport = VIEWPORTS[session.mode];
  if (!viewport) return;
  await applyResponsiveViewport({ windowId: session.windowId, tabId: session.tabId, viewport, windowsApi: chrome.windows, measure: measureViewport });
}

async function finishCapture() {
  let session = await getSession();
  if (!session || !["recording", "finish_failed", "reinjection_failed"].includes(session.phase)) throw new Error("終了できる記録がありません");
  let draftId;
  try {
    await prepareRetryViewport(session);
    const pendingEvents = await stopRecorder(session.tabId);
    if (pendingEvents.length) await persistRecoveryJournal(session.id, pendingEvents);
    session = mergeCaptureEvents(session, pendingEvents);
    await setSession(session);
    const dataUrl = await takeMaskedScreenshot(session);
    const screenshot = { id: crypto.randomUUID(), dataUrl, masks: [] };
    const lastIndex = session.events.length - 1;
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
        ...(index === lastIndex ? { screenshotId: screenshot.id } : {}),
        ...event
      })),
      screenshots: [screenshot]
    };
    await draftStore.put(draft);
    draftId = draft.id;
  } catch {
    const pendingEvents = await stopRecorder(session.tabId);
    if (pendingEvents.length) await persistRecoveryJournal(session.id, pendingEvents, "finish_failed");
    else await persistRecoveryJournal(session.id, [], "finish_failed");
    session = mergeCaptureEvents(session, pendingEvents);
    const retrySession = { ...session, phase: "finish_failed", finishFailed: true, failureCategory: "draft_finish_failed" };
    const restored = await attemptRestore(retrySession);
    try {
      await setSession({ ...retrySession, restorePending: !restored });
    } catch {
      // The bounded local recovery journal remains the durable source of the drained events and retry phase.
    }
    throw new Error(restored
      ? "記録内容はこの端末に保持しています。対象タブを開いて、もう一度「記録を終了して編集」をお試しください。"
      : "記録内容はこの端末に保持しています。画面サイズを元に戻せませんでした。先に復元してから、もう一度お試しください。");
  }
  const restored = await attemptRestore(session);
  if (restored) await setSession(null);
  await clearRecoveryJournal(session.id);
  return { draftId, restorePending: !restored };
}

async function cancelCapture() {
  const session = await getSession();
  if (!session) return { cancelled: true, restorePending: false };
  await stopRecorder(session.tabId);
  const cancelSession = { ...session, finishFailed: false, failureCategory: "cancel" };
  const restored = await attemptRestore(cancelSession);
  if (restored) {
    await setSession(null);
    await clearRecoveryJournal(session.id);
  }
  return { cancelled: true, restorePending: !restored };
}

async function retryRestore() {
  const session = await getSession();
  if (!session?.restorePending) return { restored: true };
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

async function resumeCapture(tabId) {
  const session = await getSession();
  if (!session || session.phase !== "reinjection_failed") throw new Error("再開できる記録がありません");
  if (tabId !== session.tabId) throw new Error("記録対象のタブを開いてから再開してください");
  try {
    await injectRecorder(tabId);
    await setSession({ ...session, phase: "recording", reinjectionFailed: false, failureCategory: undefined });
    return { resumed: true };
  } catch {
    await setSession({ ...session, phase: "reinjection_failed", reinjectionFailed: true, failureCategory: "recorder_reinjection_failed" });
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
    restorePending: Boolean(session?.restorePending),
    finishFailed: Boolean(session?.finishFailed),
    reinjectionFailed: Boolean(session?.reinjectionFailed)
  };
}

serializeSessionOperation(recoverInterruptedStartingSession).catch(() => undefined);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    const fromExtensionPage = !sender.tab;
    if (message?.type === "capture:start" && fromExtensionPage) return serializeSessionOperation(() => startCapture(message.tabId, message.mode));
    if (message?.type === "capture:finish" && fromExtensionPage) return serializeSessionOperation(() => finishCapture());
    if (message?.type === "capture:cancel" && fromExtensionPage) return serializeSessionOperation(() => cancelCapture());
    if (message?.type === "capture:restore" && fromExtensionPage) return serializeSessionOperation(() => retryRestore());
    if (message?.type === "capture:resume" && fromExtensionPage) return serializeSessionOperation(() => resumeCapture(message.tabId));
    if (message?.type === "capture:status") return captureStatus();
    if (message?.type === "capture:event") {
      return serializeSessionOperation(async () => {
        const session = await getSession();
        if (session?.phase !== "recording" || sender.tab?.id !== session.tabId) return { accepted: false };
        await appendCaptureEvent(session, message.event);
        return { accepted: true };
      });
    }
    throw new TypeError("不正なメッセージです");
  })().then((value) => sendResponse({ ok: true, value }), () => sendResponse({ ok: false, error: "操作を完了できませんでした。記録データはこの端末に残っています。もう一度お試しください。" }));
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  serializeSessionOperation(async () => {
    const session = await getSession();
    if (session?.phase !== "recording" || session.tabId !== tabId) return;
    const navigationEvent = { kind: "navigation", at: Date.now(), eventId: `navigation:${crypto.randomUUID()}` };
    const withNavigation = mergeCaptureEvents(session, [navigationEvent]);
    try {
      await setSession(withNavigation);
    } catch {
      await persistRecoveryJournal(session.id, [navigationEvent]);
    }
    try {
      await injectRecorder(tabId);
    } catch {
      const failedSession = {
        ...withNavigation,
        phase: "reinjection_failed",
        reinjectionFailed: true,
        failureCategory: "recorder_reinjection_failed"
      };
      try {
        await setSession(failedSession);
      } catch {
        await persistRecoveryJournal(session.id, [], "reinjection_failed");
      }
    }
  }).catch(() => undefined);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  serializeSessionOperation(async () => {
    const session = await getSession();
    if (session?.tabId !== tabId) return;
    let windowExists = true;
    try {
      await chrome.windows.get(session.windowId);
      const remainingTabs = await chrome.tabs.query({ windowId: session.windowId });
      if (remainingTabs.length === 0) windowExists = false;
    } catch {
      windowExists = false;
    }
    if (!windowExists) {
      await setSession(null);
      await clearRecoveryJournal(session.id);
      return;
    }
    const restored = await attemptRestore(session);
    if (restored) {
      await setSession(null);
      await clearRecoveryJournal(session.id);
    }
  }).catch(() => undefined);
});
