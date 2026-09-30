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

const TOOL_LABELS = { select: "選択", text: "文字", rectangle: "四角", ellipse: "丸", arrow: "矢印", mask: "黒塗り" };
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

export function createImageEditor({ dialog, canvas, screenshot, onSave, onCancel }) {
  const controller = new AbortController();
  const { signal } = controller;
  const status = dialog.querySelector("[data-editor-status]");
  const textInput = dialog.querySelector("[data-editor-text]");
  const fontSizeInput = dialog.querySelector("[data-editor-font-size]");
  const saveButton = dialog.querySelector("[data-editor-save]");
  const cancelButtons = [...dialog.querySelectorAll("[data-editor-cancel]")];
  const toolButtons = [...dialog.querySelectorAll("[data-editor-tool]")];
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
  let working = { annotations: [], masks: [] };

  function setStatus(message) { if (!disposed && status) status.textContent = message; }
  function isBusy() { return state === "loading" || state === "saving" || state === "error"; }
  function setControlsDisabled(disabled) {
    toolButtons.forEach((button) => { button.disabled = disabled; });
    if (textInput) textInput.disabled = disabled;
    if (fontSizeInput) fontSizeInput.disabled = disabled;
    selection.querySelectorAll("button").forEach((button) => { button.disabled = disabled; });
    if (saveButton) saveButton.disabled = disabled;
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
    if (drag.operation === "new-mask") {
      return { id: "preview-mask", x: Math.min(drag.start.x, drag.current.x), y: Math.min(drag.start.y, drag.current.y), width: Math.abs(drag.current.x - drag.start.x), height: Math.abs(drag.current.y - drag.start.y) };
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
    if (!image || disposed) return;
    const annotations = previewAnnotations(working.annotations); const masks = working.masks.slice(); const transient = previewItem();
    if (drag?.operation === "new" && transient && working.annotations.length < MAX_ANNOTATIONS) {
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
    try { drawScreenshot(context, image, { annotations, masks }); renderSelection(context); }
    catch { canvas.width = 1; canvas.height = 1; setStatus("画像の編集内容を読み込めませんでした。元の画像は変更されていません。キャンセルできます。"); }
  }

  function selectTool(next) {
    if (disposed || isBusy()) return;
    tool = next; toolButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.editorTool === next))); setStatus(`${TOOL_LABELS[next]}を選択中`);
  }
  function selectItem(kind, id) {
    selected = { kind, id }; const item = itemFor();
    if (textInput) textInput.value = item?.type === "text" ? item.text : "";
    if (fontSizeInput) fontSizeInput.value = item?.type === "text" ? String(item.fontSize) : "24";
  }
  function refreshSelection() {
    selection.replaceChildren();
    const entries = [...working.annotations.map((item, index) => ({ ...item, kind: "annotation", label: `${TOOL_LABELS[item.type]} ${index + 1}` })), ...working.masks.map((item, index) => ({ ...item, kind: "mask", label: `黒塗り ${index + 1}` }))];
    entries.forEach((entry) => {
      const row = document.createElement("div"); const choose = document.createElement("button"); choose.type = "button"; choose.textContent = entry.label; choose.setAttribute("aria-pressed", String(selected?.id === entry.id));
      choose.addEventListener("click", () => { if (isBusy()) return; selectItem(entry.kind, entry.id); refreshSelection(); redraw(); }, { signal });
      const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "削除"; remove.setAttribute("aria-label", `${entry.label}を削除`); remove.title = `${entry.label}を削除`; remove.dataset.editorDelete = entry.id;
      remove.addEventListener("click", () => { if (isBusy()) return; if (entry.kind === "annotation") working.annotations = working.annotations.filter((item) => item.id !== entry.id); else working.masks = working.masks.filter((item) => item.id !== entry.id); if (selected?.id === entry.id) selected = null; refreshSelection(); redraw(); }, { signal });
      row.append(choose, remove); selection.append(row);
    });
    setControlsDisabled(isBusy());
  }
  function createTextAt(point) {
    if (working.annotations.length >= MAX_ANNOTATIONS) { setStatus(`追加できる文字や図形は${MAX_ANNOTATIONS}件までです。`); return; }
    const width = 0.35; const height = 0.12; const annotation = normalizeAnnotation({ type: "text", x: clamp(point.x, 0, 1 - width), y: clamp(point.y, 0, 1 - height), width, height, text: textInput?.value || "文字を入力", color: "#087f7a", fontSize: 24 });
    if (!annotation) return; working.annotations.push(annotation); selectItem("annotation", annotation.id); refreshSelection(); redraw(); textInput?.focus();
  }
  function findTarget(point) {
    const mask = [...working.masks].reverse().find((candidate) => point.x >= candidate.x && point.x <= candidate.x + candidate.width && point.y >= candidate.y && point.y <= candidate.y + candidate.height);
    if (mask) return { targetKind: "mask", id: mask.id, original: { ...mask } };
    const annotation = [...working.annotations].reverse().find((candidate) => annotationAtPoint(candidate, point.x, point.y));
    return annotation ? { targetKind: "annotation", id: annotation.id, original: { ...annotation } } : null;
  }
  function handlePointerDown(event) {
    if (!image || state !== "editing") return;
    const start = pointerPoint(event, canvas); canvas.setPointerCapture?.(event.pointerId);
    if (tool === "text") { createTextAt(start); return; }
    if (tool === "mask" || ["rectangle", "ellipse", "arrow"].includes(tool)) { drag = { operation: tool === "mask" ? "new-mask" : "new", type: tool, start, current: start }; redraw(); return; }
    const target = findTarget(start); if (!target) return;
    selectItem(target.targetKind, target.id); const bounds = boundsFor(target.targetKind, target.original); const operation = isNearResizeHandle(start, bounds) ? "resize" : "move";
    // operation and targetKind are separate so a target cannot overwrite drag state.
    drag = { operation, targetKind: target.targetKind, targetId: target.id, original: target.original, start, current: start }; refreshSelection(); redraw();
  }
  function handlePointerMove(event) { if (!drag || !image || state !== "editing") return; drag.current = pointerPoint(event, canvas); redraw(); }
  function handlePointerUp(event) {
    if (!drag || !image || disposed) return;
    drag.current = pointerPoint(event, canvas); const currentDrag = drag; const preview = previewItem(); drag = null;
    if (currentDrag.operation === "new" && preview) {
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
    const item = itemFor(); if (item?.type !== "text") return;
    if (event?.isComposing) { item.text = textInput.value; redraw(); return; }
    const value = limitedText(textInput.value);
    if (value !== textInput.value) textInput.value = value;
    item.text = value;
    redraw();
  }
  function handleFontSizeInput() { if (isBusy()) return; const item = itemFor(); if (item?.type !== "text") return; const value = Number(fontSizeInput.value); if (!fontSizeInput.value.trim() || !Number.isFinite(value) || value < 10 || value > 96) return; item.fontSize = value; redraw(); }
  function handleKeydown(event) {
    if (state !== "editing" || event.target.closest("input, textarea, select")) return;
    if (event.key === "Delete" && selected) { if (selected.kind === "annotation") working.annotations = working.annotations.filter((item) => item.id !== selected.id); else working.masks = working.masks.filter((item) => item.id !== selected.id); selected = null; refreshSelection(); redraw(); return; }
    if (!selected || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault(); const deltaX = event.key === "ArrowLeft" ? -0.005 : event.key === "ArrowRight" ? 0.005 : 0; const deltaY = event.key === "ArrowUp" ? -0.005 : event.key === "ArrowDown" ? 0.005 : 0;
    if (selected.kind === "annotation") working.annotations = working.annotations.map((item) => item.id === selected.id ? moveAnnotation(item, deltaX, deltaY) : item); else working.masks = working.masks.map((item) => item.id === selected.id ? { ...item, x: clamp(item.x + deltaX, 0, 1 - item.width), y: clamp(item.y + deltaY, 0, 1 - item.height) } : item); redraw();
  }
  async function save() {
    if (disposed || state !== "editing" || !image) return;
    state = "saving"; setControlsDisabled(true); setStatus("画像を保存しています。");
    try {
      const annotations = cloneAnnotations(previewAnnotations(working.annotations)); if (annotations === null) throw new TypeError("invalid annotations");
      const masks = copyMasks(working.masks); const focusTarget = await onSave({ annotations, masks }); if (focusTarget === false) throw new Error("save failed");
      state = "closed"; dialog.close("save"); (focusTarget || restoreFocus)?.focus?.();
    } catch { state = "editing"; setControlsDisabled(false); refreshSelection(); setStatus("保存できませんでした。編集内容を保持したまま、もう一度保存してください。"); }
  }
  function cancel() { if (disposed || state === "saving") return; generation += 1; drag = null; state = "closed"; onCancel?.(); dialog.close("cancel"); restoreFocus?.focus?.(); }

  toolButtons.forEach((button) => button.addEventListener("click", () => selectTool(button.dataset.editorTool), { signal }));
  textInput?.addEventListener("input", handleTextInput, { signal }); textInput?.addEventListener("compositionend", handleTextInput, { signal }); fontSizeInput?.addEventListener("input", handleFontSizeInput, { signal });
  canvas.addEventListener("pointerdown", handlePointerDown, { signal }); canvas.addEventListener("pointermove", handlePointerMove, { signal }); canvas.addEventListener("pointerup", handlePointerUp, { signal }); canvas.addEventListener("pointercancel", handlePointerCancel, { signal });
  dialog.addEventListener("keydown", handleKeydown, { signal }); saveButton?.addEventListener("click", save, { signal }); cancelButtons.forEach((button) => button.addEventListener("click", cancel, { signal }));
  dialog.querySelector("form")?.addEventListener("submit", (event) => event.preventDefault(), { signal });
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); if (state !== "saving") cancel(); }, { signal });

  return {
    async open() {
      restoreFocus = document.activeElement; const currentGeneration = ++generation; state = "loading"; image = null; selected = null; drag = null;
      dialog.showModal();
      // Keep the dialog's scroll position stable on narrow screens. The
      // selection tool is useful immediately and is a real focus target even
      // while the image is still loading; preventScroll avoids jumping the
      // work area away from the image on mobile.
      const initialFocus = dialog.querySelector('[data-editor-tool="select"]') || dialog.querySelector("[data-editor-cancel]");
      initialFocus?.focus?.({ preventScroll: true });
      canvas.width = 1; canvas.height = 1; canvas.getContext("2d")?.clearRect(0, 0, 1, 1); selection.replaceChildren(); if (textInput) textInput.value = ""; if (fontSizeInput) fontSizeInput.value = "24";
      try {
        const cloned = cloneAnnotations(screenshot.annotations === undefined ? [] : screenshot.annotations);
        if (cloned === null) throw new TypeError("invalid annotations");
        working = { annotations: cloned, masks: copyMasks(screenshot.masks) }; setControlsDisabled(true); setStatus("画像を準備しています。");
        const loaded = new Image(); loaded.src = screenshot.dataUrl; if (typeof loaded.decode === "function") await loaded.decode(); if (disposed || currentGeneration !== generation) return false;
        image = loaded;
        // Validate source data before the first draw; invalid data must not reveal the raw image.
        drawScreenshot(canvas.getContext("2d"), image, { annotations: previewAnnotations(working.annotations), masks: working.masks });
        state = "editing"; setControlsDisabled(false); selectTool("select"); refreshSelection(); redraw(); setStatus("画像を編集できます。"); return true;
      } catch {
        if (disposed || currentGeneration !== generation) return false; image = null; state = "error"; setControlsDisabled(true); canvas.width = 1; canvas.height = 1; setStatus("画像を読み込めませんでした。元の画像は変更されていません。キャンセルできます。"); return false;
      }
    },
    dispose() { disposed = true; state = "closed"; generation += 1; controller.abort(); if (dialog.open) dialog.close(); }
  };
}
