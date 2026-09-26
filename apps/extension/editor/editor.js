import { addMask, addStep, deleteStep, moveStep, removeMask, updateStepInstruction } from "./draft-model.js";
import { buildContinueUrl, createHandoffMetadata, findRecoverableHandoff, fingerprintDraft, pruneExpiredHandoffs, saveHandoffMetadata, withHandoffDraftLock } from "./handoff.js";
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
const gateStatus = document.querySelector("#gateStatus");
const pendingRegistrationMessage = "登録画面は現在準備中です。元の手順書はこの端末に残っています。";
let selectedStepId = draft.steps[0]?.id;

title.value = draft.title;
description.value = draft.description;

async function persist(message = "この端末に保存しました。") {
  draft.title = title.value;
  draft.description = description.value;
  draft.updatedAt = new Date().toISOString();
  try {
    await draftStore.put(draft);
    status.textContent = message;
    return true;
  } catch {
    status.textContent = "下書きを保存できませんでした。記録内容は送信されていません。空き容量を確認してもう一度お試しください。";
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
  hint.textContent = "画像上をドラッグすると追加のマスクを作成できます。";
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
    select.textContent = `${step.order}. ${step.instruction}`;
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
  draft.steps.forEach((step, index) => { if (labels[index]) labels[index].textContent = `${step.order}. ${step.instruction}`; });
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
async function startOutput(outputAction) {
  const origin = updateRegistrationAvailability();
  if (!origin) return;
  startRegistration.disabled = true;
  if (startShare) startShare.disabled = true;
  gateStatus.textContent = "登録画面を準備しています。手順書本文は送信しません。";
  try {
    await withHandoffDraftLock(draft.id, async () => {
      await pruneExpiredHandoffs();
      const extensionId = chrome.runtime?.id;
      const draftFingerprint = await fingerprintDraft(draft);
      const recovery = await findRecoverableHandoff(draft.id, draftFingerprint, undefined, outputAction);
      if (recovery) {
        await chrome.tabs.create({ url: buildContinueUrl(origin, recovery.handoffId, extensionId, recovery, outputAction) });
        gateStatus.textContent = recovery.claimIntentId
          ? "未確定の保存操作を再開する登録画面を開きました。元の手順書はこの端末に残っています。"
          : "登録画面を開きました。元の手順書はこの端末に残っています。";
        outputGate.close();
        return;
      }
      const metadata = createHandoffMetadata(draft.id, outputAction, Date.now(), extensionId, draft.updatedAt, draftFingerprint);
      await saveHandoffMetadata(metadata);
      await chrome.tabs.create({ url: buildContinueUrl(origin, metadata.handoffId, extensionId, null, outputAction) });
      gateStatus.textContent = "登録画面を開きました。元の手順書はこの端末に残っています。";
      outputGate.close();
    });
  } catch (error) {
    gateStatus.textContent = ["HANDOFF_STORAGE_UNAVAILABLE", "HANDOFF_LOCK_UNAVAILABLE"].includes(error?.message)
      ? "登録準備を保存できませんでした。元の手順書はこの端末に残っています。"
      : "登録画面を開けませんでした。元の手順書はこの端末に残っています。";
  } finally {
    if (getOnboardingOrigin()) {
      startRegistration.disabled = false;
      if (startShare) startShare.disabled = false;
    }
  }
}
startRegistration.addEventListener("click", () => startOutput("save"));
startShare?.addEventListener("click", () => startOutput("share"));
render();
