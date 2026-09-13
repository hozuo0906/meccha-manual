import { normalizeCaptureEvent } from "../capture/privacy.js";
import { captureWithMaskBoundary, installSensitiveMasks, removeSensitiveMasks } from "../capture/screenshot.js";
import { VIEWPORTS } from "../responsive/viewports.js";
import { applyResponsiveViewport, originalWindowSnapshot, restoreOriginalWindow } from "../responsive/window-lifecycle.js";
import { draftStore } from "../storage/draft-store.js";
import { recoverWindowSession } from "./session-recovery.js";

const SESSION_KEY = "activeCaptureSession";

async function getSession() {
  return (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY] ?? null;
}

async function setSession(session) {
  if (session) await chrome.storage.session.set({ [SESSION_KEY]: session });
  else await chrome.storage.session.remove(SESSION_KEY);
}

async function measureViewport(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: () => ({ innerWidth, innerHeight }) });
  return result;
}

async function stopRecorder(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, func: () => globalThis.__mecchaManualRecorder?.() }).catch(() => undefined);
}

async function attemptRestore(session) {
  const result = await recoverWindowSession(session, { persist: setSession, restore: (original) => restoreOriginalWindow(original, chrome.windows) });
  return result.restored;
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
  // Persist every restore field before the first window mutation.
  await setSession(session);
  try {
    if (mode !== "pc") await applyResponsiveViewport({ windowId: tab.windowId, tabId, viewport, windowsApi: chrome.windows, measure: measureViewport });
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content/recorder.js"] });
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
    removeMasks: async () => { await chrome.scripting.executeScript({ target: { tabId: session.tabId }, func: removeSensitiveMasks }); }
  });
}

function instructionFor(event) {
  if (event.kind === "scroll") return `画面を${event.direction === "up" ? "上" : "下"}へスクロールする`;
  if (event.kind === "navigation") return "次のページへ移動する";
  if (event.kind === "input") return `${event.label}に入力する`;
  return `${event.label}を操作する`;
}

async function finishCapture() {
  const session = await getSession();
  if (!session || session.phase !== "recording") throw new Error("記録中の操作がありません");
  let draftId;
  try {
    await stopRecorder(session.tabId);
    const dataUrl = await takeMaskedScreenshot(session);
    const screenshot = { id: crypto.randomUUID(), dataUrl, masks: [] };
    const draft = {
      id: session.id,
      title: "新しい手順書",
      description: "",
      displayMode: session.mode,
      createdAt: new Date(session.startedAt).toISOString(),
      updatedAt: new Date().toISOString(),
      steps: session.events.map((event, index) => ({ id: crypto.randomUUID(), order: index + 1, instruction: instructionFor(event), screenshotId: screenshot.id, ...event })),
      screenshots: [screenshot]
    };
    await draftStore.put(draft);
    draftId = draft.id;
  } catch {
    await stopRecorder(session.tabId);
    const restored = await attemptRestore(session);
    if (restored) await setSession(null);
    throw new Error(restored ? "下書きを保存できませんでした。記録内容は送信されていません。空き容量を確認してもう一度お試しください。" : "画面サイズを元に戻せませんでした。記録データと復元情報は残っています。もう一度復元してください。");
  }
  const restored = await attemptRestore(session);
  if (restored) await setSession(null);
  return { draftId, restorePending: !restored };
}

async function cancelCapture() {
  const session = await getSession();
  if (!session) return { cancelled: true, restorePending: false };
  await stopRecorder(session.tabId);
  const restored = await attemptRestore(session);
  if (restored) await setSession(null);
  return { cancelled: true, restorePending: !restored };
}

async function retryRestore() {
  const session = await getSession();
  if (!session?.restorePending) return { restored: true };
  const restored = await attemptRestore(session);
  if (restored) await setSession(null);
  return { restored };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    const fromExtensionPage = !sender.tab;
    if (message?.type === "capture:start" && fromExtensionPage) return startCapture(message.tabId, message.mode);
    if (message?.type === "capture:finish" && fromExtensionPage) return finishCapture();
    if (message?.type === "capture:cancel" && fromExtensionPage) return cancelCapture();
    if (message?.type === "capture:restore" && fromExtensionPage) return retryRestore();
    const session = await getSession();
    if (message?.type === "capture:event" && session?.phase === "recording" && sender.tab?.id === session.tabId) {
      session.events.push(normalizeCaptureEvent(message.event));
      await setSession(session);
      return { accepted: true };
    }
    if (message?.type === "capture:status") return { recording: session?.phase === "recording", mode: session?.mode, restorePending: Boolean(session?.restorePending) };
    throw new TypeError("不正なメッセージです");
  })().then((value) => sendResponse({ ok: true, value }), () => sendResponse({ ok: false, error: "操作を完了できませんでした。記録データはこの端末に残っています。もう一度お試しください。" }));
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  getSession().then(async (session) => {
    if (session?.phase !== "recording" || session.tabId !== tabId) return;
    session.events.push(normalizeCaptureEvent({ kind: "navigation", at: Date.now() }));
    await setSession(session);
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content/recorder.js"] }).catch(() => undefined);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  getSession().then(async (session) => {
    if (session?.tabId !== tabId) return;
    const restored = await attemptRestore(session);
    if (restored) await setSession(null);
  });
});
