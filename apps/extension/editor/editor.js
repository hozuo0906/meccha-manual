import { addStep, deleteStep, moveStep, updateStepInstruction } from "./draft-model.js";
import { createImageEditor } from "./image-editor.js";
import { drawScreenshot } from "./image-renderer.js";
import { buildContinueUrl, createHandoffAttemptId, createHandoffMetadata, findRecoverableHandoff, fingerprintDraft, handoffReadyStorageKey, handoffStorageKey, pruneExpiredHandoffs, saveHandoffMetadata, withHandoffDraftLock, withHandoffReadyLock } from "./handoff.js";
import { getOnboardingOrigin } from "../onboarding-config.js";
import { draftStore } from "../storage/draft-store.js";

const id = location.hash.slice(1);
const draft = await draftStore.get(id);
if (!draft) throw new Error("下書きが見つかりません");

const title = document.querySelector("#title");
const description = document.querySelector("#description");
const steps = document.querySelector("#steps");
const detail = document.querySelector("#detail");
const status = document.querySelector("#status");
const addStepButton = document.querySelector("#addStep");
const outputGate = document.querySelector("#outputGate");
const cancelOutput = document.querySelector("#cancelOutput");
const startRegistration = document.querySelector("#startRegistration");
const startShare = document.querySelector("#startShare");
const activateHandoff = document.querySelector("#activateHandoff");
const gateStatus = document.querySelector("#gateStatus");
const saveState = document.querySelector("#saveState");
const handoffProgress = document.querySelector("#handoffProgress");
const handoffProgressText = document.querySelector("#handoffProgressText");
const pendingRegistrationMessage = "保存先は現在利用できません。元の手順書はこの端末に残っています。";
const HANDOFF_READY_TIMEOUT_MS = 8_000;
let outputInFlight = false;
let pendingHandoffTabId = null;
let activeHandoffAttempt = null;
let handoffRunGeneration = 0;
let selectedStepId = draft.steps[0]?.id;
const previewGenerations = new WeakMap();
function invalidatePreview(canvas) {
  previewGenerations.set(canvas, (previewGenerations.get(canvas) || 0) + 1);
  canvas.width = 1;
  canvas.height = 1;
  canvas.dataset.previewRendered = "false";
}
const previewObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    const canvas = entry.target;
    const screenshot = canvas.__screenshot;
    if (!screenshot) return;
    if (entry.isIntersecting) drawPreview(canvas, screenshot);
    else invalidatePreview(canvas);
  });
}, { rootMargin: "900px 0px" });
let activeImageEditor = null;
let stepObserver = null;
let persistQueue = Promise.resolve();

title.value = draft.title;
description.value = draft.description;

function setSaveState(label, state = "saved") {
  if (!saveState) return;
  saveState.textContent = label;
  saveState.dataset.state = state;
}

function enqueuePersist(operation) {
  const next = persistQueue.then(operation, operation);
  persistQueue = next.catch(() => undefined);
  return next;
}

function persist(message = "この端末に保存しました。") {
  return enqueuePersist(async () => {
    draft.title = title.value;
    draft.description = description.value;
    draft.updatedAt = new Date().toISOString();
    setSaveState("保存中…", "saving");
    try {
      await draftStore.put(draft);
      status.textContent = message;
      setSaveState("保存済み", "saved");
      return true;
    } catch {
      status.textContent = "下書きを保存できませんでした。記録内容は送信されていません。空き容量を確認してもう一度お試しください。";
      setSaveState("保存できません", "error");
      return false;
    }
  });
}

function persistCandidate(candidate, message = "この端末に保存しました。") {
  return enqueuePersist(async () => {
    candidate = typeof candidate === "function" ? candidate() : candidate;
    candidate.title = title.value;
    candidate.description = description.value;
    candidate.updatedAt = new Date().toISOString();
    setSaveState("保存中…", "saving");
    try { await draftStore.put(candidate); status.textContent = message; setSaveState("保存済み", "saved"); return { ok: true, candidate }; }
    catch { status.textContent = "下書きを保存できませんでした。編集内容は保持されています。空き容量を確認してもう一度お試しください。"; setSaveState("保存できません", "error"); return { ok: false }; }
  });
}

function screenshotFor(step) { return draft.screenshots.find((item) => item.id === step?.screenshotId); }

