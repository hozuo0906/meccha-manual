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
const pendingRegistrationMessage = "保存先を準備できません。時間をおいてもう一度お試しください。手順書はこの端末に残っています。";
const HANDOFF_READY_TIMEOUT_MS = 8_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_COUNT = 100;
const MAX_IMAGE_TOTAL_BYTES = 100 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_IMAGE_DIMENSION = 12_000;
const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
let outputInFlight = false;
let pendingHandoffTabId = null;
let activeHandoffAttempt = null;
let handoffRunGeneration = 0;
let selectedStepId = draft.steps[0]?.id;
const previewGenerations = new WeakMap();
function invalidatePreview(canvas) {
  previewGenerations.set(canvas, (previewGenerations.get(canvas) || 0) + 1);
  // Keep the intrinsic ratio while an off-screen image is decoding. Resetting
  // the canvas to 1x1 makes a portrait preview briefly collapse and compete
  // with the CSS aspect-ratio during scrolling.
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
    draft.updatedAt = new Date().toISOString();
    setSaveState("保存中…", "saving");
    try {
      await draftStore.put(draft);
      status.textContent = message;
      setSaveState("端末に保存済み", "saved");
      return true;
    } catch {
      status.textContent = "下書きを保存できませんでした。記録内容は送信されていません。空き容量を確認するか、もう一度お試しください。";
      setSaveState("保存できません", "error");
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
    candidate.updatedAt = new Date().toISOString();
    setSaveState("保存中…", "saving");
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
      setSaveState("端末に保存済み", "saved");
      return { ok: true, candidate: merged, hasPendingEdits };
    }
    catch { status.textContent = "下書きを保存できませんでした。編集内容は保持されています。空き容量を確認するか、もう一度お試しください。"; setSaveState("保存できません", "error"); return { ok: false }; }
  });
}

function screenshotFor(step) { return draft.screenshots.find((item) => item.id === step?.screenshotId); }

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("IMAGE_ENCODE_FAILED")), type, quality));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("IMAGE_READ_FAILED"));
    reader.readAsDataURL(blob);
  });
}

function dataUrlBytes(dataUrl) {
  if (typeof dataUrl !== "string") return 0;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  const encoded = dataUrl.slice(comma + 1).replace(/\s/g, "");
  return Math.floor(encoded.length * 3 / 4) - (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
}

function assertImageCapacity(candidate, nextDataUrl, replacedId = null) {
  const current = Array.isArray(candidate?.screenshots) ? candidate.screenshots : [];
  const count = current.filter((item) => item?.id !== replacedId).length + 1;
  if (count > MAX_IMAGE_COUNT) throw new RangeError("IMAGE_COUNT_LIMIT");
  const total = current.reduce((sum, item) => sum + (item?.id === replacedId ? 0 : dataUrlBytes(item?.dataUrl)), 0) + dataUrlBytes(nextDataUrl);
  if (total > MAX_IMAGE_TOTAL_BYTES) throw new RangeError("IMAGE_TOTAL_TOO_LARGE");
}

async function readImageHeaderDimensions(file) {
  // JPEG metadata may legally place SOF after a large APP segment. The input
  // is already capped at 10 MiB, so scan the bounded file instead of rejecting
  // a valid image merely because its header exceeds the old 64 KiB probe.
  const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, MAX_IMAGE_BYTES)).arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index])) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 10 && ["GIF89a", "GIF87a"].includes(String.fromCharCode(...bytes.slice(0, 6)))) {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  if (bytes.length >= 30 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === "VP8X" && bytes.length >= 30) return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) };
    if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
      const width = 1 + ((bytes[21] | (bytes[22] << 8)) & 0x3fff);
      const height = 1 + (((bytes[22] >> 6) | (bytes[23] << 2) | (bytes[24] << 10)) & 0x3fff);
      return { width, height };
    }
    if (chunk === "VP8 " && bytes.length >= 30) {
      for (let offset = 20; offset + 9 < bytes.length; offset += 1) if (bytes[offset] === 0x9d && bytes[offset + 1] === 0x01 && bytes[offset + 2] === 0x2a) return { width: view.getUint16(offset + 3, true) & 0x3fff, height: view.getUint16(offset + 5, true) & 0x3fff };
    }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1]; offset += 2;
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = view.getUint16(offset); if (length < 2 || offset + length > bytes.length) break;
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
      offset += length;
    }
  }
  return null;
}

function assertImageDimensions(width, height) {
  if (!width || !height || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS) throw new RangeError("IMAGE_PIXELS_TOO_LARGE");
}

