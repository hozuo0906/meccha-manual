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
  const privacyOverlays = [];
  const token = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  const backdropSelector = "*";
  const backdropRule = "*::backdrop{opacity:0!important;transition:none!important;animation:none!important;}";
  const privacyOverlayClass = "meccha-manual-pii-overlay";
  const privacyDummies = Object.freeze({
    name: "山田太郎",
    address: "100-0000 東京都千代田区",
    phone: "03-0000-0000",
    email: "manual@example.invalid"
  });
  const maxPrivacyOverlays = 64;
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
    const privacyMutation = { detected: false };

    const normalizeText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const semanticKind = (value) => {
      const label = normalizeText(value).toLowerCase();
      if (/メール|e-?mail|mail|電子.?メール/.test(label)) return "email";
      if (/電話|tel|phone|携帯|mobile/.test(label)) return "phone";
      if (/住所|address|所在地/.test(label)) return "address";
      if (/氏名|名前|name/.test(label)) return "name";
      return null;
    };
    const rectValues = (rect) => ({ left: Number(rect.left), top: Number(rect.top), width: Number(rect.width), height: Number(rect.height) });
    const usableRect = (rect) => rect && [rect.left, rect.top, rect.width, rect.height].every((value) => Number.isFinite(value)) && rect.width > 0 && rect.height > 0;
    const intersectsViewport = (rect) => usableRect(rect) && rect.left < (globalThis.innerWidth || document.documentElement?.clientWidth || 0) && rect.top < (globalThis.innerHeight || document.documentElement?.clientHeight || 0) && rect.left + rect.width > 0 && rect.top + rect.height > 0;
    const isConnected = (element) => element && (element.isConnected === undefined || element.isConnected);
    const isVisibleTextElement = (element) => {
      if (!element || typeof element.getBoundingClientRect !== "function") return false;
      if (element.closest?.(`.${privacyOverlayClass},script,style,noscript,template,[aria-hidden="true"]`)) return false;
      const rect = element.getBoundingClientRect();
      if (!usableRect(rect)) return false;
      const computed = getComputedStyle(element);
      return computed.display !== "none" && computed.visibility !== "hidden" && Number(computed.opacity) !== 0;
    };
    const rangeRect = (range) => {
      if (typeof range?.getClientRects !== "function") return null;
      const rects = [...range.getClientRects()].filter(usableRect);
      if (!rects.length) return null;
      const left = Math.min(...rects.map((rect) => rect.left));
      const top = Math.min(...rects.map((rect) => rect.top));
      const right = Math.max(...rects.map((rect) => rect.right ?? rect.left + rect.width));
      const bottom = Math.max(...rects.map((rect) => rect.bottom ?? rect.top + rect.height));
      return { left, top, width: right - left, height: bottom - top };
    };
    const textPatterns = [
      { kind: "email", pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
      { kind: "phone", pattern: /(?:^|[^\d])((?:0\d{1,4})[-ー−‐– ]?(?:\d{1,4})[-ー−‐– ]?\d{3,4})(?!\d)/g },
      { kind: "address", pattern: /(?:〒?\d{3}[-ー−‐– ]?\d{4})/g }
    ];
    const collectPrivacyCandidates = () => {
      const candidates = [];
      const pairedValues = new WeakSet();
      const candidateKeys = new Set();
      const textNodeIds = new WeakMap();
      let nextTextNodeId = 1;
      const textNodeId = (node) => {
        if (!textNodeIds.has(node)) textNodeIds.set(node, nextTextNodeId++);
        return textNodeIds.get(node);
      };
      const addCandidate = (candidate) => {
        if (candidates.length >= maxPrivacyOverlays || !candidate?.target || !intersectsViewport(candidate.rect)) return;
        const key = candidate.key || `${candidate.kind}:${candidate.target}`;
        if (candidateKeys.has(key)) return;
        candidateKeys.add(key);
        candidates.push(candidate);
      };
      const pairSelectors = ["dt + dd", "th + td"];
      for (const selectorText of pairSelectors) {
        for (const valueElement of document.querySelectorAll?.(selectorText) || []) {
          const labelElement = valueElement.previousElementSibling;
          const kind = semanticKind(labelElement?.textContent);
          if (!kind || !isVisibleTextElement(valueElement)) continue;
          const text = normalizeText(valueElement.textContent);
          if (!text || text.length > 160) continue;
          const rect = rectValues(valueElement.getBoundingClientRect());
          pairedValues.add(valueElement);
          addCandidate({ kind, target: valueElement, rect, key: `pair:${kind}:${candidates.length}` });
        }
      }
      if (typeof document.createTreeWalker !== "function") return candidates;
      const showText = globalThis.NodeFilter?.SHOW_TEXT ?? 4;
      const walker = document.createTreeWalker(document.body || document.documentElement, showText);
      let node;
      while ((node = walker.nextNode?.())) {
        const parent = node.parentElement;
        const pairedAncestor = parent?.closest?.("dd,td");
        if (!parent || pairedValues.has(parent) || (pairedAncestor && pairedValues.has(pairedAncestor)) || !isVisibleTextElement(parent)) continue;
        const value = String(node.nodeValue ?? "");
        if (!value.trim()) continue;
        for (const { kind, pattern } of textPatterns) {
          pattern.lastIndex = 0;
          let match;
          while ((match = pattern.exec(value)) && candidates.length < maxPrivacyOverlays) {
            const matchedValue = match[1] || match[0];
            const offset = match.index + (match[0].length - matchedValue.length);
            const range = document.createRange?.();
            if (!range) break;
            range.setStart(node, offset);
            range.setEnd(node, offset + matchedValue.length);
            const rect = rangeRect(range);
            if (rect) addCandidate({ kind, target: parent, rect, range, key: `text:${kind}:${textNodeId(node)}:${offset}:${matchedValue.length}` });
          }
        }
      }
      return candidates;
    };
    const colorIsOpaque = (color) => {
      const value = String(color || "").trim().toLowerCase();
      if (!value || value === "transparent") return false;
      const rgba = value.match(/^rgba?\([^,]+,[^,]+,[^,]+(?:,\s*([\d.]+))?\)$/);
      return Boolean(rgba) && (rgba[1] === undefined || Number(rgba[1]) >= 1);
    };
    const textFingerprint = (value) => {
      let hash = 2166136261;
      const text = String(value ?? "");
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return `${text.length}:${hash >>> 0}`;
    };
    const overlayBackground = (element) => {
      let current = element;
      while (current && current !== document.documentElement) {
        const color = getComputedStyle(current).backgroundColor;
        if (colorIsOpaque(color)) return color;
        current = current.parentElement;
      }
      return "rgb(255, 255, 255)";
    };
    const addPrivacyOverlays = () => {
      if (!document.body || typeof document.createElement !== "function") return 0;
      const overlayHost = document.documentElement || document.body;
      for (const candidate of collectPrivacyCandidates()) {
        const overlay = document.createElement("span");
        const rect = candidate.rect;
        const computed = getComputedStyle(candidate.target);
        overlay.className = privacyOverlayClass;
        overlay.setAttribute("aria-hidden", "true");
        overlay.setAttribute("role", "presentation");
        overlay.textContent = privacyDummies[candidate.kind];
        const style = overlay.style;
        style.setProperty("position", "fixed", "important");
        style.setProperty("left", `${rect.left}px`, "important");
        style.setProperty("top", `${rect.top}px`, "important");
        style.setProperty("width", `${rect.width}px`, "important");
        style.setProperty("height", `${rect.height}px`, "important");
        style.setProperty("box-sizing", "border-box", "important");
        style.setProperty("display", "block", "important");
        style.setProperty("overflow", "hidden", "important");
        style.setProperty("white-space", "nowrap", "important");
        style.setProperty("pointer-events", "none", "important");
        style.setProperty("user-select", "none", "important");
        style.setProperty("z-index", "2147483647", "important");
        style.setProperty("margin", "0", "important");
        style.setProperty("padding", "0", "important");
        style.setProperty("border", "0", "important");
        style.setProperty("background-color", overlayBackground(candidate.target), "important");
        style.setProperty("color", computed.color || "rgb(0, 0, 0)", "important");
        style.setProperty("font-family", computed.fontFamily || "sans-serif", "important");
        style.setProperty("font-size", computed.fontSize || "16px", "important");
        style.setProperty("font-style", computed.fontStyle || "normal", "important");
        style.setProperty("font-weight", computed.fontWeight || "400", "important");
        style.setProperty("line-height", computed.lineHeight || "normal", "important");
        style.setProperty("letter-spacing", computed.letterSpacing || "normal", "important");
        style.setProperty("text-align", computed.textAlign || "left", "important");
        // Keep the overlay outside body so a transformed/filtered/contained body
        // cannot establish a different fixed-position containing block.
        overlayHost.append(overlay);
        const overlayRect = overlay.getBoundingClientRect?.();
        if (!isConnected(overlay) || !usableRect(overlayRect)) {
          overlay.remove?.();
          throw new Error("SCREENSHOT_PII_OVERLAY_FAILED");
        }
        privacyOverlays.push({
          overlay,
          target: candidate.target,
          range: candidate.range || null,
          targetRect: rectValues(candidate.target.getBoundingClientRect()),
          protectedRect: rectValues(rect),
          overlayRect: rectValues(overlayRect),
          textFingerprint: textFingerprint(candidate.target.textContent)
        });
      }
      return privacyOverlays.length;
    };

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
    const privacyMaskedCount = addPrivacyOverlays();
    if (privacyOverlays.length && typeof MutationObserver === "function") {
      const privacyObserver = new MutationObserver((records) => {
        if (records.some((record) => {
          const target = record.target?.closest?.(`.${privacyOverlayClass}`);
          const addedOnlyOverlay = [...record.addedNodes || []].every((node) => node.nodeType === 3 ? node.parentElement?.closest?.(`.${privacyOverlayClass}`) : node.closest?.(`.${privacyOverlayClass}`));
          return !target && !addedOnlyOverlay;
        })) privacyMutation.detected = true;
      });
      privacyObserver.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["style", "class", "hidden", "aria-hidden"] });
      observers.push(privacyObserver);
    }
    globalThis.__mecchaManualScreenshotMasks = { token, masks, observers, backdropMasks, backdropSelector, backdropRule, privacyOverlays, privacyMutation, document, privacyOverlayClass };
    return { applied: true, count: masks.length, privacyMaskedCount, token };
  } catch {
    for (const observer of observers) observer.disconnect();
    for (const backdropMask of backdropMasks) backdropMask.style.remove();
    for (const { overlay } of privacyOverlays) overlay.remove?.();
    for (const mask of masks) restoreMask(mask);
    delete globalThis.__mecchaManualScreenshotMasks;
    return { applied: false };
  }
}