async function drawPreview(canvas, screenshot) {
  const generation = (previewGenerations.get(canvas) || 0) + 1;
  previewGenerations.set(canvas, generation);
  try {
    const image = new Image(); image.src = screenshot.dataUrl; await image.decode();
    if (previewGenerations.get(canvas) !== generation || !canvas.isConnected) return;
    const context = canvas.getContext("2d"); drawScreenshot(context, image, screenshot);
    canvas.dataset.previewRendered = "true";
    canvas.setAttribute("aria-label", "操作を記録した画面（注釈とマスクを反映）");
  } catch {
    if (previewGenerations.get(canvas) !== generation || !canvas.isConnected) return;
    previewObserver.unobserve(canvas);
    canvas.__screenshot = null;
    canvas.replaceWith(Object.assign(document.createElement("p"), { textContent: "画像を読み込めませんでした。" }));
  }
}

function renderScreenshot(step) {
  const screenshot = screenshotFor(step);
  if (!screenshot) return document.createTextNode("この手順には画像がありません。");
  const area = document.createElement("div"); area.className = "screenshot-area";
  const preview = document.createElement("div"); preview.className = "screenshot-preview";
  preview.style.aspectRatio = "16 / 9";
  const canvas = document.createElement("canvas"); canvas.className = "screenshot-canvas"; canvas.tabIndex = 0; preview.append(canvas); area.append(preview);
  const edit = document.createElement("button"); edit.type = "button"; edit.className = "image-edit-button"; edit.textContent = "✎ 画像を編集"; edit.setAttribute("aria-label", "画像を編集"); edit.dataset.editorTrigger = screenshot.id;
  edit.addEventListener("click", async () => {
    activeImageEditor?.dispose();
    activeImageEditor = createImageEditor({ dialog: document.querySelector("#imageEditorDialog"), canvas: document.querySelector("#imageEditorCanvas"), screenshot, onSave: async (next) => { const result = await persistCandidate(() => { const candidate = structuredClone(draft); const candidateScreenshot = candidate.screenshots.find((item) => item.id === screenshot.id); candidateScreenshot.annotations = next.annotations; candidateScreenshot.masks = next.masks; candidate.updatedAt = new Date().toISOString(); return candidate; }, "画像を更新して、この端末に保存しました。"); if (!result.ok) return false; Object.assign(draft, result.candidate); draft.steps.filter((candidateStep) => candidateStep.screenshotId === screenshot.id).forEach(renderStepArticle); return detail.querySelector(`[data-step-id="${CSS.escape(step.id)}"] [data-editor-trigger="${CSS.escape(screenshot.id)}"]`); } });
    await activeImageEditor.open();
  });
  area.append(edit);
  const note = document.createElement("p"); note.className = "image-editor-note"; note.textContent = "鉛筆ボタンから画像に文字や図形を追加できます。黒塗りは保存・共有する画像にも反映されます。"; area.append(note);
  canvas.__screenshot = screenshot;
  previewObserver.observe(canvas);
  return area;
}

function renderStepArticle(step) {
  const article = detail.querySelector(`[data-step-id="${CSS.escape(step.id)}"]`);
  if (!article) return render();
  const previousCanvas = article.querySelector(".screenshot-canvas");
  if (previousCanvas) { invalidatePreview(previousCanvas); previewObserver.unobserve(previousCanvas); previousCanvas.__screenshot = null; }
  article.querySelector(".screenshot-area")?.replaceWith(renderScreenshot(step));
}

