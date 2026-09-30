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

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || "操作を完了できませんでした");
  return response.value;
}

function renderCaptureState(state = {}) {
  const active = ["recording", "paused", "finish_failed", "reinjection_failed"].includes(state.phase);
  if (state.mode) mode.value = state.mode;
  start.hidden = active || state.restorePending;
  mode.disabled = active || state.restorePending;
  finish.hidden = !active;
  cancel.hidden = !active && !state.restorePending;
  resume.hidden = state.phase !== "reinjection_failed";
  restore.hidden = !state.restorePending;

  if (state.restorePending) {
    status.textContent = state.finishFailed
      ? "記録内容はこの端末に保持しています。画面サイズを元に戻してから、もう一度終了してください。"
      : "画面サイズを元に戻せませんでした。復元情報は残っています。もう一度復元してください。";
  } else if (state.phase === "reinjection_failed") {
    status.textContent = "ページ移動後に記録を再開できませんでした。ここまでの記録は保持しています。対象タブで再開するか、ここまでの内容を終了して編集してください。";
  } else if (state.phase === "finish_failed") {
    status.textContent = "終了処理に失敗しましたが、記録内容はこの端末に保持しています。対象タブを開いて、もう一度終了してください。";
  } else if (state.recording) {
    status.textContent = "このタブだけを記録しています。入力欄の内容は記録せず、画像でも隠します。入力欄以外の機密情報は画像に写る場合があります。";
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

start.addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await send({ type: "capture:start", tabId: tab.id, mode: mode.value });
    renderCaptureState({ recording: true, phase: "recording" });
  } catch (error) {
    const current = await send({ type: "capture:status" }).catch(() => ({}));
    renderCaptureState(current);
    if (current.restorePending) {
      status.textContent = "画面を元に戻せませんでした。復元情報は残っています。もう一度復元してください。";
      return;
    }
    status.textContent = "記録を開始できませんでした。下書きは変更されていません。対象ページを開いて、もう一度お試しください。";
  }
});

finish.addEventListener("click", async () => {
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
  await refreshDrafts();
  renderCaptureState({ restorePending: Boolean(restorePending) });
  if (restorePending) {
    return;
  } else if (editorOpenError) {
    status.textContent = "記録は保存しましたが、編集画面を開けませんでした。下書き一覧から開いてください。";
  } else {
    window.close();
  }
});

resume.addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await send({ type: "capture:resume", tabId: tab.id });
    renderCaptureState({ recording: true, phase: "recording" });
  } catch (error) {
    status.textContent = "記録を再開できませんでした。記録内容は保持しています。対象タブを開いて、もう一度お試しください。";
  }
});

cancel.addEventListener("click", async () => {
  try {
    const result = await send({ type: "capture:cancel" });
    renderCaptureState({ restorePending: result.restorePending });
  } catch {
    status.textContent = "キャンセルを完了できませんでした。記録データと復元情報は残っています。もう一度お試しください。";
  }
});

restore.addEventListener("click", async () => {
  const result = await send({ type: "capture:restore" });
  const current = await send({ type: "capture:status" }).catch(() => ({ restorePending: !result.restored }));
  renderCaptureState(current);
});

openDraft.addEventListener("click", async () => {
  if (!recentDraft.value) return;
  await chrome.tabs.create({ url: chrome.runtime.getURL(`editor/editor.html#${recentDraft.value}`) });
});

Promise.all([
  send({ type: "capture:status" }).then(renderCaptureState, () => renderCaptureState()),
  refreshDrafts()
]);
