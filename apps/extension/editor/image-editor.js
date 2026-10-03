import {
  annotationAtPoint,
  annotationBounds,
  cloneAnnotations,
  MAX_ANNOTATIONS,
  MAX_ANNOTATION_TEXT,
  moveAnnotation,
  normalizeAnnotation,
  resizeAnnotation
} from "./image-annotations.js";
import { drawScreenshot } from "./image-renderer.js";
import { createPersonalInfoValue, createSyntheticPerson, isSyntheticPersonalInfoValue, syntheticPersonForReplacementAnnotations, syntheticPersonIndex, SYNTHETIC_PEOPLE, PERSONAL_INFO_TYPES } from "./personal-info-replacement.js";

const TOOL_LABELS = { select: "選択", text: "文字", rectangle: "四角", ellipse: "丸", arrow: "矢印", mask: "黒塗り", crop: "切り抜き", replacement: "個人情報置換" };
const REPLACEMENT_LABELS = { name: "氏名", kana: "カナ", phone: "電話", email: "メール", postal: "郵便", address: "住所" };
const MIN_DRAG_SIZE = 0.01;
const HANDLE_SIZE = 0.045;
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

function pointerPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return { x: clamp((event.clientX - rect.left) / Math.max(1, rect.width)), y: clamp((event.clientY - rect.top) / Math.max(1, rect.height)) };
}

function copyMasks(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError("invalid masks");
  return value.map((mask) => {
    if (!mask || typeof mask !== "object" || Array.isArray(mask)) throw new TypeError("invalid mask");
    const { x, y, width, height } = mask;
    if (![x, y, width, height].every((item) => typeof item === "number" && Number.isFinite(item)) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) throw new TypeError("invalid mask");
    return { ...mask, x, y, width, height };
  });
}

function previewAnnotations(annotations) {
  // 空の文字は編集中だけ許可し、shared rendererへは渡さない。
  return annotations.filter((item) => item.type !== "text" || item.text.length > 0);
}
function limitedText(value) { return Array.from(value).slice(0, MAX_ANNOTATION_TEXT).join(""); }

function boundsFor(kind, item) { return kind === "annotation" ? annotationBounds(item) : item; }
function isNearResizeHandle(point, bounds) { return point.x >= bounds.x + bounds.width - HANDLE_SIZE && point.y >= bounds.y + bounds.height - HANDLE_SIZE; }
function resizeMask(mask, point) { return { ...mask, width: clamp(point.x - mask.x, 0.001, 1 - mask.x), height: clamp(point.y - mask.y, 0.001, 1 - mask.y) }; }