function render() {
  detail.querySelectorAll(".screenshot-canvas").forEach((canvas) => invalidatePreview(canvas));
  previewObserver.disconnect();
  stepObserver?.disconnect();
  steps.replaceChildren();
  detail.replaceChildren();
  const current = draft.steps.find((step) => step.id === selectedStepId) || draft.steps[0]; selectedStepId = current?.id;
  for (const step of draft.steps) {
    const item = document.createElement("li");
    const select = document.createElement("button"); select.textContent = `${step.order}. ${step.instruction || "（説明なし）"}`; select.setAttribute("aria-controls", `step-${step.id}`); select.setAttribute("aria-current", step.id === selectedStepId ? "step" : "false");
    select.addEventListener("click", () => { selectedStepId = step.id; document.getElementById(`step-${step.id}`)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); });
    item.append(select);
    steps.append(item);
  }
  if (!current) { detail.textContent = "記録された手順はありません。手順を追加して編集できます。"; return; }
  for (const step of draft.steps) {
    const article = document.createElement("article"); article.className = "step-article"; article.id = `step-${step.id}`; article.dataset.stepId = step.id;
    const heading = document.createElement("h3"); heading.textContent = `手順 ${step.order}`; article.append(heading);
    const label = document.createElement("label"); label.textContent = "手順の説明"; const instruction = document.createElement("textarea"); instruction.value = step.instruction; instruction.maxLength = 500; instruction.addEventListener("input", async () => { updateStepInstruction(draft, step.id, instruction.value); await persist(); renderListOnly(); }); label.append(instruction); article.append(label);
    const controls = document.createElement("div"); controls.className = "step-controls";
    for (const [text, action, disabled] of [["上へ", "up", step.order === 1], ["下へ", "down", step.order === draft.steps.length]]) { const button = document.createElement("button"); button.textContent = text; button.disabled = disabled; button.addEventListener("click", async () => { moveStep(draft, step.id, action); selectedStepId = step.id; await persist(); render(); }); controls.append(button); }
    const remove = document.createElement("button"); remove.textContent = "削除"; remove.className = "danger"; remove.addEventListener("click", async () => { deleteStep(draft, step.id); selectedStepId = draft.steps[0]?.id; await persist(); render(); }); controls.append(remove); article.append(controls, renderScreenshot(step)); detail.append(article);
  }
  const setCurrent = (id) => steps.querySelectorAll("button[aria-controls]").forEach((button) => button.setAttribute("aria-current", button.getAttribute("aria-controls") === id ? "step" : "false"));
  stepObserver = new IntersectionObserver((entries) => entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio).slice(0, 1).forEach((entry) => setCurrent(entry.target.id)), { rootMargin: "-20% 0px -60%" });
  detail.querySelectorAll(".step-article").forEach((article) => stepObserver.observe(article));
}

function renderListOnly() {
  const labels = steps.querySelectorAll("button");
  draft.steps.forEach((step, index) => { if (labels[index]) labels[index].textContent = `${step.order}. ${step.instruction || "（説明なし）"}`; });
}

addStepButton.addEventListener("click", async () => {
  const step = addStep(draft);
  selectedStepId = step.id;
  await persist("手順を追加して、この端末に保存しました。");
  render();
});
for (const field of [title, description]) field.addEventListener("input", () => persist());
function updateRegistrationAvailability() {
  const origin = getOnboardingOrigin();
  startRegistration.disabled = !origin;
  if (startShare) startShare.disabled = !origin;
  if (!origin) gateStatus.textContent = pendingRegistrationMessage;
  return origin;
}

document.querySelector("#save").addEventListener("click", async () => {
  if (!await persist("この端末に保存しました。保存先を準備するか、編集に戻れます。")) {
    gateStatus.textContent = "この端末への保存に失敗したため、保存先を準備できません。編集内容を確認して、もう一度保存してください。";
    return;
  }
  gateStatus.textContent = "";
  if (typeof outputGate.showModal === "function") outputGate.showModal();
  else outputGate.hidden = false;
  updateRegistrationAvailability();
});

