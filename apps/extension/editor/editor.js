import { addStep, deleteStep, moveStep, updateStepInstruction } from "./draft-model.js";
import { createImageEditor } from "./image-editor.js";
import { drawScreenshot } from "./image-renderer.js";
import { createSyntheticPerson, syntheticPersonForReplacementAnnotations } from "./personal-info-replacement.js";
import { normalizeUploadedImage, assertImageCapacity, assertImageDimensions, dataUrlBytes, MAX_IMAGE_BYTES, ACCEPTED_IMAGE_TYPES } from "./image-import.js";
import { buildContinueUrl, canonicalDraftJson, createHandoffAttemptId, createHandoffMetadata, findRecoverableHandoff, fingerprintDraft, handoffReadyStorageKey, handoffStorageKey, pruneExpiredHandoffs, resumeCompletedOfficeStartup, saveHandoffMetadata, validOfficeFormat, withHandoffDraftLock, withHandoffReadyLock } from "./handoff.js";
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
document.querySelectorAll(".privacy-note").forEach((node) => {
  node.textContent = "撮影時は画像を加工せず端末に保持し、操作文へ入力値を保存しません。必要な置換・黒塗りは画像編集で明示的に適用し、クラウド保存・共有の前に画像と操作文を確認してください。";
});
const cancelOutput = document.querySelector("#cancelOutput");
const startRegistration = document.querySelector("#startRegistration");
const startShare = document.querySelector("#startShare");
const activateHandoff = document.querySelector("#activateHandoff");
const gateStatus = document.querySelector("#gateStatus");
const exportWord = document.querySelector("#exportWord");
const exportPowerPoint = document.querySelector("#exportPowerPoint");
const officeExportStatus = document.querySelector("#officeExportStatus");
const saveState = document.querySelector("#saveState");
const cloudSaveState = document.querySelector("#cloudSaveState");
let cloudStateVersion = 0;
const cloudReferenceKey = "meccha-manual:cloud-ref:" + id;
const officeIntentKey = "meccha-manual:office-intent:" + id;
const handoffProgress = document.querySelector("#handoffProgress");
const handoffProgressText = document.querySelector("#handoffProgressText");
const pendingRegistrationMessage = "保存先を準備できません。時間をおいてもう一度お試しください。手順書はこの端末に残っています。";
const HANDOFF_READY_TIMEOUT_MS = 8_000;
let outputInFlight = false;
let pendingHandoffTabId = null;
let activeHandoffAttempt = null;
let handoffRunGeneration = 0;
let selectedStepId = draft.editorState?.selectedStepId || draft.steps[0]?.id;
let previewZoom = Math.max(1, Math.min(3, Number(draft.editorState?.zoom) || 1));
const pendingImages = new Map();
const displayFailures = new Set();
const editorViewStates = new Map();
const uploadFailures = new Map();
const shownReplacements = new Set();
// Keep the generated name/kana pair stable for this image while the editor is
// reopened. The pair is ephemeral UI state; original values are never read or
// persisted.
const replacementPeople = new Map();
const undoStack = [];
const redoStack = [];
let outputIntent = "save";
let outputOfficeFormat = null;
let pendingOfficeResume = null;
let officeResumePromise = null;
let outputGateGeneration = 0;
let outputPreflight = false;
let officeExportInFlight = false;
let historyGroup = null;
let localWriteFailed = false;
let panelTrigger = null;
const workSurface = document.querySelector("#workSurface");
const contextTools = document.querySelector("#contextTools");
const imageDialog = document.querySelector("#imageEditorDialog");

// History contains only the editable, already-captured draft. Capture events,
// source URLs, DOM values and original/replacement correspondence never enter it.
function snapshot() {
  return structuredClone({ title: draft.title, description: draft.description,
    steps: draft.steps.map(({ id, order, instruction, screenshotId, imageState, privacyReview }) => ({ id, order, instruction, ...(screenshotId ? { screenshotId } : {}), ...(imageState ? { imageState } : {}), ...(privacyReview ? { privacyReview } : {}) })),
    screenshots: draft.screenshots.map(({ id, dataUrl, annotations, masks, privacyReview }) => ({ id, dataUrl, ...(annotations ? { annotations } : {}), masks: masks || [], ...(privacyReview ? { privacyReview } : {}) })), branding: draft.branding,
    selectedStepId, zoom: previewZoom });
}
function remember(group = null) {
  if (!group || historyGroup !== group) {
    undoStack.push(snapshot());
    if (undoStack.length > 40) undoStack.shift();
  }
  historyGroup = group;
  redoStack.length = 0;
  updateHistoryButtons();
}
function updateHistoryButtons() {
  document.querySelector("#undo").disabled = !undoStack.length || pendingImages.size > 0;
  document.querySelector("#redo").disabled = !redoStack.length || pendingImages.size > 0;
}
async function restoreHistory(source, destination) {
  if (!source.length || pendingImages.size || imageDialog.open) return;
  destination.push(snapshot());
  const saved = source.pop();
  Object.assign(draft, { title: saved.title, description: saved.description, steps: saved.steps, screenshots: saved.screenshots, branding: saved.branding });
  selectedStepId = saved.selectedStepId; previewZoom = saved.zoom;
  title.value = draft.title; description.value = draft.description;
  historyGroup = null; displayFailures.clear(); uploadFailures.clear();
  applyBranding(); render(); await persist("操作を取り消して、この端末に保存しました。");
  detail.querySelector("textarea")?.focus({ preventScroll: true });
}
function imageStatus(step) {
  if (pendingImages.has(step.id)) return "queued";
  if (displayFailures.has(step.id) || uploadFailures.has(step.id)) return "failed";
  if (step.imageState?.status === "none") return "none";
  if (step.privacyReview?.reviewRequired || screenshotFor(step)?.privacyReview?.reviewRequired) return "protected";
  return step.imageState?.status || (screenshotFor(step) ? "ready" : "unavailable");
}
function replacementRegions(step) {
  const metadata = screenshotFor(step)?.privacyReview || step?.privacyReview;
  return (Array.isArray(metadata?.replacements) ? metadata.replacements : []).slice(0, 64).filter((region) => region && typeof region.id === "string" && typeof region.text === "string" && Array.from(region.text).length <= 160 && [region.x, region.y, region.width, region.height].every((value) => typeof value === "number" && Number.isFinite(value)) && region.x >= 0 && region.y >= 0 && region.width > 0 && region.height > 0 && region.x + region.width <= 1 && region.y + region.height <= 1);
}
function imageLabel(step) {
  if(editorViewStates.get(step.id)==="error")return "画像編集を読み込めませんでした";
  if(editorViewStates.get(step.id)==="loading")return "画像編集を準備しています";
  const state = imageStatus(step);
  if (["queued", "capturing"].includes(state)) return "画像を準備しています";
  if (state === "none") return "説明のみの手順";
  if (state === "protected") return "画像の確認が必要です";
  if (state === "failed") return displayFailures.has(step.id) ? "保存済みの画像を読み込めませんでした" : "画像を準備できませんでした";
  if (state === "unavailable" || !screenshotFor(step)) return "この操作の画像を取得できませんでした";
  const review = screenshotFor(step)?.privacyReview || step.privacyReview;
  return review?.replacementCount ? `架空データに置換済み ${review.replacementCount}か所` : "画像の準備ができました";
}
function unresolvedSteps() { return draft.steps.filter((step) => !["ready", "none"].includes(imageStatus(step)) || (imageStatus(step) === "ready" && !screenshotFor(step))); }
function setImageState(step, state, reason = null) {
  step.imageState = { status: state, reason, attempts: step.imageState?.attempts || 0, version: (step.imageState?.version || 0) + 1 };
}
function updateImageSummary() {
  const unresolved = unresolvedSteps();
  const pending = draft.steps.filter((step) => ["queued", "capturing"].includes(imageStatus(step))).length;
  document.querySelector("#reviewCount").textContent = pending ? `画像を準備中 ${draft.steps.length - pending}/${draft.steps.length}` : unresolved.length ? `要確認 ${unresolved.length}件` : "";
  document.querySelector("#stepCount").textContent = draft.steps.length;
  updateHistoryButtons();
  if (outputGate.open) renderOutputSummary();
}
function button(text, action, className = "secondary") {
  const node = document.createElement("button"); node.type = "button"; node.textContent = text; node.className = className; node.addEventListener("click", action); return node;
}
function closePanels() {
  document.querySelectorAll("[data-panel-open]").forEach((panel) => delete panel.dataset.panelOpen);
  document.querySelector("#panelBackdrop").hidden = true;
  document.querySelectorAll(".mobile-actions [aria-expanded]").forEach((node) => node.setAttribute("aria-expanded", "false"));
  panelTrigger?.focus({ preventScroll: true }); panelTrigger = null;
}
function openPanel(name, trigger) {
  closePanels(); panelTrigger = trigger;
  const panel = name === "navigation" ? document.querySelector("#stepNavigation") : contextTools;
  panel.dataset.panelOpen = "true"; trigger?.setAttribute("aria-expanded", "true");
  document.querySelector("#panelBackdrop").hidden = false;
  panel.querySelector("button")?.focus({ preventScroll: true });
}

