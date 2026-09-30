import { draftStore } from "../storage/draft-store.js";\nimport { captureLiveStore } from "../storage/capture-live-store.js";\n\nconst MASCOT = "../assets/meccha-manual-mascot-me-clear-eyes.png";\nconst mode = document.querySelector("#mode");\nconst modeBadge = document.querySelector("#modeBadge");\nconst start = document.querySelector("#start");\nconst finish = document.querySelector("#finish");\nconst pause = document.querySelector("#pause");\nconst resume = document.querySelector("#resume");\nconst cancel = document.querySelector("#cancel");\nconst restore = document.querySelector("#restore");\nconst status = document.querySelector("#status");\nconst startSection = document.querySelector("#startSection");\nconst liveSection = document.querySelector("#liveSection");\nconst liveSteps = document.querySelector("#liveSteps");
const liveCount = document.querySelector("#liveCount");
const liveDescription = document.querySelector("#liveDescription");
const liveCurrentStep = document.querySelector("#liveCurrentStep");
const liveCurrentStatus = document.querySelector("#liveCurrentStatus");
const liveLatest = document.querySelector("#liveLatest");
const draftSection = document.querySelector("#draftSection");\nconst drafts = document.querySelector("#drafts");\nconst draftCount = document.querySelector("#draftCount");\nconst emptyState = document.querySelector("#emptyState");\nconst SEMANTIC_LABELS = new Set(["ボタン", "リンク", "メニュー", "入力欄", "選択欄", "ファイル選択", "保護された入力欄", "操作対象"]);\nconst DRAFT_POLL_INTERVAL_MS = 3_000;\n\nconst MODE_LABELS = {\n  pc: "PC",\n  smartphonePortrait: "スマホ（縦）",\n  smartphoneLandscape: "スマホ（横）",\n  tabletPortrait: "タブレット（縦）",\n  tabletLandscape: "タブレット（横）"\n};\n\nasync function send(message) {\n  const response = await chrome.runtime.sendMessage(message);\n  if (!response?.ok) throw new Error(response?.error || "操作を完了できませんでした");\n  return response.value;\n}\n\nfunction instructionFor(event) {\n  if (event?.kind === "scroll") return `画面を${({ up: "上", down: "下", left: "左", right: "右" })[event.direction] || "指定方向"}へスクロールする`;\n  if (event?.kind === "navigation") return "次のページへ移動する";\n  const semanticLabel = SEMANTIC_LABELS.has(event?.label) ? event.label : "操作対象";\n  if (event?.kind === "input") return `${semanticLabel}に入力する`;\n  return `${semanticLabel}を操作する`;\n}\n\nfunction setImage(image, source, alt) {
  image.src = source || MASCOT;
  image.alt = alt;
}

function imageStatusFor(event, imageEntries, imageRefs) {
  const imageEntry = imageEntries.find((entry) => entry?.eventId === event?.eventId);
  const imageRef = imageRefs.find((entry) => entry?.eventId === event?.eventId);
  if (imageEntry?.status === "ready" && imageEntry.dataUrl) return "保存済み";
  if (["failed", "unavailable"].includes(imageRef?.status)) return "記録できませんでした";
  return "記録中…";
}

function updateLiveLatestVisibility() {
  liveLatest.hidden = followLiveTail || !liveSteps.children.length;
}

