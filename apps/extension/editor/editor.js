import { addMask, addStep, deleteStep, moveStep, removeMask, updateStepInstruction } from "./draft-model.js";
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
const startRegistration = document.querySelector("#startRegistration");
const startShare = document.querySelector("#startShare");
const activateHandoff = document.querySelector("#activateHandoff");
const gateStatus = document.querySelector("#gateStatus");
const saveState = document.querySelector("#saveState");
const handoffProgress = document.querySelector("#handoffProgress");
const handoffProgressText = document.querySelector("#handoffProgressText");
const pendingRegistrationMessage = "登録画面は現在準備中です。元の手順書はこの端末に残っています。";
const HANDOFF_READY_TIMEOUT_MS = 8_000;
let outputInFlight = false;
let pendingHandoffTabId = null;
let activeHandoffAttempt = null;
let handoffRunGeneration = 0;
let selectedStepId = draft.steps[0]?.id;

title.value = draft.title;
description.value = draft.description;

function setSaveState(label, state = "saved") {
  if (!saveState) return;
  saveState.textContent = label;
  saveState.dataset.state = state;
}

async function persist(message = "この端末に保存しました。") {
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
}

function selectedStep() {
  return draft.steps.find((step) => step.id === selectedStepId) || draft.steps[0];
}

function renderScreenshot(step) {
  const screenshot = draft.screenshots.find((item) => item.id === step?.screenshotId);
  if (!screenshot) return document.createTextNode("この手順の画像はありません。");
  const area = document.createElement("div");
  area.className = "screenshot-area";
  const preview = document.createElement("div");
  preview.className = "screenshot-preview";
  const image = document.createElement("img");
  image.src = screenshot.dataUrl;
  image.alt = "記録した画面";
  image.draggable = false;
  preview.append(image);
  for (const mask of screenshot.masks || []) {
    const overlay = document.createElement("span");
    overlay.className = "mask";
    overlay.style.cssText = `left:${mask.x * 100}%;top:${mask.y * 100}%;width:${mask.width * 100}%;height:${mask.height * 100}%`;
    preview.append(overlay);
  }
  area.append(preview);

  const hint = document.createElement("p");
  hint.textContent = "機密情報を隠すには、画像上をドラッグしてマスクを作成します。保存・共有時にもマスクが引き継がれます。";
  area.append(hint);
  let start;
  const normalizedPoint = (event, rect) => ({ x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) });
  preview.addEventListener("pointerdown", (event) => { const rect = preview.getBoundingClientRect(); start = normalizedPoint(event, rect); preview.setPointerCapture(event.pointerId); });
  preview.addEventListener("pointerup", async (event) => {
    if (!start) return;
    const rect = preview.getBoundingClientRect();
    const end = normalizedPoint(event, rect);
    const region = { x: Math.max(0, Math.min(start.x, end.x)), y: Math.max(0, Math.min(start.y, end.y)), width: Math.min(1, Math.abs(end.x - start.x)), height: Math.min(1, Math.abs(end.y - start.y)) };
    start = undefined;
    if (region.width < 0.01 || region.height < 0.01) return;
    addMask(draft, screenshot.id, region);
    await persist("マスクを追加して、この端末に保存しました。");
    render();
  });
  preview.addEventListener("pointercancel", () => { start = undefined; });

  const list = document.createElement("ul");
  list.className = "mask-list";
  for (const [index, mask] of (screenshot.masks || []).entries()) {
    const item = document.createElement("li");
    item.textContent = `マスク ${index + 1} `;
    const remove = document.createElement("button");
    remove.textContent = "マスクを削除";
    remove.addEventListener("click", async () => { removeMask(draft, screenshot.id, mask.id); await persist(); render(); });
    item.append(remove);
    list.append(item);
  }
  area.append(list);
  return area;
}

function render() {
  steps.replaceChildren();
  detail.replaceChildren();
  const current = selectedStep();
  selectedStepId = current?.id;
  for (const step of draft.steps) {
    const item = document.createElement("li");
    const select = document.createElement("button");
    select.textContent = step.instruction;
    select.setAttribute("aria-current", step.id === selectedStepId ? "step" : "false");
    select.addEventListener("click", () => { selectedStepId = step.id; render(); });
    item.append(select);
    steps.append(item);
  }
  if (!current) { detail.textContent = "記録された手順はありません。手順を追加して編集できます。"; return; }
  const label = document.createElement("label");
  label.textContent = "手順の説明";
  const instruction = document.createElement("textarea");
  instruction.value = current.instruction;
  instruction.maxLength = 500;
  instruction.addEventListener("input", async () => { updateStepInstruction(draft, current.id, instruction.value); await persist(); renderListOnly(); });
  label.append(instruction);
  detail.append(label);
  const controls = document.createElement("div");
  controls.className = "step-controls";
  for (const [text, action, disabled] of [["上へ", "up", current.order === 1], ["下へ", "down", current.order === draft.steps.length]]) {
    const button = document.createElement("button"); button.textContent = text; button.disabled = disabled;
    button.addEventListener("click", async () => { moveStep(draft, current.id, action); await persist(); render(); }); controls.append(button);
  }
  const remove = document.createElement("button"); remove.textContent = "削除"; remove.className = "danger";
  remove.addEventListener("click", async () => { deleteStep(draft, current.id); selectedStepId = draft.steps[0]?.id; await persist(); render(); }); controls.append(remove);
  detail.append(controls, renderScreenshot(current));
}