const previewGenerations = new WeakMap();
function invalidatePreview(canvas) {
  previewGenerations.set(canvas, (previewGenerations.get(canvas) || 0) + 1);
  // Keep the wrapper's reserved ratio while releasing the backing store for
  // previews that are far from the viewport. The image is decoded and drawn
  // again when the observer brings this canvas back near the viewport.
  canvas.width = 1;
  canvas.height = 1;
  canvas.style.visibility = "hidden";
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

let persistQueue = Promise.resolve();

title.value = draft.title;
description.value = draft.description;

async function refreshCloudReference(reference) {
  if (!reference && chrome.storage?.local?.get) {
    const values = await chrome.storage.local.get(cloudReferenceKey);
    reference = values?.[cloudReferenceKey];
  }
  if (reference && typeof reference.manualId === "string" && typeof reference.workspaceId === "string"
    && typeof reference.revisionId === "string" && typeof reference.updatedAt === "string") {
    if (!draft.cloudRef?.updatedAt || Date.parse(reference.updatedAt) >= Date.parse(draft.cloudRef.updatedAt)) draft.cloudRef = structuredClone(reference);
  }
  document.querySelector("#save").textContent = draft.cloudRef ? "クラウドへ更新" : "クラウドに保存";
  const version = ++cloudStateVersion;
  if (!cloudSaveState) return;
  if (!draft.cloudRef) { cloudSaveState.textContent = "クラウド未保存"; return; }
  const saved = draft.cloudRef.savedFingerprint === await fingerprintDraft(draft);
  if (version !== cloudStateVersion) return;
  cloudSaveState.textContent = saved ? "クラウドに保存済み" : "クラウド未反映の変更あり";
}

async function saveOfficeIntent(intent) {
  if (!chrome.storage?.local?.set) throw new Error("OFFICE_INTENT_STORAGE_UNAVAILABLE");
  await chrome.storage.local.set({ [officeIntentKey]: intent });
  pendingOfficeResume = intent;
}

async function readOfficeIntent() {
  if (!chrome.storage?.local?.get) return null;
  const value = (await chrome.storage.local.get(officeIntentKey))?.[officeIntentKey];
  if (!value || value.draftId !== id || !validOfficeFormat(value.officeFormat) || typeof value.handoffId !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value.handoffId) || !/^[a-f0-9]{64}$/.test(value.draftFingerprint || "") || !Number.isFinite(Date.parse(value.expiresAt || ""))) return null;
  if (Date.parse(value.expiresAt) <= Date.now()) { await chrome.storage.local.remove(officeIntentKey); return null; }
  pendingOfficeResume = value;
  return value;
}

async function clearOfficeIntent() {
  pendingOfficeResume = null;
  if (chrome.storage?.local?.remove) await chrome.storage.local.remove(officeIntentKey);
}

async function consumeOfficeReturnReceipt(metadata, intent) {
  if (!metadata?.officeReturnReceipt || !intent || typeof chrome.runtime?.sendMessage !== "function") return null;
  const reply = await chrome.runtime.sendMessage({
    schema: "meccha-manual/cloud-claim-v1",
    type: "handoff.office-return-consume",
    handoffId: intent.handoffId,
    launchId: metadata.officeReturnReceipt.launchId,
    officeFormat: intent.officeFormat,
    draftFingerprint: intent.draftFingerprint
  });
  return reply?.ok && reply.value?.ok ? reply.value : null;
}

async function resumeOfficeAfterClaim(metadata) {
  if (officeResumePromise || !pendingOfficeResume || metadata?.outputAction !== "office" || metadata.officeFormat !== pendingOfficeResume.officeFormat || metadata.handoffId !== pendingOfficeResume.handoffId || metadata.status !== "completed" || metadata.draftFingerprint !== pendingOfficeResume.draftFingerprint) return;
  const resumeWithLock = () => withHandoffDraftLock(draft.id, async () => {
    // Re-read and consume the intent while holding the shared draft lock. Two
    // editor tabs can observe the same completed handoff; only one may start
    // the download.
    const intent = await readOfficeIntent();
    if (!intent || intent.handoffId !== metadata.handoffId || intent.officeFormat !== metadata.officeFormat || intent.draftFingerprint !== metadata.draftFingerprint) return;
    if (Date.parse(metadata.expiresAt || "") <= Date.now() || await fingerprintDraft(draft) !== intent.draftFingerprint) {
      setOfficeExportStatus("認証後に手順書が変更されたため、Office出力を中止しました。最新の内容で再試行してください。", "warning");
      await clearOfficeIntent();
      return;
    }
    const format = intent.officeFormat;
    await clearOfficeIntent();
    setOfficeExportStatus("認証と保存先の確認が完了しました。Officeファイルを作成しています。", "saving");
    await exportOffice(format, null);
  });
  const resume = metadata.officeReturnReceipt ? (async () => {
    const intent = await readOfficeIntent();
    if (!intent || intent.handoffId !== metadata.handoffId || intent.officeFormat !== metadata.officeFormat || intent.draftFingerprint !== metadata.draftFingerprint) return;
    const consumed = await consumeOfficeReturnReceipt(metadata, intent);
    if (!consumed) return;
    return resumeWithLock();
  })() : resumeWithLock();
  officeResumePromise = Promise.resolve(resume).catch(() => {
    setOfficeExportStatus("認証後のOfficeファイル作成に失敗しました。もう一度Office出力を選んでください。", "error");
  }).finally(() => { officeResumePromise = null; });
  await officeResumePromise;
}

chrome.storage?.onChanged?.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[cloudReferenceKey]?.newValue) void refreshCloudReference(changes[cloudReferenceKey].newValue);
  const handoffChanges = Object.entries(changes).filter(([key]) => key.startsWith("meccha-manual:handoff:") && !key.startsWith("meccha-manual:handoff-ready:"));
  for (const [, change] of handoffChanges) if (change.newValue) void resumeOfficeAfterClaim(change.newValue);
});

function setSaveState(label, state = "saved") {
  if (!saveState) return;
  saveState.textContent = label;
  saveState.dataset.state = state;
  if (state === "saving") status.textContent = "変更をこの端末に保存しています…";
  else if (state === "saved" && status.textContent === "変更をこの端末に保存しています…") status.textContent = "この端末への保存が完了しました。";
}

