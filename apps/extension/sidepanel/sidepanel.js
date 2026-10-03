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
const liveCurrentStep = document.querySelector("#liveCurrentStep");
const liveCurrentStatus = document.querySelector("#liveCurrentStatus");
const liveImageSummary = document.querySelector("#liveImageSummary");
const failedDisplayImages = new Set();
const liveLatest = document.querySelector("#liveLatest");
const liveProgress = document.querySelector("#liveProgress");
const draftSection = document.querySelector("#draftSection");
const drafts = document.querySelector("#drafts");
const draftCount = document.querySelector("#draftCount");
const emptyState = document.querySelector("#emptyState");
const controls = document.querySelector(".controls");
const SEMANTIC_LABELS = new Set(["ボタン", "リンク", "メニュー", "入力欄", "選択欄", "ファイル選択", "保護された入力欄", "操作対象"]);
const DRAFT_POLL_INTERVAL_MS = 3_000;
const EDITOR_READY_TIMEOUT_MS = 8_000;

function syncControlsSpace() {
  if (!controls) return;
  document.documentElement.style.setProperty("--controls-height", `${Math.ceil(controls.getBoundingClientRect().height)}px`);
}

syncControlsSpace();
if (typeof ResizeObserver === "function" && controls) {
  new ResizeObserver(() => {
    syncControlsSpace();
    keepLiveTailVisibleAfterResize();
  }).observe(controls);
}
window.addEventListener("resize", syncControlsSpace, { passive: true });

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
  if (event?.kind === "click" && event.label && (event.labelSource === "caption" || !SEMANTIC_LABELS.has(event.label))) return `【${event.label}】をクリック`;
  return `${semanticLabel}を操作する`;
}

function setImage(image, source, alt) {
  image.src = source || MASCOT;
  image.alt = alt;
}

function imageStateFor(event, imageEntries, imageRefs) {
  const image = imageEntries.find((entry) => entry?.eventId === event?.eventId);
  const ref = imageRefs.find((entry) => entry?.eventId === event?.eventId);
  const state = ref && (ref.version || 1) > (image?.version || 1) ? ref : image || ref;
  const currentBytes = image?.dataUrl && (image.version || 1) >= (state?.version || 1);
  if (["ready", "protected"].includes(state?.status) && currentBytes && failedDisplayImages.has(image.id)) return { ...state, status: "display_failed", reason: "display_failed" };
  if (["ready", "protected"].includes(state?.status) && !currentBytes) return { status: "failed", reason: "storage_failed" };
  return state || { status: "queued" };
}

function imageStatusFor(event, imageEntries, imageRefs) {
  const state = imageStateFor(event, imageEntries, imageRefs);
  const image = imageEntries.find((entry) => entry?.eventId === event?.eventId);
  if (state.status === "protected" && image?.privacyReview?.reasonCodes?.includes("manual_image_review")) return "画像の確認が必要です";
  return ({
    ready: "保存済み", queued: "画像を準備しています", capturing: "画像を確認しています",
    unavailable: "この操作の画像を取得できませんでした", failed: "この操作の画像を取得できませんでした",
    protected: "保護した領域の確認が必要です", none: "説明のみの手順",
    display_failed: "保存済みの画像を読み込めませんでした"
  })[state.status] || "画像を準備しています";
}

function imageReviewText(image, state) {
  if (state?.status === "protected" && image?.privacyReview?.reasonCodes?.includes("manual_image_review")) return "画像を表示しています。内容を確認し、必要なら画像編集で黒塗りや置換を適用してください。";
  return imageReasonText(state?.reason);
}