function renderListOnly() {
  const labels = steps.querySelectorAll("button");
  draft.steps.forEach((step, index) => { if (labels[index]) labels[index].textContent = step.instruction; });
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
  if (!await persist("この端末に保存しました。登録画面へ進むか、編集に戻れます。")) {
    gateStatus.textContent = "保存に失敗したため、登録画面へ進めません。編集内容を確認して再試行してください。";
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
  if (!run || run.cancelled) return;
  run.cancelled = true;
  if (activeHandoffAttempt === run) activeHandoffAttempt = null;
  updateHandoffActivationPolicy(run, "cancelled").catch(() => undefined);
}

async function openHandoffTab(origin, metadata, recovery, outputAction, run) {
  if (!isActiveHandoffRun(run)) throw new Error("HANDOFF_CANCELLED");
  const launchId = createHandoffAttemptId();
  const tab = await chrome.tabs.create({ url: "about:blank", active: false });
  if (!isActiveHandoffRun(run)) throw new Error("HANDOFF_CANCELLED");
  if (!Number.isInteger(tab?.id)) throw new Error("HANDOFF_TAB_UNAVAILABLE");
  run.tabId = tab.id;
  const key = handoffStorageKey(metadata.handoffId);
  const latest = (await chrome.storage.local.get(key))?.[key];
  if (!isActiveHandoffRun(run)) throw new Error("HANDOFF_CANCELLED");
  const base = latest?.handoffId === metadata.handoffId ? latest : metadata;
  run.handoffId = base.handoffId;
  if (!latest) await saveHandoffMetadata(base);
  run.launchId = launchId;
  const readyKey = handoffReadyStorageKey(base.handoffId, launchId);
  await withHandoffReadyLock(base.handoffId, async () => {
    if (!isActiveHandoffRun(run)) throw new Error("HANDOFF_CANCELLED");
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
    if (!isActiveHandoffRun(run)) throw new Error("HANDOFF_CANCELLED");
    await chrome.tabs.update(tab.id, {
      url: buildContinueUrl(origin, base.handoffId, base.extensionId, recovery, outputAction, launchId),
      active: false
    });
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
    if (stored?.handoffId === handoffId && stored.launchId === launchId && stored.tabId === tabId && Number.isFinite(Date.parse(stored.pageReadyAt || "")) && Number.isFinite(Date.parse(stored.activatedAt || ""))) return stored;
    await waitFor(100);
  }
  return null;
}

async function startOutput(outputAction) {
  const origin = updateRegistrationAvailability();
  if (!origin || outputInFlight) return;
  outputInFlight = true;
  const previousAttempt = activeHandoffAttempt;
  cancelHandoffRun(previousAttempt);
  const run = { runId: ++handoffRunGeneration, cancelled: false, handoffId: null, launchId: null, tabId: null };
  activeHandoffAttempt = run;
  pendingHandoffTabId = null;
  if (activateHandoff) activateHandoff.hidden = true;
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
        activeHandoffAttempt = null;
        pendingHandoffTabId = null;
        if (activateHandoff) activateHandoff.hidden = true;
        if (handoffProgress) handoffProgress.hidden = true;
        gateStatus.textContent = "登録画面の準備ができました。ログインが必要な場合は、表示された画面で続けてください。";
        outputGate.close();
        return;
      }
      await updateHandoffActivationPolicy(run, "manual");
      pendingHandoffTabId = opened.tabId;
      if (activateHandoff) activateHandoff.hidden = false;
      if (handoffProgress) handoffProgress.hidden = true;
      gateStatus.textContent = "登録画面の準備を確認できませんでした。ログインや接続が必要な場合があります。『ログイン・接続を確認する』を押すと画面を表示できます。手順書はこの端末に残っています。";
      return;
    });
  } catch (error) {
    if (isActiveHandoffRun(run)) {
      if (handoffProgress) handoffProgress.hidden = true;
      gateStatus.textContent = ["HANDOFF_STORAGE_UNAVAILABLE", "HANDOFF_LOCK_UNAVAILABLE"].includes(error?.message)
        ? "登録準備を保存できませんでした。元の手順書はこの端末に残っています。"
        : "登録画面を開けませんでした。元の手順書はこの端末に残っています。";
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
  const tabId = pendingHandoffTabId;
  if (!Number.isInteger(tabId)) return;
  activateHandoff.disabled = true;
  try {
    const attempt = activeHandoffAttempt;
    if (!attempt || attempt.cancelled) return;
    activeHandoffAttempt = null;
    await updateHandoffActivationPolicy(attempt, "manual");
    await chrome.tabs.update(tabId, { active: true });
    pendingHandoffTabId = null;
    activateHandoff.hidden = true;
    outputGate.close();
  } finally {
    activateHandoff.disabled = false;
  }
});
startRegistration.addEventListener("click", () => startOutput("save"));
startShare?.addEventListener("click", () => startOutput("share"));
outputGate.addEventListener("close", () => {
  const attempt = activeHandoffAttempt;
  cancelHandoffRun(attempt);
});
render();