function enqueuePersist(operation) {
  const next = persistQueue.then(operation, operation);
  persistQueue = next.catch(() => undefined);
  return next;
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeChangedValue(base, candidate, current) {
  if (sameValue(candidate, base)) return structuredClone(current);
  if (sameValue(current, base)) return structuredClone(candidate);
  if (Array.isArray(base) && Array.isArray(candidate) && Array.isArray(current)) {
    return mergeChangedEntities(base, candidate, current);
  }
  if (base && candidate && current && typeof base === "object" && typeof candidate === "object" && typeof current === "object"
    && !Array.isArray(base) && !Array.isArray(candidate) && !Array.isArray(current)) {
    const merged = structuredClone(current);
    const keys = new Set([...Object.keys(base), ...Object.keys(candidate)]);
    for (const key of keys) {
      if (!(key in candidate)) {
        if (sameValue(current[key], base[key])) delete merged[key];
        continue;
      }
      if (!(key in base)) {
        if (!(key in current)) merged[key] = structuredClone(candidate[key]);
        continue;
      }
      merged[key] = mergeChangedValue(base[key], candidate[key], current[key]);
    }
    return merged;
  }
  // When both sides changed the same scalar, the edit already visible to the
  // user wins. The candidate is still applied to fields that the user did not
  // touch while its write was pending.
  return structuredClone(current);
}

function mergeChangedEntities(base = [], candidate = [], current = []) {
  const hasIds = [...base, ...candidate, ...current].every((value) => value && typeof value === "object" && value.id);
  if (!hasIds) return sameValue(current, base) ? structuredClone(candidate) : structuredClone(current);
  const baseById = new Map(base.map((value) => [value.id, value]));
  const candidateById = new Map(candidate.map((value) => [value.id, value]));
  const currentById = new Map(current.map((value) => [value.id, value]));
  const merged = current.map((value) => {
    const next = candidateById.get(value.id);
    const original = baseById.get(value.id);
    return next && original ? mergeChangedValue(original, next, value) : structuredClone(value);
  });
  // A newly added candidate entity is valid only when the current draft still
  // contains its relationship. The caller removes unreferenced screenshots;
  // retain all other additions here so concurrent edits are never discarded.
  for (const value of candidate) if (!baseById.has(value.id) && !currentById.has(value.id)) merged.push(structuredClone(value));
  // Apply a candidate deletion only when the user has not changed that entity
  // since the candidate snapshot. This preserves a concurrent step edit.
  for (const value of base) if (!candidateById.has(value.id) && currentById.has(value.id) && sameValue(currentById.get(value.id), value)) {
    const index = merged.findIndex((entry) => entry.id === value.id);
    if (index >= 0) merged.splice(index, 1);
  }
  // Reordering is a meaningful current edit. Use the candidate's order only
  // when the current order still matches the base order exactly.
  if (sameValue(current.map((value) => value.id), base.map((value) => value.id))) {
    const byId = new Map(merged.map((value) => [value.id, value]));
    return candidate.map((value) => byId.get(value.id)).filter(Boolean);
  }
  return merged;
}

function mergePendingCandidate(base, candidate, current) {
  const merged = structuredClone(current);
  merged.title = title.value;
  merged.description = description.value;
  merged.steps = mergeChangedEntities(base.steps || [], candidate.steps || [], current.steps || []);
  merged.screenshots = mergeChangedEntities(base.screenshots || [], candidate.screenshots || [], current.screenshots || []);
  const candidateScreenshotIds = new Set((candidate.screenshots || []).map((value) => value.id));
  const baseScreenshotIds = new Set((base.screenshots || []).map((value) => value.id));
  const currentStepScreenshotIds = new Set(merged.steps.map((step) => step.screenshotId).filter(Boolean));
  // Uploading to a step that was deleted or retargeted while IDB was pending
  // must not leave a new unreferenced image behind.
  merged.screenshots = merged.screenshots.filter((image) => baseScreenshotIds.has(image.id)
    || !candidateScreenshotIds.has(image.id)
    || currentStepScreenshotIds.has(image.id));
  merged.updatedAt = new Date().toISOString();
  return merged;
}

function persist(message = "この端末に保存しました。") {
  return enqueuePersist(async () => {
    draft.title = title.value;
    draft.description = description.value;
    draft.editorState = { selectedStepId, zoom: previewZoom };
    draft.updatedAt = new Date().toISOString();
    setSaveState("端末に保存中…", "saving");
    try {
      await refreshCloudReference();
      await draftStore.put(draft);
      status.textContent = message;
      localWriteFailed = false; document.querySelector("#retrySave").hidden = true; setSaveState(pendingImages.size ? "画像を保存中…" : "端末に保存済み", pendingImages.size ? "saving" : "saved");
      return true;
    } catch {
      status.textContent = "下書きを保存できませんでした。記録内容は送信されていません。空き容量を確認するか、もう一度お試しください。";
      localWriteFailed = true; document.querySelector("#retrySave").hidden = false; setSaveState("端末に保存できません", "error");
      return false;
    }
  });
}

function persistCandidate(candidate, message = "この端末に保存しました。") {
  return enqueuePersist(async () => {
    const draftBeforePersist = structuredClone(draft);
    candidate = typeof candidate === "function" ? candidate() : candidate;
    candidate.title = title.value;
    candidate.description = description.value;
    candidate.editorState = { selectedStepId, zoom: previewZoom };
    candidate.updatedAt = new Date().toISOString();
    setSaveState("端末に保存中…", "saving");
    try {
      await draftStore.put(candidate);
      // A write may stay pending while the user edits another field. Merge
      // only the candidate's changed fields into the current draft so image
      // edits survive without replacing newer text, step, or ordering edits.
      const hasPendingEdits = JSON.stringify(draft) !== JSON.stringify(draftBeforePersist)
        || title.value !== candidate.title
        || description.value !== candidate.description;
      const merged = hasPendingEdits ? mergePendingCandidate(draftBeforePersist, candidate, draft) : candidate;
      Object.assign(draft, merged);
      status.textContent = message;
      localWriteFailed = false; document.querySelector("#retrySave").hidden = true; setSaveState(pendingImages.size ? "画像を保存中…" : "端末に保存済み", pendingImages.size ? "saving" : "saved");
      return { ok: true, candidate: merged, hasPendingEdits };
    }
    catch { status.textContent = "下書きを保存できませんでした。編集内容は保持されています。空き容量を確認するか、もう一度お試しください。"; localWriteFailed = true; document.querySelector("#retrySave").hidden = false; setSaveState("端末に保存できません", "error"); return { ok: false }; }
  });
}

function removeUnreferencedImages() {
  const referenced = new Set(draft.steps.map((step) => step.screenshotId).filter(Boolean));
  draft.screenshots = draft.screenshots.filter((image) => referenced.has(image.id));
}
function screenshotFor(step) { return draft.screenshots.find((item) => item.id === step?.screenshotId); }

function imageUploadError(error, replacing = false) {
  if (error?.message === "IMAGE_TYPE_UNSUPPORTED") return "PNG、JPEG、WebPの画像を選んでください。";
  if (error?.message === "IMAGE_INPUT_TOO_LARGE") return "画像が10MBを超えています。10MB以下の画像を選んでください。";
  if (error?.message === "IMAGE_OUTPUT_TOO_LARGE") return "画像を変換した結果、10MBを超えました。解像度を下げるか、別の画像を選んでください。";
  if (error?.message === "IMAGE_PIXELS_TOO_LARGE") return "画像の解像度が高すぎます。縦横12,000px以下、合計4,000万画素以内の画像を選んでください。";
  if (error?.message === "IMAGE_TOTAL_TOO_LARGE") return "画像の合計サイズが大きすぎます。画像を減らすか、小さい画像を選んでください。";
  if (error?.message === "IMAGE_COUNT_LIMIT") return "画像は100件まで追加できます。";
  if (error?.message === "IMAGE_DECODE_TIMEOUT") return "画像の読み込みに時間がかかっています。別の画像を選ぶか、もう一度お試しください。";
  if (error?.message === "IMAGE_DIMENSIONS_INVALID") return "画像の大きさを確認できませんでした。別の画像を選んでください。";
  return replacing ? "画像を差し替えられませんでした。元の内容は変更されていません。もう一度お試しください。" : "画像を追加できませんでした。元の内容は変更されていません。もう一度お試しください。";
}

async function drawPreview(canvas, screenshot) {
  const generation = (previewGenerations.get(canvas) || 0) + 1;
  previewGenerations.set(canvas, generation);
  try {
    const image = new Image(); image.src = screenshot.dataUrl; await image.decode();
    if (previewGenerations.get(canvas) !== generation || !canvas.isConnected) return;
    const context = canvas.getContext("2d"); drawScreenshot(context, image, screenshot);
    const step = draft.steps.find((entry) => entry.id === canvas.dataset.stepId);
    if (step && shownReplacements.has(step.id)) {
      context.save(); context.strokeStyle = "#1768c4"; context.lineWidth = Math.max(2, image.width / 500); context.setLineDash([8, 5]);
      for (const region of replacementRegions(step)) context.strokeRect(region.x * image.width, region.y * image.height, region.width * image.width, region.height * image.height);
      context.restore();
    }
    canvas.style.visibility = "visible"; canvas.dataset.previewRendered = "true";
    canvas.setAttribute("aria-label", "記録した画面。クリックして画像を調整");
  } catch {
    if (previewGenerations.get(canvas) !== generation || !canvas.isConnected) return;
    const step = draft.steps.find((entry) => entry.id === canvas.dataset.stepId);
    if (!step) return;
    displayFailures.add(step.id); previewObserver.unobserve(canvas);
    renderStepArticle(step); renderListOnly();
  }
}

async function openImageEditor(step, initialTool = "select") {
  const screenshot = screenshotFor(step);
  if (!screenshot || pendingImages.has(step.id) || displayFailures.has(step.id)) return;
  closePanels(); activeImageEditor?.dispose();
  const editorBitmap = { id: screenshot.id, dataUrl: screenshot.dataUrl };
  const syntheticPerson = replacementPeople.get(screenshot.id) || syntheticPersonForReplacementAnnotations(screenshot.annotations, createSyntheticPerson());
  replacementPeople.set(screenshot.id, syntheticPerson);
  const editor = createImageEditor({ dialog: imageDialog, canvas: document.querySelector("#imageEditorCanvas"), screenshot,
    inline: true, initialTool, syntheticPerson,
    onStateChange: (state) => { for(const id of ["save","share","mobileShare","exportWord","exportPowerPoint"]){const action=document.getElementById(id);if(action){action.disabled=state!=="closed";action.title=state!=="closed"?"画像の変更を適用してから保存・共有・Office出力へ進めます":"";}} if(state==="closed")editorViewStates.delete(step.id);else editorViewStates.set(step.id,state);renderListOnly(); },
    onSave: async (next) => {
      const currentStep = draft.steps.find((entry) => entry.id === step.id);
      const currentScreenshot = screenshotFor(currentStep);
      if (!currentStep || !currentScreenshot || currentScreenshot.id !== editorBitmap.id || currentScreenshot.dataUrl !== editorBitmap.dataUrl) return false;
      const before = snapshot();
      const result = await persistCandidate(() => {
        const candidate = structuredClone(draft);
        const candidateScreenshot = candidate.screenshots.find((item) => item.id === editorBitmap.id);
        if (!candidateScreenshot || candidateScreenshot.dataUrl !== editorBitmap.dataUrl) throw new Error("IMAGE_EDITOR_STALE");
        candidateScreenshot.annotations = next.annotations; candidateScreenshot.masks = next.masks;
        if (next.dataUrl) { if (dataUrlBytes(next.dataUrl) > MAX_IMAGE_BYTES) throw new RangeError("IMAGE_OUTPUT_TOO_LARGE"); assertImageCapacity(candidate, next.dataUrl, candidateScreenshot.id); candidateScreenshot.dataUrl = next.dataUrl; if (next.privacyReview) { candidateScreenshot.privacyReview = next.privacyReview; candidate.steps.filter((entry) => entry.screenshotId === candidateScreenshot.id && entry.privacyReview).forEach((entry) => { entry.privacyReview = next.privacyReview; }); } }
        return candidate;
      }, "画像を更新して、この端末に保存しました。");
      if (!result.ok) return false;
      undoStack.push(before); redoStack.length = 0; historyGroup = null;
      renderStepArticle(currentStep); updateContextTools(currentStep); updateHistoryButtons();
      return detail.querySelector(".image-edit-button");
    }, onClose: () => { workSurface.hidden = false; contextTools.hidden = false; }
  });
  editor.screenshotId = editorBitmap.id; editor.stepId = step.id; activeImageEditor = editor;
  workSurface.hidden = true; contextTools.hidden = true;
  await editor.open();
}

function renderScreenshot(step) {
  const screenshot = screenshotFor(step);
  const state = imageStatus(step);
  const area = document.createElement("div"); area.className = "screenshot-area";
  const visibleImage = screenshot && !displayFailures.has(step.id) && state !== "none";
  if (visibleImage) {
    const preview = document.createElement("div"); preview.className = "screenshot-preview";
    preview.dataset.zoomed = String(previewZoom > 1); preview.style.setProperty("--preview-zoom", `${previewZoom * 100}%`);
    const canvas = document.createElement("canvas"); canvas.className = "screenshot-canvas"; canvas.tabIndex = 0; canvas.dataset.stepId = step.id;
    canvas.addEventListener("click", () => openImageEditor(step));
    canvas.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); openImageEditor(step); } });
    preview.append(canvas); area.append(preview);
    canvas.__screenshot = screenshot; previewObserver.observe(canvas);
  } else {
    const placeholder = document.createElement("div"); placeholder.className = "image-state-placeholder"; placeholder.dataset.state = state;
    const heading = document.createElement("strong"); heading.textContent = imageLabel(step);
    const explanation = document.createElement("p"); explanation.textContent = ["queued", "capturing"].includes(state) ? "説明の編集や、ほかの手順への移動を続けられます。" : state === "none" ? "この手順は、操作の説明だけで伝えます。" : "画像を追加するか、説明だけの手順に変更できます。";
    placeholder.append(heading, explanation);
    const recovery = document.createElement("div"); recovery.className = "image-state-actions";
    if (!["queued", "capturing"].includes(state)) {
      recovery.append(button("画像を追加", () => detail.querySelector("input[type=file]")?.click()));
      if (state !== "none") recovery.append(button("説明だけの手順にする", () => makeTextOnly(step)));
      if (displayFailures.has(step.id)) recovery.prepend(button("もう一度読み込む", () => { displayFailures.delete(step.id); renderStepArticle(step); renderListOnly(); }));
    }
    placeholder.append(recovery); area.append(placeholder);
  }
  const actionRow = document.createElement("div"); actionRow.className = "image-action-row";
  const badge = document.createElement("span"); badge.className = "image-status"; badge.dataset.state = state === "protected" ? "review" : state; badge.textContent = imageLabel(step); actionRow.append(badge);
  if (visibleImage) {
    const edit = button("画像を編集", () => openImageEditor(step), "image-edit-button secondary"); edit.dataset.editorTrigger = screenshot.id; edit.disabled = pendingImages.has(step.id); actionRow.append(edit);
    const zoom = document.createElement("div"); zoom.className = "zoom-controls";
    const label = document.createElement("span"); label.textContent = `${Math.round(previewZoom * 100)}%`;
    const updateZoom = (next) => { previewZoom = Math.max(1, Math.min(3, next)); draft.editorState = { selectedStepId, zoom: previewZoom }; const preview = area.querySelector(".screenshot-preview"); preview.dataset.zoomed = String(previewZoom > 1); preview.style.setProperty("--preview-zoom", `${previewZoom * 100}%`); label.textContent = `${Math.round(previewZoom * 100)}%`; persist(); };
    const minus = button("−", () => updateZoom(previewZoom - .25)); minus.setAttribute("aria-label", "表示を縮小");
    const plus = button("＋", () => updateZoom(previewZoom + .25)); plus.setAttribute("aria-label", "表示を拡大");
    zoom.append(label, minus, plus, button("全体表示", () => updateZoom(1))); actionRow.append(zoom);
  }
  area.append(actionRow);
  if (["protected", "failed"].includes(state) && visibleImage) {
    const recovery = document.createElement("div"); recovery.className = "image-state-actions";
    const privacy = screenshot.privacyReview || step.privacyReview;
    // Unsupported protected surfaces need a replacement or an explicit text-only
    // choice. A generic acknowledgement cannot turn those pixels into success.
    if (privacy?.reasonCodes?.includes("manual_image_review") || uploadFailures.has(step.id)) recovery.append(button(uploadFailures.has(step.id) ? "元の画像を使う" : "画像に公開できない情報がないことを確認", () => confirmImage(step)));
    recovery.append(button("安全な画像へ差し替える", () => detail.querySelector("input[type=file]")?.click()), button("説明だけの手順にする", () => makeTextOnly(step)));
    area.append(recovery);
  }
  const uploadPanel = createUploadPanel(step, screenshot);
  // The input remains in the selected article for accessible file selection;
  // the replacement controls are progressively disclosed below the caption.
  const uploadDetails = document.createElement("details"); uploadDetails.className = "advanced-actions image-file-actions";
  const summary = document.createElement("summary"); summary.textContent = screenshot ? "画像を差し替える" : "画像を追加する";
  uploadDetails.append(summary, uploadPanel); uploadDetails.open = uploadFailures.has(step.id); area.append(uploadDetails);
  return area;
}

