import { draftStore } from "../storage/draft-store.js";
import { captureLiveStore } from "../storage/capture-live-store.js";

const MASCOT = "../assets/meccha-manual-mascot-me-clear-eyes.png";
const mode = document.querySelector("#mode");
const modeBadge = document.querySelector("#modeBadge");
const start = document.querySelector("#start");
const finish = document.querySelector("#finish");
const pause = document.querySelector("#pause");
const resume = document.querySelector("#resume");
const cancel = document.querySelector("#cancel");
const restore = document.querySelector("#restore");
const status = document.querySelector("#status");
const startSection = document.querySelector("#startSection");
const liveSection = document.querySelector("#liveSection");
const liveSteps = document.querySelector("#liveSteps");
const liveCount = document.querySelector("#liveCount");
const liveDescription = document.querySelector("#liveDescription");
const draftSection = document.querySelector("#draftSection");
const drafts = document.querySelector("#drafts");
const draftCount = document.querySelector("#draftCount");
const emptyState = document.querySelector("#emptyState");
const SEMANTIC_LABELS = new Set(["ボタン", "リンク", "メニュー", "入力欄", "選択欄", "ファイル選択", "保護された入力欄", "操作対象"]);

const MODE_LABELS = {
  pc: "PC",
  smartphonePortrait: "スマホ（縦）",
  smartphoneLandscape: "スマホ（横）",
  tabletPortrait: "タブレット（縦）",
  tabletLandscape: "タブレット（横）"
};

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || "操作を完了できませんでした");
  return response.value;
}

function instructionFor(event) {
  if (event?.kind === "scroll") return `画面を${({ up: "上", down: "下", left: "左", right: "右" })[event.direction] || "指定方向"}へスクロールする`;
  if (event?.kind === "navigation") return "次のページへ移動する";
  const semanticLabel = SEMANTIC_LABELS.has(event?.label) ? event.label : "操作対象";
  if (event?.kind === "input") return `${semanticLabel}に入力する`;
  return `${semanticLabel}を操作する`;
}

function setImage(image, source, alt) {
  image.src = source || MASCOT;
  image.alt = alt;
}

function renderLiveSteps(events = [], imageEntries = [], imageRefs = []) {
  liveSteps.replaceChildren();
  liveCount.textContent = String(events.length);
  const images = new Map(imageEntries.map((entry) => [entry.eventId, entry]));
  const refs = new Map(imageRefs.map((entry) => [entry.eventId, entry]));
  for (const [index, event] of events.entries()) {
    const item = document.createElement("li");
    item.className = "step-card";
    const text = document.createElement("div");
    text.className = "step-text";
    const number = document.createElement("span");
    number.className = "step-number";
    number.textContent = String(index + 1);
    const instruction = document.createElement("p");
    instruction.textContent = instructionFor(event);
    text.append(number, instruction);
    const imageEntry = images.get(event.eventId);
    const imageRef = refs.get(event.eventId);
    if (imageEntry?.status === "ready" && imageEntry.dataUrl) {
      const image = document.createElement("img");
      setImage(image, imageEntry.dataUrl, "この手順のスクリーンショット");
      item.append(text, image);
    } else {
      const imageState = document.createElement("span");
      imageState.className = "image-state";
      imageState.textContent = imageRef?.status === "failed" || imageRef?.status === "unavailable"
        ? "画像を記録できませんでした"
        : "画像を取得中";
      item.append(text, imageState);
    }
    liveSteps.append(item);
  }
  liveDescription.textContent = events.length ? "操作を続けると、手順がここへ追加されます。" : "操作すると、ここに手順が追加されます。";
}

function firstScreenshot(draft) {
  const screenshot = draft?.screenshots?.find((item) => item?.dataUrl);
  return screenshot?.dataUrl || null;
}

function editorUrl(draftId) {
  return chrome.runtime.getURL(`editor/editor.html#${encodeURIComponent(draftId)}`);
}

async function openDraftEditor(draftId) {
  if (typeof draftId !== "string" || !draftId) throw new Error("下書きIDがありません");
  return chrome.tabs.create({ url: editorUrl(draftId) });
}

function renderDrafts(items = []) {
  const sorted = [...items].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  drafts.replaceChildren();
  draftCount.textContent = String(sorted.length);
  draftSection.hidden = sorted.length === 0;
  for (const draft of sorted) {
    const card = document.createElement("article");
    card.className = "draft-card";
    const image = document.createElement("img");
    setImage(image, firstScreenshot(draft), "手順書のスクリーンショット");
    const content = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = draft.title || "無題の手順書";
    const detail = document.createElement("p");
    detail.textContent = `${draft.steps?.length || 0}手順・端末に保存済み`;
    const open = document.createElement("button");
    open.type = "button";
    open.textContent = "手順書を開く";
    open.addEventListener("click", () => openDraftEditor(draft.id));
    content.append(title, detail, open);
    card.append(image, content);
    drafts.append(card);
  }
}

