export async function captureWithMaskBoundary({ applyMasks, waitForPaint = async () => undefined, capture, verifyMasks, removeMasks, includePrivacyMetadata = false }) {
  let maskingAttempted = false;
  try {
    maskingAttempted = true;
    const result = await applyMasks();
    if (result?.reason === "SCREENSHOT_BUDGET_EXCEEDED") throw new Error(result.reason);
    if (!result?.applied || (verifyMasks && !result?.token)) throw new Error("SCREENSHOT_MASK_FAILED");
    await waitForPaint();
    if (verifyMasks && !(await verifyMasks(result.token))) throw new Error("SCREENSHOT_MASK_INVALIDATED");
    const image = await capture();
    if (typeof image !== "string" || !image.startsWith("data:image/")) throw new Error("SCREENSHOT_CAPTURE_FAILED");
    if (verifyMasks && !(await verifyMasks(result.token))) throw new Error("SCREENSHOT_MASK_INVALIDATED");
    return includePrivacyMetadata ? { dataUrl: image, privacyReview: result.privacyReview } : image;
  } finally {
    if (maskingAttempted) await removeMasks().catch(() => undefined);
  }
}

export async function installSensitiveMasks(options = {}) {
  const existing = globalThis.__mecchaManualScreenshotMasks;
  if (existing?.token) {
    if (options?.recordId && options.recordId !== existing.recordId) return { applied: false };
    return { applied: true, count: existing.masks.length, privacyMaskedCount: existing.privacyOverlays.length, privacyReview: existing.privacyReview, token: existing.token,
      ...(options.privateAliasState ? { privateAliasAllocations: existing.privateAliasAllocations } : {}),
      ...((existing.privacyCandidateOverflow || existing.privacyCandidateTraversalOverflow || existing.privacyCandidateRangeOverflow || existing.privacyRootTraversalOverflow) ? { reason: "SCREENSHOT_BUDGET_EXCEEDED" } : {}) };
  }

  const masks = [];
  const observers = [];
  const backdropMasks = [];
  const privacyOverlays = [];
  const token = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  const backdropSelector = "*";
  const backdropRule = "*::backdrop{opacity:0!important;transition:none!important;animation:none!important;}";
  const privacyOverlayClass = "meccha-manual-pii-overlay";
  const privacyDummies = Object.freeze({
    name: "山田 花子", company: "株式会社サンプル", address: "サンプル県 例示市 テスト町 1-2-3",
    phone: "000-0000-0000", email: "hanako@example.invalid", customerId: "C000123",
    employeeId: "EMP0007", birthday: "2000-01-01", secret: "••••••••", unknown: "サンプル値"
  });
  const reviewReasons = new Set();
  // Only exact displayed value + kind correlates within a recording. These
  // aliases do not assert that two fields describe the same person or entity.
  const recordId = typeof options?.recordId === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(options.recordId) ? options.recordId : token;
  let record;
  let stopAliasPreparation = () => false;
  const privacyReview = { replacementCount: 0, protectedRegionCount: 0, reviewRequired: false, reasonCodes: [], replacements: [] };
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
    if (options.privateAliasState) {
      const state = options.privateAliasState;
      if (state.version !== 1 || state.recordId !== recordId || !/^[a-f0-9-]{36}$/.test(state.namespace)
        || !/^[a-f0-9]{64}$/.test(state.secret) || !Array.isArray(state.allocations)
        || state.allocations.length > 512 || state.next !== state.allocations.length
        || state.allocations.some((entry, index) => !Array.isArray(entry) || entry.length !== 2
          || !/^[a-f0-9]{64}$/.test(entry[0]) || entry[1] !== index + 1)
        || new Set(state.allocations.map(([key]) => key)).size !== state.allocations.length) throw new Error("SCREENSHOT_ALIAS_STATE_INVALID");
      record = { ...state, allocations: new Map(state.allocations) };
    } else {
      // Standalone installation keeps the same bounded state only in the
      // isolated document. Production always supplies the trusted session state.
      record = globalThis.__mecchaManualPrivacyRecord;
      if (!record || record.recordId !== recordId) {
        record = { version: 1, recordId, namespace: crypto.randomUUID(),
          secret: Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join(""),
          allocations: new Map(), next: 0 };
        globalThis.__mecchaManualPrivacyRecord = record;
      }
    }

    const shadowRootOf = (host) => host instanceof HTMLElement ? chrome.dom.openOrClosedShadowRoot(host) : host.shadowRoot;
    const selector = [
      "canvas",
      "iframe"
    ].join(",");
    const masked = new WeakSet();
    const observedRoots = new WeakMap();
    const backdropRoots = new WeakSet();
    const mutationEvidence = {
      currentStreams: new Map(),
      oldCharacterStreams: new Map(),
      seenChildValues: new WeakMap(),
      seenCurrentCharacterValues: new WeakMap(),
      inspectedNodes: 0,
      inspectedCharacters: 0,
      childListNodes: 0,
      childListCharacters: 0,
      overflow: false
    };
    const privacyMutation = { detected: false, mutationEvidence };
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
      // A truncated label is unknown, never evidence that a value is public.
      const raw = String(value ?? "");
      if (raw.length > 4096) return "unknown";
      const label = normalizeText(raw).toLowerCase();
      if (/password|passcode|token|secret|cc-|card|credit|cvv|cvc|pin|パスワード|秘密|カード|暗証|個人番号|マイナンバー|認証コード/.test(label)) return "secret";
      if (/メール|e-?mail|mail|電子.?メール/.test(label)) return "email";
      if (/電話|tel|phone|携帯|mobile/.test(label)) return "phone";
      if (/住所|address|所在地/.test(label)) return "address";
      if (/会社|企業|店舗|施設|organization|company/.test(label)) return "company";
      if (/生年月日|誕生日|birth|bday/.test(label)) return "birthday";
      if (/社員番号|従業員番号|employee.?id|staff.?id/.test(label)) return "employeeId";
      if (/顧客番号|会員番号|customer.?id|member.?id/.test(label)) return "customerId";
      if (/氏名|名前|担当者|姓名|(?:^|[\s_-])(?:given-|family-|full-)?name(?:$|[\s_-])/.test(label)) return "name";
      return null;
    };
    // Kept identical in recorder.js: both injected entry points must classify
    // table context without imports. A slot/association budget is fail-closed.
    const semanticTableKinds = (table, classify) => {
      const rows = Array.from(table?.rows || []);
      const kinds = new Map();
      const entries = [];
      const grid = [];
      const groupEnds = new Map();
      let slots = 0, associations = 0;
      const exceed = () => { throw new Error("SCREENSHOT_BUDGET_EXCEEDED"); };
      if (rows.length > 4096) exceed();
      rows.forEach((row, index) => groupEnds.set(row.parentElement, index + 1));
      for (const [rowIndex, row] of rows.entries()) {
        const cells = Array.from(row.cells || []);
        if (cells.length > 4096) exceed();
        const headerRow = cells.length > 0 && cells.every((cell) => cell.tagName === "TH");
        let column = 0;
        for (const cell of cells) {
          while (grid[rowIndex]?.[column]) { if (++column > 4096) exceed(); }
          const width = Number(cell.colSpan || 1);
          const height = Number(cell.rowSpan);
          if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 0) exceed();
          const endRow = Math.min(groupEnds.get(row.parentElement), height === 0 ? groupEnds.get(row.parentElement) : rowIndex + height);
          const endColumn = column + width;
          const scope = String(cell.getAttribute?.("scope") || "").toLowerCase();
          if (scope && !["row", "rowgroup", "col", "colgroup"].includes(scope)) exceed();
          const columnHeader = cell.tagName === "TH" && (scope === "col" || scope === "colgroup"
            || (!scope && (row.parentElement?.tagName === "THEAD" || headerRow)));
          const entry = { cell, row: rowIndex, endRow, column, endColumn, group: row.parentElement, scope, columnHeader };
          for (let r = rowIndex; r < endRow; r += 1) {
            grid[r] ||= [];
            for (let c = column; c < endColumn; c += 1) {
              if (++slots > 4096 || grid[r][c]) exceed();
              grid[r][c] = entry;
            }
          }
          entries.push(entry);
          column = endColumn;
        }
      }
      const headers = entries.filter((entry) => entry.cell.tagName === "TH");
      const byId = new Map();
      for (const header of headers) {
        header.kind = classify(header.cell.textContent);
        const id = header.cell.id;
        if (id) byId.set(id, byId.has(id) ? null : header);
      }
      for (const entry of entries) {
        if (entry.columnHeader) continue;
        const matched = new Set();
        const explicit = String(entry.cell.getAttribute?.("headers") || "");
        if (explicit.length > 4096) exceed();
        for (const id of explicit.split(/\s+/).filter(Boolean)) {
          if (++associations > 65536) exceed();
          const header = byId.get(id);
          if (!header || header === entry) matched.add("unknown");
          else if (header.kind) matched.add(header.kind);
        }
        for (const header of headers) {
          if (++associations > 65536) exceed();
          if (header === entry || !header.kind) continue;
          const sameColumns = header.column < entry.endColumn && entry.column < header.endColumn;
          const sameRows = header.row < entry.endRow && entry.row < header.endRow;
          const applies = header.columnHeader
            ? header.row < entry.row && sameColumns
            : header.scope === "rowgroup" ? header.group === entry.group
              : sameRows && header.endColumn <= entry.column;
          if (applies) matched.add(header.kind);
        }
        // Conflicting hierarchical headers must not produce a guessed alias.
        const kind = matched.has("secret") ? "secret" : matched.size > 1 ? "unknown" : [...matched][0] || null;
        if (kind) kinds.set(entry.cell, kind);
      }
      return kinds;
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
        if (computed.display === "none" || computed.contentVisibility === "hidden" || computed.visibility === "hidden" || computed.visibility === "collapse" || Number(computed.opacity) === 0) return false;
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
    const fieldSelector = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="spinbutton"],[aria-valuetext]';
    const fieldKind = (element) => {
      const type = String(element.type || element.getAttribute?.("type") || "").toLowerCase();
      if (element.tagName === "INPUT" && ["button", "submit", "reset", "image", "checkbox", "radio", "range", "color", "hidden"].includes(type)) return null;
      if (type === "password") return "secret";
      const metadata = [type, element.getAttribute?.("autocomplete"), element.getAttribute?.("name"), element.id,
        element.getAttribute?.("aria-label"), ...Array.from(element.labels || [], (label) => label.textContent)].filter(Boolean).join(" ");
      const kind = semanticKind(metadata);
      if (kind) return kind;
      // Explicit quantity/price controls retain their meaningful numeric value.
      // An unclassified text field is never presumed non-personal.
      if ((type === "number" || element.getAttribute?.("role") === "spinbutton") && /数量|個数|件数|金額|単価|価格|quantity|amount|price/i.test(metadata)) return null;
      return "unknown";
    };
    const fieldValue = (element) => fieldKind(element) === "secret" ? "" : element.tagName === "SELECT"
      ? Array.from(element.selectedOptions || [], (option) => option.textContent).join(" ")
      : ("value" in element ? String(element.value ?? "") : String(element.textContent || element.getAttribute?.("aria-valuetext") || ""));
    const fieldRect = (element) => {
      const rect = rectValues(element.getBoundingClientRect());
      const style = getComputedStyle(element);
      // Preserve the live frame. The opaque interior includes all padding and
      // the native value area, so long values and native date/file controls
      // cannot protrude. Transformed/skewed controls require review instead.
      const left = parseFloat(style.borderLeftWidth) || 0, right = parseFloat(style.borderRightWidth) || 0;
      const top = parseFloat(style.borderTopWidth) || 0, bottom = parseFloat(style.borderBottomWidth) || 0;
      return { left: rect.left + left, top: rect.top + top, width: rect.width - left - right, height: rect.height - top - bottom };
    };
    const fieldGeometrySafe = (element) => {
      let current = element;
      while (current) {
        const style = getComputedStyle(current);
        if (style.transform !== "none" || (style.zoom && !["1", "normal"].includes(style.zoom))) return false;
        current = current.parentElement || current.getRootNode?.()?.host || null;
      }
      return true;
    };
    const collectPrivacyCandidates = () => {
      privacyCandidateRangeOverflow = false;
      const candidates = [];
      const pairedValues = new WeakSet();
      const tableKinds = new Map();
      const tableKind = (element) => {
        const table = element.closest?.("table");
        if (!table) return null;
        if (!tableKinds.has(table)) tableKinds.set(table, semanticTableKinds(table, semanticKind));
        return tableKinds.get(table).get(element) || null;
      };
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
      const visibleInlineCss = (element) => {
        if (!element || !inlineDisplay(element)) return false;
        let current = element;
        while (current) {
          if (isOwnedPrivacyOverlayNode(current) || current.matches?.("script,style,noscript,template,br")) return false;
          const computed = getComputedStyle(current);
          if (computed.display === "none" || computed.contentVisibility === "hidden" || computed.visibility === "hidden" || computed.visibility === "collapse" || Number(computed.opacity) === 0) return false;
          current = current.parentElement || current.getRootNode?.()?.host || null;
        }
        return true;
      };
      const visibleTextBoundary = (element) => {
        if (!element) return false;
        if (isVisibleTextElement(element)) return true;
        if (!visibleInlineCss(element)) return false;
        const computed = getComputedStyle(element);
        return computed.display === "contents" || String(element.textContent ?? "") === "";
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
        if (!previousParent || !nextParent || !visibleTextBoundary(previousParent) || !visibleTextBoundary(nextParent)) return false;
        let current = previous;
        let inspected = 0;
        while (current && current !== root) {
          inspected += 1;
          if (inspected > maxPrivacyAdjacentTextNodes) {
            privacyCandidateRangeOverflow = true;
            return false;
          }
          if (current.nextSibling) {
            if (current.nodeType === 1 && !visibleInlineCss(current)) return false;
            current = current.nextSibling;
            break;
          }
          if (current.nodeType === 1 && !visibleInlineCss(current)) return false;
          current = current.parentNode;
        }
        while (current && current !== next) {
          inspected += 1;
          if (inspected > maxPrivacyAdjacentTextNodes) {
            privacyCandidateRangeOverflow = true;
            return false;
          }
          if (current.nodeType === 1) {
            if (current.matches?.("script,style,noscript,template,br")) return false;
            if (!visibleInlineCss(current)) return false;
          }
          current = nextNodeInRoot(current, root);
        }
        return current === next;
      };
      const joinRenderedText = (entries) => {
        const characters = [];
        const mapping = [];
        let pendingWhitespace = null;
        const emitWhitespace = () => {
          if (!pendingWhitespace) return;
          characters.push(" ");
          mapping.push(pendingWhitespace);
          pendingWhitespace = null;
        };
        for (const entry of entries) {
          const value = String(entry.value ?? "");
          const whiteSpace = String(getComputedStyle(entry.node.parentElement || entry.node).whiteSpace || "normal").toLowerCase();
          const collapsesWhitespace = whiteSpace === "normal" || whiteSpace === "nowrap" || whiteSpace === "pre-line";
          const collapsesSegmentBreak = whiteSpace === "normal" || whiteSpace === "nowrap";
          for (let index = 0; index < value.length; index += 1) {
            const character = value[index];
            if ((collapsesWhitespace && /[ \t\f\r]/u.test(character))
              || (collapsesSegmentBreak && character === "\n")) {
              if (!pendingWhitespace) pendingWhitespace = { entry, entries: new Set([entry]), start: index, end: index + 1 };
              else if (pendingWhitespace.entry === entry) pendingWhitespace.end = index + 1;
              else pendingWhitespace.entries.add(entry);
              continue;
            }
            emitWhitespace();
            characters.push(character);
            mapping.push({ entry, start: index, end: index + 1 });
          }
        }
        emitWhitespace();
        return { text: characters.join(""), mapping };
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
        if (!previousParent || !nextParent || !visibleTextBoundary(nextParent)) return false;
        const boundaryElementSafe = (element) => {
          if (!element || !element.matches?.("script,style,noscript,template,br")) {
            if (isVisibleTextElement(element)) return inlineDisplay(element);
            const computed = element && getComputedStyle(element);
            if (computed && (computed.display === "none" || computed.contentVisibility === "hidden" || computed.visibility === "hidden" || computed.visibility === "collapse" || Number(computed.opacity) === 0)) return true;
            return visibleInlineCss(element);
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
          if (!visibleTextBoundary(node.parentElement)) continue;
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
          if (!first.parentElement || isPairedTextNode(first, pairedValues) || !visibleTextBoundary(first.parentElement)) continue;
          const entries = [];
          let characterCount = 0;
          for (let index = start; index < textNodes.length && entries.length < maxPrivacyAdjacentTextNodes; index += 1) {
            const node = textNodes[index];
            if (!node.parentElement || isPairedTextNode(node, pairedValues)) {
              if (entries.length && uncertainBoundary(entries.map((entry) => entry.value).join(""))) privacyCandidateRangeOverflow = true;
              break;
            }
            if (!visibleTextBoundary(node.parentElement)) {
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
          const rendered = joinRenderedText(entries);
          const joined = rendered.text;
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
              const startPoint = rendered.mapping[matchStart];
              const endPoint = rendered.mapping[matchEnd - 1];
              if (!startPoint || !endPoint) {
                privacyCandidateRangeOverflow = true;
                continue;
              }
              const startEntry = startPoint.entry;
              const endEntry = endPoint.entry;
              const rangeKey = `text:${textNodeId(startEntry.node)}:${startPoint.start}:${textNodeId(endEntry.node)}:${endPoint.end}`;
              const previousKind = seenRangeKinds.get(rangeKey);
              if (previousKind !== undefined && candidatePriority(kind) <= candidatePriority(previousKind)) continue;
              const range = createTextRange(record.root, startEntry.node, startPoint.start, endEntry.node, endPoint.end);
              if (!range) continue;
              const rect = rangeRect(range);
              if (rect) {
                seenRangeKinds.set(rangeKey, kind);
                const matchedEntries = entries.filter((entry) => rendered.mapping.slice(matchStart, matchEnd).some((point) => point.entry === entry || point.entries?.has(entry)));
                addCandidate({ kind, target: startEntry.node.parentElement, rect, range, rangeKey, key: rangeKey, textNodes: matchedEntries.map((entry) => entry.node) });
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
          if (valueElement.matches?.(fieldSelector) && isVisibleTextElement(valueElement)) {
            if (!intersectsViewport(valueElement.getBoundingClientRect())) continue;
            const kind = fieldKind(valueElement);
            pairedValues.add(valueElement);
            if (kind) {
              if (!fieldGeometrySafe(valueElement)) throw new Error("SCREENSHOT_FIELD_GEOMETRY_UNSAFE");
              // Rich editable/custom widgets can paint children outside their
              // box. Until a range-safe adapter exists, refuse the image
              // rather than relying on an interior overlay that could leak.
              if (!["INPUT", "TEXTAREA", "SELECT"].includes(valueElement.tagName)
                || (valueElement.tagName === "SELECT" && (valueElement.multiple || valueElement.size > 1))) throw new Error("SCREENSHOT_FIELD_GEOMETRY_UNSAFE");
              addCandidate({ kind, target: valueElement, rect: fieldRect(valueElement), field: true, key: `field:${candidates.length}` });
            }
            continue;
          }
          const labelElement = valueElement.previousElementSibling;
          const valueTag = String(valueElement.tagName || "").toUpperCase();
          const labelTag = String(labelElement?.tagName || "").toUpperCase();
          const isSemanticPair = (labelTag === "DT" && valueTag === "DD") || (labelTag === "TH" && valueTag === "TD");
          const kind = (["TD", "TH"].includes(valueTag) ? tableKind(valueElement) : null)
            || (isSemanticPair ? semanticKind(labelElement?.textContent) : null);
          if (!kind || !isVisibleTextElement(valueElement) || valueElement.querySelector?.(fieldSelector)) continue;
          const text = normalizeText(valueElement.textContent);
          if (!text) continue;
          if (text.length > 4096) throw new Error("SCREENSHOT_BUDGET_EXCEEDED");
          const rect = fieldRect(valueElement);
          pairedValues.add(valueElement);
          addCandidate({ kind, target: valueElement, rect, interior: true, key: `pair:${kind}:${candidates.length}` });
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
    const candidateValue = (candidate) => String(candidate.field ? fieldValue(candidate.target) : candidate.range?.toString?.() || candidate.target.textContent || "");
    const prepareAliases = async (candidates) => {
      const snapshots = candidates.map((candidate) => {
        const value = candidateValue(candidate);
        if (value.length > 4096) throw new Error("SCREENSHOT_BUDGET_EXCEEDED");
        return { candidate, value };
      });
      if (!snapshots.length) return;
      let invalidated = false;
      const invalidate = () => { invalidated = true; };
      // Async key preparation has the same conservative hidden-content lease
      // as quota waiting: only content already AND still display:none is exempt.
      const roots = collectPrivacyRootSnapshot();
      const hiddenRoots = [];
      let visited = 0;
      for (const root of roots) {
        for (const element of root.querySelectorAll?.("*") || []) {
          if (++visited > 4096) break;
          if (["HTML", "HEAD", "STYLE", "LINK", "SCRIPT"].includes(element.tagName)) continue;
          if (hiddenRoots.some((hidden) => hidden.contains(element))) continue;
          if (getComputedStyle(element).display === "none") hiddenRoots.push(element);
        }
        if (visited > 4096) break;
      }
      const stylingNode = (node) => {
        const element = node?.nodeType === 3 ? node.parentElement : node;
        return Boolean(element?.closest?.("style,link,script,head") || element?.matches?.("style,link,script") || element?.querySelector?.("style,link,script"));
      };
      const contentStayedHidden = (change) => change.type !== "attributes" && !stylingNode(change.target)
        && ![...change.addedNodes || [], ...change.removedNodes || []].some(stylingNode)
        && hiddenRoots.some((root) => root.isConnected && getComputedStyle(root).display === "none" && (root === change.target || root.contains(change.target)));
      const inspect = (changes) => {
        if (changes.some((change) => !isOwnedPrivacyOverlayNode(change.target) && !contentStayedHidden(change)
          && !([...change.addedNodes || [], ...change.removedNodes || []].length
            && [...change.addedNodes || [], ...change.removedNodes || []].every(isOwnedPrivacyOverlayNode)))) invalidate();
      };
      const preparationObservers = [];
      for (const root of roots) {
        const observer = new MutationObserver(inspect);
        observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true });
        preparationObservers.push(observer);
        observers.push(observer);
      }
      const events = ["input", "change", "scroll", "resize", "pagehide"];
      for (const name of events) globalThis.addEventListener(name, invalidate, true);
      stopAliasPreparation = () => {
        for (const observer of preparationObservers) { inspect(observer.takeRecords()); observer.disconnect(); }
        for (const name of events) globalThis.removeEventListener(name, invalidate, true);
        return invalidated;
      };
      const key = await crypto.subtle.importKey("raw", Uint8Array.from(record.secret.match(/../g), (byte) => parseInt(byte, 16)),
        { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const keys = await Promise.all(snapshots.map(async ({ candidate, value }) => {
        if (["secret", "unknown"].includes(candidate.kind)) return null;
        const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(JSON.stringify([candidate.kind, value])));
        return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      }));
      // Async crypto must never leave a gap in the existing capture boundary.
      // Property writes need this explicit comparison because they need not
      // dispatch input events or produce DOM mutation records.
      if (invalidated || snapshots.some(({ candidate, value }) => !isConnected(candidate.target) || candidateValue(candidate) !== value)) {
        throw new Error("SCREENSHOT_MASK_INVALIDATED");
      }
      for (let index = 0; index < snapshots.length; index += 1) {
        const digest = keys[index];
        if (!digest) continue;
        if (!record.allocations.has(digest)) {
          if (record.allocations.size >= 512) throw new Error("SCREENSHOT_BUDGET_EXCEEDED");
          record.allocations.set(digest, ++record.next);
        }
        snapshots[index].candidate.aliasOrdinal = record.allocations.get(digest);
      }
    };
    const replacementFor = (candidate) => {
      const kind = candidate.kind;
      if (kind === "secret" || kind === "unknown") return privacyDummies[kind];
      const ordinal = candidate.aliasOrdinal;
      if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 512) throw new Error("SCREENSHOT_ALIAS_STATE_INVALID");
      const serial = String(ordinal).padStart(6, "0");
      candidate.safeAliasId = `${record.namespace}:${kind}:${serial}`;
      if (kind === "name") return `山田 花子${ordinal}`;
      if (kind === "company") return `株式会社サンプル${ordinal}`;
      if (kind === "address") return `サンプル県 例示市 テスト町 ${serial.slice(0, 2)}-${serial.slice(2, 4)}-${serial.slice(4)}`;
      if (kind === "email") return `sample${serial}@example.invalid`;
      if (kind === "phone") return `000-0${serial.slice(0, 3)}-${serial.slice(2)}`;
      if (kind === "customerId") return `C${serial}`;
      if (kind === "employeeId") return `EMP${serial}`;
      if (kind === "birthday") return `${2000 + Math.floor((ordinal - 1) / 336)}-${String(Math.floor((ordinal - 1) % 336 / 28) + 1).padStart(2, "0")}-${String((ordinal - 1) % 28 + 1).padStart(2, "0")}`;
      return privacyDummies[kind];
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
        if (Number(computed.opacity) !== 1 || computed.contentVisibility === "hidden" || computed.display === "none" || computed.visibility !== "visible") return false;
        if (computed.filter !== "none" || computed.mixBlendMode !== "normal" || computed.clipPath !== "none" || computed.mask !== "none" || computed.maskImage !== "none" || computed.webkitMaskImage !== "none") return false;
        current = current.parentElement;
      }
      return true;
    };
    const addPrivacyOverlays = async () => {
      if (!document.body || typeof document.createElement !== "function") return 0;
      const overlayHost = document.documentElement || document.body;
      const candidates = collectPrivacyCandidates();
      await prepareAliases(candidates);
      for (const candidate of candidates) {
        const overlay = document.createElement("span");
        const rect = candidate.rect;
        const computed = getComputedStyle(candidate.target);
        overlay.className = privacyOverlayClass;
        overlay.setAttribute("aria-hidden", "true");
        overlay.setAttribute("role", "presentation");
        overlay.textContent = replacementFor(candidate);
        if (candidate.kind === "unknown") reviewReasons.add("unknown_field_semantics");
        const style = overlay.style;
        style.setProperty("position", "fixed", "important");
        style.setProperty("left", `${rect.left}px`, "important");
        style.setProperty("top", `${rect.top}px`, "important");
        style.setProperty("width", `${rect.width}px`, "important");
        style.setProperty("height", `${rect.height}px`, "important");
        style.setProperty("box-sizing", "border-box", "important");
        style.setProperty("display", "block", "important");
        style.setProperty("overflow", "hidden", "important");
        style.setProperty("white-space", candidate.field && candidate.target.tagName === "TEXTAREA" ? "pre-wrap" : "nowrap", "important");
        style.setProperty("pointer-events", "none", "important");
        style.setProperty("user-select", "none", "important");
        style.setProperty("z-index", "2147483647", "important");
        style.setProperty("margin", "0", "important");
        style.setProperty("padding", candidate.field || candidate.interior ? computed.padding : "0", "important");
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
        if (candidate.field && candidate.target.tagName === "SELECT") {
          const arrow = document.createElement("span");
          arrow.textContent = " ▾";
          arrow.style.cssText = "position:absolute!important;right:4px!important;top:0!important;bottom:0!important;display:flex!important;align-items:center!important;pointer-events:none!important";
          arrow.style.setProperty("background", overlayBackground(candidate.target), "important");
          overlay.append(arrow);
        }
        overlayHost.append(overlay);
        const overlayRect = overlay.getBoundingClientRect?.();
        if (!isConnected(overlay) || !usableRect(overlayRect) || !overlayBoundarySafe(overlay)) {
          overlay.remove?.();
          throw new Error("SCREENSHOT_PII_OVERLAY_FAILED");
        }
        const viewportWidth = Number(globalThis.innerWidth || document.documentElement.clientWidth);
        const viewportHeight = Number(globalThis.innerHeight || document.documentElement.clientHeight);
        const visibleX = Math.max(0, rect.left), visibleY = Math.max(0, rect.top);
        const visibleWidth = Math.min(viewportWidth, rect.left + rect.width) - visibleX;
        const visibleHeight = Math.min(viewportHeight, rect.top + rect.height) - visibleY;
        if (viewportWidth > 0 && viewportHeight > 0 && visibleWidth > 0 && visibleHeight > 0) {
          // Only fictional output text and normalized geometry cross the capture
          // boundary. The original text, allocation hashes and DOM never do.
          privacyReview.replacements.push({
            id: candidate.safeAliasId || `${record.namespace}:${candidate.kind}:${privacyReview.replacements.length}`,
            kind: candidate.kind, text: overlay.textContent,
            x: visibleX / viewportWidth, y: visibleY / viewportHeight,
            width: visibleWidth / viewportWidth, height: visibleHeight / viewportHeight
          });
        }
        privacyOverlays.push({
          overlay,
          target: candidate.target,
          range: candidate.range || null,
          field: Boolean(candidate.field),
          interior: Boolean(candidate.interior),
          kind: candidate.kind,
          replacement: overlay.textContent,
          textNodes: candidate.textNodes || [],
          targetRect: rectValues(candidate.target.getBoundingClientRect()),
          protectedRect: rectValues(rect),
          overlayRect: rectValues(overlayRect),
          textFingerprint: textFingerprint(candidate.field ? fieldValue(candidate.target) : candidate.range?.toString?.() || candidate.target.textContent)
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

    const maskElement = (element, opaqueSubtree = false, protectedReason = null) => {
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
      if (intersectsViewport(rect)) {
        privacyReview.protectedRegionCount += 1;
        reviewReasons.add(protectedReason || (opaqueSubtree ? "unsupported_closed_shadow" : String(element.tagName).toUpperCase() === "CANVAS" ? "unsupported_canvas" : "unsupported_iframe"));
      }
    };

    const fieldNeedsOpaqueProtection = (element) => element.matches?.(fieldSelector)
      && fieldKind(element) && isVisibleTextElement(element) && intersectsViewport(element.getBoundingClientRect())
      && (!fieldGeometrySafe(element) || !["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)
        || (element.tagName === "SELECT" && (element.multiple || element.size > 1)));
    const protectUnsupportedField = (element) => {
      maskElement(element, true, "unsupported_editable");
      const root = element.getRootNode?.();
      if (root && !backdropRoots.has(root)) { installBackdropMask(root); backdropRoots.add(root); }
      // Protect every descendant separately, including top-layer content whose
      // pixels do not inherit the host's opacity. This is a partial safe image,
      // explicitly marked for review, rather than rejecting the whole viewport.
      scanRoot(element, true);
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
      if (!maskAllDescendants) for (const element of root.querySelectorAll(fieldSelector)) if (fieldNeedsOpaqueProtection(element)) protectUnsupportedField(element);
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
                else if (fieldNeedsOpaqueProtection(node)) protectUnsupportedField(node);
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
    const privacyMaskedCount = await addPrivacyOverlays();
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
    const mutationPartialPattern = (value) => /[A-Z0-9._%+-]+@[A-Z0-9.-]*/i.test(String(value ?? ""))
      || /@[A-Z0-9.-]+/i.test(String(value ?? ""))
      || /(?:0\d{1,4}[-ー−‐– ]\d{0,4}|〒\d{1,3}[-ー−‐– ]?\d{0,4})$/i.test(String(value ?? ""));
    const collectMutationVisibleText = (node, state) => {
      if (!node || state.nodeOverflow) return;
      state.inspectedNodes += 1;
      if (state.inspectedNodes > maxPrivacyAdjacentTextNodes) {
        state.nodeOverflow = true;
        return;
      }
      if (node.nodeType === 3) {
        const value = String(node.nodeValue ?? "");
        const renderedValue = collapseMutationWhitespace(value, node);
        if (mutationPartialPattern(renderedValue)) state.completeMatch = true;
        if (containsPiiText(renderedValue)) state.completeMatch = true;
        state.characterCount += value.length;
        if (state.characterCount > maxPrivacyAdjacentTextCharacters) state.characterOverflow = true;
        state.text = appendMutationRenderedText(state.text, renderedValue, state.lastNode, node).slice(-maxPrivacyAdjacentTextCharacters);
        state.lastNode = node;
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
          if (computed.display === "none" || computed.contentVisibility === "hidden" || computed.visibility === "hidden" || computed.visibility === "collapse" || Number(computed.opacity) === 0) return;
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
          if (computed.display === "none" || computed.contentVisibility === "hidden" || computed.visibility === "hidden" || computed.visibility === "collapse" || Number(computed.opacity) === 0) return false;
        }
        element = element.parentElement || element.getRootNode?.()?.host || null;
      }
      return true;
    };
    const mutationBoundaryMarker = (value) => mutationPartialPattern(value)
      || /[A-Z0-9._%+-]{3,}$/i.test(String(value ?? ""));
    const normalizeMutationNumericFragment = (value) => String(value ?? "")
      .replace(/^[\s,、。.!！?？:：;；"'「『（【〈《]+/u, "")
      .replace(/[\s,、。.!！?？:：;；"'」』）】〉》]+$/u, "");
    const numericMutationCorePattern = /(?:^|[^\d])[-\u30fc\u2212\u2010\u2013 ]?\d{1,16}(?:[-\u30fc\u2212\u2010\u2013 ]\d{0,16}){0,3}(?!\d)/;
    const mutationNumericFragment = (value) => {
      const text = String(value ?? "");
      if (/^(?:\d{1,16}|[-ー−‐– ]\d{1,16}|\d{1,16}(?:[-ー−‐– ]\d{0,16}){1,3})$/.test(normalizeMutationNumericFragment(text))) return true;
      return numericMutationCorePattern.test(text);
    };
    const mutationNumericSeparator = (value) => /^[ \t\n\f\r\-\u30fc\u2212\u2010\u2013]+$/.test(String(value ?? ""));
    const mutationWhitespaceMode = (node) => {
      const element = node?.nodeType === 3 ? node.parentElement : node?.nodeType === 1 ? node : null;
      if (!element) return "normal";
      if (element.isConnected) {
        const computed = String(getComputedStyle(element).whiteSpace || "").toLowerCase();
        if (computed) return computed;
      }
      let current = element;
      while (current) {
        const inline = String(current.style?.whiteSpace || "").toLowerCase();
        if (inline) return inline;
        current = current.parentElement;
      }
      return "normal";
    };
    const collapseMutationWhitespace = (value, node) => {
      const text = String(value ?? "");
      const whiteSpace = mutationWhitespaceMode(node);
      if (whiteSpace === "normal" || whiteSpace === "nowrap") return text.replace(/[ \t\n\f\r]+/g, " ");
      if (whiteSpace === "pre-line") return text.replace(/[ \t\f\r]+/g, " ");
      return text;
    };
    const appendMutationRenderedText = (left, right, leftNode, rightNode) => {
      const leftMode = mutationWhitespaceMode(leftNode);
      const rightMode = mutationWhitespaceMode(rightNode);
      const leftCollapses = leftMode === "normal" || leftMode === "nowrap" || leftMode === "pre-line";
      const rightCollapses = rightMode === "normal" || rightMode === "nowrap" || rightMode === "pre-line";
      if (leftCollapses && rightCollapses && /[ \t\f\r]$/.test(left) && /^[ \t\f\r]/.test(right)) {
        return `${left.replace(/[ \t\f\r]+$/g, " ")}${right.replace(/^[ \t\f\r]+/g, "")}`;
      }
      return `${left}${right}`;
    };
    const mutationNumericContext = (value) => mutationNumericFragment(value) || mutationNumericSeparator(value);
    const mutationStreamKey = (node) => {
      let element = node?.nodeType === 3 ? node.parentElement : node;
      if (!element) return node;
      const isBlock = (candidate) => ["block", "flow-root", "list-item", "table", "table-cell", "flex", "grid"].includes(String(getComputedStyle(candidate).display || "").toLowerCase());
      if (isBlock(element)) return element;
      while (element.parentElement) {
        const parent = element.parentElement;
        if (isBlock(parent)) return parent;
        element = parent;
      }
      return element;
    };
    const mutationElementVisibility = (node) => {
      let element = node?.nodeType === 3 ? node.parentElement : node;
      let depth = 0;
      while (element) {
        depth += 1;
        if (depth > maxPrivacyAdjacentTextNodes) return null;
        if (element.hidden || element.matches?.("[hidden],script,style,noscript,template")) return false;
        if (element.isConnected) {
          const computed = getComputedStyle(element);
          if (computed.display === "none" || computed.contentVisibility === "hidden" || computed.visibility === "hidden" || computed.visibility === "collapse" || Number(computed.opacity) === 0) return false;
        }
        element = element.parentElement || element.getRootNode?.()?.host || null;
      }
      return true;
    };
    const mutationTextNode = (node, last = false, budget = { nodes: 0, depth: 0, overflow: false }) => {
      if (node?.nodeType === 3) {
        const visibility = mutationElementVisibility(node);
        if (visibility === null) budget.overflow = true;
        return visibility === true ? node : null;
      }
      if (node?.nodeType !== 1 || node.hidden || node.matches?.("[hidden],script,style,noscript,template")) return null;
      const visibility = mutationElementVisibility(node);
      if (visibility !== true) {
        if (visibility === null) budget.overflow = true;
        return null;
      }
      budget.depth += 1;
      if (budget.depth > maxPrivacyAdjacentTextNodes) {
        budget.overflow = true;
        budget.depth -= 1;
        return null;
      }
      const children = [...node.childNodes || []];
      const ordered = last ? children.reverse() : children;
      for (const child of ordered) {
        budget.nodes += 1;
        if (budget.nodes > maxPrivacyAdjacentTextNodes) {
          budget.overflow = true;
          break;
        }
        const result = mutationTextNode(child, last, budget);
        if (result) {
          budget.depth -= 1;
          return result;
        }
      }
      budget.depth -= 1;
      return null;
    };
    const mutationNodesAdjacent = (previousNode, nextNode) => {
      const budget = { nodes: 0, depth: 0, overflow: false };
      const previous = mutationTextNode(previousNode, true, budget);
      const next = mutationTextNode(nextNode, false, budget);
      if (budget.overflow) return null;
      if (!previous || !next) return false;
      if (previous === next) return false;
      if (previous.getRootNode?.() !== next.getRootNode?.()) return false;
      const visibleInline = (element) => {
        if (!element || element.matches?.("script,style,noscript,template,br,[hidden]")) return false;
        const computed = getComputedStyle(element);
        if (computed.display === "none" || computed.contentVisibility === "hidden" || computed.visibility === "hidden" || computed.visibility === "collapse" || Number(computed.opacity) === 0) return false;
        return ["inline", "inline-block", "inline-flex", "inline-grid", "contents", "ruby", "ruby-text"].includes(String(computed.display || "").toLowerCase());
      };
      let current = previous;
      let inspected = 0;
      const root = previous.getRootNode?.();
      const nextMutationNode = (node) => {
        if (node?.firstChild) return node.firstChild;
        let candidate = node;
        while (candidate && candidate !== root) {
          if (candidate.nextSibling) return candidate.nextSibling;
          candidate = candidate.parentNode;
        }
        return null;
      };
      while (current && current !== root) {
        inspected += 1;
        if (inspected > maxPrivacyAdjacentTextNodes) return null;
        if (current.nextSibling) {
          if (current.nodeType === 1 && !visibleInline(current)) return false;
          current = current.nextSibling;
          break;
        }
        if (current.nodeType === 1 && !visibleInline(current)) return false;
        current = current.parentNode;
      }
      while (current && current !== next) {
        inspected += 1;
        if (inspected > maxPrivacyAdjacentTextNodes) return null;
        if (current.nodeType === 3 && String(current.nodeValue ?? "")) return false;
        if (current.nodeType === 1 && !current.contains?.(next) && String(current.textContent ?? "")) return false;
        if (current.nodeType === 1 && !visibleInline(current)) return false;
        current = nextMutationNode(current);
      }
      return current === next;
    };
    const containsVisibleNumericSplit = (target) => {
      const root = mutationStreamKey(target);
      if (!root || root.nodeType !== 1) return false;
      const textNodes = [];
      const state = { nodes: 0, characters: 0, visited: 0, hiddenBoundary: false, overflow: false, textBudget: { nodes: 0, depth: 0, overflow: false } };
      const collectTextNodes = (node) => {
        if (!node || state.overflow) return;
        state.visited += 1;
        if (state.visited > maxPrivacyAdjacentTextNodes * 4) {
          state.overflow = true;
          return;
        }
        if (node.nodeType === 3) {
          const value = String(node.nodeValue ?? "");
          textNodes.push(node);
          if (mutationNumericFragment(value) || mutationPartialPattern(value)) {
            state.nodes += 1;
            state.characters += value.length;
            if (state.nodes > maxPrivacyAdjacentTextNodes || state.characters > maxPrivacyAdjacentTextCharacters) state.overflow = true;
          }
          return;
        }
        if (node.nodeType !== 1) return;
        if (node.hidden || node.matches?.("[hidden],script,style,noscript,template")) {
          textNodes.push(null);
          return;
        }
        if (node.isConnected) {
          const computed = getComputedStyle(node);
          if (computed.display === "none" || computed.contentVisibility === "hidden" || computed.visibility === "hidden" || computed.visibility === "collapse" || Number(computed.opacity) === 0) {
            textNodes.push(null);
            return;
          }
        }
        for (const child of node.childNodes || []) collectTextNodes(child);
      };
      const previousTextNode = (node) => {
        let current = node;
        while (current && current !== root) {
          state.visited += 1;
          if (state.visited > maxPrivacyAdjacentTextNodes * 4) {
            state.overflow = true;
            return null;
          }
          if (current.previousSibling) {
            const sibling = current.previousSibling;
            const visibility = mutationElementVisibility(sibling);
            if (visibility !== true) {
              state.hiddenBoundary = true;
              current = sibling.nodeType === 1 ? sibling.parentNode : sibling;
              continue;
            }
            const previous = mutationTextNode(sibling, true, state.textBudget);
            if (previous) return previous;
            if (sibling.nodeType === 1 && sibling.childNodes?.length) state.hiddenBoundary = true;
          }
          current = current.parentNode;
        }
        return null;
      };
      const nextTextNode = (node) => {
        let current = node;
        while (current && current !== root) {
          state.visited += 1;
          if (state.visited > maxPrivacyAdjacentTextNodes * 4) {
            state.overflow = true;
            return null;
          }
          if (current.nextSibling) {
            const sibling = current.nextSibling;
            const visibility = mutationElementVisibility(sibling);
            if (visibility !== true) {
              state.hiddenBoundary = true;
              current = sibling;
              continue;
            }
            const next = mutationTextNode(sibling, false, state.textBudget);
            if (next) return next;
            if (sibling.nodeType === 1 && sibling.childNodes?.length) state.hiddenBoundary = true;
          }
          current = current.parentNode;
        }
        return null;
      };
      if (target?.nodeType === 3) {
        if (!mutationNumericContext(String(target.nodeValue ?? ""))) return false;
        const before = [];
        let current = previousTextNode(target);
        while (current && before.length < maxPrivacyAdjacentTextNodes) {
          if (!mutationNumericContext(String(current.nodeValue ?? ""))) break;
          before.push(current);
          current = previousTextNode(current);
        }
        const after = [];
        current = nextTextNode(target);
        while (current && after.length < maxPrivacyAdjacentTextNodes) {
          if (!mutationNumericContext(String(current.nodeValue ?? ""))) break;
          after.push(current);
          current = nextTextNode(current);
        }
        if (current && (before.length >= maxPrivacyAdjacentTextNodes || after.length >= maxPrivacyAdjacentTextNodes)
          && mutationNumericContext(String(current.nodeValue ?? ""))) state.overflow = true;
        textNodes.push(...before.reverse(), target, ...after);
        for (const node of textNodes) {
          if (!node) continue;
          const value = String(node.nodeValue ?? "");
          if (mutationNumericFragment(value) || mutationPartialPattern(value)) {
            state.nodes += 1;
            state.characters += value.length;
            if (state.nodes > maxPrivacyAdjacentTextNodes || state.characters > maxPrivacyAdjacentTextCharacters) state.overflow = true;
          }
        }
      } else {
        collectTextNodes(root);
      }
      if (state.overflow || state.textBudget.overflow) return true;
      let previous = null;
      let joined = "";
      let pendingSeparatorNodes = 0;
      let pendingSeparatorCharacters = 0;
      let hasNumericPrefix = false;
      for (const node of textNodes) {
        if (!node) {
          state.hiddenBoundary = true;
          pendingSeparatorNodes = 0;
          pendingSeparatorCharacters = 0;
          hasNumericPrefix = false;
          continue;
        }
        const value = String(node.nodeValue ?? "");
        const renderedValue = collapseMutationWhitespace(value, node);
        if (!mutationNumericContext(value)) {
          previous = null;
          joined = "";
          pendingSeparatorNodes = 0;
          pendingSeparatorCharacters = 0;
          hasNumericPrefix = false;
          continue;
        }
        if (mutationNumericSeparator(value)) {
          if (!hasNumericPrefix) {
            previous = null;
            joined = "";
            pendingSeparatorNodes = 0;
            pendingSeparatorCharacters = 0;
            continue;
          }
          const separatorAdjacent = previous ? mutationNodesAdjacent(previous.node, node) : false;
          if (separatorAdjacent === null) return true;
          if (!previous || !separatorAdjacent) {
            previous = null;
            joined = "";
            pendingSeparatorNodes = 0;
            pendingSeparatorCharacters = 0;
            hasNumericPrefix = false;
            continue;
          }
          joined = appendMutationRenderedText(joined, renderedValue, previous?.node, node).slice(-maxPrivacyAdjacentTextCharacters);
          pendingSeparatorNodes += 1;
          pendingSeparatorCharacters += value.length;
          previous = { node, value };
          continue;
        }
        const adjacent = previous ? mutationNodesAdjacent(previous.node, node) : false;
        if (adjacent === null) return true;
        if (!previous || !adjacent) {
          if (state.hiddenBoundary && previous && containsPiiText(`${joined}${value}`)) return true;
          joined = renderedValue;
          pendingSeparatorNodes = 0;
          pendingSeparatorCharacters = 0;
        }
        else {
          if (pendingSeparatorNodes > 0) {
            state.nodes += pendingSeparatorNodes;
            state.characters += pendingSeparatorCharacters;
            if (state.nodes > maxPrivacyAdjacentTextNodes || state.characters > maxPrivacyAdjacentTextCharacters) return true;
            pendingSeparatorNodes = 0;
            pendingSeparatorCharacters = 0;
          }
          joined = appendMutationRenderedText(joined, renderedValue, previous?.node, node).slice(-maxPrivacyAdjacentTextCharacters);
        }
        if (containsPiiText(joined)) return true;
        hasNumericPrefix = true;
        previous = { node, value };
      }
      return false;
    };
    const rememberMutationFragment = (streams, key, value, node, alreadyRendered = false) => {
      const text = String(value ?? "");
      if (!mutationNumericContext(text)) return false;
      if (mutationEvidence.inspectedNodes >= maxPrivacyAdjacentTextNodes
        || mutationEvidence.inspectedCharacters + text.length > maxPrivacyAdjacentTextCharacters) {
        mutationEvidence.overflow = true;
        return true;
      }
      mutationEvidence.inspectedNodes += 1;
      mutationEvidence.inspectedCharacters += text.length;
      const stream = streams.get(key) || { text: "", fragments: 0 };
      stream.fragments += 1;
      const adjacent = stream.lastNode ? mutationNodesAdjacent(stream.lastNode, node) : false;
      if (adjacent === null) {
        mutationEvidence.overflow = true;
        return true;
      }
      const renderedText = alreadyRendered ? text : collapseMutationWhitespace(text, node);
      stream.text = adjacent
        ? appendMutationRenderedText(stream.text, renderedText, stream.lastNode, node).slice(-maxPrivacyAdjacentTextCharacters)
        : renderedText;
      stream.lastNode = node;
      streams.set(key, stream);
      return containsPiiText(stream.text);
    };
    const clearMutationStream = (streams, key, node) => {
      const stream = streams.get(key);
      if (stream && stream.lastNode === node) {
        stream.text = "";
        stream.lastNode = null;
      }
    };
    const inspectMutationValue = (value, state) => {
      if (state.nodeOverflow || state.characterOverflow) return true;
      state.inspectedNodes += 1;
      if (state.inspectedNodes > maxPrivacyAdjacentTextNodes) {
        state.nodeOverflow = true;
        return true;
      }
      const text = String(value ?? "");
      if (mutationPartialPattern(text)) return true;
      if (containsPiiText(text)) return true;
      state.characterCount += text.length;
      if (state.characterCount > maxPrivacyAdjacentTextCharacters) {
        state.characterOverflow = true;
        return true;
      }
      state.text = `${state.text}${text}`.slice(-maxPrivacyAdjacentTextCharacters);
      if (containsPiiText(state.text)) return true;
      if (mutationPartialPattern(state.text)) return true;
      if (!mutationBoundaryMarker(state.text)) state.text = "";
      return false;
    };
    const containsSplitPiiMutation = (records) => {
      let pending = "";
      let pendingNode = null;
      const oldCharacterState = { text: "", inspectedNodes: 0, characterCount: 0, nodeOverflow: false, characterOverflow: false };
      const currentCharacterState = { text: "", inspectedNodes: 0, characterCount: 0, nodeOverflow: false, characterOverflow: false };
      for (const record of records || []) {
        if (mutationEvidence.overflow) return true;
        // The target can be empty by the time the observer callback runs. Use
        // the bounded added/removed text evidence itself so a transient split
        // PII remains fail closed after both child nodes are removed.
        if (record.type === "characterData") {
          const targetVisibility = mutationTargetMayBeVisible(record.target);
          if (targetVisibility === null) return true;
          if (!targetVisibility) continue;
          if (containsVisibleNumericSplit(record.target)) return true;
          if (inspectMutationValue(record.oldValue, oldCharacterState)
            || inspectMutationValue(record.target?.nodeValue, currentCharacterState)) return true;
          const streamKey = mutationStreamKey(record.target);
          if (rememberMutationFragment(mutationEvidence.oldCharacterStreams, streamKey, record.oldValue, record.target)) return true;
          if (!mutationNumericContext(record.oldValue)) clearMutationStream(mutationEvidence.oldCharacterStreams, streamKey, record.target);
          const currentValue = String(record.target?.nodeValue ?? "");
          const previousCurrentValue = mutationEvidence.seenCurrentCharacterValues.get(record.target);
          if (previousCurrentValue !== currentValue) {
            mutationEvidence.seenCurrentCharacterValues.set(record.target, currentValue);
            if (rememberMutationFragment(mutationEvidence.currentStreams, streamKey, currentValue, record.target)) return true;
            if (!mutationNumericContext(currentValue)) clearMutationStream(mutationEvidence.currentStreams, streamKey, record.target);
          }
          continue;
        }
        if (record.type !== "childList") continue;
        const targetVisibility = mutationTargetMayBeVisible(record.target);
        if (targetVisibility === null) return true;
        if (!targetVisibility) continue;
        if (containsVisibleNumericSplit(record.target)) return true;
        const fragments = [];
        for (const node of [...record.addedNodes || [], ...record.removedNodes || []]) {
          const state = { text: "", inspectedNodes: 0, characterCount: 0, nodeOverflow: false, characterOverflow: false, completeMatch: false };
          collectMutationVisibleText(node, state);
          if (state.completeMatch) return true;
          if (state.nodeOverflow || state.characterOverflow) return true;
          mutationEvidence.childListNodes += state.inspectedNodes;
          mutationEvidence.childListCharacters += state.characterCount;
          if (mutationEvidence.childListNodes > maxPrivacyAdjacentTextNodes
            || mutationEvidence.childListCharacters > maxPrivacyAdjacentTextCharacters) {
            mutationEvidence.overflow = true;
            return true;
          }
          if (state.text) fragments.push({ node, text: state.text, alreadyRendered: true });
        }
        const childStreamKey = mutationStreamKey(record.target);
        for (const { node, text, alreadyRendered } of fragments) {
          if (mutationEvidence.seenChildValues.get(node) === text) continue;
          mutationEvidence.seenChildValues.set(node, text);
          if (rememberMutationFragment(mutationEvidence.currentStreams, childStreamKey, text, node, alreadyRendered)) return true;
          if (!mutationNumericContext(text)) clearMutationStream(mutationEvidence.currentStreams, childStreamKey, node);
          const renderedText = alreadyRendered ? text : collapseMutationWhitespace(text, node);
          const joined = appendMutationRenderedText(pending, renderedText, pendingNode, node);
          if (containsPiiText(joined)) return true;
          if (mutationPartialPattern(joined)) return true;
          const hasBoundaryMarker = mutationBoundaryMarker(joined);
          pending = hasBoundaryMarker ? joined.slice(-maxPrivacyAdjacentTextCharacters) : "";
          pendingNode = hasBoundaryMarker ? node : null;
        }
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
    const containsFieldBoundary = (node) => {
      const element = node?.nodeType === 3 ? node.parentElement : node;
      if (!element || isOwnedPrivacyOverlayNode(element)) return false;
      if (element.matches?.(fieldSelector) && fieldKind(element)) return true;
      return Boolean(element.querySelector?.(fieldSelector));
    };
    const privacyMutationAffectsBoundary = (record) => {
      const element = record.target?.nodeType === 3 ? record.target.parentElement : record.target;
      // Row/column associations can change without touching an existing value.
      // Keep transient header/scope/span/table changes inside the boundary too.
      if (element?.closest?.("table") || element?.querySelector?.("table")) return true;
      if (record.type === "characterData") {
        return isProtectedMutationNode(record.target?.parentElement)
          || isSemanticMutationNode(record.target, [record.oldValue])
          || containsPiiText(record.oldValue)
          || containsPiiText(record.target?.nodeValue);
      }
      if (record.type === "attributes") {
        return containsFieldBoundary(record.target)
          || isProtectedMutationNode(record.target)
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
        if (containsFieldBoundary(node)
          || isProtectedMutationNode(node)
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
    if (stopAliasPreparation()) throw new Error("SCREENSHOT_MASK_INVALIDATED");
    const privateAliasAllocations = { namespace: record.namespace, next: record.next, allocations: [...record.allocations] };
    privacyReview.replacementCount = privacyMaskedCount;
    privacyReview.reasonCodes = [...reviewReasons];
    privacyReview.reviewRequired = privacyReview.reasonCodes.length > 0;
    globalThis.__mecchaManualScreenshotMasks = { recordId, privateAliasAllocations, privacyReview, fieldRect, fieldValue, initialMaskCount: masks.length, token, masks, observers, backdropMasks, backdropSelector, backdropRule, privacyOverlays, privacyMutation, privacyRootSnapshot, collectPrivacyRootSnapshot, flushPrivacyMutations, document, privacyOverlayClass, collectPrivacyCandidates, get privacyCandidateOverflow() { return privacyCandidateOverflow; }, get privacyCandidateTraversalOverflow() { return privacyCandidateTraversalOverflow; }, get privacyCandidateRangeOverflow() { return privacyCandidateRangeOverflow; }, get privacyRootTraversalOverflow() { return privacyRootTraversalOverflow; } };
    return { applied: true, count: masks.length, privacyMaskedCount, privacyReview, token,
      ...(options.privateAliasState ? { privateAliasAllocations } : {}),
      ...((privacyCandidateOverflow || privacyCandidateTraversalOverflow || privacyCandidateRangeOverflow || privacyRootTraversalOverflow) ? { reason: "SCREENSHOT_BUDGET_EXCEEDED" } : {}) };
  } catch (error) {
    stopAliasPreparation();
    for (const observer of observers) observer.disconnect();
    for (const backdropMask of backdropMasks) backdropMask.style.remove();
    for (const { overlay } of privacyOverlays) overlay.remove?.();
    for (const mask of masks) restoreMask(mask);
    delete globalThis.__mecchaManualScreenshotMasks;
    return error?.message === "SCREENSHOT_BUDGET_EXCEEDED" ? { applied: false, reason: "SCREENSHOT_BUDGET_EXCEEDED" } : { applied: false };
  }
}

export function verifySensitiveMasks(expectedToken) {
  const state = globalThis.__mecchaManualScreenshotMasks;
  if (!state?.token || state.token !== expectedToken) return false;
  try {
    if (state.document !== document || state.masks.length !== state.initialMaskCount) return false;
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
        if (Number(computed.opacity) !== 1 || computed.contentVisibility === "hidden" || computed.display === "none" || computed.visibility !== "visible") return false;
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
      if (currentCandidates.some((candidate) => !overlays.some((item) => item.target === candidate.target && item.kind === candidate.kind && item.field === Boolean(candidate.field) && sameRect(item.protectedRect, candidate.rect)))) return false;
    }
    for (const item of state.privacyOverlays || []) {
      if (!item?.overlay || !item.overlay.isConnected || item.overlay.className !== state.privacyOverlayClass || item.overlay.getAttribute("aria-hidden") !== "true") return false;
      if (!item.target || (item.target.isConnected !== undefined && !item.target.isConnected)) return false;
      if (!sameRect(item.targetRect, item.target.getBoundingClientRect())) return false;
      const protectedRect = item.field || item.interior ? state.fieldRect(item.target) : item.range ? rangeRect(item.range) : item.target.getBoundingClientRect();
      if (!sameRect(item.protectedRect, protectedRect)) return false;
      // Compare the rendered overlay with the protected text range itself. A
      // parent element's rect is insufficient when a body transform moves a
      // fixed-position overlay away from the PII glyphs.
      if (!sameRect(item.overlayRect, item.overlay.getBoundingClientRect()) || !sameRect(item.overlay.getBoundingClientRect(), protectedRect)) return false;
      if (item.textFingerprint !== (() => {
        let hash = 2166136261;
        const text = String(item.field ? state.fieldValue(item.target) : item.range?.toString?.() || item.target.textContent || "");
        for (let index = 0; index < text.length; index += 1) {
          hash ^= text.charCodeAt(index);
          hash = Math.imul(hash, 16777619);
        }
        return `${text.length}:${hash >>> 0}`;
      })()) return false;
      if (item.overlay.textContent !== item.replacement) return false;
      const overlayStyle = getComputedStyle(item.overlay);
      const background = String(overlayStyle.backgroundColor || "").toLowerCase();
      const rgba = background.match(/^rgba?\([^,]+,[^,]+,[^,]+(?:,\s*([\d.]+))?\)$/);
      const webkitBackgroundClip = String(overlayStyle.webkitBackgroundClip || "").toLowerCase();
      if (overlayStyle.display === "none" || overlayStyle.contentVisibility === "hidden" || overlayStyle.visibility === "hidden" || Number(overlayStyle.opacity) !== 1 || overlayStyle.filter !== "none" || overlayStyle.mixBlendMode !== "normal" || !clipIsAuto(overlayStyle.clip) || overlayStyle.clipPath !== "none" || overlayStyle.mask !== "none" || overlayStyle.maskImage !== "none" || overlayStyle.webkitMaskImage !== "none" || overlayStyle.backgroundImage !== "none" || String(overlayStyle.backgroundClip).toLowerCase() !== "border-box" || (webkitBackgroundClip && webkitBackgroundClip !== "border-box") || overlayStyle.borderRadius !== "0px" || overlayStyle.boxShadow !== "none" || background === "transparent" || !rgba || (rgba[1] !== undefined && Number(rgba[1]) < 1) || !overlayBoundarySafe(item.overlay)) return false;
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
      "canvas",
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

export function removeSensitiveMasks(options = {}) {
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
  if (options?.endRecord) delete globalThis.__mecchaManualPrivacyRecord;
  return true;
}