function createUploadPanel(step, screenshot) {
  const panel = document.createElement("div"); panel.className = screenshot ? "image-upload-panel image-replace" : "image-upload-panel";
  const hint = document.createElement("span"); hint.textContent = screenshot ? "この画像の注釈と追加の保護設定は引き継がれません。適用後は取り消せます。PNG・JPEG・WebP、10MB以下。" : "PNG・JPEG・WebP、10MB以下。追加後に画像の内容を確認してください。";
  const uploadButton = button(screenshot ? "画像を選び直す" : "画像を選ぶ", () => fileInput.click());
  const fileInput = document.createElement("input"); fileInput.type = "file"; fileInput.accept = [...ACCEPTED_IMAGE_TYPES].join(","); fileInput.tabIndex = -1; fileInput.setAttribute("aria-hidden", "true");
  const message = document.createElement("p"); message.className = "image-upload-message"; message.hidden = true; message.setAttribute("role", "status");
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0]; if (!file || pendingImages.has(step.id)) return;
    const before = snapshot(); const priorState = structuredClone(step.imageState);
    const version = (step.imageState?.version || 0) + 1;
    step.imageState = { status: "queued", reason: null, attempts: (step.imageState?.attempts || 0) + 1, version };
    uploadButton.disabled = true; message.hidden = false; message.dataset.state = "pending"; message.textContent = "画像を確認して端末に保存しています…";
    let resolvePending;
    const pending = new Promise((resolve) => { resolvePending = resolve; });
    // Register before the first asynchronous file read, not just before IDB.
    pendingImages.set(step.id, { promise: pending, version });
    renderListOnly(); updateImageSummary();
    const stillCurrent = () => draft.steps.find((entry) => entry.id === step.id)?.imageState?.version === version;
    (async () => {
      let timer; let succeeded = false; let shouldRestoreFocus = false;
      try {
        const normalized = await Promise.race([normalizeUploadedImage(file), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("IMAGE_DECODE_TIMEOUT")), 30_000); })]);
        clearTimeout(timer);
        if (!stillCurrent()) return;
        const result = await persistCandidate(() => {
          const candidate = structuredClone(draft); const targetStep = candidate.steps.find((item) => item.id === step.id);
          if (!targetStep || targetStep.imageState?.version !== version) throw new Error("IMAGE_UPLOAD_STALE");
          const target = candidate.screenshots.find((item) => item.id === targetStep.screenshotId);
          const shared = target && candidate.steps.some((entry) => entry.id !== step.id && entry.screenshotId === target.id);
          assertImageCapacity(candidate, normalized.dataUrl, target && !shared ? target.id : null);
          const next = { id: target && !shared ? target.id : crypto.randomUUID(), dataUrl: normalized.dataUrl, annotations: [], masks: [], privacyReview: { replacementCount: 0, protectedRegionCount: 0, reviewRequired: true, reasonCodes: ["manual_image_review"] } };
          if (target && !shared) candidate.screenshots[candidate.screenshots.indexOf(target)] = next; else candidate.screenshots.push(next);
          targetStep.screenshotId = next.id; targetStep.imageState = { status: "protected", reason: null, attempts: targetStep.imageState.attempts, version }; targetStep.privacyReview = next.privacyReview;
          return candidate;
        }, "画像を端末に保存しました。公開できない情報が残っていないか確認してください。");
        if (!result.ok) throw new Error("IMAGE_PERSIST_FAILED");
        succeeded = true;
        shouldRestoreFocus = (activeImageEditor?.stepId === step.id && imageDialog.open) || [document.body, fileInput, uploadButton].includes(document.activeElement);
        undoStack.push(before); redoStack.length = 0; historyGroup = null;
        uploadFailures.delete(step.id); displayFailures.delete(step.id);
        if (activeImageEditor?.stepId === step.id) { activeImageEditor.dispose(); activeImageEditor = null; workSurface.hidden = false; contextTools.hidden = false; }
      } catch (error) {
        if (!stillCurrent()) return;
        shouldRestoreFocus = [document.body, fileInput, uploadButton].includes(document.activeElement);
        const current = draft.steps.find((entry) => entry.id === step.id);
        if (current) { current.imageState = { status: "failed", reason: null, attempts: current.imageState?.attempts || 1, version }; uploadFailures.set(step.id, { priorState, message: imageUploadError(error, Boolean(screenshot)) }); }
        message.textContent = imageUploadError(error, Boolean(screenshot)); message.hidden = false; message.dataset.state = "error";
        status.textContent = "画像欄の案内を確認してください。元の画像は保持しています。";
        await persist("画像を準備できませんでした。画像欄から再試行できます。");
      } finally {
        clearTimeout(timer);
        if (pendingImages.get(step.id)?.version === version) pendingImages.delete(step.id);
        resolvePending(); fileInput.value = ""; uploadButton.disabled = false;
        const current = draft.steps.find((entry) => entry.id === step.id);
        if (current && selectedStepId === step.id) { renderStepArticle(current); if (shouldRestoreFocus) detail.querySelector(succeeded ? ".image-edit-button" : ".image-upload-panel button")?.focus({ preventScroll: true }); }
        renderListOnly(); updateImageSummary();
        if (!localWriteFailed) {
          const processing = pendingImages.size > 0;
          setSaveState(processing ? "画像を保存中…" : "端末に保存済み", processing ? "saving" : "saved");
          if (succeeded && !processing) status.textContent = "画像を端末に保存しました。公開できない情報が残っていないか確認してください。";
        }
      }
    })();
  });
  const failure = uploadFailures.get(step.id);
  if (failure) { message.hidden = false; message.dataset.state = "error"; message.textContent = failure.message; }
  panel.append(hint, uploadButton, fileInput, message); return panel;
}