export function verifySensitiveMasks(expectedToken) {
  const state = globalThis.__mecchaManualScreenshotMasks;
  if (!state?.token || state.token !== expectedToken) return false;
  try {
    if (state.document !== document) return false;
    const sameRect = (left, right) => ["left", "top", "width", "height"].every((key) => Number.isFinite(left?.[key]) && Number.isFinite(right?.[key]) && Math.abs(left[key] - right[key]) <= 1);
    const usableRect = (rect) => rect && [rect.left, rect.top, rect.width, rect.height].every((value) => Number.isFinite(value)) && rect.width > 0 && rect.height > 0;
    const rangeRect = (range) => {
      if (typeof range?.getClientRects !== "function") return null;
      const rects = [...range.getClientRects()].filter(usableRect);
      if (!rects.length) return null;
      const left = Math.min(...rects.map((rect) => rect.left));
      const top = Math.min(...rects.map((rect) => rect.top));
      const right = Math.max(...rects.map((rect) => rect.right ?? rect.left + rect.width));
      const bottom = Math.max(...rects.map((rect) => rect.bottom ?? rect.top + rect.height));
      return { left, top, width: right - left, height: bottom - top };
    };
    if (state.privacyMutation?.detected) return false;
    for (const item of state.privacyOverlays || []) {
      if (!item?.overlay || !item.overlay.isConnected || item.overlay.className !== state.privacyOverlayClass || item.overlay.getAttribute("aria-hidden") !== "true") return false;
      if (!item.target || (item.target.isConnected !== undefined && !item.target.isConnected)) return false;
      if (!sameRect(item.targetRect, item.target.getBoundingClientRect())) return false;
      const protectedRect = item.range ? rangeRect(item.range) : item.target.getBoundingClientRect();
      if (!sameRect(item.protectedRect, protectedRect)) return false;
      // Compare the rendered overlay with the protected text range itself. A
      // parent element's rect is insufficient when a body transform moves a
      // fixed-position overlay away from the PII glyphs.
      if (!sameRect(item.overlayRect, item.overlay.getBoundingClientRect()) || !sameRect(item.overlay.getBoundingClientRect(), protectedRect)) return false;
      if (item.textFingerprint !== (() => {
        let hash = 2166136261;
        const text = String(item.target.textContent ?? "");
        for (let index = 0; index < text.length; index += 1) {
          hash ^= text.charCodeAt(index);
          hash = Math.imul(hash, 16777619);
        }
        return `${text.length}:${hash >>> 0}`;
      })()) return false;
      const overlayStyle = getComputedStyle(item.overlay);
      const background = String(overlayStyle.backgroundColor || "").toLowerCase();
      const rgba = background.match(/^rgba?\([^,]+,[^,]+,[^,]+(?:,\s*([\d.]+))?\)$/);
      if (overlayStyle.display === "none" || overlayStyle.visibility === "hidden" || Number(overlayStyle.opacity) === 0 || background === "transparent" || !rgba || (rgba[1] !== undefined && Number(rgba[1]) < 1)) return false;
      const rect = item.overlay.getBoundingClientRect();
      const previousPointerEvents = item.overlay.style.getPropertyValue("pointer-events");
      const previousPointerPriority = item.overlay.style.getPropertyPriority("pointer-events");
      let topElement;
      try {
        item.overlay.style.setProperty("pointer-events", "auto", "important");
        topElement = document.elementFromPoint?.(rect.left + rect.width / 2, rect.top + rect.height / 2);
      } finally {
        if (previousPointerEvents) item.overlay.style.setProperty("pointer-events", previousPointerEvents, previousPointerPriority);
        else item.overlay.style.removeProperty("pointer-events");
      }
      if (topElement && topElement !== item.overlay && !item.overlay.contains?.(topElement)) return false;
    }
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
  for (const { overlay } of state?.privacyOverlays || []) overlay.remove?.();
  for (const mask of state?.masks || []) {
    for (const item of mask.previous) {
      if (item.value) mask.element.style.setProperty(item.property, item.value, item.priority);
      else mask.element.style.removeProperty(item.property);
    }
  }
  delete globalThis.__mecchaManualScreenshotMasks;
  return true;
}