function imageReasonText(reason) {
  return ({
    screen_changed: "次の操作で画面が変わったため、過去の画面を取得できませんでした。",
    navigation_changed: "ページが移動したため、移動前の画面を取得できませんでした。",
    tab_not_visible: "記録対象のタブが表示されていませんでした。",
    tab_unavailable: "記録対象のタブを確認できませんでした。",
    mask_failed: "画像の保護を確認できませんでした。",
    mask_invalidated: "処理中に画面が変わり、画像の保護を確認できませんでした。",
    paint_timeout: "画面の描画を確認できるまでに時間がかかりました。",
    paint_unavailable: "画面の描画を確認できませんでした。",
    privacy_budget_exceeded: "安全に確認できる範囲を超えたため、画像を保存していません。",
    storage_failed: "画像を端末に保存できませんでした。",
    capture_not_requested: "終了・一時停止時に操作文だけを回収しました。",
    capture_interrupted: "画像の処理が中断されました。",
    unsupported_editable: "この編集領域だけを保護しました。ほかの画面は記録されています。",
    unsupported_canvas: "描画領域を自動で確認できないため保護しました。画像編集で確認してください。",
    unsupported_iframe: "埋め込み領域を自動で確認できないため保護しました。画像編集で確認してください。",
    unsupported_closed_shadow: "安全に読み取れない領域を保護しました。",
    unknown_field_semantics: "入力欄の種類を確認できないため保護しました。",
    protection_too_broad: "保護した範囲が広く、操作を確認できません。",
    protected_region: "安全な画像ですが、保護した領域を編集画面で確認してください。"
  })[reason] || "記録を続けられます。終了後、元の画面で撮り直すか画像を追加してください。";
}

function imageSummaryFor(events, imageEntries, imageRefs) {
  const counts = { ready: 0, pending: 0, missing: 0, protected: 0, none: 0, displayFailed: 0 };
  for (const event of events) {
    const state = imageStateFor(event, imageEntries, imageRefs).status;
    if (state === "ready" || state === "protected" || state === "none") counts[state] += 1;
    else if (state === "display_failed") counts.displayFailed += 1;
    else if (["unavailable", "failed"].includes(state)) counts.missing += 1;
    else counts.pending += 1;
  }
  return `画像 完了 ${counts.ready}/${events.length}・準備中 ${counts.pending}・取得できず ${counts.missing}・要確認 ${counts.protected}・説明のみ ${counts.none}${counts.displayFailed ? `・表示できず ${counts.displayFailed}` : ""}`;
}

function updateLiveLatestVisibility() {
  liveLatest.hidden = followLiveTail || !liveSteps.children.length;
}

function scrollLiveLatest({ behavior = "smooth", scheduleRepair = true } = {}) {
  const latest = liveSteps.lastElementChild;
  if (!latest) return;
  followLiveTail = true;
  programmaticFollowPending = true;
  updateLiveLatestVisibility();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scrollBehavior = reducedMotion ? "auto" : behavior;
  const footerTop = controls?.getBoundingClientRect().top ?? window.innerHeight;
  const targetScrollY = Math.max(0, window.scrollY + latest.getBoundingClientRect().bottom - footerTop + 8);
  if (Math.abs(targetScrollY - window.scrollY) > 1) {
    window.scrollTo({ top: targetScrollY, behavior: scrollBehavior });
  }
  const repairFollow = followLiveTail;
  if (repairFollow && scheduleRepair) {
    const repairGeneration = ++liveTailRepairGeneration;
    for (const delay of [80, 220, 420]) {
      setTimeout(() => {
        if (repairGeneration !== liveTailRepairGeneration || !followLiveTail || liveSection.hidden) return;
        if (!isLiveTailVisible()) scrollLiveLatest({ behavior: "auto", scheduleRepair: false });
      }, delay);
    }
  }
  requestAnimationFrame(() => {
    if (isLiveTailVisible()) programmaticFollowPending = false;
  });
}

function isLiveTailVisible() {
  const latest = liveSteps.lastElementChild;
  if (!latest) return true;
  const rect = latest.getBoundingClientRect();
  const footerTop = controls?.getBoundingClientRect().top ?? window.innerHeight;
  const viewportBottom = Math.min(window.innerHeight, footerTop);
  return rect.bottom <= viewportBottom && rect.top < viewportBottom;
}

function captureLiveScrollAnchor() {
  const anchor = [...liveSteps.children].find((item) => {
    const rect = item.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  });
  return anchor ? { eventId: anchor.dataset.eventId, top: anchor.getBoundingClientRect().top } : null;
}

function restoreLiveScrollAnchor(anchor) {
  if (!anchor?.eventId) return;
  const next = liveSteps.querySelector(`[data-event-id="${CSS.escape(anchor.eventId)}"]`);
  if (!next) return;
  const delta = next.getBoundingClientRect().top - anchor.top;
  if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: "auto" });
}