async function confirmImage(step) {
  if (pendingImages.has(step.id)) return;
  remember(); const screenshot = screenshotFor(step);
  const failure = uploadFailures.get(step.id);
  if (failure) { step.imageState = failure.priorState || { status: screenshot ? "ready" : "unavailable", reason: null, attempts: 0, version: 1 }; uploadFailures.delete(step.id); renderStepArticle(step); renderListOnly(); await persist(); return; }
  uploadFailures.delete(step.id); displayFailures.delete(step.id);
  if (screenshot?.privacyReview) screenshot.privacyReview.reviewRequired = false;
  if (step.privacyReview) step.privacyReview.reviewRequired = false;
  setImageState(step, "ready"); renderStepArticle(step); renderListOnly(); await persist();
}
async function makeTextOnly(step) {
  if (pendingImages.has(step.id)) return;
  remember(); delete step.screenshotId; delete step.privacyReview; setImageState(step, "none"); removeUnreferencedImages();
  displayFailures.delete(step.id); uploadFailures.delete(step.id); renderStepArticle(step); renderListOnly(); await persist("説明だけの手順として、この端末に保存しました。");
}
function updateContextTools(step) {
  const screenshot = screenshotFor(step); const canEdit = Boolean(screenshot) && !pendingImages.has(step.id) && !displayFailures.has(step.id) && imageStatus(step) !== "none";
  document.querySelector("#adjustImage").disabled = !canEdit;
  document.querySelector("#cropImage").disabled = !canEdit;
  const review = screenshot?.privacyReview || step.privacyReview;
  document.querySelector("#privacySummary").textContent = review?.replacementCount ? `${review.replacementCount}か所を架空値に置換` : "画像と説明の内容を確認してください";
  const privacyDetail = document.querySelector("#privacyDetail");
  privacyDetail.hidden = !shownReplacements.has(step.id);
  privacyDetail.textContent = review?.reviewRequired ? "安全な置換を確認できない領域があります。安全な画像へ差し替えるか、説明だけの手順に変更してください。" : "置換済み画像だけを表示しています。元の個人情報の表示・復元はできません。手動追加した画像では自動置換を行っていません。";
  const regions = replacementRegions(step);
  if (regions.length) {
    const list = document.createElement("ol"); list.className = "replacement-list";
    const labels = { name: "氏名", person: "氏名", company: "所属", organization: "所属", address: "住所", email: "メール", phone: "電話", identifier: "番号", date: "日付", secret: "秘密情報" };
    for (const region of regions) { const item = document.createElement("li"); item.textContent = `${labels[region.kind] || "置換"}：${region.text}`; list.append(item); }
    privacyDetail.append(list);
  } else if (review?.replacementCount) { const note = document.createElement("p"); note.textContent = "この画像には置換位置の情報がありません。画像全体で確認してください。"; privacyDetail.append(note); }
  document.querySelector("#reviewPrivacy").textContent = shownReplacements.has(step.id) ? "置換箇所の表示を閉じる" : "置換箇所を確認";
  document.querySelector("#reviewPrivacy").disabled = !screenshot;
  const actions = document.querySelector("#contextImageActions"); actions.replaceChildren(button(screenshot ? "画像を差し替える" : "画像を追加する", () => { closePanels(); const details = detail.querySelector(".image-file-actions"); details.open = true; details.querySelector("button")?.focus(); }), button("説明だけの手順にする", () => makeTextOnly(step)));
}
function renderStepArticle(step) {
  if (step.id !== selectedStepId) return;
  const article = detail.querySelector(`[data-step-id="${CSS.escape(step.id)}"]`);
  if (!article) return render();
  const oldCanvas = article.querySelector(".screenshot-canvas");
  if (oldCanvas) { invalidatePreview(oldCanvas); previewObserver.unobserve(oldCanvas); oldCanvas.__screenshot = null; }
  article.querySelector(".image-file-actions")?.remove();
  article.querySelector(".screenshot-area")?.replaceWith(renderScreenshot(step));
  const uploadDetails=article.querySelector(".image-file-actions");if(uploadDetails)article.append(uploadDetails);
  updateContextTools(step); updateImageSummary();
}
function renderListOnly() {
  const previous = document.activeElement?.closest("#steps button")?.dataset.stepId;
  const scrollTop = steps.scrollTop;
  steps.replaceChildren();
  for (const step of draft.steps) {
    const item = document.createElement("li");
    const select = button("", () => selectStep(step.id)); select.dataset.stepId = step.id;
    select.setAttribute("aria-controls", `step-${step.id}`); select.setAttribute("aria-current", step.id === selectedStepId ? "step" : "false");
    const number = document.createElement("span"); number.className = "step-number"; number.textContent = step.order;
    const name = document.createElement("span"); name.className = "step-name"; name.textContent = step.instruction || "（説明なし）";
    const state = document.createElement("span"); state.className = "step-image-status"; state.dataset.state = imageStatus(step) === "protected" ? "review" : imageStatus(step); state.textContent = imageLabel(step);
    select.append(number, name, state); item.append(select); steps.append(item);
    select.addEventListener("keydown", (event) => {
      if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      if (event.altKey) { reorderStep(step, event.key === "ArrowUp" ? "up" : "down", true); return; }
      const index = draft.steps.findIndex((entry) => entry.id === step.id) + (event.key === "ArrowUp" ? -1 : 1);
      steps.querySelectorAll("button")[Math.max(0, Math.min(draft.steps.length - 1, index))]?.focus();
    });
  }
  steps.scrollTop = scrollTop;
  if (previous) steps.querySelector(`[data-step-id="${CSS.escape(previous)}"]`)?.focus({ preventScroll: true });
  updateImageSummary();
}
function selectStep(stepId) {
  if (imageDialog.open) { status.textContent = "画像の変更を適用するか、閉じてから手順を移動してください。"; return; }
  selectedStepId = stepId; historyGroup = null; closePanels(); render(); persist();
}
async function reorderStep(step, direction, focusList = false) {
  remember(); moveStep(draft, step.id, direction); selectedStepId = step.id; render();
  if (focusList) steps.querySelector(`[data-step-id="${CSS.escape(step.id)}"]`)?.focus({ preventScroll: true });
  else detail.querySelector(".step-menu summary")?.focus({ preventScroll: true });
  await persist("手順の順序を変更して、この端末に保存しました。");
}
function render() {
  detail.querySelectorAll(".screenshot-canvas").forEach((canvas) => invalidatePreview(canvas)); previewObserver.disconnect(); detail.replaceChildren();
  const step = draft.steps.find((entry) => entry.id === selectedStepId) || draft.steps[0]; selectedStepId = step?.id;
  renderListOnly();
  if (!step) { detail.textContent = "手順を追加して編集を始めましょう。"; contextTools.hidden = true; return; }
  contextTools.hidden = imageDialog.open;
  const article = document.createElement("article"); article.className = "step-article"; article.id = `step-${step.id}`; article.dataset.stepId = step.id;
  const headingRow = document.createElement("div"); headingRow.className = "step-heading";
  const heading = document.createElement("h3"); const count = document.createElement("span"); count.textContent = `手順 ${step.order} / ${draft.steps.length}`; heading.append(count, "操作を確認する");
  const menu = document.createElement("details"); menu.className = "step-menu"; const summary = document.createElement("summary"); summary.textContent = "•••"; summary.setAttribute("aria-label", "手順の操作");
  const controls = document.createElement("div"); controls.className = "step-controls";
  for (const [text, direction, disabled] of [["前へ移動", "up", step.order === 1], ["後へ移動", "down", step.order === draft.steps.length]]) { const move = button(text, () => reorderStep(step, direction)); move.disabled = disabled; controls.append(move); }
  controls.append(button("複製", async () => { remember(); const copied = structuredClone(step); copied.id = crypto.randomUUID(); draft.steps.splice(draft.steps.indexOf(step) + 1, 0, copied); draft.steps.forEach((entry,index) => { entry.order = index + 1; }); selectedStepId = copied.id; render(); detail.querySelector("textarea")?.focus(); await persist(); }));
  controls.append(button("削除", async () => { remember(); const index = draft.steps.indexOf(step); deleteStep(draft, step.id); removeUnreferencedImages(); selectedStepId = draft.steps[index]?.id || draft.steps[index - 1]?.id; render(); detail.querySelector("textarea")?.focus(); await persist("手順を削除しました。取り消すことができます。"); }, "danger"));
  menu.append(summary, controls); headingRow.append(heading, menu); article.append(headingRow, renderScreenshot(step));
  const label = document.createElement("label"); label.className = "instruction-label"; label.textContent = "操作の説明";
  const instruction = document.createElement("textarea"); instruction.value = step.instruction; instruction.setAttribute("aria-description", "500文字以内");
  const updateInstruction = (event) => { if (event.isComposing) return; remember(`instruction:${step.id}`); instruction.value = Array.from(instruction.value).slice(0, 500).join(""); updateStepInstruction(draft, step.id, instruction.value); persist(); renderListOnly(); };
  instruction.addEventListener("input", updateInstruction); instruction.addEventListener("compositionend", updateInstruction);
  instruction.addEventListener("blur", () => { historyGroup = null; });
  label.append(instruction); article.append(label); const uploadDetails=article.querySelector(".image-file-actions");if(uploadDetails)article.append(uploadDetails); detail.append(article); updateContextTools(step); applyBranding();
}
function notifyEditorReady() { if (typeof chrome !== "undefined") chrome.runtime?.sendMessage?.({ type: "editor:ready", draftId: id, ready: true }, () => void globalThis.chrome?.runtime?.lastError); }
addStepButton.addEventListener("click", async () => {
  if (imageDialog.open) return;
  remember(); const previous = selectedStepId; const step = addStep(draft);
  const index = draft.steps.findIndex((entry) => entry.id === previous);
  draft.steps.pop(); draft.steps.splice(index + 1, 0, step); draft.steps.forEach((entry, position) => { entry.order = position + 1; });
  if (!step.screenshotId) setImageState(step, "none");
  selectedStepId = step.id; closePanels(); render(); detail.querySelector("textarea")?.focus(); await persist("手順を追加して、この端末に保存しました。");
});
for (const field of [title, description]) {
  field.addEventListener("input", () => { remember(field.id); draft[field.id] = field.value; persist(); });
  field.addEventListener("blur", () => { historyGroup = null; });
}
document.querySelector("#undo").addEventListener("click", () => restoreHistory(undoStack, redoStack));
document.querySelector("#redo").addEventListener("click", () => restoreHistory(redoStack, undoStack));
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !imageDialog.open) { event.preventDefault(); restoreHistory(event.shiftKey ? redoStack : undoStack, event.shiftKey ? undoStack : redoStack); }
  if (event.key === "Escape" && panelTrigger) { event.preventDefault(); closePanels(); }
});
document.querySelector("#openNavigation").addEventListener("click", (event) => openPanel("navigation", event.currentTarget));
document.querySelector("#openTools").addEventListener("click", (event) => openPanel("tools", event.currentTarget));
document.querySelectorAll("[data-close-panel]").forEach((node) => node.addEventListener("click", closePanels));
document.querySelector("#panelBackdrop").addEventListener("click", closePanels);
document.querySelector("#adjustImage").addEventListener("click", () => openImageEditor(draft.steps.find((step) => step.id === selectedStepId)));
document.querySelector("#cropImage").addEventListener("click", () => openImageEditor(draft.steps.find((step) => step.id === selectedStepId), "crop"));
document.querySelector("#reviewPrivacy").addEventListener("click", () => { const step = draft.steps.find((entry) => entry.id === selectedStepId); if (!step) return; if (shownReplacements.has(step.id)) shownReplacements.delete(step.id); else shownReplacements.add(step.id); renderStepArticle(step); });
document.querySelector("#retrySave").addEventListener("click", () => persist());
window.addEventListener("beforeunload", (event) => { if (localWriteFailed || pendingImages.size) { event.preventDefault(); event.returnValue = ""; } });