function waitFor(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isActiveHandoffRun(run) {
  return Boolean(run && !run.cancelled && run.runId === handoffRunGeneration && activeHandoffAttempt === run);
}

function cancelHandoffRun(run) {
  if (!run || run.cancelled || run.tabState === "activating") return;
  run.cancelled = true;
  if (activeHandoffAttempt === run) activeHandoffAttempt = null;
  updateHandoffActivationPolicy(run, "cancelled").catch(() => undefined);
  cleanupProvisionalHandoffTab(run).catch(() => undefined);
}

async function cleanupProvisionalHandoffTab(run) {
  if (!run || run.tabState !== "provisional" || !Number.isInteger(run.tabId) || run.tabCleanupStarted) return;
  run.tabCleanupStarted = true;
  try {
    const current = typeof chrome.tabs.get === "function" ? await chrome.tabs.get(run.tabId) : null;
    const currentUrl = current?.url;
    const pendingUrl = current?.pendingUrl;
    const isKnownProvisional = pendingUrl === "about:blank" && (currentUrl === "" || currentUrl === "about:blank");
    const isStableBlank = currentUrl === "about:blank" && (pendingUrl === undefined || pendingUrl === null);
    if (!current || (!isKnownProvisional && !isStableBlank)) return;
    await chrome.tabs.remove(run.tabId);
    run.tabState = "closed";
  } catch {
    // The tab may have been closed by the user while cancellation was settling.
  }
}

async function openHandoffTab(origin, metadata, recovery, outputAction, run) {
  if (!isActiveHandoffRun(run)) throw new Error("HANDOFF_CANCELLED");
  const launchId = createHandoffAttemptId();
  const tab = await chrome.tabs.create({ url: "about:blank", active: false });
  if (!Number.isInteger(tab?.id)) throw new Error("HANDOFF_TAB_UNAVAILABLE");
  run.tabId = tab.id;
  run.tabState = "provisional";
  if (!isActiveHandoffRun(run)) {
    await cleanupProvisionalHandoffTab(run);
    throw new Error("HANDOFF_CANCELLED");
  }
  const key = handoffStorageKey(metadata.handoffId);
  const latest = (await chrome.storage.local.get(key))?.[key];
  if (!isActiveHandoffRun(run)) {
    await cleanupProvisionalHandoffTab(run);
    throw new Error("HANDOFF_CANCELLED");
  }
  const base = latest?.handoffId === metadata.handoffId ? latest : metadata;
  run.handoffId = base.handoffId;
  if (!latest) await saveHandoffMetadata(base);
  run.launchId = launchId;
  const readyKey = handoffReadyStorageKey(base.handoffId, launchId);
  await withHandoffReadyLock(base.handoffId, async () => {
    if (!isActiveHandoffRun(run)) {
      await cleanupProvisionalHandoffTab(run);
      throw new Error("HANDOFF_CANCELLED");
    }
    await chrome.storage.local.set({ [readyKey]: {
      handoffId: base.handoffId,
      launchId,
      tabId: tab.id,
      expiresAt: base.expiresAt,
      activationPolicy: "auto",
      activationDeadlineAt: new Date(Date.now() + HANDOFF_READY_TIMEOUT_MS).toISOString(),
      pageReadyAt: null,
      activatedAt: null
    } });
    if (!isActiveHandoffRun(run)) {
      await cleanupProvisionalHandoffTab(run);
      throw new Error("HANDOFF_CANCELLED");
    }
    run.tabState = "navigating";
    try {
      await chrome.tabs.update(tab.id, {
        url: buildContinueUrl(origin, base.handoffId, base.extensionId, recovery, outputAction, launchId),
        active: false
      });
      run.tabState = "prepared";
    } catch (error) {
      run.tabState = "provisional";
      throw error;
    }
  });
  if (!isActiveHandoffRun(run)) throw new Error("HANDOFF_CANCELLED");
  return { tabId: tab.id, launchId, metadata: base };
}

async function updateHandoffActivationPolicy(attempt, policy) {
  if (!attempt || !attempt.handoffId || !attempt.launchId || !Number.isInteger(attempt.tabId) || !["cancelled", "manual"].includes(policy)) return;
  await withHandoffReadyLock(attempt.handoffId, async () => {
    if (policy === "manual" && attempt.cancelled) return;
    const key = handoffReadyStorageKey(attempt.handoffId, attempt.launchId);
    const latest = (await chrome.storage.local.get(key))?.[key];
    if (!latest || latest.handoffId !== attempt.handoffId || latest.launchId !== attempt.launchId || latest.tabId !== attempt.tabId) return;
    await chrome.storage.local.set({ [key]: { ...latest, activationPolicy: policy, activationDeadlineAt: new Date().toISOString() } });
  });
}

async function waitForPageReady(handoffId, launchId, tabId, run) {
  const key = handoffReadyStorageKey(handoffId, launchId);
  const deadline = Date.now() + HANDOFF_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!isActiveHandoffRun(run)) return null;
    const stored = (await chrome.storage.local.get(key))?.[key];
    if (stored?.handoffId === handoffId && stored.launchId === launchId && stored.tabId === tabId && Number.isFinite(Date.parse(stored.pageReadyAt || ""))) return stored;
    await waitFor(100);
  }
  return null;
}