function renderStatus(state = {}, imageEntries = []) {
  const active = ["recording", "paused", "finish_failed", "reinjection_failed"].includes(state.phase);
  const waitingForRestore = Boolean(state.restorePending || state.phase === "starting");
  if (state.mode) {
    mode.value = state.mode;
    modeBadge.textContent = MODE_LABELS[state.mode] || state.mode;
  }
  startSection.hidden = active || waitingForRestore;
  liveSection.hidden = !active;
  finish.hidden = !active;
  pause.hidden = state.phase !== "recording";
  resume.hidden = !["paused", "reinjection_failed"].includes(state.phase) || Boolean(state.captureLimitReached);
  cancel.hidden = !active && !waitingForRestore;
  restore.hidden = !waitingForRestore;
  mode.disabled = active || waitingForRestore;
  start.disabled = active || waitingForRestore;
  emptyState.hidden = active || waitingForRestore || Boolean(state.hasDrafts);
  const liveKey = JSON.stringify({
    events: state.events || [],
    imageRefs: state.stepImageRefs || [],
    images: imageEntries.map(({ eventId, id, status, dataUrl }) => [eventId, id, status, Boolean(dataUrl)])
  });
  if (liveKey !== lastLiveKey) {
    lastLiveKey = liveKey;
    renderLiveSteps(state.events || [], imageEntries, state.stepImageRefs || []);
  }
  if (statusOverride) status.textContent = statusOverride;
  else if (waitingForRestore) status.textContent = state.finishFailed ? "記録内容は保持しています。画面を元に戻してから、もう一度終了してください。" : "画面を元に戻せませんでした。復元情報は残っています。";
  else if (state.phase === "reinjection_failed") status.textContent = "ページ移動後に再開できません。対象タブで再開するか、ここまでの内容を終了してください。";
  else if (state.phase === "finish_failed") status.textContent = "終了処理に失敗しました。記録内容はこの端末に保持しています。";
  else if (state.captureLimitReached === "images") status.textContent = "画像の保存上限100件に達しました。記録を終了して手順書として保存してください。";
  else if (state.captureLimitReached === "steps") status.textContent = "手順の上限200件に達しました。記録を終了して手順書として保存してください。";
  else if (state.phase === "paused") status.textContent = "記録を一時停止しています。再開すると続きから記録します。";
  else if (active) status.textContent = "このタブだけを記録しています。入力した値は保存しません。";
  else if (!state.hasDrafts) status.textContent = "";
}

async function refresh() {
  const state = await send({ type: "capture:status" });
  const statusKey = JSON.stringify({
    sessionId: state.sessionId,
    phase: state.phase,
    captureLimitReached: state.captureLimitReached || null,
    events: (state.events || []).map(({ eventId, at }) => [eventId, at]),
    stepImageRefs: state.stepImageRefs || []
  });
  if (statusKey !== lastStatusKey) {
    lastStatusKey = statusKey;
    [localDrafts, liveImages] = await Promise.all([
      draftStore.list(),
      state.sessionId ? captureLiveStore.list(state.sessionId) : Promise.resolve([])
    ]);
    renderDrafts(localDrafts);
  }
  renderStatus({ ...state, hasDrafts: localDrafts.length > 0 }, liveImages);
}

async function withError(action, fallback) {
  try { await action(); }
  catch (error) { statusOverride = `${fallback}（${error.message}）`; await refresh().catch(() => undefined); }
}

start.addEventListener("click", () => withError(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await send({ type: "capture:start", tabId: tab?.id, mode: mode.value });
  statusOverride = "";
  status.textContent = "記録を開始しました。対象タブで操作してください。";
  await refresh();
}, "記録を開始できませんでした。対象ページを開いて、もう一度お試しください。"));

finish.addEventListener("click", () => withError(async () => {
  const result = await send({ type: "capture:finish" });
  let editorOpenError = result?.draftId ? null : new Error("下書きIDがありません");
  if (!editorOpenError) {
    try {
      await openDraftEditor(result.draftId);
    } catch (error) {
      editorOpenError = error;
    }
  }
  let refreshError = null;
  try {
    await refresh();
  } catch (error) {
    refreshError = error;
  }
  statusOverride = "";
  if (result?.restorePending) {
    statusOverride = "記録は保存済みです。画面をもう一度復元してから続けてください。";
    restore.hidden = false;
    status.textContent = statusOverride;
  } else if (editorOpenError) {
    statusOverride = "記録は保存しましたが、編集画面を開けませんでした。下書き一覧から開いてください。";
    status.textContent = statusOverride;
  } else {
    status.textContent = result?.missingImageCount
      ? `記録できました。${result.imageCount || 0}件の画像を保存しました。${result.missingImageCount}件は画像を記録できませんでした。`
      : "記録できました。画像付きの手順を保存しました。";
    if (refreshError) status.textContent = "記録できました。編集画面を開きました。下書き一覧の更新は次回表示時に確認してください。";
  }
}, "記録を終了できませんでした。記録内容はこの端末に保持しています。"));

pause.addEventListener("click", () => withError(async () => {
  await send({ type: "capture:pause" });
  statusOverride = "";
  await refresh();
}, "一時停止できませんでした。記録内容は保持しています。"));

resume.addEventListener("click", () => withError(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await send({ type: "capture:resume", tabId: tab?.id });
  statusOverride = "";
  await refresh();
}, "記録を再開できませんでした。記録内容は保持しています。"));

cancel.addEventListener("click", () => withError(async () => {
  await send({ type: "capture:cancel" });
  await refresh();
  statusOverride = "";
  status.textContent = "記録をキャンセルしました。保存済みの下書きは残っています。";
}, "キャンセルを完了できませんでした。記録データと復元情報は残っています。"));

restore.addEventListener("click", () => withError(async () => {
  await send({ type: "capture:restore" });
  statusOverride = "";
  await refresh();
}, "画面を復元できませんでした。復元情報は残っています。"));

let refreshTimer;
let lastStatusKey = "";
let lastLiveKey = "";
let statusOverride = "";
let liveImages = [];
let localDrafts = [];
async function startPolling() {
  await refresh().catch(() => { status.textContent = "状態を読み込めませんでした。もう一度お試しください。"; });
  const poll = async () => {
    await refresh().catch(() => undefined);
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(poll, liveSection.hidden ? 1800 : 700);
  };
  refreshTimer = setTimeout(poll, 700);
}

void startPolling();