function scrollLiveLatest({ behavior = "smooth" } = {}) {
  const latest = liveSteps.lastElementChild;
  if (!latest) return;
  followLiveTail = true;
  ignoreScrollEventsUntil = performance.now() + 1_000;
  updateLiveLatestVisibility();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  latest.scrollIntoView({ behavior: reducedMotion ? "auto" : behavior, block: "end" });
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

function renderLiveSteps(events = [], imageEntries = [], imageRefs = []) {
  const scrollAnchor = followLiveTail ? null : captureLiveScrollAnchor();
  liveSteps.replaceChildren();
  liveCount.textContent = String(events.length);
  const images = new Map(imageEntries.map((entry) => [entry.eventId, entry]));
  const refs = new Map(imageRefs.map((entry) => [entry.eventId, entry]));
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
    const number = document.createElement("span");\n    number.className = "step-number";\n    number.textContent = String(index + 1);\n    const instruction = document.createElement("p");
    instruction.textContent = instructionFor(event);
    text.append(number, instruction);
    const imageStatus = document.createElement("span");
    imageStatus.className = "step-image-status";
    const imageStatusText = imageStatusFor(event, imageEntries, imageRefs);
    imageStatus.textContent = imageStatusText === "保存済み" ? "✓ スクリーンショット保存済み" : `スクリーンショット：${imageStatusText}`;
    imageStatus.dataset.state = imageStatusText === "保存済み" ? "ready" : imageStatusText === "記録できませんでした" ? "failed" : "pending";
    text.append(imageStatus);
    const imageEntry = images.get(event.eventId);
    const imageRef = refs.get(event.eventId);\n    if (imageEntry?.status === "ready" && imageEntry.dataUrl) {\n      const image = document.createElement("img");\n      setImage(image, imageEntry.dataUrl, "この手順のスクリーンショット");\n      item.append(text, image);\n    } else {\n      const imageState = document.createElement("span");\n      imageState.className = "image-state";\n      imageState.textContent = imageRef?.status === "failed" || imageRef?.status === "unavailable"\n        ? "画像を記録できませんでした。記録を続けるか、終了して手順書を確認してください。"\n        : "画像を読み込んでいます…";\n      item.append(text, imageState);\n    }\n    liveSteps.append(item);\n  }
  liveDescription.textContent = events.length ? "操作を続けると、手順がここへ追加されます。" : "操作すると、ここに手順が追加されます。";
  const current = events.at(-1);
  liveCurrentStep.textContent = current ? `手順 ${events.length}：${instructionFor(current)}` : "まだありません";
  const currentStatus = current ? imageStatusFor(current, imageEntries, imageRefs) : "操作を待っています";
  liveCurrentStatus.textContent = current ? `スクリーンショット：${currentStatus}` : currentStatus;
  liveCurrentStatus.dataset.state = currentStatus === "保存済み" ? "ready" : currentStatus === "記録できませんでした" ? "failed" : "pending";
  updateLiveLatestVisibility();
  requestAnimationFrame(() => {
    if (followLiveTail) scrollLiveLatest({ behavior: "auto" });
    else restoreLiveScrollAnchor(scrollAnchor);
  });
}
\nfunction firstScreenshot(draft) {\n  const screenshot = draft?.screenshots?.find((item) => item?.dataUrl);\n  return screenshot?.dataUrl || null;\n}\n\nfunction editorUrl(draftId) {\n  return chrome.runtime.getURL(`editor/editor.html#${encodeURIComponent(draftId)}`);\n}\n\nasync function openDraftEditor(draftId) {
  if (typeof draftId !== "string" || !draftId) throw new Error("下書きIDがありません");
  return chrome.tabs.create({ url: editorUrl(draftId) });
}