async function normalizeUploadedImage(file) {
  if (!(file instanceof File) || !ACCEPTED_IMAGE_TYPES.has(file.type)) throw new TypeError("IMAGE_TYPE_UNSUPPORTED");
  if (file.size > MAX_IMAGE_BYTES) throw new RangeError("IMAGE_INPUT_TOO_LARGE");
  if (typeof createImageBitmap !== "function") throw new Error("IMAGE_DECODE_UNAVAILABLE");
  const headerDimensions = await readImageHeaderDimensions(file);
  // The decoder must never be the first place we learn the dimensions. A malformed
  // or unsupported header is rejected before a potentially huge bitmap is allocated.
  if (!headerDimensions) throw new TypeError("IMAGE_DIMENSIONS_INVALID");
  assertImageDimensions(headerDimensions.width, headerDimensions.height);
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height) throw new TypeError("IMAGE_DIMENSIONS_INVALID");
    assertImageDimensions(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("IMAGE_CANVAS_UNAVAILABLE");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let hasTransparency = false;
    for (let offset = 3; offset < pixels.length; offset += 4) {
      if (pixels[offset] < 255) { hasTransparency = true; break; }
    }
    // Re-encode to remove the original file metadata before it enters the draft.
    let blob = await canvasToBlob(canvas, "image/png");
    if (blob.size > MAX_IMAGE_BYTES) {
      // JPEG has no alpha channel. Keep transparent input lossless and report
      // the size limit instead of silently turning hidden areas opaque.
      if (hasTransparency) throw new RangeError("IMAGE_OUTPUT_TOO_LARGE");
      const flattened = document.createElement("canvas");
      flattened.width = bitmap.width;
      flattened.height = bitmap.height;
      const flattenedContext = flattened.getContext("2d");
      if (!flattenedContext) throw new Error("IMAGE_CANVAS_UNAVAILABLE");
      flattenedContext.fillStyle = "#ffffff";
      flattenedContext.fillRect(0, 0, bitmap.width, bitmap.height);
      flattenedContext.drawImage(canvas, 0, 0);
      blob = await canvasToBlob(flattened, "image/jpeg", .88);
    }
    if (blob.size > MAX_IMAGE_BYTES) throw new RangeError("IMAGE_OUTPUT_TOO_LARGE");
    return { dataUrl: await blobToDataUrl(blob), width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close?.();
  }
}

function imageUploadError(error) {
  if (error?.message === "IMAGE_TYPE_UNSUPPORTED") return "PNG、JPEG、WebPの画像を選んでください。";
  if (error?.message === "IMAGE_INPUT_TOO_LARGE") return "画像が10MBを超えています。10MB以下の画像を選んでください。";
  if (error?.message === "IMAGE_OUTPUT_TOO_LARGE") return "画像を変換した結果、10MBを超えました。解像度を下げるか、別の画像を選んでください。";
  if (error?.message === "IMAGE_PIXELS_TOO_LARGE") return "画像の解像度が高すぎます。縦横12,000px以下、合計4,000万画素以内の画像を選んでください。";
  if (error?.message === "IMAGE_TOTAL_TOO_LARGE") return "画像の合計サイズが大きすぎます。画像を減らすか、小さい画像を選んでください。";
  if (error?.message === "IMAGE_COUNT_LIMIT") return "画像は100件まで追加できます。";
  if (error?.message === "IMAGE_DIMENSIONS_INVALID") return "画像の大きさを確認できませんでした。別の画像を選んでください。";
  return "画像を追加できませんでした。元の内容は変更されていません。もう一度お試しください。";
}