function keepLiveTailVisibleAfterResize() {
  if (!followLiveTail || liveSection.hidden) return;
  requestAnimationFrame(() => {
    if (followLiveTail && !isLiveTailVisible()) scrollLiveLatest({ behavior: "auto" });
  });
}

if (typeof ResizeObserver === "function" && liveSteps) {
  new ResizeObserver(keepLiveTailVisibleAfterResize).observe(liveSteps);
}

function renderLiveSteps(events = [], imageEntries = [], imageRefs = []) {
  const scrollAnchor = followLiveTail ? null : captureLiveScrollAnchor();
  liveSteps.replaceChildren();
  liveCount.textContent = String(events.length);
  if (liveImageSummary) liveImageSummary.textContent = imageSummaryFor(events, imageEntries, imageRefs);
  const images = new Map(imageEntries.map((entry) => [entry.eventId, entry]));
  for (const [index, event] of events.entries()) {
    const item = document.createElement("li");
    item.className = "step-card";
    item.dataset.eventId = event.eventId || "";
    if (index === events.length - 1) {
      item.classList.add("is-current");
      item.setAttribute("aria-current", "step");
    }
    const text = document.createElement("div");
    text.className = "step-text";
    const number = document.createElement("span");
    number.className = "step-number";
    number.textContent = String(index + 1);
    const instruction = document.createElement("p");
    instruction.textContent = instructionFor(event);
    text.append(number, instruction);
    const imageStatus = document.createElement("span");
    imageStatus.className = "step-image-status";
    const imageStatusText = imageStatusFor(event, imageEntries, imageRefs);
    const currentImageState = imageStateFor(event, imageEntries, imageRefs);
    imageStatus.textContent = imageStatusText === "保存済み" ? "✓ 画像を端末に保存済み" : imageStatusText;
    imageStatus.dataset.state = currentImageState.status;
    text.append(imageStatus);
    const imageEntry = images.get(event.eventId);
    if (["ready", "protected"].includes(currentImageState.status) && imageEntry?.dataUrl && (imageEntry.version || 1) >= (currentImageState.version || 1)) {
      const image = document.createElement("img");
      setImage(image, imageEntry.dataUrl, "この手順のスクリーンショット");
      image.addEventListener("error", () => {
        failedDisplayImages.add(imageEntry.id);
        renderLiveSteps(events, imageEntries, imageRefs);
      }, { once: true });
      item.append(text, image);
      if (currentImageState.status === "protected") {
        const review = document.createElement("p");
        review.className = "image-state";
        review.textContent = imageReviewText(imageEntry, currentImageState);
        item.append(review);
      }
    } else {
      const imageState = document.createElement("span");
      imageState.className = "image-state";
      imageState.textContent = ["queued", "capturing", "none", "display_failed"].includes(currentImageState.status)
        ? imageStatusText : imageReasonText(currentImageState.reason);
      item.append(text, imageState);
      if (currentImageState.status === "display_failed") {
        const retry = document.createElement("button");
        retry.type = "button";
        retry.textContent = "もう一度読み込む";
        retry.addEventListener("click", () => {
          failedDisplayImages.delete(imageEntry.id);
          renderLiveSteps(events, imageEntries, imageRefs);
        });
        item.append(retry);
      }
    }
    liveSteps.append(item);
  }
  liveDescription.textContent = events.length ? "操作を続けると、手順がここへ追加されます。" : "操作すると、ここに手順が追加されます。";
  const current = events.at(-1);
  liveCurrentStep.textContent = current ? `手順 ${events.length}：${instructionFor(current)}` : "まだありません";
  const currentStatus = current ? imageStatusFor(current, imageEntries, imageRefs) : "操作を待っています";
  liveCurrentStatus.textContent = current ? `スクリーンショット：${currentStatus}` : currentStatus;
  liveCurrentStatus.dataset.state = current ? imageStateFor(current, imageEntries, imageRefs).status : "queued";
  updateLiveLatestVisibility();
  requestAnimationFrame(() => {
    if (followLiveTail) scrollLiveLatest({ behavior: "auto" });
    else restoreLiveScrollAnchor(scrollAnchor);
  });
}