async function closeSidePanel() {
  const currentWindow = await chrome.windows.getCurrent();
  const response = await send({ type: "capture:close-panel", windowId: currentWindow?.id });
  return response?.closed === true;
}
\nfunction draftRenderKey(items = []) {\n  return JSON.stringify(items.map((draft) => {\n    const screenshot = draft?.screenshots?.find((item) => item?.dataUrl);\n    return {\n      id: draft?.id || "",\n      updatedAt: draft?.updatedAt || "",\n      title: draft?.title || "",\n      description: draft?.description || "",\n      stepCount: draft?.steps?.length || 0,\n      firstScreenshotId: screenshot?.id || "",\n      firstScreenshotLength: screenshot?.dataUrl?.length || 0\n    };\n  }).sort((a, b) => a.id.localeCompare(b.id)));\n}\n\nfunction renderDrafts(items = []) {\n  const focusedDraftId = document.activeElement?.dataset?.draftId || "";\n  const sorted = [...items].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));\n  drafts.replaceChildren();\n  draftCount.textContent = String(sorted.length);\n  draftSection.hidden = sorted.length === 0;\n  for (const draft of sorted) {\n    const card = document.createElement("article");\n    card.className = "draft-card";\n    const image = document.createElement("img");\n    setImage(image, firstScreenshot(draft), "手順書のスクリーンショット");\n    const content = document.createElement("div");\n    const title = document.createElement("h3");\n    title.textContent = draft.title || "無題の手順書";\n    const detail = document.createElement("p");\n    detail.textContent = `${draft.steps?.length || 0}手順・端末に保存済み`;\n    const open = document.createElement("button");\n    open.type = "button";\n    open.dataset.draftId = draft.id;\n    open.textContent = "手順書を開く";\n    open.addEventListener("click", () => openDraftEditor(draft.id));\n    content.append(title, detail, open);\n    card.append(image, content);\n    drafts.append(card);\n  }\n  if (focusedDraftId) {\n    const focused = [...drafts.querySelectorAll("button[data-draft-id]")]\n      .find((button) => button.dataset.draftId === focusedDraftId);\n    focused?.focus();\n  }\n}\n\nfunction renderStatus(state = {}, imageEntries = []) {\n  const active = ["recording", "paused", "finish_failed", "reinjection_failed", "cancel_failed"].includes(state.phase);\n  const canFinish = ["recording", "paused", "finish_failed", "reinjection_failed"].includes(state.phase);\n  const waitingForRestore = Boolean(state.restorePending || state.phase === "starting");\n  if (state.mode) {\n    mode.value = state.mode;\n    modeBadge.textContent = MODE_LABELS[state.mode] || state.mode;\n  }\n  startSection.hidden = active || waitingForRestore;\n  liveSection.hidden = !active;\n  finish.hidden = !canFinish;\n  finish.disabled = false;\n  pause.hidden = state.phase !== "recording";\n  resume.hidden = !["paused", "reinjection_failed"].includes(state.phase) || Boolean(state.captureLimitReached);\n  cancel.hidden = !active && !waitingForRestore;\n  restore.hidden = !waitingForRestore;\n  mode.disabled = active || waitingForRestore;\n  start.disabled = active || waitingForRestore;\n  emptyState.hidden = active || waitingForRestore || Boolean(state.hasDrafts);\n  const liveKey = JSON.stringify({\n    events: state.events || [],\n    imageRefs: state.stepImageRefs || [],\n    images: imageEntries.map(({ eventId, id, status, dataUrl }) => [eventId, id, status, Boolean(dataUrl)])\n  });\n  if (liveKey !== lastLiveKey) {\n    lastLiveKey = liveKey;\n    renderLiveSteps(state.events || [], imageEntries, state.stepImageRefs || []);\n  }\n  if (statusOverride) status.textContent = statusOverride;\n  else if (waitingForRestore) status.textContent = state.finishFailed ? "記録内容は保持しています。画面を元に戻してから、もう一度終了してください。" : "画面を元に戻せませんでした。復元情報は残っています。";\n  else if (state.phase === "reinjection_failed") status.textContent = "ページ移動後に記録を再開できません。対象タブで再開するか、記録を終了して編集してください。";\n  else if (state.phase === "cancel_failed") status.textContent = "キャンセルが完了していません。もう一度キャンセルしてください。";\n  else if (state.phase === "finish_failed") status.textContent = "記録を終了できませんでした。記録内容はこの端末に保持しています。もう一度終了してください。";\n  else if (state.captureLimitReached === "images") status.textContent = "画像の保存上限100件に達しました。記録を終了して手順書として保存してください。";\n  else if (state.captureLimitReached === "steps") status.textContent = "手順の上限200件に達しました。記録を終了して手順書として保存してください。";\n  else if (state.phase === "paused") status.textContent = "記録を一時停止しています。再開すると続きから記録します。";\n  else if (active) status.textContent = "このタブだけを記録しています。入力欄の内容は記録せず、画像でも隠します。入力欄以外の機密情報は画像に写る場合があります。";\n  else if (!state.hasDrafts) status.textContent = "";\n}\n\nfunction finishFailureMessage(state, statusAvailable, draftsState) {\n  const unknownMessage = !draftsState?.available\n    ? "記録終了の結果を確認できませんでした。下書き一覧を表示できませんでした。もう一度この画面を開いて確認してください。"\n    : draftsState.count === 0\n      ? "記録終了の結果を確認できませんでした。下書きが見つかりませんでした。対象タブの状態を確認してから、もう一度お試しください。"\n      : "記録終了の結果を確認できませんでした。今回の記録が保存されたか確認できません。下書き一覧を確認してください。";\n  if (!statusAvailable) return unknownMessage;\n  if (state?.restorePending || state?.phase === "starting" || state?.phase === "restore_pending") {\n    return "画面を元に戻せませんでした。復元情報は残っています。先に復元してください。";\n  }\n  if (state?.phase === "finish_failed") {\n    return "記録を終了できませんでした。記録内容はこの端末に保持しています。対象タブを開いて、もう一度終了してください。";\n  }\n  if (["recording", "paused", "reinjection_failed"].includes(state?.phase)) {\n    return "記録を終了できませんでした。記録内容はこの端末に保持しています。対象タブの状態を確認して、もう一度終了してください。";\n  }\n  return unknownMessage;\n}\n\nfunction savedDraftOpenMessage(draftsState) {\n  return draftsState?.available && draftsState.count > 0\n    ? "記録は保存しましたが、編集画面を開けませんでした。下書き一覧から開いてください。"\n    : draftsState?.available\n      ? "記録は保存しましたが、編集画面を開けませんでした。もう一度この画面を開いて確認してください。"\n      : "記録は保存しましたが、編集画面と下書き一覧を表示できませんでした。もう一度この画面を開いて確認してください。";\n}\n\nlet refreshInFlight = null;\nasync function refresh(forceDraftPoll = false) {\n  if (refreshInFlight) {\n    const inFlight = refreshInFlight;\n    try {\n      await inFlight;\n    } catch (error) {\n      if (!forceDraftPoll) throw error;\n    }\n    if (refreshInFlight === inFlight) refreshInFlight = null;\n    return forceDraftPoll ? refresh(true) : undefined;\n  }\n  const operation = (async () => {\n    const state = await send({ type: "capture:status" });\n    const nextStatusKey = JSON.stringify({\n      sessionId: state.sessionId,\n      phase: state.phase,\n      captureLimitReached: state.captureLimitReached || null,\n      events: (state.events || []).map(({ eventId, at }) => [eventId, at]),\n      stepImageRefs: state.stepImageRefs || []\n    });\n    const statusChanged = nextStatusKey !== lastStatusKey;\n    const shouldPollDrafts = forceDraftPoll || statusChanged || Date.now() - lastDraftPollAt >= DRAFT_POLL_INTERVAL_MS;\n    const nextDrafts = shouldPollDrafts ? await draftStore.list() : localDrafts;\n    const nextLiveImages = statusChanged\n      ? (state.sessionId ? await captureLiveStore.list(state.sessionId) : [])\n      : liveImages;\n    if (statusChanged) {\n      lastStatusKey = nextStatusKey;\n      liveImages = nextLiveImages;\n    }\n    if (shouldPollDrafts) {\n      lastDraftPollAt = Date.now();\n      const nextDraftKey = draftRenderKey(nextDrafts);\n      if (nextDraftKey !== lastDraftKey) {\n        localDrafts = nextDrafts;\n        lastDraftKey = nextDraftKey;\n        renderDrafts(localDrafts);\n      }\n    }\n    renderStatus({ ...state, hasDrafts: localDrafts.length > 0 }, liveImages);\n  })();\n  refreshInFlight = operation;\n  try {\n    return await operation;\n  } finally {\n    if (refreshInFlight === operation) refreshInFlight = null;\n  }\n}\n\nasync function refreshDraftsOnly() {\n  try {\n    const nextDrafts = await draftStore.list();\n    lastDraftPollAt = Date.now();\n    localDrafts = nextDrafts;\n    lastDraftKey = draftRenderKey(nextDrafts);\n    renderDrafts(localDrafts);\n    return { available: true, count: nextDrafts.length };\n  } catch {\n    return { available: false, count: 0 };\n  }\n}\n\nasync function showFinishFailureOutcome() {\n  let current = {};\n  let statusAvailable = true;\n  try {\n    current = await send({ type: "capture:status" });\n    if (!current || typeof current !== "object" || Array.isArray(current)) throw new Error("INVALID_CAPTURE_STATUS");\n  } catch {\n    statusAvailable = false;\n  }\n  const draftsState = await refreshDraftsOnly();\n  statusOverride = finishFailureMessage(current, statusAvailable, draftsState);\n  if (statusAvailable) renderStatus({ ...current, hasDrafts: localDrafts.length > 0 }, liveImages);\n  else {\n    finish.hidden = true;\n    finish.disabled = true;\n  }\n  status.textContent = statusOverride;\n}\n\nasync function withError(action, fallback) {\n  try { await action(); }\n  catch { statusOverride = fallback; await refresh().catch(() => undefined); }\n}\n\nstart.addEventListener("click", () => withError(async () => {\n  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });\n  await send({ type: "capture:start", tabId: tab?.id, mode: mode.value });\n  statusOverride = "";\n  status.textContent = "記録を開始しました。対象タブで操作してください。";\n  await refresh();\n}, "記録を開始できませんでした。対象ページを開いて、もう一度お試しください。"));\n\nfinish.addEventListener("click", async () => {\n  try {\n    const result = await send({ type: "capture:finish" });\n    if (!result?.draftId) {\n      await showFinishFailureOutcome();\n      return;\n    }\n    let editorOpenError = null;
    try {
      await openDraftEditor(result.draftId);
    } catch (error) {
      editorOpenError = error;
    }
    if (!editorOpenError && !result.restorePending) await closeSidePanel().catch(() => false);
    let refreshError = null;\n    try {\n      await refresh(true);\n    } catch (error) {\n      refreshError = error;\n    }\n    const draftsState = refreshError\n      ? await refreshDraftsOnly()\n      : { available: true, count: localDrafts.length };\n    renderStatus({\n      phase: result.restorePending ? "restore_pending" : null,\n      restorePending: Boolean(result.restorePending),\n      hasDrafts: localDrafts.length > 0,\n      events: [],\n      stepImageRefs: [],\n      sessionId: null\n    }, []);\n    statusOverride = "";\n    if (result.restorePending) {\n      statusOverride = "記録は保存済みです。画面をもう一度復元してから続けてください。";\n      restore.hidden = false;\n      status.textContent = statusOverride;\n    } else if (editorOpenError) {\n      statusOverride = savedDraftOpenMessage(draftsState);\n      status.textContent = statusOverride;\n    } else {\n      status.textContent = result.missingImageCount\n        ? `記録できました。${result.imageCount || 0}件の画像を保存しました。${result.missingImageCount}件は画像を記録できませんでした。`\n        : "記録できました。画像付きの手順を保存しました。";\n      if (refreshError) status.textContent = "記録できました。編集画面を開きました。下書き一覧の更新は次回表示時に確認してください。";\n    }\n  } catch {\n    await showFinishFailureOutcome();\n  }\n});\n\npause.addEventListener("click", () => withError(async () => {\n  await send({ type: "capture:pause" });\n  statusOverride = "";\n  await refresh();\n}, "一時停止できませんでした。記録内容は保持しています。"));\n\nresume.addEventListener("click", () => withError(async () => {\n  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });\n  await send({ type: "capture:resume", tabId: tab?.id });\n  statusOverride = "";\n  await refresh();\n}, "記録を再開できませんでした。記録内容は保持しています。"));\n\ncancel.addEventListener("click", () => withError(async () => {\n  await send({ type: "capture:cancel" });\n  await refresh();\n  statusOverride = "";\n  status.textContent = "記録をキャンセルしました。保存済みの下書きは残っています。";\n}, "キャンセルを完了できませんでした。記録データと復元情報は残っています。"));\n\nrestore.addEventListener("click", () => withError(async () => {\n  await send({ type: "capture:restore" });\n  statusOverride = "";\n  await refresh();\n}, "画面を復元できませんでした。復元情報は残っています。"));\n\nlet refreshTimer;\nlet lastStatusKey = "";\nlet lastDraftKey = null;\nlet lastDraftPollAt = 0;\nlet lastLiveKey = "";\nlet statusOverride = "";\nlet liveImages = [];
let localDrafts = [];
let followLiveTail = true;
let ignoreScrollEventsUntil = 0;

function updateLiveTailPosition(event) {
  if (performance.now() < ignoreScrollEventsUntil) return;
  const root = document.scrollingElement || document.documentElement;
  const distanceFromTail = root.scrollHeight - (root.scrollTop + window.innerHeight);
  if (distanceFromTail <= 120) followLiveTail = true;
  else if (!liveSection.hidden) followLiveTail = false;
  updateLiveLatestVisibility();
}

liveLatest.addEventListener("click", () => scrollLiveLatest());
window.addEventListener("scroll", updateLiveTailPosition, { passive: true });

async function startPolling() {
  await refresh().catch(() => { status.textContent = "状態を読み込めませんでした。もう一度お試しください。"; });\n  const poll = async () => {\n    await refresh().catch(() => undefined);\n    clearTimeout(refreshTimer);\n    refreshTimer = setTimeout(poll, liveSection.hidden ? 1800 : 700);\n  };\n  refreshTimer = setTimeout(poll, 700);\n}\n\nvoid startPolling();\n