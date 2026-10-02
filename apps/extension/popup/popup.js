import { draftStore } from "../storage/draft-store.js";

const mode = document.querySelector("#mode");
const start = document.querySelector("#start");
const finish = document.querySelector("#finish");
const resume = document.querySelector("#resume");
const cancel = document.querySelector("#cancel");
const status = document.querySelector("#status");
const restore = document.querySelector("#restore");
const draftSection = document.querySelector("#draftSection");
const recentDraft = document.querySelector("#recentDraft");
const openDraft = document.querySelector("#openDraft");
const recordingState = document.querySelector("#recordingState");
let currentCaptureState = {};
let operationInFlight = false;
let captureStateAvailable = false;

function syncControlAvailability() {
  const active = ["recording", "paused", "finish_failed", "reinjection_failed", "cancel_failed"].includes(currentCaptureState.phase);
  mode.disabled = operationInFlight || active || Boolean(currentCaptureState.restorePending) || currentCaptureState.phase === "starting";
  for (const button of [start, finish, resume, cancel, restore, openDraft]) button.disabled = operationInFlight;
  start.disabled = operationInFlight || !captureStateAvailable;
}

async function withBusy(button, label, action) {
  if (operationInFlight) return;
  operationInFlight = true;
  const originalLabel = button.textContent;
  const hadFocus = document.activeElement === button;
  button.textContent = label;
  button.setAttribute?.("aria-busy", "true");
  syncControlAvailability();
  status.textContent = label;
  try { await action(); }
  finally {
    operationInFlight = false;
    button.textContent = originalLabel;
    button.removeAttribute?.("aria-busy");
    syncControlAvailability();
    if (hadFocus && button.getClientRects?.().length === 0) {
      if (status.textContent.includes("編集画面を開けません")) status.focus?.();
      else [resume, restore, finish, start].find((target) => !target.hidden && !target.disabled && target.getClientRects?.().length)?.focus();
    }
  }
}

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || "操作を完了できませんでした");
  return response.value;
}

function renderCaptureState(state = {}) {
  currentCaptureState = state;
  captureStateAvailable = true;
  const active = ["recording", "paused", "finish_failed", "reinjection_failed", "cancel_failed"].includes(state.phase);
  const waitingForRestore = Boolean(state.restorePending || state.phase === "starting");
  const phase = waitingForRestore ? "restore_pending" : state.phase || "idle";
  recordingState.textContent = ({ recording: "記録中", paused: "一時停止中", finish_failed: "終了できません", reinjection_failed: "再開が必要", cancel_failed: "取消を再試行", restore_pending: "復元が必要" })[phase] || "準備完了";
  recordingState.setAttribute?.("data-phase", phase);
  if (state.mode) mode.value = state.mode;
  start.hidden = active || waitingForRestore;
  mode.disabled = active || waitingForRestore;
  finish.hidden = !active || state.phase === "cancel_failed";
  cancel.hidden = !active && !waitingForRestore;
  resume.hidden = !["paused", "reinjection_failed"].includes(state.phase) || Boolean(state.captureLimitReached);
  restore.hidden = !waitingForRestore;
  syncControlAvailability();

  if (waitingForRestore) {
    status.textContent = state.finishFailed
      ? "記録内容はこの端末に保持しています。画面サイズを元に戻してから、もう一度終了してください。"
      : "画面サイズを元に戻せませんでした。復元情報は残っています。もう一度復元してください。";
  } else if (state.phase === "reinjection_failed") {
    status.textContent = "ページ移動後に記録を再開できませんでした。ここまでの記録は保持しています。対象タブで再開するか、ここまでの操作で記録を終了して、手順書を編集してください。";
  } else if (state.phase === "finish_failed") {
    status.textContent = "終了処理に失敗しましたが、記録内容はこの端末に保持しています。対象タブを開いて、もう一度終了してください。";
  } else if (state.phase === "cancel_failed") {
    status.textContent = "キャンセルが完了していません。記録データと復元情報は残っています。もう一度キャンセルしてください。";
  } else if (state.phase === "paused") {
    status.textContent = "記録を一時停止しています。再開すると続きから記録します。";
  } else if (state.recording || state.phase === "recording") {
    status.textContent = "このタブだけを記録しています。操作が終わったら、記録を終了して手順書を編集してください。";
  } else {
    status.textContent = "";
  }
}

function finishFailureMessage(state, statusAvailable, draftsState) {
  const unknownMessage = !draftsState?.available
    ? "記録終了の結果を確認できませんでした。下書き一覧を表示できませんでした。もう一度この画面を開いて確認してください。"
    : draftsState.count === 0
      ? "記録終了の結果を確認できませんでした。下書きが見つかりませんでした。対象タブの状態を確認してから、もう一度お試しください。"
      : "記録終了の結果を確認できませんでした。今回の記録が保存されたか確認できません。下書き一覧を確認してください。";
  if (!statusAvailable) return unknownMessage;
  if (state?.restorePending || state?.phase === "starting" || state?.phase === "restore_pending") {
    return "画面を元に戻せませんでした。復元情報は残っています。先に復元してください。";
  }
  if (state?.phase === "finish_failed") {
    return "記録を終了できませんでした。記録内容はこの端末に保持しています。対象タブを開いて、もう一度終了してください。";
  }
  if (["recording", "paused", "reinjection_failed"].includes(state?.phase)) {
    return "記録を終了できませんでした。記録内容はこの端末に保持しています。対象タブの状態を確認して、もう一度終了してください。";
  }
  return unknownMessage;
}