function firstScreenshot(draft) {
  const screenshot = draft?.screenshots?.find((item) => item?.dataUrl);
  return screenshot?.dataUrl || null;
}

function editorUrl(draftId) {
  return chrome.runtime.getURL(`editor/editor.html#${encodeURIComponent(draftId)}`);
}

function isEditorReadySender(sender, draftId) {
  try {
    const senderUrl = new URL(sender?.url || "");
    const expectedUrl = new URL(editorUrl(draftId));
    return senderUrl.origin === expectedUrl.origin && senderUrl.pathname === expectedUrl.pathname;
  } catch {
    return false;
  }
}

function waitForEditorReady(draftId) {
  if (!chrome.runtime?.onMessage?.addListener) return { promise: Promise.resolve(false), cancel() {} };
  let finishWait;
  const promise = new Promise((resolve) => {
    let settled = false;
    finishWait = (ready) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      chrome.runtime.onMessage.removeListener(listener);
      resolve(ready);
    };
    const listener = (message, sender) => {
      if (message?.type !== "editor:ready" || message.draftId !== draftId || message.ready !== true) return;
      if (!isEditorReadySender(sender, draftId)) return;
      finishWait(true);
    };
    const timeout = setTimeout(() => finishWait(false), EDITOR_READY_TIMEOUT_MS);
    chrome.runtime.onMessage.addListener(listener);
  });
  return {
    promise,
    cancel() { finishWait(false); }
  };
}

async function openDraftEditor(draftId, { waitForReady = false } = {}) {
  if (typeof draftId !== "string" || !draftId) throw new Error("下書きIDがありません");
  const readyWaiter = waitForReady ? waitForEditorReady(draftId) : null;
  try {
    const tab = await chrome.tabs.create({ url: editorUrl(draftId) });
    if (!waitForReady) return tab;
    if (!(await readyWaiter.promise)) throw new Error("EDITOR_NOT_READY");
    return tab;
  } catch (error) {
    readyWaiter?.cancel();
    throw error;
  }
}

async function closeSidePanel() {
  const currentWindow = await chrome.windows.getCurrent();
  const response = await send({ type: "capture:close-panel", windowId: currentWindow?.id });
  return response?.closed === true;
}

function draftRenderKey(items = []) {
  return JSON.stringify(items.map((draft) => {
    const screenshot = draft?.screenshots?.find((item) => item?.dataUrl);
    return {
      id: draft?.id || "",
      updatedAt: draft?.updatedAt || "",
      title: draft?.title || "",
      description: draft?.description || "",
      stepCount: draft?.steps?.length || 0,
      firstScreenshotId: screenshot?.id || "",
      firstScreenshotLength: screenshot?.dataUrl?.length || 0
    };
  }).sort((a, b) => a.id.localeCompare(b.id)));
}

function renderDrafts(items = []) {
  const focusedDraftId = document.activeElement?.dataset?.draftId || "";
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
    open.dataset.draftId = draft.id;
    open.textContent = "手順書を開く";
    open.addEventListener("click", () => openDraftEditor(draft.id));
    content.append(title, detail, open);
    card.append(image, content);
    drafts.append(card);
  }
  if (focusedDraftId) {
    const focused = [...drafts.querySelectorAll("button[data-draft-id]")]
      .find((button) => button.dataset.draftId === focusedDraftId);
    focused?.focus();
  }
}

