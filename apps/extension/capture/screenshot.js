export async function captureWithMaskBoundary({ applyMasks, waitForPaint = async () => undefined, capture, verifyMasks, removeMasks }) {
  let maskingAttempted = false;
  try {
    maskingAttempted = true;
    const result = await applyMasks();
    if (!result?.applied || (verifyMasks && !result?.token)) throw new Error("SCREENSHOT_MASK_FAILED");
    await waitForPaint();
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
  const backdropMasks = [];
  const token = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  const backdropSelector = "*";
  const backdropRule = "*::backdrop{opacity:0!important;transition:none!important;animation:none!important;}";
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
    const observedRoots = new WeakMap();
    const backdropRoots = new WeakSet();

    const installBackdropMask = (root) => {
      const style = document.createElement("style");
      style.textContent = backdropRule;
      const parent = root === document ? (document.head || document.documentElement) : root;
      if (!parent?.append) throw new Error("BACKDROP_MASK_INSTALL_FAILED");
      parent.append(style);
      backdropMasks.push({ root, style });
    };

    const maskElement = (element, opaqueSubtree = false) => {
      if (!element || masked.has(element) || typeof element.getBoundingClientRect !== "function") return;
      const rect = element.getBoundingClientRect();
      if (!opaqueSubtree && (rect.width <= 0 || rect.height <= 0)) return;
      const computed = getComputedStyle(element);
      if (computed.display === "none" || (!opaqueSubtree && Number(computed.opacity) === 0)) return;

      const previousTransition = element.style.getPropertyValue("transition");
      const previousTransitionPriority = element.style.getPropertyPriority("transition");
      const previousAnimation = element.style.getPropertyValue("animation");
      const previousAnimationPriority = element.style.getPropertyPriority("animation");
      const previous = [
        { property: "opacity", value: element.style.getPropertyValue("opacity"), priority: element.style.getPropertyPriority("opacity") },
        { property: "transition", value: previousTransition, priority: previousTransitionPriority },
        { property: "animation", value: previousAnimation, priority: previousAnimationPriority }
      ];

      element.style.setProperty("transition", "none", "important");
      element.style.setProperty("animation", "none", "important");
      // opacity composites the entire subtree, including inaccessible closed shadow roots.
      element.style.setProperty("opacity", "0", "important");
      const mask = { element, previous };
      if (Number(getComputedStyle(element).opacity) !== 0) {
        restoreMask(mask);
        throw new Error("SCREENSHOT_MASK_NOT_EFFECTIVE");
      }
      masked.add(element);
      masks.push(mask);
    };

    const scanRoot = (root, maskAllDescendants = false) => {
      if (!root?.querySelectorAll) throw new Error("SHADOW_INSPECTION_UNAVAILABLE");
      if (root.host && maskAllDescendants && !backdropRoots.has(root)) {
        installBackdropMask(root);
        backdropRoots.add(root);
      }
      if (maskAllDescendants) {
        for (const element of root.querySelectorAll("*")) maskElement(element, true);
      }
      for (const element of root.querySelectorAll(selector)) maskElement(element, Boolean(shadowRootOf(element) && !element.shadowRoot));
      for (const host of root.querySelectorAll("*")) {
        const shadow = shadowRootOf(host);
        if (shadow && !shadow.querySelectorAll) throw new Error("SHADOW_INSPECTION_UNAVAILABLE");
        if (shadow && !host.shadowRoot) {
          maskElement(host, true);
          scanRoot(shadow, true);
        }
        else if (shadow) scanRoot(shadow, maskAllDescendants);
      }
      if (typeof MutationObserver === "function") {
        const previousObserver = observedRoots.get(root);
        if (previousObserver && (previousObserver.maskAllDescendants || !maskAllDescendants)) return;
        previousObserver?.observer.disconnect();
        const observer = new MutationObserver((records) => {
          for (const record of records) {
            for (const node of record.addedNodes || []) {
              if (!(node instanceof Element)) continue;
              const shadow = shadowRootOf(node);
              if (shadow && !node.shadowRoot) {
                maskElement(node, true);
                scanRoot(shadow, true);
              } else {
                if (maskAllDescendants) maskElement(node, true);
                else if (node.matches?.(selector)) maskElement(node);
              }
              scanRoot(node, maskAllDescendants);
            }
          }
        });
        observer.observe(root, { childList: true, subtree: true });
        observedRoots.set(root, { observer, maskAllDescendants });
        observers.push(observer);
      }
    };

    scanRoot(document);
    globalThis.__mecchaManualScreenshotMasks = { token, masks, observers, backdropMasks, backdropSelector, backdropRule };
    return { applied: true, count: masks.length, token };
  } catch {
    for (const observer of observers) observer.disconnect();
    for (const backdropMask of backdropMasks) backdropMask.style.remove();
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
    for (const { root, style } of state.backdropMasks || []) {
      if (!style?.isConnected || style.getRootNode() !== root || style.textContent !== state.backdropRule) return false;
    }
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
    const backdropElements = [];
    const styledRoots = new Set((state.backdropMasks || []).map(({ root }) => root));
    const roots = [{ root: document, maskAllDescendants: false }];
    const elements = [];
    for (let index = 0; index < roots.length; index += 1) {
      const { root, maskAllDescendants } = roots[index];
      if (maskAllDescendants && !styledRoots.has(root)) return false;
      if (maskAllDescendants) elements.push(...root.querySelectorAll("*"));
      elements.push(...root.querySelectorAll(selector));
      if (styledRoots.has(root)) backdropElements.push(...root.querySelectorAll(state.backdropSelector || "*"));
      for (const host of root.querySelectorAll("*")) {
        const shadow = shadowRootOf(host);
        if (shadow && !host.shadowRoot) {
          if (Number(getComputedStyle(host).opacity) !== 0) return false;
          elements.push(host);
          if (!shadow.querySelectorAll) return false;
          roots.push({ root: shadow, maskAllDescendants: true });
        } else if (shadow) roots.push({ root: shadow, maskAllDescendants });
      }
    }
    for (const element of new Set(backdropElements)) {
      if (getComputedStyle(element, "::backdrop").opacity !== "0") return false;
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
  for (const backdropMask of state?.backdropMasks || []) backdropMask.style.remove();
  for (const mask of state?.masks || []) {
    for (const item of mask.previous) {
      if (item.value) mask.element.style.setProperty(item.property, item.value, item.priority);
      else mask.element.style.removeProperty(item.property);
    }
  }
  delete globalThis.__mecchaManualScreenshotMasks;
  return true;
}
