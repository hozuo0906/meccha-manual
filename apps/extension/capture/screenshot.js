export async function captureWithMaskBoundary({ applyMasks, capture, verifyMasks, removeMasks }) {
  let maskingAttempted = false;
  try {
    maskingAttempted = true;
    const result = await applyMasks();
    if (!result?.applied || (verifyMasks && !result?.token)) throw new Error("SCREENSHOT_MASK_FAILED");
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
  const restoreMask = (mask) => {
    for (const item of mask.previous) {
      if (item.value) mask.element.style.setProperty(item.property, item.value, item.priority);
      else mask.element.style.removeProperty(item.property);
    }
  };
  try {
    if (typeof globalThis.chrome?.dom?.openOrClosedShadowRoot !== "function") throw new Error("SHADOW_INSPECTION_UNAVAILABLE");
    const shadowRootOf = (host) => host instanceof HTMLElement ? chrome.dom.openOrClosedShadowRoot(host) : host.shadowRoot;
    const selector = [
      "input",
      "canvas",
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
    const observedRoots = new WeakSet();

    const maskElement = (element, opaqueSubtree = false) => {
      if (!element || masked.has(element) || typeof element.getBoundingClientRect !== "function") return;
      const rect = element.getBoundingClientRect();
      if (!opaqueSubtree && (rect.width <= 0 || rect.height <= 0)) return;
      const computed = getComputedStyle(element);
      if (computed.display === "none" || (!opaqueSubtree && Number(computed.opacity) === 0)) return;

      const previousVisibility = element.style.getPropertyValue("visibility");
      const previousPriority = element.style.getPropertyPriority("visibility");
      const previousTransition = element.style.getPropertyValue("transition");
      const previousTransitionPriority = element.style.getPropertyPriority("transition");
      const previousAnimation = element.style.getPropertyValue("animation");
      const previousAnimationPriority = element.style.getPropertyPriority("animation");
      const previous = [
        { property: "display", value: element.style.getPropertyValue("display"), priority: element.style.getPropertyPriority("display") },
        { property: "opacity", value: element.style.getPropertyValue("opacity"), priority: element.style.getPropertyPriority("opacity") },
        { property: "visibility", value: previousVisibility, priority: previousPriority },
        { property: "transition", value: previousTransition, priority: previousTransitionPriority },
        { property: "animation", value: previousAnimation, priority: previousAnimationPriority }
      ];

      element.style.setProperty("transition", "none", "important");
      element.style.setProperty("animation", "none", "important");
      // opacity composites the entire subtree, including inaccessible closed shadow roots.
      element.style.setProperty("opacity", "0", "important");
      element.style.setProperty("visibility", "hidden", "important");
      // Top-layer descendants escape opacity, but not display:none on a
      // shadow-including ancestor (CSS Positioned Layout 4, Top Layer Styling).
      if (opaqueSubtree) element.style.setProperty("display", "none", "important");
      const mask = { element, previous };
      if (opaqueSubtree ? getComputedStyle(element).display !== "none" : Number(getComputedStyle(element).opacity) !== 0) {
        restoreMask(mask);
        throw new Error("SCREENSHOT_MASK_NOT_EFFECTIVE");
      }
      masked.add(element);
      masks.push(mask);
    };

    const scanRoot = (root) => {
      if (!root?.querySelectorAll) return;
      for (const element of root.querySelectorAll(selector)) maskElement(element, Boolean(shadowRootOf(element) && !element.shadowRoot));
      for (const host of root.querySelectorAll("*")) {
        const shadow = shadowRootOf(host);
        if (shadow && !host.shadowRoot) maskElement(host, true);
        else if (shadow) scanRoot(shadow);
      }
      if (typeof MutationObserver === "function" && !observedRoots.has(root)) {
        const observer = new MutationObserver((records) => {
          for (const record of records) {
            for (const node of record.addedNodes || []) {
              if (!(node instanceof Element)) continue;
              if (shadowRootOf(node) && !node.shadowRoot) maskElement(node, true);
              else if (node.matches?.(selector)) maskElement(node);
              scanRoot(node);
            }
          }
        });
        observer.observe(root, { childList: true, subtree: true });
        observedRoots.add(root);
        observers.push(observer);
      }
    };

    scanRoot(document);
    globalThis.__mecchaManualScreenshotMasks = { token, masks, observers };
    return { applied: true, count: masks.length, token };
  } catch {
    for (const observer of observers) observer.disconnect();
    for (const mask of masks) restoreMask(mask);
    delete globalThis.__mecchaManualScreenshotMasks;
    return { applied: false };
  }
}

export function verifySensitiveMasks(expectedToken) {
  const state = globalThis.__mecchaManualScreenshotMasks;
  if (!state?.token || state.token !== expectedToken) return false;
  try {
    if (typeof globalThis.chrome?.dom?.openOrClosedShadowRoot !== "function") return false;
    const shadowRootOf = (host) => host instanceof HTMLElement ? chrome.dom.openOrClosedShadowRoot(host) : host.shadowRoot;
    const selector = [
      "input",
      "canvas",
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
        const shadow = shadowRootOf(host);
        if (shadow && !host.shadowRoot) {
          if (getComputedStyle(host).display !== "none") return false;
          elements.push(host);
        } else if (shadow) roots.push(shadow);
      }
    }
    for (const element of new Set(elements)) {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const computed = getComputedStyle(element);
      if (computed.display === "none" || Number(computed.opacity) === 0) continue;
      return false;
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