function renderStatus(state = {}, imageEntries = []) {
  if (state.sessionId !== liveSessionId) {
    liveSessionId = state.sessionId || null;
    followLiveTail = true;
    programmaticFollowPending = false;
  }
  const active = ["recording", "paused", "finish_failed", "reinjection_failed", "cancel_failed"].includes(state.phase);
  const canFinish = ["recording", "paused", "finish_failed", "reinjection_failed"].includes(state.phase);
  const waitingForRestore = Boolean(state.restorePending || state.phase === "starting");
  if (state.mode) {
    mode.value = state.mode;
    modeBadge.textContent = MODE_LABELS[state.mode] || state.mode;
  }
  startSection.hidden = active || waitingForRestore;
  liveSection.hidden = !active;
  liveProgress.hidden = !active;
  finish.hidden = !canFinish;
  finish.disabled = finishInFlight;
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
  else if (state.phase === "reinjection_failed") status.textContent = "ページ移動後に記録を再開できません。対象タブで再開するか、記録を終了して編集してください。";
  else if (state.phase === "cancel_failed") status.textContent = "キャンセルが完了していません。もう一度キャンセルしてください。";
  else if (state.phase === "finish_failed") status.textContent = "記録を終了できませんでした。記録内容はこの端末に保持しています。もう一度終了してください。";
  else if (state.captureLimitReached === "images") status.textContent = "画像の保存上限100件に達しました。記録を終了して手順書として保存してください。";
  else if (state.captureLimitReached === "steps") status.textContent = "手順の上限200件に達しました。記録を終了して手順書として保存してください。";
  else if (state.phase === "paused") status.textContent = "記録を一時停止しています。再開すると続きから記録します。";
  else if (active) status.textContent = "このタブだけを記録しています。画像は加工せず端末へ保持し、入力値そのものは操作文へ保存しません。置換・黒塗りは記録後に画像編集で明示的に適用します。";
  else if (!state.hasDrafts) status.textContent = "";
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

let refreshInFlight = null;
async function refresh(forceDraftPoll = false) {
  if (refreshInFlight) {
    const inFlight = refreshInFlight;
    try {
      await inFlight;
    } catch (error) {
      if (!forceDraftPoll) throw error;
    }
    if (refreshInFlight === inFlight) refreshInFlight = null;
    return forceDraftPoll ? refresh(true) : undefined;
  }
  const operation = (async () => {
    const state = await send({ type: "capture:status" });
    const nextStatusKey = JSON.stringify({
      sessionId: state.sessionId,
      phase: state.phase,
      captureLimitReached: state.captureLimitReached || null,
      events: (state.events || []).map(({ eventId, at }) => [eventId, at]),
      stepImageRefs: state.stepImageRefs || []
    });
    const statusChanged = nextStatusKey !== lastStatusKey;
    const shouldPollDrafts = forceDraftPoll || statusChanged || Date.now() - lastDraftPollAt >= DRAFT_POLL_INTERVAL_MS;
    const nextDrafts = shouldPollDrafts ? await draftStore.list() : localDrafts;
    const nextLiveImages = statusChanged
      ? (state.sessionId ? await captureLiveStore.list(state.sessionId) : [])
      : liveImages;
    if (statusChanged) {
      lastStatusKey = nextStatusKey;
      liveImages = nextLiveImages;
    }
    if (shouldPollDrafts) {
      lastDraftPollAt = Date.now();
      const nextDraftKey = draftRenderKey(nextDrafts);
      if (nextDraftKey !== lastDraftKey) {
        localDrafts = nextDrafts;
        lastDraftKey = nextDraftKey;
        renderDrafts(localDrafts);
      }
    }
    renderStatus({ ...state, hasDrafts: localDrafts.length > 0 }, liveImages);
  })();
  refreshInFlight = operation;
  try {
    return await operation;
  } finally {
    if (refreshInFlight === operation) refreshInFlight = null;
  }
}

async function refreshDraftsOnly() {
  try {
    const nextDrafts = await draftStore.list();
    lastDraftPollAt = Date.now();
    localDrafts = nextDrafts;
    lastDraftKey = draftRenderKey(nextDrafts);
    renderDrafts(localDrafts);
    return { available: true, count: nextDrafts.length };
  } catch {
    return { available: false, count: 0 };
  }
}

async function showFinishFailureOutcome() {
  let current = {};
  let statusAvailable = true;
  try {
    current = await send({ type: "capture:status" });
    if (!current || typeof current !== "object" || Array.isArray(current)) throw new Error("INVALID_CAPTURE_STATUS");
  } catch {
    statusAvailable = false;
  }
  const draftsState = await refreshDraftsOnly();
  statusOverride = finishFailureMessage(current, statusAvailable, draftsState);
  if (statusAvailable) renderStatus({ ...current, hasDrafts: localDrafts.length > 0 }, liveImages);
  else {
    finish.hidden = true;
    finish.disabled = true;
  }
  status.textContent = statusOverride;
}

async function withError(action, fallback) {
  try { await action(); }
  catch { statusOverride = fallback; await refresh().catch(() => undefined); }
}

start.addEventListener("click", () => withError(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await send({ type: "capture:start", tabId: tab?.id, mode: mode.value });
  statusOverride = "";
  status.textContent = "記録を開始しました。対象タブで操作してください。";
  await refresh();
}, "記録を開始できませんでした。対象ページを開いて、もう一度お試しください。"));