function renderOutputSummary() {
  document.querySelector("#outputSummaryTitle").textContent = title.value || "無題の手順書";
  const unresolved = unresolvedSteps(); const images = draft.steps.filter((step) => step.screenshotId && imageStatus(step) !== "none").length;
  document.querySelector("#outputSummary").textContent = `${draft.steps.length}手順・画像${images}枚${unresolved.length ? `・要確認${unresolved.length}件` : "・画像準備完了"}`;
  const issues = document.querySelector("#outputIssues"); issues.replaceChildren();
  for (const step of unresolved) issues.append(button(`手順${step.order}：${imageLabel(step)}`, () => { outputGate.close(); selectStep(step.id); }, "secondary"));
  updateRegistrationAvailability();
}
function textFieldsValid() {
  title.setCustomValidity(!title.value.trim() ? "手順書のタイトルを入力してください。" : Array.from(title.value.trim()).length > 64 ? "タイトルは64文字以内で入力してください。" : "");
  description.setCustomValidity(Array.from(description.value).length > 10000 ? "説明は10,000文字以内で入力してください。" : "");
  return title.validity.valid && description.validity.valid;
}
function updateRegistrationAvailability() {
  const origin = getOnboardingOrigin(); const blocked = outputPreflight || unresolvedSteps().length > 0 || pendingImages.size > 0 || !textFieldsValid();
  startRegistration.disabled = !origin || blocked || outputInFlight;
  if (startShare) startShare.disabled = !origin || blocked || outputInFlight;
  if (!origin) gateStatus.textContent = pendingRegistrationMessage;
  return origin;
}
async function verifyOutputImages(generation) {
  // Check every referenced image, including non-selected steps. No output may
  // silently omit an image just because its preview has not been opened yet.
  for (const step of draft.steps) {
    if (generation !== outputGateGeneration || !outputGate.open) return;
    if (imageStatus(step) !== "ready") continue;
    const screenshot = screenshotFor(step); if (!screenshot) continue;
    let timeout;
    try {
      const image = new Image(); image.src = screenshot.dataUrl;
      await Promise.race([image.decode(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("IMAGE_DECODE_TIMEOUT")), 8_000); })]);
      if (generation !== outputGateGeneration || !outputGate.open) return;
      assertImageDimensions(image.width, image.height);
      const canvas = document.createElement("canvas"); drawScreenshot(canvas.getContext("2d"), image, screenshot); canvas.width = 1; canvas.height = 1;
      displayFailures.delete(step.id);
    } catch { if (generation === outputGateGeneration && screenshotFor(step)?.dataUrl === screenshot.dataUrl) displayFailures.add(step.id); }
    finally { clearTimeout(timeout); }
  }
}
function officeFileName(value, extension) {
  const safe = String(value || "手順書").trim().replace(/[\\/:*?"<>|\u0000-\u001f]/gu, "_").replace(/[. ]+$/u, "").slice(0, 80) || "手順書";
  return `${safe}.${extension}`;
}
function officeError(code, message, step = null) {
  const error = new Error(code); error.code = code; error.step = step; error.userMessage = message; return error;
}
function setOfficeExportStatus(message, state = "") {
  if (!officeExportStatus) return;
  officeExportStatus.textContent = message; officeExportStatus.dataset.state = state;
}
async function editedOfficeImage(step, index, imageBudget, tools) {
  const screenshot = screenshotFor(step);
  if (!screenshot?.dataUrl || imageStatus(step) !== "ready") throw officeError("office-image-failed", `手順${index + 1}の画像を確認できないため、Officeファイルを作成できません。画像を確認してから再試行してください。`, step);
  let timer;
  try {
    const image = new Image(); image.src = screenshot.dataUrl;
    await Promise.race([image.decode(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("IMAGE_DECODE_TIMEOUT")), 8_000); })]);
    assertImageDimensions(image.naturalWidth || image.width, image.naturalHeight || image.height);
    const canvas = document.createElement("canvas"); drawScreenshot(canvas.getContext("2d"), image, screenshot);
    const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("IMAGE_ENCODE_FAILED")), "image/png"));
    imageBudget.used = tools.assertOfficeImageBudget(blob.size, imageBudget.used);
    const bytes = new Uint8Array(await blob.arrayBuffer()); if (!bytes.length) throw new Error("IMAGE_ENCODE_EMPTY");
    return { kind: "edited", bytes, mimeType: "image/png", width: canvas.width, height: canvas.height };
  } catch (error) {
    if (error?.code === "office-image-failed" || error?.code === "office-image-budget") throw error;
    throw officeError("office-image-failed", `手順${index + 1}の画像を読み込めませんでした。画像を確認してから再試行してください。`, step);
  } finally { clearTimeout(timer); }
}
function downloadOffice(bytes, titleValue, format) {
  const mimeType = format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  const blob = new Blob([bytes], { type: mimeType }); const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = officeFileName(titleValue, format === "docx" ? "docx" : "pptx"); link.rel = "noopener"; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 0);
}
function officeExportMessage(error) {
  const message = String(error?.message || "");
  const step = message.match(/^Step (\d+) requires body text$/u);
  if (step) return `手順${step[1]}の説明を入力してから再試行してください。`;
  if (message === "Office export requires one to 200 steps") return "手順は200件以内にしてから再試行してください。";
  return error?.userMessage || "Officeファイルを書き出せませんでした。内容を確認して再試行してください。";
}
function officeDraftContent(draft, titleValue, descriptionValue) {
  const canonical = JSON.parse(canonicalDraftJson({ ...draft, title: titleValue, description: descriptionValue }));
  delete canonical.updatedAt;
  return JSON.stringify(canonical);
}
async function exportOffice(format, button) {
  if (officeExportInFlight || imageDialog.open) return;
  if (!textFieldsValid()) { setOfficeExportStatus(title.validationMessage || description.validationMessage, "error"); title.reportValidity(); description.reportValidity(); return; }
  if (pendingImages.size || unresolvedSteps().length) { setOfficeExportStatus("準備中または要確認の画像があります。各手順の画像を確認するか、説明だけの手順にしてから再試行してください。", "warning"); return; }
  // Claim the export slot before any asynchronous fingerprint work so a
  // second click cannot start a concurrent snapshot.
  officeExportInFlight = true; [exportWord, exportPowerPoint].forEach((item) => { if (item) item.disabled = true; }); if (button) button.setAttribute("aria-busy", "true");
  setOfficeExportStatus(`${format === "docx" ? "Word" : "PowerPoint"}ファイルを作成しています…`);
  try {
    const exportContent = officeDraftContent(draft, title.value, description.value);
    const exportFingerprint = await fingerprintDraft(draft);
    if (officeDraftContent(draft, title.value, description.value) !== exportContent) throw officeError("office-export-changed", "編集中の内容が変わったため、Officeファイルの作成を中止しました。最新の内容で再試行してください。");
    const tools = await import("../export/office-export.js");
    if (officeDraftContent(draft, title.value, description.value) !== exportContent || await fingerprintDraft(draft) !== exportFingerprint) throw officeError("office-export-changed", "編集中の内容が変わったため、Officeファイルの作成を中止しました。最新の内容で再試行してください。");
    const exportSnapshot = { title: title.value, description: description.value, steps: draft.steps.map((step) => ({ id: step.id, instruction: step.instruction, screenshotId: step.screenshotId })) };
    const imageBudget = { used: 0 };
    const steps = [];
    for (const [index, step] of exportSnapshot.steps.entries()) {
      if (await fingerprintDraft(draft) !== exportFingerprint) throw officeError("office-export-changed", "編集中の内容が変わったため、Officeファイルの作成を中止しました。最新の内容で再試行してください。", step);
      const current = draft.steps.find((item) => item.id === step.id); if (!current) throw officeError("office-export-changed", "手順が変わったため、Officeファイルの作成を中止しました。最新の内容で再試行してください。", step);
      steps.push({ number: index + 1, instruction: String(step.instruction || ""), image: step.screenshotId ? await editedOfficeImage(current, index, imageBudget, tools) : null });
    }
    if (officeDraftContent(draft, title.value, description.value) !== exportContent || await fingerprintDraft(draft) !== exportFingerprint) throw officeError("office-export-changed", "編集中の内容が変わったため、Officeファイルの作成を中止しました。最新の内容で再試行してください。");
    if (officeDraftContent(draft, title.value, description.value) !== exportContent) throw officeError("office-export-changed", "編集中の内容が変わったため、Officeファイルの作成を中止しました。最新の内容で再試行してください。");
    if (await fingerprintDraft(draft) !== exportFingerprint) throw officeError("office-export-changed", "編集中の内容が変わったため、Officeファイルの作成を中止しました。最新の内容で再試行してください。");
    if (officeDraftContent(draft, title.value, description.value) !== exportContent) throw officeError("office-export-changed", "編集中の内容が変わったため、Officeファイルの作成を中止しました。最新の内容で再試行してください。");
    const bytes = format === "docx" ? tools.buildDocx({ title: exportSnapshot.title, description: exportSnapshot.description, steps }) : tools.buildPptx({ title: exportSnapshot.title, description: exportSnapshot.description, steps });
    if (!(bytes instanceof Uint8Array) || !bytes.length) throw officeError("office-export-failed", "Officeファイルを作成できませんでした。内容を確認して再試行してください。");
    downloadOffice(bytes, exportSnapshot.title, format); setOfficeExportStatus(`${format === "docx" ? "Word" : "PowerPoint"}ファイルを書き出しました。認証済みワークスペースへの保存を確認しました。共有設定は変更していません。`, "success");
  } catch (error) { setOfficeExportStatus(officeExportMessage(error), error?.code === "office-export-changed" ? "warning" : "error"); }
  finally { officeExportInFlight = false; [exportWord, exportPowerPoint].forEach((item) => { if (item) item.disabled = false; }); if (button) button.removeAttribute("aria-busy"); updateImageSummary(); }
}
async function openOutput(action, officeFormat = undefined) {
  if (action === "office" && !validOfficeFormat(officeFormat)) return;
  if (action !== "office") officeFormat = undefined;
  if(imageDialog.open){status.textContent="画像の変更を適用するか、閉じてから保存・共有へ進んでください。";return;}
  if (!textFieldsValid()) { status.textContent = title.validationMessage || description.validationMessage; title.reportValidity(); description.reportValidity(); return; }
  if (imageDialog.open) { status.textContent = "画像の変更を適用するか、閉じてから保存・共有してください。"; return; }
  const generation = ++outputGateGeneration; outputIntent = action; outputOfficeFormat = officeFormat || null; closePanels();
  document.querySelector("#outputGateTitle").textContent = action === "share" ? "共有する内容を確認" : action === "office" ? `${officeFormat === "docx" ? "Word" : "PowerPoint"}を書き出す準備` : "クラウドに保存する内容を確認";
  startRegistration.hidden = action === "share"; startShare.hidden = action !== "share";
  if (action === "office") startRegistration.textContent = `ログインして${officeFormat === "docx" ? "Word" : "PowerPoint"}を書き出す`;
  else startRegistration.textContent = "ログインしてクラウドに保存";
  outputPreflight = true; gateStatus.textContent = "画像と端末の保存状態を確認しています…"; renderOutputSummary();
  if (!outputGate.open) outputGate.showModal();
  if (pendingImages.size) { gateStatus.textContent = "追加した画像を端末に保存しています。完了後、内容を確認できます。"; await Promise.all([...pendingImages.values()].map((entry) => entry.promise)); }
  if (generation !== outputGateGeneration || !outputGate.open) return;
  await verifyOutputImages(generation);
  if (generation !== outputGateGeneration || !outputGate.open) return;
  if (!await persist()) { outputPreflight = false; gateStatus.textContent = "端末に保存できないため、クラウドへ進めません。編集内容を確認して再試行してください。"; startRegistration.disabled = true; startShare.disabled = true; return; }
  if (generation !== outputGateGeneration || !outputGate.open) return;
  outputPreflight = false; gateStatus.textContent = unresolvedSteps().length ? "確認が必要な手順を選んで、画像の問題を解消してください。" : "端末の最新の内容を保存します。"; renderListOnly(); renderOutputSummary();
}
document.querySelector("#save").addEventListener("click", () => openOutput("save"));
document.querySelector("#share").addEventListener("click", () => openOutput("share"));
document.querySelector("#mobileShare").addEventListener("click", () => openOutput("share"));
// A cloudRef identifies a saved revision, not a live authenticated session.
// Always use the existing auth/workspace handoff; an already authenticated
// browser session returns through it without asking the user to log in again.
exportWord?.addEventListener("click", () => openOutput("office", "docx"));
exportPowerPoint?.addEventListener("click", () => openOutput("office", "pptx"));