async function activateHandoffTab(run, policy) {
  if (!isActiveHandoffRun(run)) return { activated: false, reason: "cancelled" };
  try {
    return await withHandoffReadyLock(run.handoffId, async () => {
      if (!isActiveHandoffRun(run)) return { activated: false, reason: "cancelled" };
      const key = handoffReadyStorageKey(run.handoffId, run.launchId);
      const latest = (await chrome.storage.local.get(key))?.[key];
      const deadline = Date.parse(latest?.activationDeadlineAt || "");
      const validReady = latest && latest.handoffId === run.handoffId && latest.launchId === run.launchId && latest.tabId === run.tabId && latest.activationPolicy === policy;
      const withinAutoWindow = policy !== "auto" || (Number.isFinite(Date.parse(latest?.pageReadyAt || "")) && Number.isFinite(deadline) && deadline >= Date.now());
      if (!isActiveHandoffRun(run)) return { activated: false, reason: "cancelled" };
      if (!validReady) return { activated: false, reason: "invalid" };
      if (!withinAutoWindow) {
        const expired = policy === "auto" && Number.isFinite(deadline) && deadline < Date.now();
        return { activated: false, reason: expired ? "expired" : "invalid" };
      }
      run.tabState = "activating";
      cancelOutput.disabled = true;
      startRegistration.disabled = true;
      if (startShare) startShare.disabled = true;
      if (activateHandoff) activateHandoff.disabled = true;
      gateStatus.textContent = "\u753b\u9762\u3092\u8868\u793a\u3057\u3066\u3044\u307e\u3059\u3002";
      try {
        await chrome.tabs.update(run.tabId, { active: true });
      } catch (error) {
        run.tabState = "prepared";
        throw error;
      }
      if (!isActiveHandoffRun(run)) {
        run.tabState = "prepared";
        return { activated: false, reason: "cancelled" };
      }
      const after = (await chrome.storage.local.get(key))?.[key];
      if (!after || after.handoffId !== run.handoffId || after.launchId !== run.launchId || after.tabId !== run.tabId || after.activationPolicy !== policy) {
        run.tabState = "prepared";
        return { activated: false, reason: "invalid" };
      }
      await chrome.storage.local.set({ [key]: { ...after, activatedAt: new Date().toISOString() } });
      run.tabState = "prepared";
      return { activated: true };
    });
  } catch (error) {
    if (run.tabState === "activating") run.tabState = "prepared";
    throw error;
  } finally {
    if (activeHandoffAttempt === run && run.tabState !== "activating") {
      cancelOutput.disabled = false;
      startRegistration.disabled = false;
      if (startShare) startShare.disabled = false;
      if (activateHandoff) activateHandoff.disabled = false;
    }
  }
}

async function activateReadyHandoff(run, ready) {
  if (!isActiveHandoffRun(run) || !ready || ready.handoffId !== run.handoffId || ready.launchId !== run.launchId || ready.tabId !== run.tabId) return { activated: false, reason: "invalid" };
  return activateHandoffTab(run, "auto");
}

