export async function captureWithMaskBoundary({ applyMasks, capture, verifyMasks, removeMasks }) {
  let maskingAttempted = false;
  try {
    maskingAttempted = true;
    const result = await applyMasks();
    if (!result?.applied || !result?.token) throw new Error("SCREENSHOT_MASK_FAILED");
    const image = await capture();
    if (typeof image !== "string" || !image.startsWith("data:image/")) throw new Error("SCREENSHOT_CAPTURE_FAILED");
    if (verifyMasks && !(await verifyMasks(result.token))) throw new Error("SCREENSHOT_MASK_INVALIDATED");
    return image;
  } finally {
    if (maskingAttempted) await removeMasks().catch(() => undefined);
  }
}

export function installSensitiveMasks() {
  const existing = globalThis.__mecchaManualScreenshotMasks;
  if (existing?.token) return { applied: true, count: existing.masks.length, token: existing.token };

  const masks = [];
  const observers = [];
  const token = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
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
    const masked = new WeakSet();

    const maskElement = (element) => {
      if (!element || masked.has(element) || typeof element.getBoundingClientRect !== "function") return;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const computed = getComputedStyle(element);
      if (computed.visibility === "hidden" || computed.display === "none" || Number(computed.opacity) === 0) return;

      const previous = ["visibility", "transition", "animation"].map((property) => ({
        property,
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property)
      }));
      element.style.setProperty("transition", "none", "important");
      element.style.setProperty("animation", "none", "important");
      element.style.setProperty("visibility", "hidden", "important");
      if (getComputedStyle(element).visibility !== "hidden") {
        for (const item of previous) {
          if (item.value) element.style.setProperty(item.property, item.value, item.priority);
          else element.style.removeProperty(item.property);
        }
        throw new Error("SCREENSHOT_MASK_NOT_EFFECTIVE");
      }
      masked.add(element);
      masks.push({ element, previous });
    };

    const scanRoot = (root) => {
      if (!root?.querySelectorAll) return;
      for (const element of root.querySelectorAll(selector)) maskElement(element);
      for (const host of root.querySelectorAll("*")) {
        if (host.shadowRoot) scanRoot(host.shadowRoot);
        else if (host.localName?.includes("-") && !host.matches?.(selector)) maskElement(host);
      }
      if (typeof MutationObserver === "function") {
        const observer = new MutationObserver((records) => {
          for (const record of records) {
            for (const node of record.addedNodes || []) {
              if (!(node instanceof Element)) continue;
              if (node.matches?.(selector)) maskElement(node);
              scanRoot(node);
            }
          }
        });
        observer.observe(root, { childList: true, subtree: true });
        observers.push(observer);
      }
    };

    scanRoot(document);
    globalThis.__mecchaManualScreenshotMasks = { token, masks, observers };
    return { applied: true, count: masks.length, token };
  } catch {
    for (const observer of observers) observer.disconnect();
    for (const mask of masks) {
      for (const item of mask.previous) {
        if (item.value) mask.element.style.setProperty(item.property, item.value, item.priority);
        else mask.element.style.removeProperty(item.property);
      }
    }
    delete globalThis.__mecchaManualScreenshotMasks;
    return { applied: false };
  }
}

export function verifySensitiveMasks(expectedToken) {
  const state = globalThis.__mecchaManualScreenshotMasks;
  if (!state?.token || state.token !== expectedToken) return false;
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
        else if (host.localName?.includes("-") && !host.matches?.(selector)) elements.push(host);
      }
    }
    for (const element of new Set(elements)) {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const computed = getComputedStyle(element);
      if (computed.display === "none" || Number(computed.opacity) === 0) continue;
      if (computed.visibility !== "hidden") return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function removeSensitiveMasks() {
  const state = globalThis.__mecchaManualScreenshotMasks;
  for (const observer of state?.observers || []) observer.disconnect();
  for (const mask of state?.masks || []) {
    for (const item of mask.previous) {
      if (item.value) mask.element.style.setProperty(item.property, item.value, item.priority);
      else mask.element.style.removeProperty(item.property);
    }
  }
  delete globalThis.__mecchaManualScreenshotMasks;
  return true;
}