function applyBranding() {
  const color = /^#[\da-f]{6}$/i.test(draft.branding?.themeColor || "") ? draft.branding.themeColor : "#087f7a";
  document.querySelector("#brandColor").value = color;
  // Keep navigation/text contrast fixed; the team color decorates the image frame.
  detail.style.setProperty("--brand-color", color);
  detail.querySelector(".screenshot-preview")?.style.setProperty("border-top", `4px solid ${color}`);
  const mark = document.querySelector(".brand-mark");
  mark.src = draft.branding?.logoDataUrl || "../assets/meccha-manual-logo-mark.png";
  document.querySelector("#removeBrandLogo").hidden = !draft.branding?.logoDataUrl;
}
document.querySelector("#brandColor").addEventListener("input", async (event) => { remember("brandColor"); draft.branding = { ...draft.branding, themeColor: event.target.value }; applyBranding(); await persist(); });
document.querySelector("#brandLogo").addEventListener("change", async (event) => {
  const file = event.target.files?.[0]; if (!file || pendingImages.has("branding")) return;
  const input=event.target;input.disabled=true;let resolvePending;const promise=new Promise(resolve=>{resolvePending=resolve;});pendingImages.set("branding",{promise});updateHistoryButtons();document.querySelector("#brandStatus").textContent="ロゴを画像に変換して、端末に保存しています…";let timer;
  try { const image = await Promise.race([normalizeUploadedImage(file),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("IMAGE_DECODE_TIMEOUT")),30_000);})]); remember(); draft.branding = { ...draft.branding, logoDataUrl: image.dataUrl }; applyBranding(); const saved=await persist();document.querySelector("#brandStatus").textContent=saved?"ロゴを端末に保存しました。":"ロゴを端末に保存できませんでした。再試行してください。"; }
  catch { document.querySelector("#brandStatus").textContent = "ロゴを読み込めませんでした。10MB以下のPNG・JPEG・WebPを選んでください。前のロゴを保持しています。"; }
  finally { clearTimeout(timer);pendingImages.delete("branding");resolvePending();input.disabled=false;input.value = "";updateHistoryButtons();renderOutputSummary(); }
});
document.querySelector("#removeBrandLogo").addEventListener("click", async () => { remember(); if (draft.branding) delete draft.branding.logoDataUrl; applyBranding(); await persist(); });

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
  if (run.outputAction === "office" && run.handoffId) void clearOfficeIntentForRun(run);
  updateHandoffActivationPolicy(run, "cancelled").catch(() => undefined);
  cleanupProvisionalHandoffTab(run).catch(() => undefined);
}