async function startOutput(outputAction) {
  const origin = updateRegistrationAvailability();
  if (!origin || outputInFlight || activeHandoffAttempt?.tabState === "activating") return;
  outputInFlight = true;
  const previousAttempt = activeHandoffAttempt;
  cancelHandoffRun(previousAttempt);
  const run = { runId: ++handoffRunGeneration, cancelled: false, handoffId: null, launchId: null, tabId: null, tabState: "none", tabCleanupStarted: false };
  activeHandoffAttempt = run;
  pendingHandoffTabId = null;
  if (activateHandoff) activateHandoff.hidden = true;
  if (activateHandoff) activateHandoff.disabled = false;
  startRegistration.disabled = true;
  if (startShare) startShare.disabled = true;
  if (handoffProgress) handoffProgress.hidden = false;
  if (handoffProgressText) handoffProgressText.textContent = outputAction === "share" ? "共有設定の準備をしています。" : "保存先を準備しています。";
  gateStatus.textContent = "準備画面を開いています。ログインと保存先の準備が完了した後に手順書を送信します。認証情報は拡張機能へ渡しません。";
  try {
    await withHandoffDraftLock(draft.id, async () => {
      await pruneExpiredHandoffs();
      const extensionId = chrome.runtime?.id;
      const draftFingerprint = await fingerprintDraft(draft);
      const recovery = await findRecoverableHandoff(draft.id, draftFingerprint, undefined, outputAction);
      const metadata = recovery || createHandoffMetadata(draft.id, outputAction, Date.now(), extensionId, draft.updatedAt, draftFingerprint);
      if (metadata.draftFingerprint !== draftFingerprint) throw new Error("DRAFT_CHANGED");
      run.handoffId = metadata.handoffId;
      if (!isActiveHandoffRun(run)) throw new Error("HANDOFF_CANCELLED");
      const opened = await openHandoffTab(origin, metadata, recovery, outputAction, run);
      if (!isActiveHandoffRun(run)) throw new Error("HANDOFF_CANCELLED");
      const ready = await waitForPageReady(opened.metadata.handoffId, opened.launchId, opened.tabId, run);
      if (!isActiveHandoffRun(run)) throw new Error("HANDOFF_CANCELLED");
      if (ready) {
        const activation = await activateReadyHandoff(run, ready);
        if (activation.activated) {
          activeHandoffAttempt = null;
          pendingHandoffTabId = null;
          if (activateHandoff) activateHandoff.hidden = true;
          if (handoffProgress) handoffProgress.hidden = true;
          gateStatus.textContent = "保存先の準備ができました。ログインが必要な場合は、表示された画面で続けてください。";
          outputGate.close();
          return;
        }
        if (activation.reason !== "expired") throw new Error("HANDOFF_CANCELLED");
      }
      if (!isActiveHandoffRun(run)) throw new Error("HANDOFF_CANCELLED");
      await updateHandoffActivationPolicy(run, "manual");
      if (!isActiveHandoffRun(run)) throw new Error("HANDOFF_CANCELLED");
      pendingHandoffTabId = opened.tabId;
      if (activateHandoff) activateHandoff.hidden = false;
      if (handoffProgress) handoffProgress.hidden = true;
      gateStatus.textContent = "保存先の準備を確認できませんでした。ログインや接続が必要な場合があります。『ログインと接続を確認する』を押すと画面を表示できます。手順書はこの端末に残っています。";
      return;
    });
  } catch (error) {
    await cleanupProvisionalHandoffTab(run);
    if (isActiveHandoffRun(run)) {
      if (handoffProgress) handoffProgress.hidden = true;
      gateStatus.textContent = ["HANDOFF_STORAGE_UNAVAILABLE", "HANDOFF_LOCK_UNAVAILABLE"].includes(error?.message)
        ? "保存先へ進むための情報を保存できませんでした。もう一度準備してください。"
        : "保存先を開けませんでした。もう一度準備してください。";
      activeHandoffAttempt = null;
    }
  } finally {
    if (getOnboardingOrigin()) {
      startRegistration.disabled = false;
      if (startShare) startShare.disabled = false;
    }
    outputInFlight = false;
  }
}
activateHandoff?.addEventListener("click", async () => {
  const attempt = activeHandoffAttempt;
  const tabId = attempt?.tabId ?? pendingHandoffTabId;
  if (!Number.isInteger(tabId) || !attempt || attempt.cancelled || !isActiveHandoffRun(attempt)) return;
  activateHandoff.disabled = true;
  try {
    await updateHandoffActivationPolicy(attempt, "manual");
    if (!isActiveHandoffRun(attempt) || pendingHandoffTabId !== tabId) return;
    const activation = await activateHandoffTab(attempt, "manual");
    if (!activation.activated) return;
    activeHandoffAttempt = null;
    pendingHandoffTabId = null;
    activateHandoff.hidden = true;
    outputGate.close();
  } catch {
    if (isActiveHandoffRun(attempt)) {
      activeHandoffAttempt = null;
      pendingHandoffTabId = null;
      activateHandoff.hidden = true;
      gateStatus.textContent = "保存先を表示できませんでした。『ワークスペースに保存する』を押して準備し直してください。";
    }
  } finally {
    if ((activeHandoffAttempt === attempt || activeHandoffAttempt === null) && attempt.tabState !== "activating") activateHandoff.disabled = false;
  }
});
startRegistration.addEventListener("click", () => startOutput("save"));
startShare?.addEventListener("click", () => startOutput("share"));
cancelOutput?.addEventListener("click", () => {
  if (activeHandoffAttempt?.tabState === "activating") return;
  cancelHandoffRun(activeHandoffAttempt);
});
outputGate.addEventListener("cancel", (event) => {
  const attempt = activeHandoffAttempt;
  if (attempt?.tabState === "activating") {
    event.preventDefault();
    return;
  }
  cancelHandoffRun(attempt);
});
outputGate.addEventListener("close", () => {
  const attempt = activeHandoffAttempt;
  cancelHandoffRun(attempt);
});
render();