function savedDraftOpenMessage(draftsState) {
  return draftsState?.available && draftsState.count > 0
    ? "記録は保存しましたが、編集画面を開けませんでした。下書き一覧から開いてください。"
    : draftsState?.available
      ? "記録は保存しましたが、編集画面を開けませんでした。もう一度この画面を開いて確認してください。"
      : "記録は保存しましたが、編集画面と下書き一覧を表示できませんでした。もう一度この画面を開いて確認してください。";
}

async function showFinishFailureOutcome() {
  let current = {};
  let statusAvailable = true;
  try {
    current = await send({ type: "capture:status" });
    if (!current || typeof current !== "object" || Array.isArray(current)) throw new Error("INVALID_CAPTURE_STATUS");
  } catch {
    statusAvailable = false;
    current = {};
  }
  const draftsState = await refreshDrafts();
  renderCaptureState(current);
  captureStateAvailable = statusAvailable;
  syncControlAvailability();
  status.textContent = finishFailureMessage(current, statusAvailable, draftsState);
}

async function refreshDrafts() {
  try {
    const drafts = (await draftStore.list()).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    recentDraft.replaceChildren();
    for (const draft of drafts) {
      const option = document.createElement("option");
      option.value = draft.id;
      option.textContent = draft.title || "無題の下書き";
      recentDraft.append(option);
    }
    draftSection.hidden = drafts.length === 0;
    return { available: true, count: drafts.length };
  } catch {
    draftSection.hidden = true;
    return { available: false, count: 0 };
  }
}

start.addEventListener("click", () => withBusy(start, "記録を開始しています…", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await send({ type: "capture:start", tabId: tab?.id, mode: mode.value });
    renderCaptureState({ recording: true, phase: "recording" });
  } catch (error) {
    const current = await send({ type: "capture:status" }).catch(() => ({}));
    renderCaptureState(current);
    if (current.restorePending) {
      status.textContent = "画面を元に戻せませんでした。復元情報は残っています。もう一度復元してください。";
      return;
    }
    recordingState.textContent = "開始できません";
    recordingState.setAttribute?.("data-phase", "start_failed");
    status.textContent = "記録を開始できませんでした。下書きは変更されていません。対象ページを開いて、もう一度お試しください。";
  }
}));

finish.addEventListener("click", () => withBusy(finish, "記録を保存しています…", async () => {
  let result;
  try {
    result = await send({ type: "capture:finish" });
  } catch {
    await showFinishFailureOutcome();
    return;
  }

  const { draftId, restorePending } = result || {};
  if (typeof draftId !== "string" || !draftId) {
    await showFinishFailureOutcome();
    return;
  }
  let editorOpenError = null;
  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL(`editor/editor.html#${draftId}`) });
  } catch (error) {
    editorOpenError = error;
  }
  const draftsState = await refreshDrafts();
  renderCaptureState({ restorePending: Boolean(restorePending) });
  if (restorePending) {
    return;
  } else if (editorOpenError) {
    recordingState.textContent = "編集待ち";
    recordingState.setAttribute?.("data-phase", "editor_failed");
    status.textContent = savedDraftOpenMessage(draftsState);
  } else {
    window.close();
  }
}));

resume.addEventListener("click", () => withBusy(resume, "記録を再開しています…", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await send({ type: "capture:resume", tabId: tab?.id });
    renderCaptureState({ recording: true, phase: "recording" });
  } catch (error) {
    status.textContent = "記録を再開できませんでした。記録内容は保持しています。対象タブを開いて、もう一度お試しください。";
  }
}));

cancel.addEventListener("click", () => withBusy(cancel, "キャンセルしています…", async () => {
  try {
    const result = await send({ type: "capture:cancel" });
    renderCaptureState({ restorePending: result.restorePending });
  } catch {
    status.textContent = "キャンセルを完了できませんでした。記録データと復元情報は残っています。もう一度お試しください。";
  }
}));

restore.addEventListener("click", () => withBusy(restore, "画面を復元しています…", async () => {
  try {
    const result = await send({ type: "capture:restore" });
    const current = await send({ type: "capture:status" }).catch(() => ({ restorePending: !result.restored }));
    renderCaptureState(current);
  } catch {
    status.textContent = "画面を復元できませんでした。復元情報は残っています。もう一度復元してください。";
  }
}));

openDraft.addEventListener("click", () => withBusy(openDraft, "下書きを開いています…", async () => {
  if (!recentDraft.value) return;
  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL(`editor/editor.html#${encodeURIComponent(recentDraft.value)}`) });
    status.textContent = "下書きの編集画面を開きました。";
  } catch {
    status.textContent = "編集画面を開けませんでした。下書きはこの端末に残っています。もう一度開いてください。";
  }
}));

Promise.all([
  send({ type: "capture:status" }).then(renderCaptureState, () => {
    start.disabled = true;
    recordingState.textContent = "確認できません";
    status.textContent = "記録の状態を確認できませんでした。記録内容は変更していません。もう一度この画面を開いて確認してください。";
  }),
  refreshDrafts()
]);