async function clearOfficeIntentForRun(run) {
  try {
    await withHandoffDraftLock(draft.id, async () => {
      const current = (await chrome.storage.local.get(officeIntentKey))?.[officeIntentKey];
      if (current?.handoffId === run.handoffId) await chrome.storage.local.remove(officeIntentKey);
    });
  } catch {
    // A competing run keeps its newer intent when the shared lock is unavailable.
  }
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

async function openHandoffTab(origin, metadata, recovery, outputAction, officeFormat, run) {
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
      requestedAction: outputAction,
      ...(outputAction === "office" ? { requestedOfficeFormat: officeFormat } : {}),
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
        url: buildContinueUrl(origin, base.handoffId, base.extensionId, recovery, outputAction, launchId, officeFormat),
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
      gateStatus.textContent = "保存先を表示しています。";
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

async function startOutput(outputAction, officeFormat = undefined) {
  if (outputAction === "office" && !validOfficeFormat(officeFormat)) return;
  if (outputAction !== "office") officeFormat = undefined;
  const origin = updateRegistrationAvailability();
  if (!origin || outputPreflight || !textFieldsValid() || outputInFlight || pendingImages.size || unresolvedSteps().length || localWriteFailed || activeHandoffAttempt?.tabState === "activating") return;
  outputInFlight = true;
  const previousAttempt = activeHandoffAttempt;
  cancelHandoffRun(previousAttempt);
  const run = { runId: ++handoffRunGeneration, outputAction, officeFormat, cancelled: false, handoffId: null, launchId: null, tabId: null, tabState: "none", tabCleanupStarted: false };
  activeHandoffAttempt = run;
  pendingHandoffTabId = null;
  if (activateHandoff) activateHandoff.hidden = true;
  if (activateHandoff) activateHandoff.disabled = false;
  startRegistration.disabled = true;
  if (startShare) startShare.disabled = true;
  if (handoffProgress) handoffProgress.hidden = false;
  if (handoffProgressText) handoffProgressText.textContent = outputAction === "share" ? "共有の準備をしています。" : outputAction === "office" ? "Office出力の認証と保存先を準備しています。" : "ワークスペースへの保存を準備しています。";
  gateStatus.textContent = "保存先の準備画面を開いています。ログインが必要な場合は、表示された画面で続けてください。";
  try {
    await withHandoffDraftLock(draft.id, async () => {
      if (!await persist()) throw new Error("LOCAL_SAVE_FAILED");
      if (pendingImages.size || unresolvedSteps().length) throw new Error("IMAGE_REVIEW_REQUIRED");
      await pruneExpiredHandoffs();
      const extensionId = chrome.runtime?.id;
      const draftFingerprint = await fingerprintDraft(draft);
      const recovery = await findRecoverableHandoff(draft.id, draftFingerprint, undefined, outputAction, officeFormat);
      const metadata = recovery || createHandoffMetadata(draft.id, outputAction, Date.now(), extensionId, draft.updatedAt, draftFingerprint, officeFormat);
      const reconcilingPendingSave = recovery && ["finalize-pending", "completion-pending"].includes(recovery.status);
      if (metadata.draftFingerprint !== draftFingerprint && !reconcilingPendingSave) throw new Error("DRAFT_CHANGED");
      run.handoffId = metadata.handoffId;
      if (outputAction === "office") await saveOfficeIntent({ draftId: draft.id, handoffId: metadata.handoffId, officeFormat, draftFingerprint, expiresAt: metadata.expiresAt });
      if (!isActiveHandoffRun(run)) throw new Error("HANDOFF_CANCELLED");
      const opened = await openHandoffTab(origin, metadata, recovery, outputAction, officeFormat, run);
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
          gateStatus.textContent = "保存先の準備画面を表示しました。ログインが必要な場合は、表示された画面で続けてください。";
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
      gateStatus.textContent = "保存先の準備画面を確認できませんでした。ログインや接続が必要な場合があります。『準備画面を表示』を押すと画面を表示できます。手順書はこの端末に残っています。";
      return;
    });
  } catch (error) {
    await cleanupProvisionalHandoffTab(run);
    if (isActiveHandoffRun(run)) {
      if (handoffProgress) handoffProgress.hidden = true;
      gateStatus.textContent = ["HANDOFF_STORAGE_UNAVAILABLE", "HANDOFF_LOCK_UNAVAILABLE"].includes(error?.message)
        ? "保存の準備ができませんでした。編集画面からもう一度お試しください。手順書はこの端末に残っています。"
        : "保存先を開けませんでした。元の手順書はこの端末に残っています。";
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
      const retryLabel = outputIntent === "share" ? startShare.textContent : startRegistration.textContent;
      gateStatus.textContent = `保存先を表示できませんでした。「${retryLabel}」を押して準備し直してください。元の手順書はこの端末に残っています。`;
    }
  } finally {
    if ((activeHandoffAttempt === attempt || activeHandoffAttempt === null) && attempt.tabState !== "activating") activateHandoff.disabled = false;
  }
});
startRegistration.addEventListener("click", () => startOutput(outputIntent, outputIntent === "office" ? outputOfficeFormat : undefined));
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
  outputGateGeneration += 1; outputPreflight = false;
  status.textContent = "ログイン・保存の準備を閉じました。下書きはこの端末に残っています。";
  document.querySelector(outputIntent === "share" ? "#share" : outputIntent === "office" ? (outputOfficeFormat === "docx" ? "#exportWord" : "#exportPowerPoint") : "#save")?.focus({ preventScroll: true });
  const attempt = activeHandoffAttempt;
  cancelHandoffRun(attempt);
});
const interruptedImages = draft.steps.filter((step) => ["queued", "capturing"].includes(step.imageState?.status));
for (const step of interruptedImages) setImageState(step, "unavailable", "capture_interrupted");
render();
notifyEditorReady();
void refreshCloudReference().catch(() => { if (cloudSaveState) cloudSaveState.textContent = "クラウド保存状態を確認できません"; });
void (async () => {
  const intent = await readOfficeIntent().catch(() => null);
  if (!intent || !chrome.storage?.local?.get) return;
  const metadata = (await chrome.storage.local.get(handoffStorageKey(intent.handoffId)).catch(() => ({})))?.[handoffStorageKey(intent.handoffId)];
  // A persisted completed record is only a recovery hint. It does not prove
  // that the current browser session is still authenticated after reload or
  // logout, so require a fresh Office output handoff instead of downloading.
  await resumeCompletedOfficeStartup(metadata, {
    resume: resumeOfficeAfterClaim,
    clear: async () => {
      await clearOfficeIntent();
      setOfficeExportStatus("認証済みセッションを確認するため、Office出力をもう一度選択してください。", "warning");
    }
  });
})();
if (interruptedImages.length) persist("前回の画像準備が完了しませんでした。画像を追加するか、説明だけの手順に変更できます。");
document.getElementById("editor-heading")?.focus({ preventScroll: true });