finish.addEventListener("click", async () => {
  if (finishInFlight) return;
  finishInFlight = true;
  finish.disabled = true;
  try {
    const result = await send({ type: "capture:finish" });
    if (!result?.draftId) {
      await showFinishFailureOutcome();
      return;
    }
    let editorOpenError = null;
    let sidePanelClosed = false;
    try {
      await openDraftEditor(result.draftId, { waitForReady: true });
    } catch (error) {
      editorOpenError = error;
    }
    if (!editorOpenError && !result.restorePending) sidePanelClosed = await closeSidePanel().catch(() => false);
    let refreshError = null;
    try {
      await refresh(true);
    } catch (error) {
      refreshError = error;
    }
    const draftsState = refreshError
      ? await refreshDraftsOnly()
      : { available: true, count: localDrafts.length };
    renderStatus({
      phase: result.restorePending ? "restore_pending" : null,
      restorePending: Boolean(result.restorePending),
      hasDrafts: localDrafts.length > 0,
      events: [],
      stepImageRefs: [],
      sessionId: null
    }, []);
    statusOverride = "";
    if (result.restorePending) {
      statusOverride = "記録は保存済みです。画面をもう一度復元してから続けてください。";
      restore.hidden = false;
      status.textContent = statusOverride;
    } else if (editorOpenError) {
      statusOverride = savedDraftOpenMessage(draftsState);
      status.textContent = statusOverride;
    } else {
      status.textContent = result.missingImageCount
        ? `記録できました。${result.imageCount || 0}件の画像を保存しました。${result.missingImageCount}件は画像を記録できませんでした。`
        : "記録できました。画像付きの手順を保存しました。";
      if (result.reviewImageCount) status.textContent += `保護した領域の確認が必要な手順が${result.reviewImageCount}件あります。`;
      if (!sidePanelClosed) status.textContent += "記録パネルは自動で閉じられませんでした。必要に応じて手動で閉じてください。";
      if (refreshError) status.textContent = "記録できました。編集画面を開きました。下書き一覧の更新は次回表示時に確認してください。";
      if (refreshError && !sidePanelClosed) status.textContent += "記録パネルは自動で閉じられませんでした。必要に応じて手動で閉じてください。";
    }
  } catch {
    await showFinishFailureOutcome();
  } finally {
    finishInFlight = false;
    finish.disabled = false;
  }
});

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

let finishInFlight = false;
let refreshTimer;
let lastStatusKey = "";
let lastDraftKey = null;
let lastDraftPollAt = 0;
let lastLiveKey = "";
let statusOverride = "";
let liveImages = [];
let localDrafts = [];
let liveSessionId = null;
let followLiveTail = true;
let programmaticFollowPending = false;
let liveTailRepairGeneration = 0;

function updateLiveTailPosition() {
  if (programmaticFollowPending) {
    if (isLiveTailVisible()) programmaticFollowPending = false;
    else return;
  }
  if (!liveSection.hidden) followLiveTail = isLiveTailVisible();
  updateLiveLatestVisibility();
}

liveLatest.addEventListener("click", () => scrollLiveLatest());
window.addEventListener("scroll", updateLiveTailPosition, { passive: true });
window.addEventListener("scrollend", () => {
  if (programmaticFollowPending && isLiveTailVisible()) programmaticFollowPending = false;
}, { passive: true });
for (const eventName of ["wheel", "touchstart", "keydown"]) {
  window.addEventListener(eventName, () => {
    programmaticFollowPending = false;
    updateLiveTailPosition();
  }, { passive: eventName !== "keydown" });
}

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
