export async function captureWithMaskBoundary({ applyMasks, capture, removeMasks }) {
  let maskingAttempted = false;
  try {
    maskingAttempted = true;
    const result = await applyMasks();
    if (!result?.applied) throw new Error("SCREENSHOT_MASK_FAILED");
    const image = await capture();
    if (typeof image !== "string" || !image.startsWith("data:image/")) throw new Error("SCREENSHOT_CAPTURE_FAILED");
    return image;
  } finally {
    if (maskingAttempted) await removeMasks().catch(() => undefined);
  }
}

export function installSensitiveMasks() {
  if (globalThis.__mecchaManualScreenshotMasks) return { applied: true, count: globalThis.__mecchaManualScreenshotMasks.length };
  const overlays = [];
  try {
    const selector = [
      "input",
      "textarea",
      "select",
      "[contenteditable]:not([contenteditable=\"false\"])",
      "[role=\"textbox\"]",
      "[role=\"combobox\"]",
      "[role=\"spinbutton\"]",
      "[aria-valuetext]",
      "iframe"
    ].join(",");
    const roots = [document];
    const elements = [];
    for (let index = 0; index < roots.length; index += 1) {
      const root = roots[index];
      elements.push(...root.querySelectorAll(selector));
      for (const host of root.querySelectorAll("*")) {
        if (host.shadowRoot) roots.push(host.shadowRoot);
        else if (host.localName.includes("-") && !host.matches(selector)) elements.push(host);
      }
    }
    for (const element of new Set(elements)) {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) continue;
      const overlay = document.createElement("div");
      overlay.dataset.mecchaManualMask = "true";
      Object.assign(overlay.style, {
        position: "fixed",
        zIndex: "2147483647",
        background: "#111827",
        pointerEvents: "none",
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`
      });
      const topLayerAncestor = element.closest?.("dialog[open],[popover]:popover-open");
      (topLayerAncestor || document.documentElement).append(overlay);
      overlays.push(overlay);
    }
    globalThis.__mecchaManualScreenshotMasks = overlays;
    return { applied: true, count: overlays.length };
  } catch {
    for (const overlay of overlays) overlay.remove();
    delete globalThis.__mecchaManualScreenshotMasks;
    return { applied: false };
  }
}

export function removeSensitiveMasks() {
  for (const overlay of globalThis.__mecchaManualScreenshotMasks || []) overlay.remove();
  delete globalThis.__mecchaManualScreenshotMasks;
  return true;
}