async function drawPreview(canvas, screenshot) {
  const generation = (previewGenerations.get(canvas) || 0) + 1;
  previewGenerations.set(canvas, generation);
  try {
    const image = new Image(); image.src = screenshot.dataUrl; await image.decode();
    if (previewGenerations.get(canvas) !== generation || !canvas.isConnected) return;
    const context = canvas.getContext("2d"); drawScreenshot(context, image, screenshot);
    const preview = canvas.closest(".screenshot-preview");
    if (preview && image.naturalWidth && image.naturalHeight) preview.style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`;
    canvas.style.visibility = "visible";
    canvas.dataset.previewRendered = "true";
    canvas.setAttribute("aria-label", "記録した画面（注釈とマスクを反映）");
  } catch {
    if (previewGenerations.get(canvas) !== generation || !canvas.isConnected) return;
    previewObserver.unobserve(canvas);
    canvas.__screenshot = null;
    canvas.replaceWith(Object.assign(document.createElement("p"), { textContent: "画像を読み込めませんでした。" }));
  }
}

function renderScreenshot(step) {
  const screenshot = screenshotFor(step);
  const area = document.createElement("div"); area.className = "screenshot-area";
  if (screenshot) {
    const preview = document.createElement("div"); preview.className = "screenshot-preview";
    const canvas = document.createElement("canvas"); canvas.className = "screenshot-canvas"; canvas.tabIndex = 0; preview.append(canvas); area.append(preview);
    const actionRow = document.createElement("div"); actionRow.className = "image-action-row";
    const edit = document.createElement("button"); edit.type = "button"; edit.className = "image-edit-button"; edit.textContent = "画像を編集"; edit.setAttribute("aria-label", "画像を編集"); edit.dataset.editorTrigger = screenshot.id;
    edit.addEventListener("click", async () => {
      activeImageEditor?.dispose();
      activeImageEditor = createImageEditor({ dialog: document.querySelector("#imageEditorDialog"), canvas: document.querySelector("#imageEditorCanvas"), screenshot, onSave: async (next) => { const result = await persistCandidate(() => { const candidate = structuredClone(draft); const candidateScreenshot = candidate.screenshots.find((item) => item.id === screenshot.id); candidateScreenshot.annotations = next.annotations; candidateScreenshot.masks = next.masks; candidate.updatedAt = new Date().toISOString(); return candidate; }, "画像を更新して、この端末に保存しました。"); if (!result.ok) return false; Object.assign(draft, result.candidate); draft.steps.filter((candidateStep) => candidateStep.screenshotId === screenshot.id).forEach(renderStepArticle); return detail.querySelector(`[data-step-id="${CSS.escape(step.id)}"] [data-editor-trigger="${CSS.escape(screenshot.id)}"]`); } });
      await activeImageEditor.open();
    });
    actionRow.append(edit);
    area.append(actionRow);
    const note = document.createElement("p"); note.className = "image-editor-note"; note.textContent = "画像を編集すると、文字・図形・黒塗りを追加できます。"; area.append(note);
    canvas.__screenshot = screenshot;
    previewObserver.observe(canvas);
  }
  const uploadPanel = document.createElement("div"); uploadPanel.className = screenshot ? "image-upload-panel image-replace" : "image-upload-panel";
  const uploadTitle = document.createElement("strong"); uploadTitle.textContent = screenshot ? "画像を差し替える" : "この手順に画像を追加";
  const uploadHint = document.createElement("span"); uploadHint.textContent = "PNG、JPEG、WebP（10MB以下）";
  const uploadButton = document.createElement("button"); uploadButton.type = "button"; uploadButton.textContent = screenshot ? "画像を選び直す" : "画像を選ぶ";
  const fileInput = document.createElement("input"); fileInput.type = "file"; fileInput.accept = [...ACCEPTED_IMAGE_TYPES].join(","); fileInput.tabIndex = -1; fileInput.setAttribute("aria-hidden", "true");
  const uploadMessage = document.createElement("p"); uploadMessage.className = "image-upload-message"; uploadMessage.hidden = true; uploadMessage.setAttribute("role", "status"); uploadMessage.setAttribute("aria-live", "polite");
  uploadButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0]; if (!file) return;
    uploadButton.disabled = true; uploadMessage.hidden = false; uploadMessage.dataset.state = "pending"; uploadMessage.textContent = "画像を確認して保存しています…";
    try {
      const normalized = await normalizeUploadedImage(file);
      const result = await persistCandidate(() => {
        const candidate = structuredClone(draft);
        const candidateStep = candidate.steps.find((item) => item.id === step.id);
        const target = candidateStep?.screenshotId ? candidate.screenshots.find((item) => item.id === candidateStep.screenshotId) : null;
        const sharedByOtherStep = target && candidate.steps.some((candidateItem) => candidateItem.id !== candidateStep?.id && candidateItem.screenshotId === target.id);
        const replacementId = target && !sharedByOtherStep ? target.id : null;
        assertImageCapacity(candidate, normalized.dataUrl, replacementId);
        if (target && !sharedByOtherStep) { target.dataUrl = normalized.dataUrl; target.annotations = []; target.masks = []; }
        else { const screenshotId = crypto.randomUUID(); candidate.screenshots.push({ id: screenshotId, dataUrl: normalized.dataUrl, annotations: [], masks: [] }); candidateStep.screenshotId = screenshotId; }
        return candidate;
      }, screenshot ? "画像を差し替えて、この端末に保存しました。" : "画像を追加して、この端末に保存しました。");
      if (!result.ok) throw new Error("IMAGE_PERSIST_FAILED");
      fileInput.value = ""; uploadMessage.hidden = true; uploadMessage.dataset.state = "success"; renderStepArticle(draft.steps.find((item) => item.id === step.id) || step);
    } catch (error) {
      uploadMessage.textContent = imageUploadError(error); uploadMessage.hidden = false; uploadMessage.dataset.state = "error";
    } finally { fileInput.value = ""; uploadButton.disabled = false; }
  });
  uploadPanel.append(uploadTitle, uploadHint, uploadButton, fileInput, uploadMessage); area.append(uploadPanel);
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
  if (!await persist("この端末に保存しました。保存の準備に進むか、編集に戻れます。")) {
    gateStatus.textContent = "保存に失敗したため、保存先へ進めません。編集内容を確認して、もう一度お試しください。";
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
  if (handoffProgressText) handoffProgressText.textContent = outputAction === "share" ? "共有の準備をしています。" : "ワークスペースへの保存を準備しています。";
  gateStatus.textContent = "保存先の準備画面を開いています。ログインが必要な場合は、表示された画面で続けてください。";
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
      gateStatus.textContent = "保存先を表示できませんでした。『保存の準備に進む』を押して準備し直してください。元の手順書はこの端末に残っています。";
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
