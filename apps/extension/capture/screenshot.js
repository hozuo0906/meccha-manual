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
  const masks = [];
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
      const computed = getComputedStyle(element);
      if (computed.visibility === "hidden" || computed.display === "none" || Number(computed.opacity) === 0) continue;
      const previousVisibility = element.style.getPropertyValue("visibility");
      const previousPriority = element.style.getPropertyPriority("visibility");
      element.style.setProperty("visibility", "hidden", "important");
      masks.push({ element, previousVisibility, previousPriority });
    }
    globalThis.__mecchaManualScreenshotMasks = masks;
    return { applied: true, count: masks.length };
  } catch {
    for (const mask of masks) {
      if (mask.previousVisibility) mask.element.style.setProperty("visibility", mask.previousVisibility, mask.previousPriority);
      else mask.element.style.removeProperty("visibility");
    }
    delete globalThis.__mecchaManualScreenshotMasks;
    return { applied: false };
  }
}

export function removeSensitiveMasks() {
  for (const mask of globalThis.__mecchaManualScreenshotMasks || []) {
    if (mask.previousVisibility) mask.element.style.setProperty("visibility", mask.previousVisibility, mask.previousPriority);
    else mask.element.style.removeProperty("visibility");
  }
  delete globalThis.__mecchaManualScreenshotMasks;
  return true;
}