// Review outlines refer to the current output bitmap, never the uncropped source.
export function cropReviewRegions(review, crop) {
  if (!crop || ![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0 || crop.x + crop.width > 1 || crop.y + crop.height > 1) throw new TypeError("invalid crop");
  if (!review || typeof review !== "object") return undefined;
  const next = structuredClone(review);
  if (!Array.isArray(review.replacements)) return next;
  next.replacements = review.replacements.flatMap((region) => {
    if (![region?.x, region?.y, region?.width, region?.height].every(Number.isFinite)) return [];
    const left = Math.max(region.x, crop.x), top = Math.max(region.y, crop.y);
    const right = Math.min(region.x + region.width, crop.x + crop.width), bottom = Math.min(region.y + region.height, crop.y + crop.height);
    if (right <= left || bottom <= top) return [];
    return [{ ...region, x: clamp((left - crop.x) / crop.width), y: clamp((top - crop.y) / crop.height), width: clamp((right - left) / crop.width), height: clamp((bottom - top) / crop.height) }];
  });
  next.replacementCount = next.replacements.length;
  return next;
}

export function createImageEditor({ dialog, canvas, screenshot, onSave, onCancel, onClose, onStateChange, inline = false, initialTool = "select", syntheticPerson: providedSyntheticPerson = null }) {
  const controller = new AbortController();
  const { signal } = controller;
  const status = dialog.querySelector("[data-editor-status]");
  const textInput = dialog.querySelector("[data-editor-text]");
  const colorInput = dialog.querySelector("[data-editor-color]");
  const colorHexInput = dialog.querySelector("[data-editor-color-hex]");
  const propertyGroup = dialog.querySelector(".property-group");
  const fontSizeInput = dialog.querySelector("[data-editor-font-size]");
  let replacementTypeInput = dialog.querySelector("[data-editor-replacement-type]");
  const saveButton = dialog.querySelector("[data-editor-save]");
  const cancelButtons = [...dialog.querySelectorAll("[data-editor-cancel]")];
  let toolButtons = [...dialog.querySelectorAll("[data-editor-tool]")];
  if (!dialog.querySelector('[data-editor-tool="replacement"]')) {
    const button = document.createElement("button"); button.type = "button"; button.dataset.editorTool = "replacement"; button.setAttribute("aria-pressed", "false"); button.setAttribute("aria-label", "個人情報を置き換える"); button.title = "個人情報を置き換える"; button.textContent = "個人情報";
    const group = document.createElement("div"); group.className = "tool-grid"; group.setAttribute("aria-label", "個人情報の編集"); group.append(button);
    dialog.querySelector(".tool-group")?.append(group);
    toolButtons = [...dialog.querySelectorAll("[data-editor-tool]")];
  }
  if (!replacementTypeInput) {
    replacementTypeInput = document.createElement("select"); replacementTypeInput.dataset.editorReplacementType = "";
    for (const type of PERSONAL_INFO_TYPES) { const option = document.createElement("option"); option.value = type; option.textContent = REPLACEMENT_LABELS[type]; replacementTypeInput.append(option); }
    const label = document.createElement("label"); label.dataset.replacementProperty = ""; label.textContent = "置き換える種別"; label.append(replacementTypeInput); propertyGroup?.append(label);
  }
  let replacementPersonInput = dialog.querySelector("[data-editor-replacement-person]");
  if (!replacementPersonInput) {
    replacementPersonInput = document.createElement("select"); replacementPersonInput.dataset.editorReplacementPerson = "";
    SYNTHETIC_PEOPLE.forEach((person, index) => { const option = document.createElement("option"); option.value = String(index); option.textContent = `${person.name}（${person.kana}）`; replacementPersonInput.append(option); });
    const label = document.createElement("label"); label.dataset.replacementProperty = ""; label.textContent = "架空人物"; label.append(replacementPersonInput); propertyGroup?.append(label);
  }
  const replacementAddButton = document.createElement("button"); replacementAddButton.type = "button"; replacementAddButton.className = "secondary"; replacementAddButton.dataset.replacementAction = "add"; replacementAddButton.textContent = "範囲を追加"; replacementAddButton.setAttribute("aria-describedby", "replacementKeyboardHelp");
  const replacementKeyboardHelp = document.createElement("p"); replacementKeyboardHelp.id = "replacementKeyboardHelp"; replacementKeyboardHelp.className = "editor-help"; replacementKeyboardHelp.dataset.replacementAction = "help"; replacementKeyboardHelp.textContent = "範囲を追加後、選択した範囲を矢印キーで移動できます。元の画像の文字は表示せず、選んだ種別の架空値を表示します。";
  replacementKeyboardHelp.textContent += "画像に焼き込まれた架空人物は自動判定できないため、見えている氏名・カナに合う架空人物を選んでください。";
  propertyGroup?.append(replacementAddButton, replacementKeyboardHelp);
  const errorPanel = document.createElement("div"); errorPanel.className = "image-editor-error"; errorPanel.hidden = true;
  const errorText = document.createElement("p"); errorText.textContent = "画像を表示できませんでした。元の画像は保持しています。";
  const retryImage = document.createElement("button"); retryImage.type = "button"; retryImage.textContent = "画像をもう一度読み込む"; retryImage.dataset.editorRetry = "true";
  errorPanel.append(errorText, retryImage); canvas.parentElement?.append(errorPanel);
  const selection = dialog.querySelector("[data-editor-selection]") || (() => {
    const list = document.createElement("div");
    list.dataset.editorSelection = "";
    dialog.querySelector(".image-editor-tools")?.append(list);
    return list;
  })();
  let state = "idle";
  let disposed = false;
  let image = null;
  let tool = "select";
  let selected = null;
  let drag = null;
  let generation = 0;
  let restoreFocus = null;
  let loadingFocusTarget = null;
  let focusMovedDuringLoad = false;
  let working = { annotations: [], masks: [] };
  let syntheticPerson = providedSyntheticPerson && typeof providedSyntheticPerson === "object"
    ? { name: String(providedSyntheticPerson.name || ""), kana: String(providedSyntheticPerson.kana || "") }
    : syntheticPersonForReplacementAnnotations(screenshot.annotations, createSyntheticPerson());
  let crop = null;
  const undo = [], redo = [];
  let editGroup = null;
  const historyValue = () => structuredClone({ working, crop });
  function remember(group = null) { if (!group || editGroup !== group) { undo.push(historyValue()); if (undo.length > 60) undo.shift(); } editGroup = group; redo.length = 0; }
  function restoreHistory(from, to) { if (!from.length || state !== "editing") return; to.push(historyValue()); const value = from.pop(); working = value.working; crop = value.crop; selected = null; editGroup = null; refreshSelection(); redraw(); }
  function closeEditor(reason) { dialog.close(reason); onClose?.(reason); }

  function setStatus(message) { if (!disposed && status) status.textContent = message; }
  function showImageError() { state = "error"; onStateChange?.("error"); setControlsDisabled(true); canvas.hidden = true; errorPanel.hidden = false; }
  function isBusy() { return state === "loading" || state === "saving" || state === "error"; }
  function setControlsDisabled(disabled) {
    toolButtons.forEach((button) => { button.disabled = disabled; });
    if (textInput) textInput.disabled = disabled;
    if (fontSizeInput) fontSizeInput.disabled = disabled;
    if (replacementTypeInput) replacementTypeInput.disabled = disabled;
    if (replacementPersonInput) replacementPersonInput.disabled = disabled;
    if (colorInput) colorInput.disabled = disabled;
    if (colorHexInput) colorHexInput.disabled = disabled;
    selection.querySelectorAll("button").forEach((button) => { button.disabled = disabled; });
    if (saveButton) saveButton.disabled = disabled;
  }
  function alignReplacementAnnotations(knownOnly = false) {
    working.annotations = working.annotations.map((item) => {
      if (item.type !== "replacement" || !["name", "kana"].includes(item.category)) return item;
      if (knownOnly && !isSyntheticPersonalInfoValue(item.category, item.text)) return item;
      return { ...item, text: createPersonalInfoValue(item.category, syntheticPerson) };
    });
  }
  function setSyntheticPerson(index, knownOnly = false) {
    const person = SYNTHETIC_PEOPLE[index];
    if (!person) return;
    syntheticPerson = { ...person };
    if (replacementPersonInput) replacementPersonInput.value = String(index);
    alignReplacementAnnotations(knownOnly);
  }
  function itemFor(selectionValue = selected) {
    if (!selectionValue) return null;
    const list = selectionValue.kind === "annotation" ? working.annotations : working.masks;
    return list.find((item) => item.id === selectionValue.id) || null;
  }
  function previewItem() {
    if (!drag) return null;
    if (drag.operation === "new") {
      const x = Math.min(drag.start.x, drag.current.x); const y = Math.min(drag.start.y, drag.current.y);
      const width = Math.abs(drag.current.x - drag.start.x); const height = Math.abs(drag.current.y - drag.start.y);
      if (drag.type === "arrow") return { type: "arrow", x1: drag.start.x, y1: drag.start.y, x2: drag.current.x, y2: drag.current.y, color: "#087f7a", strokeWidth: 3 };
      return { type: drag.type, x, y, width, height, color: "#087f7a", strokeWidth: 3 };
    }
    if (drag.operation === "new-mask" || drag.operation === "crop") {
      return { id: "preview-mask", x: Math.min(drag.start.x, drag.current.x), y: Math.min(drag.start.y, drag.current.y), width: Math.abs(drag.current.x - drag.start.x), height: Math.abs(drag.current.y - drag.start.y) };
    }
    if (drag.operation === "new-replacement") {
      return { type: "replacement", category: replacementTypeInput?.value || "name", text: drag.text, x: Math.min(drag.start.x, drag.current.x), y: Math.min(drag.start.y, drag.current.y), width: Math.abs(drag.current.x - drag.start.x), height: Math.abs(drag.current.y - drag.start.y), color: "#111827", fontSize: 24 };
    }
    if (drag.operation === "move") {
      const dx = drag.current.x - drag.start.x; const dy = drag.current.y - drag.start.y;
      return drag.targetKind === "annotation" ? moveAnnotation(drag.original, dx, dy) : { ...drag.original, x: clamp(drag.original.x + dx, 0, 1 - drag.original.width), y: clamp(drag.original.y + dy, 0, 1 - drag.original.height) };
    }
    if (drag.operation === "resize") {
      const bounds = boundsFor(drag.targetKind, drag.original);
      return drag.targetKind === "annotation" ? resizeAnnotation(drag.original, clamp(drag.current.x - bounds.x, 0.001, 1 - bounds.x), clamp(drag.current.y - bounds.y, 0.001, 1 - bounds.y)) : resizeMask(drag.original, drag.current);
    }
    return null;
  }

  function renderSelection(context) {
    const item = previewItem() || itemFor();
    const selectedKind = drag?.targetKind || selected?.kind;
    if (!item || !selectedKind) return;
    const bounds = boundsFor(selectedKind, item); const x = bounds.x * image.width; const y = bounds.y * image.height; const width = bounds.width * image.width; const height = bounds.height * image.height;
    context.save(); context.strokeStyle = "#2563eb"; context.fillStyle = "#ffffff"; context.lineWidth = 2; context.setLineDash([6, 4]); context.strokeRect(x - 5, y - 5, Math.max(10, width + 10), Math.max(10, height + 10)); context.setLineDash([]); context.fillRect(x + width - 6, y + height - 6, 12, 12); context.strokeRect(x + width - 6, y + height - 6, 12, 12); context.restore();
  }

  function redraw() {
    if (!image || disposed) return false;
    const annotations = previewAnnotations(working.annotations); const masks = working.masks.slice(); const transient = previewItem();
    if (["new", "new-replacement"].includes(drag?.operation) && transient && working.annotations.length < MAX_ANNOTATIONS) {
      const normalized = normalizeAnnotation(transient);
      if (normalized) annotations.push(normalized);
    }
    if (["move", "resize"].includes(drag?.operation) && transient) {
      if (drag.targetKind === "annotation") {
        const index = annotations.findIndex((item) => item.id === drag.targetId);
        if (index >= 0) annotations[index] = transient;
      } else {
        const index = masks.findIndex((item) => item.id === drag.targetId);
        if (index >= 0) masks[index] = transient;
      }
    }
    if (drag?.operation === "new-mask" && transient && transient.width > 0 && transient.height > 0) masks.push(transient);
    const context = canvas.getContext("2d");
    try {
      drawScreenshot(context, image, { annotations, masks }); renderSelection(context);
      const frame = drag?.operation === "crop" ? transient : crop;
      if (frame) { const x = frame.x * image.width, y = frame.y * image.height, w = frame.width * image.width, h = frame.height * image.height; context.save(); context.fillStyle = "#19303966"; context.fillRect(0, 0, image.width, y); context.fillRect(0, y + h, image.width, image.height - y - h); context.fillRect(0, y, x, h); context.fillRect(x + w, y, image.width - x - w, h); context.strokeStyle = "#087f7a"; context.lineWidth = 3; context.strokeRect(x, y, w, h); context.restore(); }
      errorPanel.hidden = true; canvas.hidden = false; return true;
    }
    catch { showImageError(); setStatus("画像の編集内容を確認できません。キャンセルすると元の画像へ戻れます。"); return false; }
  }

  function selectTool(next) {
    if (disposed || isBusy()) return;
    editGroup = null; tool = next; toolButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.editorTool === next))); setStatus(`${TOOL_LABELS[next]}を選択中`); refreshSelection();
    if (next === "replacement") replacementAddButton.focus({ preventScroll: true });
  }
  function selectItem(kind, id) {
    selected = { kind, id }; const item = itemFor();
    if (textInput) textInput.value = item?.type === "text" ? item.text : "";
    if (fontSizeInput) fontSizeInput.value = item?.type === "text" ? String(item.fontSize) : "24";
    if (colorInput) colorInput.value = item?.color || "#087f7a";
    if (colorHexInput) { colorHexInput.value = item?.color || "#087f7a"; colorHexInput.removeAttribute("aria-invalid"); }
    if (replacementTypeInput) replacementTypeInput.value = item?.type === "replacement" ? item.category : "name";
    if (replacementPersonInput) replacementPersonInput.value = String(Math.max(0, syntheticPersonIndex(syntheticPerson)));
  }
  function refreshSelection() {
    const current = itemFor();
    if (colorHexInput && !current) { colorHexInput.value = "#087f7a"; colorHexInput.removeAttribute("aria-invalid"); }
    if (propertyGroup) propertyGroup.hidden = (!current || selected?.kind !== "annotation") && tool !== "replacement";
    dialog.querySelectorAll("[data-text-property]").forEach((node) => { node.hidden = current?.type !== "text"; });
    dialog.querySelectorAll("[data-replacement-property]").forEach((node) => { node.hidden = current?.type !== "replacement" && tool !== "replacement"; });
    dialog.querySelectorAll("[data-replacement-action]").forEach((node) => { node.hidden = tool !== "replacement"; });
    dialog.querySelectorAll("[data-color-property]").forEach((node) => { node.hidden = selected?.kind !== "annotation" || tool === "replacement"; });
    if (colorInput && current?.color) colorInput.value = current.color;
    if (colorHexInput && current?.color && document.activeElement !== colorHexInput) { colorHexInput.value = current.color; colorHexInput.removeAttribute("aria-invalid"); }
    const colorLabel = dialog.querySelector("[data-color-label]"); if(colorLabel)colorLabel.textContent=current?.type==="text"?"文字の色":current?.type==="arrow"?"矢印の色":"枠線の色";
    selection.replaceChildren();
    const entries = [...working.annotations.map((item, index) => ({ ...item, kind: "annotation", label: `${TOOL_LABELS[item.type]}${item.type === "replacement" ? `（${REPLACEMENT_LABELS[item.category] || "個人情報"}）` : ""} ${index + 1}` })), ...working.masks.map((item, index) => ({ ...item, kind: "mask", label: `黒塗り ${index + 1}` }))];
    entries.forEach((entry) => {
      const row = document.createElement("div"); const choose = document.createElement("button"); choose.type = "button"; choose.textContent = entry.label; choose.setAttribute("aria-pressed", String(selected?.id === entry.id));
      choose.addEventListener("click", () => { if (isBusy()) return; selectItem(entry.kind, entry.id); refreshSelection(); redraw(); }, { signal });
      const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "削除"; remove.setAttribute("aria-label", `${entry.label}を削除`); remove.title = `${entry.label}を削除`; remove.dataset.editorDelete = entry.id;
      remove.addEventListener("click", () => { if (isBusy()) return; remember(); if (entry.kind === "annotation") working.annotations = working.annotations.filter((item) => item.id !== entry.id); else working.masks = working.masks.filter((item) => item.id !== entry.id); if (selected?.id === entry.id) selected = null; refreshSelection(); redraw(); }, { signal });
      row.append(choose, remove); selection.append(row);
    });
    setControlsDisabled(isBusy());
  }
  function createTextAt(point) {
    if (working.annotations.length >= MAX_ANNOTATIONS) { setStatus(`追加できる文字や図形は${MAX_ANNOTATIONS}件までです。`); return; }
    const width = 0.35; const height = 0.12; const annotation = normalizeAnnotation({ type: "text", x: clamp(point.x, 0, 1 - width), y: clamp(point.y, 0, 1 - height), width, height, text: textInput?.value || "文字を入力", color: "#087f7a", fontSize: 24 });
    if (!annotation) return; working.annotations.push(annotation); selectItem("annotation", annotation.id); refreshSelection(); redraw(); textInput?.focus();
  }
  function createReplacementAt(point, region = {}) {
    if (working.annotations.length >= MAX_ANNOTATIONS) { setStatus(`追加できる要素は${MAX_ANNOTATIONS}件までです。`); return; }
    const category = replacementTypeInput?.value || "name";
    const width = clamp(region.width || 0.28, MIN_DRAG_SIZE, 1); const height = clamp(region.height || 0.1, MIN_DRAG_SIZE, 1);
    const replacement = normalizeAnnotation({ type: "replacement", category, x: clamp(region.x ?? point.x, 0, 1 - width), y: clamp(region.y ?? point.y, 0, 1 - height), width, height, text: createPersonalInfoValue(category, syntheticPerson), color: "#111827", fontSize: 24 });
    if (!replacement) return;
    working.annotations.push(replacement); selectItem("annotation", replacement.id); refreshSelection(); redraw();
  }
  function addKeyboardReplacement() {
    if (isBusy() || tool !== "replacement") return;
    remember("replacement:add");
    createReplacementAt({ x: 0.36, y: 0.42 }, { x: 0.36, y: 0.42, width: 0.28, height: 0.12 });
    replacementAddButton.focus({ preventScroll: true });
    setStatus("置換範囲を追加しました。矢印キーで移動し、適用または取消を選べます。");
  }
  function findTarget(point) {
    const mask = [...working.masks].reverse().find((candidate) => point.x >= candidate.x && point.x <= candidate.x + candidate.width && point.y >= candidate.y && point.y <= candidate.y + candidate.height);
    if (mask) return { targetKind: "mask", id: mask.id, original: { ...mask } };
    const annotation = [...working.annotations].reverse().find((candidate) => annotationAtPoint(candidate, point.x, point.y));
    return annotation ? { targetKind: "annotation", id: annotation.id, original: { ...annotation } } : null;
  }
  function handlePointerDown(event) {
    if (!image || state !== "editing") return;
    remember(); const start = pointerPoint(event, canvas); canvas.setPointerCapture?.(event.pointerId);
    if (tool === "text") { createTextAt(start); return; }
    if (tool === "replacement") { drag = { operation: "new-replacement", start, current: start, text: createPersonalInfoValue(replacementTypeInput?.value || "name", syntheticPerson) }; redraw(); return; }
    if (tool === "crop" || tool === "mask" || ["rectangle", "ellipse", "arrow"].includes(tool)) { drag = { operation: tool === "crop" ? "crop" : tool === "mask" ? "new-mask" : "new", type: tool, start, current: start }; redraw(); return; }
    const target = findTarget(start); if (!target) return;
    selectItem(target.targetKind, target.id); const bounds = boundsFor(target.targetKind, target.original); const operation = isNearResizeHandle(start, bounds) ? "resize" : "move";
    // operation and targetKind are separate so a target cannot overwrite drag state.
    drag = { operation, targetKind: target.targetKind, targetId: target.id, original: target.original, start, current: start }; refreshSelection(); redraw();
  }
  function handlePointerMove(event) { if (!drag || !image || state !== "editing") return; drag.current = pointerPoint(event, canvas); redraw(); }
  function handlePointerUp(event) {
    if (!drag || !image || disposed) return;
    drag.current = pointerPoint(event, canvas); const currentDrag = drag; const preview = previewItem(); drag = null;
    if (currentDrag.operation === "crop" && preview?.width > MIN_DRAG_SIZE && preview.height > MIN_DRAG_SIZE) { crop = preview; setStatus("切り抜く範囲を選択しました。変更を適用すると出力画像も切り抜かれます。");
    } else if (currentDrag.operation === "new-replacement" && preview) {
      createReplacementAt(currentDrag.start, { x: preview.x, y: preview.y, width: preview.width > MIN_DRAG_SIZE ? preview.width : 0.28, height: preview.height > MIN_DRAG_SIZE ? preview.height : 0.1 });
    } else if (currentDrag.operation === "new" && preview) {
      const drawable = currentDrag.type === "arrow" ? Math.hypot(currentDrag.current.x - currentDrag.start.x, currentDrag.current.y - currentDrag.start.y) > MIN_DRAG_SIZE : preview.width > MIN_DRAG_SIZE && preview.height > MIN_DRAG_SIZE;
      const annotation = drawable ? normalizeAnnotation(preview) : null;
      if (annotation && working.annotations.length < MAX_ANNOTATIONS) { working.annotations.push(annotation); selectItem("annotation", annotation.id); } else if (working.annotations.length >= MAX_ANNOTATIONS) setStatus(`追加できる文字や図形は${MAX_ANNOTATIONS}件までです。`);
    } else if (currentDrag.operation === "new-mask" && preview?.width > MIN_DRAG_SIZE && preview.height > MIN_DRAG_SIZE) {
      const mask = { ...preview, id: crypto.randomUUID() }; working.masks.push(mask); selectItem("mask", mask.id);
    } else if (["move", "resize"].includes(currentDrag.operation) && preview) {
      if (currentDrag.targetKind === "annotation") working.annotations = working.annotations.map((item) => item.id === currentDrag.targetId ? preview : item); else working.masks = working.masks.map((item) => item.id === currentDrag.targetId ? preview : item);
    }
    refreshSelection(); redraw();
  }
  function handlePointerCancel() { if (!drag) return; drag = null; redraw(); }
  function handleTextInput(event) {
    if (isBusy()) return;
    const item = itemFor(); if (item?.type !== "text") return; remember(`text:${item.id}`);
    if (event?.isComposing) { item.text = textInput.value; redraw(); return; }
    const value = limitedText(textInput.value);
    if (value !== textInput.value) textInput.value = value;
    item.text = value;
    redraw();
  }
  function handleFontSizeInput() { if (isBusy()) return; const item = itemFor(); if (item?.type !== "text") return; const value = Number(fontSizeInput.value); if (!fontSizeInput.value.trim() || !Number.isFinite(value) || value < 10 || value > 96) return; remember(`font:${item.id}`); item.fontSize = value; redraw(); }
  function handleReplacementTypeInput() {
    if (isBusy()) return;
    const item = itemFor();
    if (item?.type !== "replacement" || !PERSONAL_INFO_TYPES.includes(replacementTypeInput?.value)) return;
    remember(`replacement:${item.id}`); item.category = replacementTypeInput.value; item.text = createPersonalInfoValue(item.category, syntheticPerson); refreshSelection(); redraw();
  }
  function handleReplacementPersonInput() {
    if (isBusy()) return;
    const index = Number(replacementPersonInput?.value);
    if (!Number.isInteger(index) || !SYNTHETIC_PEOPLE[index]) return;
    remember("replacement:person"); setSyntheticPerson(index); refreshSelection(); redraw();
    setStatus(`架空人物を${SYNTHETIC_PEOPLE[index].name}（${SYNTHETIC_PEOPLE[index].kana}）に変更しました。`);
  }
  function handleKeydown(event) {
    if (event.key === "Escape" && inline) { event.preventDefault(); if (state !== "saving") cancel(); return; }
    if (state !== "editing") return;
    if (event.key === "Enter" && tool === "replacement" && !selected && !event.target.closest("input, textarea, select, button")) { event.preventDefault(); addKeyboardReplacement(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.stopPropagation(); restoreHistory(event.shiftKey ? redo : undo, event.shiftKey ? undo : redo); return; }
    if (event.target.closest("input, textarea, select")) return;
    if (event.key === "Delete" && selected) { remember(); if (selected.kind === "annotation") working.annotations = working.annotations.filter((item) => item.id !== selected.id); else working.masks = working.masks.filter((item) => item.id !== selected.id); selected = null; refreshSelection(); redraw(); return; }
    if (!selected || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault(); remember(); const deltaX = event.key === "ArrowLeft" ? -0.005 : event.key === "ArrowRight" ? 0.005 : 0; const deltaY = event.key === "ArrowUp" ? -0.005 : event.key === "ArrowDown" ? 0.005 : 0;
    if (selected.kind === "annotation") working.annotations = working.annotations.map((item) => item.id === selected.id ? moveAnnotation(item, deltaX, deltaY) : item); else working.masks = working.masks.map((item) => item.id === selected.id ? { ...item, x: clamp(item.x + deltaX, 0, 1 - item.width), y: clamp(item.y + deltaY, 0, 1 - item.height) } : item); redraw();
  }
  async function save() {
    if (disposed || state !== "editing" || !image) return;
    if(colorHexInput?.getAttribute("aria-invalid")==="true"){setStatus("色のカラーコードを確認してから適用してください。");colorHexInput.focus();return;}
    state = "saving"; onStateChange?.("saving"); setControlsDisabled(true); setStatus("画像を保存しています。");
    try {
      const annotations = cloneAnnotations(previewAnnotations(working.annotations)); if (annotations === null) throw new TypeError("invalid annotations");
      const masks = copyMasks(working.masks);
      let output = { annotations, masks };
      if (crop) {
        const full = document.createElement("canvas"); drawScreenshot(full.getContext("2d"), image, output);
        const clipped = document.createElement("canvas");
        const left = Math.floor(crop.x * image.width), top = Math.floor(crop.y * image.height);
        clipped.width = Math.max(1, Math.floor(crop.width * image.width)); clipped.height = Math.max(1, Math.floor(crop.height * image.height));
        clipped.getContext("2d").drawImage(full, left, top, clipped.width, clipped.height, 0, 0, clipped.width, clipped.height);
        const dataUrl = clipped.toDataURL("image/png");
        if (Math.floor(dataUrl.slice(dataUrl.indexOf(",") + 1).length * 3 / 4) > 10 * 1024 * 1024) throw new RangeError("IMAGE_OUTPUT_TOO_LARGE");
        output = { annotations: [], masks: [], dataUrl, ...(screenshot.privacyReview ? { privacyReview: cropReviewRegions(screenshot.privacyReview, crop) } : {}) };
      }
      const focusTarget = await onSave(output); if (focusTarget === false) throw new Error("save failed");
      state = "closed"; onStateChange?.("closed"); closeEditor("save"); (focusTarget || restoreFocus)?.focus?.();
    } catch { state = "editing"; onStateChange?.("editing"); setControlsDisabled(false); refreshSelection(); setStatus("保存できませんでした。編集内容を保持したまま、もう一度保存してください。"); }
  }
  function cancel() { if (disposed || state === "saving") return; generation += 1; drag = null; state = "closed"; onStateChange?.("closed"); onCancel?.(); closeEditor("cancel"); restoreFocus?.focus?.(); }

  toolButtons.forEach((button) => button.addEventListener("click", () => selectTool(button.dataset.editorTool), { signal }));
  function applyColor(value) { const item = itemFor(); if (isBusy() || !item || selected?.kind !== "annotation" || !/^#[\da-f]{6}$/i.test(value)) return; remember(`color:${item.id}`); item.color = value.toLowerCase(); if(colorInput)colorInput.value=item.color; redraw(); }
  colorInput?.addEventListener("input", () => { applyColor(colorInput.value); if(colorHexInput){colorHexInput.value=colorInput.value;colorHexInput.removeAttribute("aria-invalid");} }, { signal });
  colorHexInput?.addEventListener("input", () => { const valid=/^#[\da-f]{6}$/i.test(colorHexInput.value);colorHexInput.setAttribute("aria-invalid",String(!valid));if(valid)applyColor(colorHexInput.value);else setStatus("色は # と6桁のカラーコードで入力してください。最後に確認できた色を保持しています。"); }, { signal });
  textInput?.addEventListener("input", handleTextInput, { signal }); textInput?.addEventListener("compositionend", handleTextInput, { signal }); fontSizeInput?.addEventListener("input", handleFontSizeInput, { signal }); replacementTypeInput?.addEventListener("change", handleReplacementTypeInput, { signal }); replacementPersonInput?.addEventListener("change", handleReplacementPersonInput, { signal });
  replacementAddButton.addEventListener("click", addKeyboardReplacement, { signal });
  canvas.addEventListener("pointerdown", handlePointerDown, { signal }); canvas.addEventListener("pointermove", handlePointerMove, { signal }); canvas.addEventListener("pointerup", handlePointerUp, { signal }); canvas.addEventListener("pointercancel", handlePointerCancel, { signal });
  dialog.addEventListener("keydown", handleKeydown, { signal }); saveButton?.addEventListener("click", save, { signal }); cancelButtons.forEach((button) => button.addEventListener("click", cancel, { signal }));
  dialog.querySelector("form")?.addEventListener("submit", (event) => event.preventDefault(), { signal });
  dialog.addEventListener("focusin", (event) => {
    if (state === "loading" && loadingFocusTarget && event.target !== loadingFocusTarget) focusMovedDuringLoad = true;
  }, { signal });
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); if (state !== "saving") cancel(); }, { signal });

  const api = {
    async open({ preserveWorking = false } = {}) {
      restoreFocus = document.activeElement; const currentGeneration = ++generation; state = "loading"; onStateChange?.("loading"); image = null; selected = null; drag = null; focusMovedDuringLoad = false;
      if (!dialog.open) { if (inline) dialog.show(); else dialog.showModal(); }
      errorPanel.hidden = true; canvas.hidden = false;
      canvas.width = 1; canvas.height = 1; canvas.getContext("2d")?.clearRect(0, 0, 1, 1); selection.replaceChildren(); if (textInput) textInput.value = ""; if (fontSizeInput) fontSizeInput.value = "24";
      setControlsDisabled(true);
      // Loading disables the editing tools, so keep focus on an enabled
      // cancel action. Once decoding finishes, focus can move to the tool
      // without stealing a control the user reached while waiting.
      loadingFocusTarget = dialog.querySelector("[data-editor-cancel]");
      loadingFocusTarget?.focus?.({ preventScroll: true });
      try {
        const cloned = cloneAnnotations(screenshot.annotations === undefined ? [] : screenshot.annotations);
        if (cloned === null) throw new TypeError("invalid annotations");
        if (!preserveWorking) { working = { annotations: cloned, masks: copyMasks(screenshot.masks) }; setSyntheticPerson(syntheticPersonIndex(syntheticPerson), true); } setStatus("画像を準備しています。");
        const loaded = new Image(); loaded.src = screenshot.dataUrl; if (typeof loaded.decode === "function") await loaded.decode(); if (disposed || currentGeneration !== generation) return false;
        image = loaded;
        if (!image.width || !image.height || image.width > 12_000 || image.height > 12_000 || image.width * image.height > 40_000_000) throw new RangeError("IMAGE_PIXELS_TOO_LARGE");
        // Validate source data before the first draw; invalid data must not reveal the raw image.
        drawScreenshot(canvas.getContext("2d"), image, { annotations: previewAnnotations(working.annotations), masks: working.masks });
        state = "editing"; onStateChange?.("editing"); setControlsDisabled(false); selectTool(initialTool); refreshSelection(); if (!redraw()) return false;
        if (!focusMovedDuringLoad && document.activeElement === loadingFocusTarget) dialog.querySelector('[data-editor-tool="select"]')?.focus?.({ preventScroll: true });
        loadingFocusTarget = null; setStatus("画像を編集できます。"); return true;
      } catch {
        if (disposed || currentGeneration !== generation) return false; image = null; showImageError(); canvas.width = 1; canvas.height = 1; if (!dialog.contains(document.activeElement) || document.activeElement === document.body) loadingFocusTarget?.focus?.({ preventScroll: true }); loadingFocusTarget = null; setStatus("画像を読み込めませんでした。元の画像は変更されていません。キャンセルできます。"); return false;
      }
    },
    dispose() { disposed = true; state = "closed"; onStateChange?.("closed"); generation += 1; controller.abort(); errorPanel.remove(); if (dialog.open) closeEditor("dispose"); }
  };
  retryImage.addEventListener("click", () => { if (!disposed && state === "error") void api.open({ preserveWorking: true }); }, { signal });
  return api;
}
