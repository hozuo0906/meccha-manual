import { normalizeCaptureEvent } from "../capture/privacy.js";
import { VIEWPORTS, targetOuterBounds } from "../responsive/viewports.js";
import { draftStore } from "../storage/draft-store.js";

let session = null;
const SESSION_KEY = "activeCaptureSession";
const sessionLoaded = chrome.storage.session.get(SESSION_KEY).then((stored) => {
  session = stored[SESSION_KEY] ?? null;
});

async function getSession() {
  await sessionLoaded;
  return session;
}

async function setSession(nextSession) {
  session = nextSession;
  if (nextSession) await chrome.storage.session.set({ [SESSION_KEY]: nextSession });
  else await chrome.storage.session.remove(SESSION_KEY);
}

async function measureViewport(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: () => ({ innerWidth, innerHeight }) });
  return result;
}

async function restoreWindow() {
  const activeSession = await getSession();
  if (!activeSession?.originalWindow) return;
  const { id, ...bounds } = activeSession.originalWindow;
  await chrome.windows.update(id, bounds).catch(() => undefined);
}

async function startCapture(tabId, mode) {
  if (await getSession()) throw new Error("既に操作を記録しています");
  const tab = await chrome.tabs.get(tabId);
  const window = await chrome.windows.get(tab.windowId);
  const viewport = VIEWPORTS[mode];
  if (!viewport) throw new TypeError("表示モードが不正です");
  await setSession({
    id: crypto.randomUUID(), tabId, windowId: tab.windowId, mode,
    originalWindow: { id: window.id, left: window.left, top: window.top, width: window.width, height: window.height, state: window.state },
    events: [], screenshots: [], startedAt: Date.now()
  });
  try {
    if (mode !== "pc") {
      const measured = await measureViewport(tabId);
      const bounds = targetOuterBounds(viewport, measured, window);
      await chrome.windows.update(tab.windowId, { state: "normal", ...bounds });
    }
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content/recorder.js"] });
    return { sessionId: session.id, modeLabel: viewport.label };
  } catch (error) {
    await restoreWindow();
    await setSession(null);
    throw error;
  }
}

async function finishCapture() {
  const completed = await getSession();
  if (!completed) throw new Error("記録中の操作がありません");
  try {
    await chrome.scripting.executeScript({ target: { tabId: completed.tabId }, func: () => globalThis.__mecchaManualRecorder?.() }).catch(() => undefined);
    const image = await chrome.tabs.captureVisibleTab(completed.windowId, { format: "jpeg", quality: 75 }).catch(() => null);
    if (image) completed.screenshots.push(image);
    const draft = {
      id: completed.id,
      title: "新しい手順書",
      description: "",
      displayMode: completed.mode,
      createdAt: new Date(completed.startedAt).toISOString(),
      updatedAt: new Date().toISOString(),
      steps: completed.events.map((event, index) => ({ id: crypto.randomUUID(), order: index + 1, ...event })),
      screenshots: completed.screenshots
    };
    await draftStore.put(draft);
    return { draftId: draft.id };
  } finally {
    await restoreWindow();
    await setSession(null);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === "capture:start") return startCapture(message.tabId, message.mode);
    if (message?.type === "capture:finish") return finishCapture();
    if (message?.type === "capture:cancel") { await restoreWindow(); await setSession(null); return { cancelled: true }; }
    const activeSession = await getSession();
    if (message?.type === "capture:event" && sender.tab?.id === activeSession?.tabId) {
      activeSession.events.push(normalizeCaptureEvent(message.event));
      await setSession(activeSession);
      return { accepted: true };
    }
    if (message?.type === "capture:status") return { recording: Boolean(activeSession), mode: activeSession?.mode };
    throw new TypeError("不正なメッセージです");
  })().then((value) => sendResponse({ ok: true, value }), (error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  getSession().then(async (activeSession) => {
    if (activeSession?.tabId !== tabId) return;
    activeSession.events.push(normalizeCaptureEvent({ kind: "navigation", at: Date.now() }));
    await setSession(activeSession);
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content/recorder.js"] }).catch(() => undefined);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  getSession().then(async (activeSession) => {
    if (activeSession?.tabId !== tabId) return;
    await restoreWindow();
    await setSession(null);
  });
});
