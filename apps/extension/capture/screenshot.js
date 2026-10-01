export async function captureWithMaskBoundary({ applyMasks, waitForPaint = async () => undefined, capture, verifyMasks, removeMasks }) {
  let maskingAttempted = false;
  try {
    maskingAttempted = true;
    const result = await applyMasks();
    if (!result?.applied || (verifyMasks && !result?.token)) throw new Error("SCREENSHOT_MASK_FAILED");
    await waitForPaint();
    if (verifyMasks && !(await verifyMasks(result.token))) throw new Error("SCREENSHOT_MASK_INVALIDATED");
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
  // Keep candidate count and composed-tree evidence traversal bounded separately:
  // unrelated DOM depth must not consume the overlay budget.
  const maxPrivacyTraversalNodes = 4096;
  // A rendered value may be split across inline elements (for example,
  // <span>alice@</span><span>example.com</span>). Keep this recovery finite
  // and never join text across a rendering boundary.
  const maxPrivacyAdjacentTextNodes = 128;
  const maxPrivacyAdjacentTextCharacters = 1024;
  const maxPrivacyTextRanges = 256;
  const privacyOverlayElements = new WeakSet();
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
    let privacyRootTraversalOverflow = false;
    const collectPrivacyRootSnapshot = () => {
      const roots = [];
      const seen = new Set();
      const traversal = { inspected: 0 };
      const frames = [];
      const visitRoot = (root) => {
        if (!root?.childNodes || seen.has(root) || privacyRootTraversalOverflow) return;
        seen.add(root);
        roots.push(root);
        traversal.inspected += 1;
        if (traversal.inspected > maxPrivacyTraversalNodes) {
          privacyRootTraversalOverflow = true;
          return;
        }
        frames.push({ parent: root, index: 0 });
      };
      visitRoot(document);
      while (frames.length && !privacyRootTraversalOverflow) {
        const frame = frames[frames.length - 1];
        if (frame.index >= frame.parent.childNodes.length) {
          frames.pop();
          continue;
        }
        const node = frame.parent.childNodes[frame.index++];
        if (isOwnedPrivacyOverlayNode(node)) continue;
        traversal.inspected += 1;
        if (traversal.inspected > maxPrivacyTraversalNodes) {
          privacyRootTraversalOverflow = true;
          break;
        }
        if (node.nodeType !== 1) {
          if (node.childNodes?.length) frames.push({ parent: node, index: 0 });
          continue;
        }
        if (node.matches?.("script,style,noscript,template")) continue;
        let shadow;
        try {
          shadow = shadowRootOf(node);
        } catch {
          privacyRootTraversalOverflow = true;
          break;
        }
        if (shadow?.childNodes) visitRoot(shadow);
        if (node.childNodes?.length) frames.push({ parent: node, index: 0 });
      }
      return roots;
    };

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
    const isOwnedPrivacyOverlayNode = (node) => {
      let current = node?.nodeType === 3 ? node.parentElement : node;
      while (current) {
        if (privacyOverlayElements.has(current)) return true;
        current = current.parentElement || current.getRootNode?.()?.host || null;
      }
      return false;
    };
    const isVisibleTextElement = (element) => {
      if (!element || typeof element.getBoundingClientRect !== "function") return false;
      let current = element;
      while (current) {
        // aria-hidden only affects assistive technology. A visually rendered
        // value still has to be protected before capture.
        if (isOwnedPrivacyOverlayNode(current) || current.matches?.("script,style,noscript,template")) return false;
        const computed = getComputedStyle(current);
        if (computed.display === "none" || computed.visibility === "hidden" || computed.visibility === "collapse" || Number(computed.opacity) === 0) return false;
        current = current.parentElement || current.getRootNode?.()?.host || null;
      }
      return usableRect(element.getBoundingClientRect());
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
      { kind: "address", pattern: /(?:^|[^\d])(〒?\d{3}[-ー−‐– ]?\d{4})(?!\d)/g }
    ];
    // Boundary checks must not mutate the global expressions used by the
    // candidate collector's exec loops.
    const completePiiPatterns = textPatterns.map(({ kind, pattern }) => ({
      kind,
      pattern: new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ""))
    }));
    let privacyCandidateOverflow = false;
    let privacyCandidateTraversalOverflow = false;
    let privacyCandidateRangeOverflow = false;
    const collectPrivacyCandidates = () => {
      privacyCandidateRangeOverflow = false;
      const candidates = [];
      const pairedValues = new WeakSet();
      const candidateKeys = new Set();
      const rangeCandidates = new Map();
      const seenRangeKinds = new Map();
      let candidateOverflow = false;
      let textRangeCount = 0;
      const candidatePriority = (kind) => kind === "address" ? 3 : kind === "phone" ? 2 : 1;
      const traversal = { inspected: 0, exceeded: false };
      const textNodeIds = new WeakMap();
      let nextTextNodeId = 1;
      const textNodeId = (node) => {
        if (!textNodeIds.has(node)) textNodeIds.set(node, nextTextNodeId++);
        return textNodeIds.get(node);
      };
      const addCandidate = (candidate) => {
        if (!candidate?.target || !intersectsViewport(candidate.rect)) return;
        if (candidate.rangeKey) {
          const existingIndex = rangeCandidates.get(candidate.rangeKey);
          if (existingIndex !== undefined) {
            const existing = candidates[existingIndex];
            if (candidatePriority(candidate.kind) > candidatePriority(existing?.kind)) candidates[existingIndex] = candidate;
            return;
          }
          rangeCandidates.set(candidate.rangeKey, candidates.length);
        }
        const key = candidate.key || `${candidate.kind}:${candidate.target}`;
        if (candidateKeys.has(key)) return;
        if (candidates.length >= maxPrivacyOverlays) {
          candidateOverflow = true;
          return;
        }
        candidateKeys.add(key);
        candidates.push(candidate);
      };
      const inlineDisplay = (element) => {
        const display = String(getComputedStyle(element).display || "").toLowerCase();
        return display === "inline" || display === "inline-block" || display === "inline-flex"
          || display === "inline-grid" || display === "contents" || display === "ruby" || display === "ruby-text";
      };
      const nextNodeInRoot = (node, root) => {
        if (node?.firstChild) return node.firstChild;
        let current = node;
        while (current && current !== root) {
          if (current.nextSibling) return current.nextSibling;
          current = current.parentNode;
        }
        return null;
      };
      const renderedTextBoundarySafe = (previous, next, root) => {
        if (!previous || !next || previous.getRootNode?.() !== root || next.getRootNode?.() !== root) return false;
        const previousParent = previous.parentElement;
        const nextParent = next.parentElement;
        if (!previousParent || !nextParent || !isVisibleTextElement(previousParent) || !isVisibleTextElement(nextParent)) return false;
        let current = previous;
        while (current && current !== root) {
          if (current.nextSibling) {
            if (current.nodeType === 1 && (!isVisibleTextElement(current) || !inlineDisplay(current))) return false;
            current = current.nextSibling;
            break;
          }
          if (current.nodeType === 1 && (!isVisibleTextElement(current) || !inlineDisplay(current))) return false;
          current = current.parentNode;
        }
        while (current && current !== next) {
          if (current.nodeType === 1) {
            if (current.matches?.("script,style,noscript,template,br")) return false;
            if (!isVisibleTextElement(current) || !inlineDisplay(current)) return false;
          }
          current = nextNodeInRoot(current, root);
        }
        return current === next;
      };
      const createTextRange = (root, startNode, startOffset, endNode, endOffset) => {
        if (textRangeCount >= maxPrivacyTextRanges) {
          privacyCandidateRangeOverflow = true;
          return null;
        }
        const range = root.createRange?.() || document.createRange?.();
        if (!range) {
          privacyCandidateRangeOverflow = true;
          return null;
        }
        try {
          range.setStart(startNode, startOffset);
          range.setEnd(endNode, endOffset);
          textRangeCount += 1;
          return range;
        } catch {
          privacyCandidateRangeOverflow = true;
          return null;
        }
      };
      const partialPatternAtBoundary = (value) => /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]*|0\d{1,4}[-ー−‐– ]\d{0,4}|〒\d{1,3}[-ー−‐– ]?\d{0,4})$/i.test(value);
      const containsCompletePii = (value) => completePiiPatterns.some(({ pattern }) => pattern.test(String(value ?? "")));
      const uncertainBoundary = (value) => partialPatternAtBoundary(value) && !containsCompletePii(value);
      const uncertainBudgetContinuation = (value, nextValue = "") => {
        if (uncertainBoundary(value)) return true;
        const suffix = String(value ?? "").match(/[A-Z0-9._%+-]{3,}$/i)?.[0];
        const next = String(nextValue ?? "");
        return Boolean(suffix && (next.startsWith("@") || /^[A-Z0-9._%+-]*@/i.test(next)));
      };
      const renderedTextBoundarySafeThroughHidden = (previous, next, root) => {
        if (!previous || !next || previous.getRootNode?.() !== root || next.getRootNode?.() !== root) return false;
        const previousParent = previous.parentElement;
        const nextParent = next.parentElement;
        if (!previousParent || !nextParent || !isVisibleTextElement(nextParent)) return false;
        const boundaryElementSafe = (element) => {
          if (!element || !element.matches?.("script,style,noscript,template,br")) {
            if (isVisibleTextElement(element)) return inlineDisplay(element);
            const computed = element && getComputedStyle(element);
            return Boolean(computed && (computed.display === "none" || computed.visibility === "hidden" || computed.visibility === "collapse" || Number(computed.opacity) === 0));
          }
          return false;
        };
        let current = previous;
        while (current && current !== root) {
          if (current.nextSibling) {
            if (current.nodeType === 1 && !boundaryElementSafe(current)) return false;
            current = current.nextSibling;
            break;
          }
          if (current.nodeType === 1 && !boundaryElementSafe(current)) return false;
          current = current.parentNode;
        }
        while (current && current !== next) {
          if (current.nodeType === 1 && !boundaryElementSafe(current)) return false;
          current = nextNodeInRoot(current, root);
        }
        return current === next;
      };
      const visibleContinuationAfterHidden = (textNodes, hiddenIndex, entries, root) => {
        const previous = entries[entries.length - 1]?.node;
        if (!previous) return false;
        let joined = entries.map((entry) => entry.value).join("");
        let previousVisible = previous;
        let inspected = 0;
        for (let index = hiddenIndex + 1; index < textNodes.length && inspected < 4; index += 1) {
          const node = textNodes[index];
          if (!node?.parentElement) return false;
          if (!isVisibleTextElement(node.parentElement)) continue;
          inspected += 1;
          if (!renderedTextBoundarySafeThroughHidden(previousVisible, node, root)) return false;
          joined += String(node.nodeValue ?? "");
          if (containsCompletePii(joined) || partialPatternAtBoundary(joined)) return true;
          previousVisible = node;
        }
        return inspected >= 4 && uncertainBudgetContinuation(joined);
      };
      const isPairedTextNode = (node, pairedValues) => {
        let current = node?.parentElement;
        while (current) {
          if (pairedValues.has(current)) return true;
          current = current.parentElement;
        }
        return false;
      };
      const addRenderedTextCandidates = (record, textNodes, pairedValues) => {
        for (let start = 0; start < textNodes.length && !candidateOverflow; start += 1) {
          const first = textNodes[start];
          if (!first.parentElement || isPairedTextNode(first, pairedValues) || !isVisibleTextElement(first.parentElement)) continue;
          const entries = [];
          let characterCount = 0;
          for (let index = start; index < textNodes.length && entries.length < maxPrivacyAdjacentTextNodes; index += 1) {
            const node = textNodes[index];
            if (!node.parentElement || isPairedTextNode(node, pairedValues)) {
              if (entries.length && uncertainBoundary(entries.map((entry) => entry.value).join(""))) privacyCandidateRangeOverflow = true;
              break;
            }
            if (!isVisibleTextElement(node.parentElement)) {
              // A hidden node can later reveal text that was split from a
              // visible PII prefix. PII-free help/menu boundaries remain
              // recordable; hidden contents are never joined or inspected.
              const boundaryValue = entries.map((entry) => entry.value).join("");
              if (entries.length && (uncertainBoundary(boundaryValue)
                || visibleContinuationAfterHidden(textNodes, index, entries, record.root))) privacyCandidateRangeOverflow = true;
              break;
            }
            if (entries.length > 0 && !renderedTextBoundarySafe(entries[entries.length - 1].node, node, record.root)) {
              if (uncertainBoundary(entries.map((entry) => entry.value).join(""))) privacyCandidateRangeOverflow = true;
              break;
            }
            const value = String(node.nodeValue ?? "");
            // Preserve the established single-node detector for long rendered
            // text. The adjacent recovery budget applies only when joining
            // multiple nodes; a single node is already a bounded DOM item.
            if (!entries.length && value.length > maxPrivacyAdjacentTextCharacters) {
              entries.push({ node, value, start: 0, end: value.length });
              characterCount = value.length;
              continue;
            }
            if (characterCount + value.length > maxPrivacyAdjacentTextCharacters) {
              if (entries.length > 0 && renderedTextBoundarySafe(entries[entries.length - 1].node, node, record.root)
                && uncertainBudgetContinuation(entries.map((entry) => entry.value).join(""), value)) privacyCandidateRangeOverflow = true;
              break;
            }
            entries.push({ node, value, start: characterCount, end: characterCount + value.length });
            characterCount += value.length;
          }
          if (!entries.length || !characterCount) continue;
          const joined = entries.map((entry) => entry.value).join("");
          for (const { kind, pattern } of textPatterns) {
            pattern.lastIndex = 0;
            let match;
            while ((match = pattern.exec(joined)) && !candidateOverflow) {
              const matchedValue = match[1] || match[0];
              const matchStart = match.index + (match[0].length - matchedValue.length);
              const matchEnd = matchStart + matchedValue.length;
              const previousNode = textNodes[start - 1];
              const previousCharacter = previousNode && renderedTextBoundarySafe(previousNode, first, record.root)
                ? String(previousNode.nodeValue ?? "").slice(-1) : "";
              const previousComplete = previousNode && containsCompletePii(previousNode.nodeValue);
              const startsInsideToken = matchStart === 0 && (kind === "email"
                ? !previousComplete && /[A-Z0-9._%+-]/i.test(previousCharacter)
                : !previousComplete && /\d/.test(previousCharacter));
              if (startsInsideToken) continue;
              const startEntry = entries.find((entry) => matchStart >= entry.start && matchStart < entry.end);
              const endEntry = entries.find((entry) => matchEnd > entry.start && matchEnd <= entry.end);
              if (!startEntry || !endEntry) {
                privacyCandidateRangeOverflow = true;
                continue;
              }
              const rangeKey = `text:${textNodeId(startEntry.node)}:${matchStart - startEntry.start}:${textNodeId(endEntry.node)}:${matchEnd - endEntry.start}`;
              const previousKind = seenRangeKinds.get(rangeKey);
              if (previousKind !== undefined && candidatePriority(kind) <= candidatePriority(previousKind)) continue;
              const range = createTextRange(record.root, startEntry.node, matchStart - startEntry.start, endEntry.node, matchEnd - endEntry.start);
              if (!range) continue;
              const rect = rangeRect(range);
              if (rect) {
                seenRangeKinds.set(rangeKey, kind);
                addCandidate({ kind, target: startEntry.node.parentElement, rect, range, rangeKey, key: rangeKey, textNodes: entries.filter((entry) => entry.end > matchStart && entry.start < matchEnd).map((entry) => entry.node) });
              }
            }
          }
          if (entries.length >= maxPrivacyAdjacentTextNodes && textNodes[start + entries.length]
            && renderedTextBoundarySafe(entries[entries.length - 1].node, textNodes[start + entries.length], record.root)
            && uncertainBudgetContinuation(joined, textNodes[start + entries.length].nodeValue)) privacyCandidateRangeOverflow = true;
        }
      };
      const rootRecords = new Map();
      const seenRoots = new Set();
      const visitRoot = (root) => {
        if (!root?.childNodes || seenRoots.has(root) || traversal.exceeded) return;
        seenRoots.add(root);
        const record = { root, elements: [], textNodes: [] };
        rootRecords.set(root, record);
        traversal.inspected += 1;
        if (traversal.inspected > maxPrivacyTraversalNodes) {
          traversal.exceeded = true;
          return;
        }
        frames.push({ parent: root, index: 0, record });
      };
      const frames = [];
      visitRoot(document);
      while (frames.length && !traversal.exceeded) {
        const frame = frames[frames.length - 1];
        if (frame.index >= frame.parent.childNodes.length) {
          frames.pop();
          continue;
        }
        const node = frame.parent.childNodes[frame.index++];
        if (isOwnedPrivacyOverlayNode(node)) continue;
        traversal.inspected += 1;
        if (traversal.inspected > maxPrivacyTraversalNodes) {
          traversal.exceeded = true;
          break;
        }
        if (node.nodeType === 3) {
          if (node.parentElement) frame.record.textNodes.push(node);
          continue;
        }
        if (node.nodeType !== 1) {
          if (node.childNodes?.length) frames.push({ parent: node, index: 0, record: frame.record });
          continue;
        }
        if (node.matches?.("script,style,noscript,template")) continue;
        frame.record.elements.push(node);
        const shadow = node.shadowRoot;
        if (shadow?.childNodes) visitRoot(shadow);
        if (node.childNodes?.length) frames.push({ parent: node, index: 0, record: frame.record });
      }
      for (const record of rootRecords.values()) {
        for (const valueElement of record.elements) {
          if (candidateOverflow) break;
          const labelElement = valueElement.previousElementSibling;
          const valueTag = String(valueElement.tagName || "").toUpperCase();
          const labelTag = String(labelElement?.tagName || "").toUpperCase();
          const isSemanticPair = (labelTag === "DT" && valueTag === "DD") || (labelTag === "TH" && valueTag === "TD");
          const kind = isSemanticPair ? semanticKind(labelElement?.textContent) : null;
          if (!kind || !isVisibleTextElement(valueElement)) continue;
          const text = normalizeText(valueElement.textContent);
          if (!text || text.length > 160) continue;
          const rect = rectValues(valueElement.getBoundingClientRect());
          pairedValues.add(valueElement);
          addCandidate({ kind, target: valueElement, rect, key: `pair:${kind}:${candidates.length}` });
        }
        if (candidateOverflow) break;
        addRenderedTextCandidates(record, record.textNodes, pairedValues);
      }
      privacyCandidateOverflow = candidateOverflow;
      privacyCandidateTraversalOverflow = traversal.exceeded;
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
    const overlayBoundarySafe = (overlay) => {
      let current = overlay;
      while (current) {
        const computed = getComputedStyle(current);
        if (Number(computed.opacity) !== 1) return false;
        if (computed.filter !== "none" || computed.mixBlendMode !== "normal" || computed.clipPath !== "none" || computed.mask !== "none" || computed.maskImage !== "none" || computed.webkitMaskImage !== "none") return false;
        current = current.parentElement;
      }
      return true;
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
        style.setProperty("border-radius", "0", "important");
        style.setProperty("box-shadow", "none", "important");
        style.setProperty("background-image", "none", "important");
        style.setProperty("background-clip", "border-box", "important");
        style.setProperty("-webkit-background-clip", "border-box", "important");
        style.setProperty("background-color", overlayBackground(candidate.target), "important");
        style.setProperty("background", overlayBackground(candidate.target), "important");
        style.setProperty("opacity", "1", "important");
        style.setProperty("filter", "none", "important");
        style.setProperty("mix-blend-mode", "normal", "important");
        style.setProperty("clip", "auto", "important");
        style.setProperty("clip-path", "none", "important");
        style.setProperty("mask", "none", "important");
        style.setProperty("-webkit-mask", "none", "important");
        style.setProperty("text-shadow", "none", "important");
        style.setProperty("transform", "none", "important");
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
        privacyOverlayElements.add(overlay);
        overlayHost.append(overlay);
        const overlayRect = overlay.getBoundingClientRect?.();
        if (!isConnected(overlay) || !usableRect(overlayRect) || !overlayBoundarySafe(overlay)) {
          overlay.remove?.();
          throw new Error("SCREENSHOT_PII_OVERLAY_FAILED");
        }
        privacyOverlays.push({
          overlay,
          target: candidate.target,
          range: candidate.range || null,
          textNodes: candidate.textNodes || [],
          targetRect: rectValues(candidate.target.getBoundingClientRect()),
          protectedRect: rectValues(rect),
          overlayRect: rectValues(overlayRect),
          textFingerprint: textFingerprint(candidate.range?.toString?.() || candidate.target.textContent)
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
    const privacyRootSnapshot = collectPrivacyRootSnapshot();
    const privacyRootSet = new Set(privacyRootSnapshot);
    const protectedTargets = new Set(privacyOverlays.map(({ target }) => target));
    const protectedTextNodes = new Set(privacyOverlays.flatMap(({ textNodes }) => textNodes || []));
    const protectedTextParents = new Set([...protectedTextNodes].map((node) => node.parentElement).filter(Boolean));
    const isProtectedMutationNode = (node) => {
      if (!node) return false;
      if (protectedTextNodes.has(node) || protectedTextParents.has(node) || protectedTextParents.has(node?.parentElement)) return true;
      for (const target of [...protectedTargets, ...protectedTextParents]) {
        const label = target?.previousElementSibling;
        if (node === target || node === label || node === target?.parentElement || target?.contains?.(node)) return true;
      }
      return false;
    };
    const isProtectedAncestorMutationNode = (node) => {
      const element = node?.nodeType === 3 ? node.parentElement : node;
      if (!element) return false;
      for (const target of [...protectedTargets, ...protectedTextParents]) {
        for (const candidate of [target, target?.previousElementSibling]) {
          let current = candidate;
          while (current) {
            if (current === element) return true;
            current = current.parentElement || current.getRootNode?.()?.host || null;
          }
        }
      }
      return false;
    };
    const containsPiiText = (value) => {
      const text = String(value ?? "");
      return textPatterns.some(({ pattern }) => {
        pattern.lastIndex = 0;
        return pattern.test(text);
      });
    };
    const mutationPartialPattern = (value) => /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]*|0\d{1,4}[-ー−‐– ]\d{0,4}|〒\d{1,3}[-ー−‐– ]?\d{0,4})$/i.test(String(value ?? ""));
    const collectMutationVisibleText = (node, state) => {
      if (!node || state.nodeOverflow) return;
      state.inspectedNodes += 1;
      if (state.inspectedNodes > maxPrivacyAdjacentTextNodes) {
        state.nodeOverflow = true;
        return;
      }
      if (node.nodeType === 3) {
        const value = String(node.nodeValue ?? "");
        if (containsPiiText(value)) state.completeMatch = true;
        state.characterCount += value.length;
        if (state.characterCount > maxPrivacyAdjacentTextCharacters) state.characterOverflow = true;
        state.text = `${state.text}${value}`.slice(-maxPrivacyAdjacentTextCharacters);
        return;
      }
      if (node.nodeType !== 1) return;
      let ancestor = node;
      let ancestorDepth = 0;
      while (ancestor) {
        ancestorDepth += 1;
        if (ancestorDepth > maxPrivacyAdjacentTextNodes) {
          state.nodeOverflow = true;
          return;
        }
        if (ancestor.hidden || ancestor.matches?.("[hidden],script,style,noscript,template")) return;
        if (ancestor.isConnected) {
          const computed = getComputedStyle(ancestor);
          if (computed.display === "none" || computed.visibility === "hidden" || computed.visibility === "collapse" || Number(computed.opacity) === 0) return;
        }
        ancestor = ancestor.parentElement || ancestor.getRootNode?.()?.host || null;
      }
      for (const child of node.childNodes || []) collectMutationVisibleText(child, state);
    };
    const mutationTargetMayBeVisible = (target) => {
      let element = target?.nodeType === 3 ? target.parentElement : target;
      if (!element) return true;
      let inspected = 0;
      while (element) {
        inspected += 1;
        if (inspected > maxPrivacyAdjacentTextNodes) return null;
        if (element.hidden || element.matches?.("[hidden],script,style,noscript,template")) return false;
        if (element.isConnected) {
          const computed = getComputedStyle(element);
          if (computed.display === "none" || computed.visibility === "hidden" || computed.visibility === "collapse" || Number(computed.opacity) === 0) return false;
        }
        element = element.parentElement || element.getRootNode?.()?.host || null;
      }
      return true;
    };
    const mutationBoundaryMarker = (value) => mutationPartialPattern(value)
      || /[A-Z0-9._%+-]{3,}$/i.test(String(value ?? ""));
    const containsSplitPiiMutation = (records) => {
      let pending = "";
      for (const record of records || []) {
        // The target can be empty by the time the observer callback runs. Use
        // the bounded added/removed text evidence itself so a transient split
        // PII remains fail closed after both child nodes are removed.
        if (record.type !== "childList") continue;
        const targetVisibility = mutationTargetMayBeVisible(record.target);
        if (targetVisibility === null) return true;
        if (!targetVisibility) continue;
        const state = { text: "", inspectedNodes: 0, characterCount: 0, nodeOverflow: false, characterOverflow: false, completeMatch: false };
        for (const node of [...record.addedNodes || [], ...record.removedNodes || []]) {
          collectMutationVisibleText(node, state);
          if (state.nodeOverflow) break;
        }
        if (state.completeMatch) return true;
        if (!state.text) continue;
        const joined = `${pending}${state.text}`;
        if (containsPiiText(joined)) return true;
        if (state.nodeOverflow || state.characterOverflow) return true;
        const hasBoundaryMarker = mutationBoundaryMarker(joined);
        pending = hasBoundaryMarker ? joined.slice(-maxPrivacyAdjacentTextCharacters) : "";
      }
      return false;
    };
    const semanticPairKind = (labelElement, valueElement, labelText = labelElement?.textContent) => {
      const labelTag = String(labelElement?.tagName || "").toUpperCase();
      const valueTag = String(valueElement?.tagName || "").toUpperCase();
      const strictPair = (labelTag === "DT" && valueTag === "DD") || (labelTag === "TH" && valueTag === "TD");
      if (!strictPair || !normalizeText(valueElement?.textContent)) return null;
      return semanticKind(labelText);
    };
    const semanticMutationKind = (node, labelTexts = [], sibling = null) => {
      const element = node?.nodeType === 3 ? node.parentElement : node;
      if (!element) return null;
      let pairElement = element;
      while (pairElement && !["DD", "TD", "DT", "TH"].includes(String(pairElement.tagName || "").toUpperCase())) {
        pairElement = pairElement.parentElement;
      }
      if (!pairElement) return null;
      const tagName = String(pairElement.tagName || "").toUpperCase();
      if (["DD", "TD"].includes(tagName)) {
        return semanticPairKind(pairElement.previousElementSibling || sibling, pairElement);
      }
      if (!["DT", "TH"].includes(tagName)) return null;
      const valueCandidates = [pairElement.nextElementSibling, sibling].filter(Boolean);
      const labelCandidates = [pairElement.textContent, ...labelTexts];
      return valueCandidates.map((valueElement) => labelCandidates
        .map((labelText) => semanticPairKind(pairElement, valueElement, labelText))
        .find(Boolean)).find(Boolean) || null;
    };
    const containsSemanticCandidate = (node) => {
      if (!node) return false;
      const element = node.nodeType === 3 ? node.parentElement : node;
      if (!element) return false;
      for (const valueElement of [element, ...element.querySelectorAll?.("dd,td") || []]) {
        if (semanticPairKind(valueElement?.previousElementSibling, valueElement)) return true;
      }
      for (const labelElement of [element, ...element.querySelectorAll?.("dt,th") || []]) {
        if (semanticMutationKind(labelElement)) return true;
      }
      return false;
    };
    // Attribute changes on a host or an ancestor can expose text that is only
    // reachable through one or more open/privileged shadow roots. Keep this
    // evidence scan finite; exhausting the budget fails closed without
    // retaining or reporting the inspected value.
    const containsComposedCandidate = (node) => {
      const element = node?.nodeType === 3 ? node.parentElement : node;
      if (!element) return false;
      let inspected = 0;
      let matched = false;
      let budgetExceeded = false;
      const visitRoot = (root) => {
        if (!root?.childNodes || matched || budgetExceeded) return;
        for (const child of root.childNodes) {
          if (matched || budgetExceeded) return;
          inspected += 1;
          if (inspected > maxPrivacyTraversalNodes) {
            budgetExceeded = true;
            return;
          }
          if (child.nodeType === 3) {
            if (containsPiiText(child.nodeValue)) matched = true;
            continue;
          }
          if (child.nodeType !== 1) continue;
          visitElement(child);
        }
      };
      const visitElement = (current) => {
        if (!current || matched || budgetExceeded) return;
        const tagName = String(current.tagName || "").toUpperCase();
        if (["DD", "TD"].includes(tagName)) {
          const label = current.previousElementSibling;
          if (semanticKind(label?.textContent) && normalizeText(current.textContent)) {
            matched = true;
            return;
          }
        }
        visitRoot(current);
        if (matched || budgetExceeded) return;
        let shadow;
        try {
          shadow = shadowRootOf(current);
        } catch {
          budgetExceeded = true;
          return;
        }
        if (shadow?.childNodes) visitRoot(shadow);
      };
      visitElement(element);
      return matched || budgetExceeded;
    };
    const isSemanticMutationNode = (node, labelTexts = [], sibling = null) => Boolean(semanticMutationKind(node, labelTexts, sibling));
    const hasUnseenShadowRoot = (node) => {
      const elements = node?.nodeType === 1 ? [node, ...node.querySelectorAll?.("*") || []] : [];
      for (const element of elements) {
        let shadow;
        try {
          shadow = shadowRootOf(element);
        } catch {
          return true;
        }
        if (shadow && !privacyRootSet.has(shadow)) return true;
      }
      return false;
    };
    const privacyMutationAffectsBoundary = (record) => {
      if (record.type === "characterData") {
        return isProtectedMutationNode(record.target?.parentElement)
          || isSemanticMutationNode(record.target, [record.oldValue])
          || containsPiiText(record.oldValue)
          || containsPiiText(record.target?.nodeValue);
      }
      if (record.type === "attributes") {
        return isProtectedMutationNode(record.target)
          || isProtectedAncestorMutationNode(record.target)
          || isSemanticMutationNode(record.target)
          || containsPiiText(record.target?.textContent)
          || containsSemanticCandidate(record.target)
          || containsComposedCandidate(record.target);
      }
      if (record.type !== "childList") return false;
      const historyTexts = [...record.addedNodes || [], ...record.removedNodes || []]
        .map((node) => node?.textContent ?? node?.nodeValue ?? "");
      if (isProtectedMutationNode(record.target) || isSemanticMutationNode(record.target, historyTexts)) return true;
      for (const node of [...record.addedNodes || [], ...record.removedNodes || []]) {
        if (isProtectedMutationNode(node)
          || isSemanticMutationNode(node, [node.textContent], record.nextSibling || record.previousSibling)
          || containsPiiText(node.textContent)
          || containsSemanticCandidate(node)
          || hasUnseenShadowRoot(node)) return true;
      }
      return false;
    };
    const privacyObservers = [];
    const isOverlayNode = (node) => isOwnedPrivacyOverlayNode(node);
    const processPrivacyMutations = (records) => {
      if (containsSplitPiiMutation(records)) {
        privacyMutation.detected = true;
        return;
      }
      for (const record of records || []) {
        const isOverlayRecord = isOverlayNode(record.target)
          || ([...record.addedNodes || [], ...record.removedNodes || []].length > 0
            && [...record.addedNodes || [], ...record.removedNodes || []].every(isOverlayNode));
        if (!isOverlayRecord && privacyMutationAffectsBoundary(record)) {
          privacyMutation.detected = true;
          return;
        }
      }
    };
    if (typeof MutationObserver === "function") {
      const privacyRoots = [];
      const seenPrivacyRoots = new Set();
      const collectPrivacyRoots = (root) => {
        if (!root?.querySelectorAll || seenPrivacyRoots.has(root)) return;
        seenPrivacyRoots.add(root);
        privacyRoots.push(root);
        for (const host of root.querySelectorAll("*")) {
          const shadow = shadowRootOf(host);
          if (shadow?.querySelectorAll && host.shadowRoot) collectPrivacyRoots(shadow);
        }
      };
      collectPrivacyRoots(document);
      for (const root of privacyRoots) {
        const target = root === document ? (document.documentElement || document) : root;
        if (!target) continue;
        const privacyObserver = new MutationObserver(processPrivacyMutations);
        privacyObserver.observe(target, { subtree: true, childList: true, characterData: true, characterDataOldValue: true, attributes: true, attributeOldValue: true });
        observers.push(privacyObserver);
        privacyObservers.push(privacyObserver);
      }
    }
    const flushPrivacyMutations = () => {
      for (const observer of privacyObservers) processPrivacyMutations(observer.takeRecords?.() || []);
    };
    globalThis.__mecchaManualScreenshotMasks = { token, masks, observers, backdropMasks, backdropSelector, backdropRule, privacyOverlays, privacyMutation, privacyRootSnapshot, collectPrivacyRootSnapshot, flushPrivacyMutations, document, privacyOverlayClass, collectPrivacyCandidates, get privacyCandidateOverflow() { return privacyCandidateOverflow; }, get privacyCandidateTraversalOverflow() { return privacyCandidateTraversalOverflow; }, get privacyCandidateRangeOverflow() { return privacyCandidateRangeOverflow; }, get privacyRootTraversalOverflow() { return privacyRootTraversalOverflow; } };
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
    const clipIsAuto = (value) => {
      const clip = String(value || "").trim().toLowerCase();
      return !clip || clip === "auto" || /^rect\(\s*auto\s*,\s*auto\s*,\s*auto\s*,\s*auto\s*\)$/.test(clip);
    };
    const overlayBoundarySafe = (overlay) => {
      let current = overlay;
      while (current) {
        const computed = getComputedStyle(current);
        if (Number(computed.opacity) !== 1) return false;
        if (computed.filter !== "none" || computed.mixBlendMode !== "normal" || !clipIsAuto(computed.clip) || computed.clipPath !== "none" || computed.mask !== "none" || computed.maskImage !== "none" || computed.webkitMaskImage !== "none") return false;
        current = current.parentElement;
      }
      return true;
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
    state.flushPrivacyMutations?.();
    if (state.privacyMutation?.detected) return false;
    if (Array.isArray(state.privacyRootSnapshot) && typeof state.collectPrivacyRootSnapshot === "function") {
      const currentRoots = state.collectPrivacyRootSnapshot();
      if (state.privacyRootTraversalOverflow) return false;
      if (currentRoots.some((root) => !state.privacyRootSnapshot.includes(root))) return false;
    }
    if (typeof state.collectPrivacyCandidates === "function") {
      const currentCandidates = state.collectPrivacyCandidates();
      const overlays = state.privacyOverlays || [];
      if (state.privacyCandidateOverflow || state.privacyCandidateTraversalOverflow || state.privacyCandidateRangeOverflow) return false;
      if (currentCandidates.length !== overlays.length) return false;
      if (currentCandidates.some((candidate) => !overlays.some((item) => item.target === candidate.target && sameRect(item.protectedRect, candidate.rect)))) return false;
    }
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
        const text = String(item.range?.toString?.() || item.target.textContent || "");
        for (let index = 0; index < text.length; index += 1) {
          hash ^= text.charCodeAt(index);
          hash = Math.imul(hash, 16777619);
        }
        return `${text.length}:${hash >>> 0}`;
      })()) return false;
      const overlayStyle = getComputedStyle(item.overlay);
      const background = String(overlayStyle.backgroundColor || "").toLowerCase();
      const rgba = background.match(/^rgba?\([^,]+,[^,]+,[^,]+(?:,\s*([\d.]+))?\)$/);
      const webkitBackgroundClip = String(overlayStyle.webkitBackgroundClip || "").toLowerCase();
      if (overlayStyle.display === "none" || overlayStyle.visibility === "hidden" || Number(overlayStyle.opacity) !== 1 || overlayStyle.filter !== "none" || overlayStyle.mixBlendMode !== "normal" || !clipIsAuto(overlayStyle.clip) || overlayStyle.clipPath !== "none" || overlayStyle.mask !== "none" || overlayStyle.maskImage !== "none" || overlayStyle.webkitMaskImage !== "none" || overlayStyle.backgroundImage !== "none" || String(overlayStyle.backgroundClip).toLowerCase() !== "border-box" || (webkitBackgroundClip && webkitBackgroundClip !== "border-box") || overlayStyle.borderRadius !== "0px" || overlayStyle.boxShadow !== "none" || background === "transparent" || !rgba || (rgba[1] !== undefined && Number(rgba[1]) < 1) || !overlayBoundarySafe(item.overlay)) return false;
      const rect = item.overlay.getBoundingClientRect();
      const viewportWidth = Number(globalThis.innerWidth || document.documentElement?.clientWidth || 0);
      const viewportHeight = Number(globalThis.innerHeight || document.documentElement?.clientHeight || 0);
      const visibleLeft = Math.max(0, rect.left);
      const visibleTop = Math.max(0, rect.top);
      const visibleRight = Math.min(viewportWidth, rect.left + rect.width);
      const visibleBottom = Math.min(viewportHeight, rect.top + rect.height);
      if (![viewportWidth, viewportHeight, visibleLeft, visibleTop, visibleRight, visibleBottom].every(Number.isFinite)
        || visibleRight <= visibleLeft || visibleBottom <= visibleTop) return false;
      const previousPointerEvents = item.overlay.style.getPropertyValue("pointer-events");
      const previousPointerPriority = item.overlay.style.getPropertyPriority("pointer-events");
      let topElement;
      try {
        item.overlay.style.setProperty("pointer-events", "auto", "important");
        topElement = document.elementFromPoint?.((visibleLeft + visibleRight) / 2, (visibleTop + visibleBottom) / 2);
      } finally {
        if (previousPointerEvents) item.overlay.style.setProperty("pointer-events", previousPointerEvents, previousPointerPriority);
        else item.overlay.style.removeProperty("pointer-events");
      }
      if (!topElement || (topElement !== item.overlay && !item.overlay.contains?.(topElement))) return false;
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
