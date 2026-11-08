(() => {
  if (globalThis.__mecchaManualRecorder) return;

  const HISTORY_EVENT = "meccha-manual:history-navigation";
  const recorderId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  let eventSequence = 0;
  const nextEventId = () => `${recorderId}:${++eventSequence}`;

  const boundedVisibleText = (element, limit = 40) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const parts = [];
    let length = 0;
    let scanned = 0;
    let visitedNodes = 0;
    let truncated = false;
    let pendingSpace = false;
    const append = (character) => {
      if (/\s/u.test(character)) {
        pendingSpace = length > 0;
        return;
      }
      if (pendingSpace && length < limit) {
        parts.push(" ");
        length += 1;
      }
      pendingSpace = false;
      if (length >= limit) {
        truncated = true;
        return;
      }
      parts.push(character);
      length += 1;
    };
    while (walker.nextNode()) {
      visitedNodes += 1;
      if (visitedNodes > 256) {
        truncated = true;
        break;
      }
      const textNode = walker.currentNode;
      let current = textNode.parentElement;
      let visible = true;
      let ancestorDepth = 0;
      while (current) {
        ancestorDepth += 1;
        if (ancestorDepth > 128) {
          visible = false;
          break;
        }
        if (current.hidden || current.getAttribute("aria-hidden") === "true") {
          visible = false;
          break;
        }
        const style = getComputedStyle(current);
        if (style.display === "none" || style.contentVisibility === "hidden" || style.visibility === "hidden" || style.visibility === "collapse" || style.opacity === "0") {
          visible = false;
          break;
        }
        current = current.parentElement;
      }
      if (!visible) continue;
      for (const character of String(textNode.nodeValue || "")) {
        scanned += 1;
        if (scanned > 4096) {
          truncated = true;
          break;
        }
        append(character);
        if (truncated) break;
      }
      if (truncated) break;
    }
    return { text: parts.join(""), truncated };
  };

  const boundedAttribute = (value, limit = 40) => {
    if (value === null || value === undefined) return undefined;
    const text = String(value);
    let count = 0;
    for (const _character of text) {
      count += 1;
      if (count > limit) return undefined;
    }
    return text;
  };

  const semanticKind = (value) => {
      // A truncated label is unknown, never evidence that a value is public.
      const raw = String(value ?? "");
      if (raw.length > 4096) return "unknown";
      const label = raw.replace(/\s+/g, " ").trim().toLowerCase();
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
  const privateValueContext = (element) => {
    let current = element;
    const tables = new Map();
    try {
      for (let depth = 0; current && depth < 64; depth += 1) {
        const tag = String(current.tagName || "").toUpperCase();
        const label = current.previousElementSibling;
        if (((tag === "DD" && label?.tagName === "DT") || (tag === "TD" && label?.tagName === "TH"))
          && semanticKind(label.textContent)) return true;
        if (["TD", "TH"].includes(tag)) {
          const table = current.closest?.("table");
          if (table) {
            if (!tables.has(table)) tables.set(table, semanticTableKinds(table, semanticKind));
            if (tables.get(table).has(current)) return true;
          }
        }
        current = current.parentElement || current.getRootNode?.()?.host || null;
      }
      return Boolean(current);
    } catch {
      // Malformed/over-budget tables cannot authorize a page-derived caption.
      return true;
    }
  };

  const describe = (element) => {
    if (!(element instanceof Element)) return {};
    const id = element.id;
    const associatedLabelElement = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : undefined;
    const associatedLabelResult = associatedLabelElement && typeof document.createTreeWalker === "function"
      ? boundedVisibleText(associatedLabelElement)
      : null;
    const associatedLabel = associatedLabelResult?.truncated ? undefined : associatedLabelResult?.text;
    const tagName = element.tagName.toLowerCase();
    const type = String(element.getAttribute("type") || "").toLowerCase();
    const role = element.getAttribute("role");
    const isCaptionedInput = tagName === "input" && ["button", "submit", "reset", "image"].includes(type);
    const isNamedControl = tagName === "button" || tagName === "a" || isCaptionedInput || ["button", "link", "menuitem"].includes(String(role || "").toLowerCase());
    const nestedValueControl = element.querySelector?.("input,textarea,select,[contenteditable]:not([contenteditable=\"false\"])");
    const hasEditableBoundary = Boolean(
      element.isContentEditable
      || element.closest?.("[contenteditable]:not([contenteditable=\"false\"])")
      || element.querySelector?.("[contenteditable]:not([contenteditable=\"false\"])")
    );
    const hasNestedValueControl = isNamedControl && (nestedValueControl || hasEditableBoundary);
    const visibleTextResult = isNamedControl && !hasNestedValueControl && typeof document.createTreeWalker === "function"
      ? boundedVisibleText(element)
      : null;
    const visibleText = visibleTextResult?.truncated ? undefined : visibleTextResult?.text;
    const privateContext = privateValueContext(element);
    const captionSourcesAllowed = !hasEditableBoundary && !privateContext;
    return {
      privateValueContext: privateContext,
      type: element.getAttribute("type"),
      controlCaption: captionSourcesAllowed && tagName === "input" && ["button", "submit", "reset"].includes(type)
        ? boundedAttribute(element.getAttribute("value"))
        : undefined,
      imageAlt: captionSourcesAllowed && tagName === "input" && type === "image" ? boundedAttribute(element.getAttribute("alt")) : undefined,
      name: element.getAttribute("name"),
      id,
      autocomplete: element.getAttribute("autocomplete"),
      ariaLabel: captionSourcesAllowed ? element.getAttribute("aria-label") : undefined,
      placeholder: captionSourcesAllowed ? element.getAttribute("placeholder") : undefined,
      title: captionSourcesAllowed ? boundedAttribute(element.getAttribute("title")) : undefined,
      associatedLabel: captionSourcesAllowed ? associatedLabel?.trim() : undefined,
      visibleText: captionSourcesAllowed && isNamedControl ? visibleText?.trim() : undefined,
      role,
      tagName
    };
  };
  const captureEvent = (kind, target, extra = {}) => ({ kind, target: describe(target), at: Date.now(), ...(kind === "click" ? { clickTarget: clickTargetRect(target) } : {}), ...extra });
  const sendEvent = (event) => chrome.runtime.sendMessage({ type: "capture:event", event })
    .then((response) => Boolean(response?.ok && response?.value?.accepted !== false), () => false);

  const trackedActions = new Map();
  const failedActionIds = new Set();
  const actionGenerations = new Map();
  const trackAction = (event, onAccepted) => {
    const generation = (actionGenerations.get(event.eventId) || 0) + 1;
    actionGenerations.set(event.eventId, generation);
    trackedActions.set(event.eventId, event);
    let sendPromise;
    try {
      sendPromise = sendEvent(event);
    } catch {
      failedActionIds.add(event.eventId);
      return Promise.resolve(false);
    }
    return Promise.resolve(sendPromise).then((accepted) => {
      if (actionGenerations.get(event.eventId) !== generation) return;
      if (accepted) {
        trackedActions.delete(event.eventId);
        failedActionIds.delete(event.eventId);
        onAccepted?.();
      } else {
        failedActionIds.add(event.eventId);
      }
      return accepted;
    }, () => {
      if (actionGenerations.get(event.eventId) === generation) failedActionIds.add(event.eventId);
      return false;
    });
  };

  let pendingInput;
  let inputFlush = Promise.resolve(true);
  const flushInput = () => {
    if (!pendingInput) return inputFlush;
    const pending = pendingInput;
    const event = captureEvent("input", pending.target, { eventId: pending.eventId, at: pending.at });
    pendingInput = undefined;
    const transmit = async () => {
      return trackAction(event);
    };
    inputFlush = inputFlush.then(transmit, transmit);
    return inputFlush;
  };
  const queueInput = (event) => {
    if (pendingInput && pendingInput.target !== event.target) void flushInput();
    if (!pendingInput || pendingInput.target !== event.target) {
      pendingInput = { target: event.target, eventId: nextEventId() };
      pendingInput.at = Date.now();
    } else {
      pendingInput.at = Date.now();
    }
    // Start persistence while the document is alive, not for the first time at pagehide.
    checkpoint(pendingInput, captureEvent("input", pendingInput.target, { eventId: pendingInput.eventId, at: pendingInput.at }));
  };
  const commitInput = (event) => {
    if (pendingInput?.target === event.target) void flushInput();
  };

  const scrollPositions = new WeakMap();
  scrollPositions.set(document, { x: scrollX, y: scrollY });
  // Seed the current position. New elements are seeded on their first event, so
  // an unknown baseline is never guessed as zero.
  for (const element of document.querySelectorAll?.("*") || []) {
    scrollPositions.set(element, { x: element.scrollLeft, y: element.scrollTop });
  }
  let pendingScroll;
  let scrollTimer;
  let scrollFlush = Promise.resolve(true);
  const scrollTarget = (event) => event.target instanceof Element ? event.target : document;
  const scrollPosition = (target) => target === document
    ? { x: scrollX, y: scrollY }
    : { x: target.scrollLeft, y: target.scrollTop };
  const flushScroll = () => {
    clearTimeout(scrollTimer);
    scrollTimer = undefined;
    if (!pendingScroll) return scrollFlush;
    const pending = pendingScroll;
    const event = captureEvent("scroll", document.documentElement, {
      eventId: pending.eventId,
      at: pending.at,
      direction: pending.direction
    });
    pendingScroll = undefined;
    scrollPositions.set(pending.target, pending.position);
    const transmit = async () => {
      return trackAction(event);
    };
    scrollFlush = scrollFlush.then(transmit, transmit);
    return scrollFlush;
  };
  const scroll = (event) => {
    const target = scrollTarget(event);
    if (pendingScroll && pendingScroll.target !== target) void flushScroll();
    const position = scrollPosition(target);
    const knownPosition = scrollPositions.get(target);
    if (!knownPosition && pendingScroll?.target !== target) {
      scrollPositions.set(target, position);
      return;
    }
    const baseline = pendingScroll?.target === target
      ? pendingScroll.baseline
      : knownPosition;
    const deltaX = position.x - baseline.x;
    const deltaY = position.y - baseline.y;
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 80) return;
    const horizontal = Math.abs(deltaX) > Math.abs(deltaY);
    const direction = horizontal ? (deltaX < 0 ? "left" : "right") : (deltaY < 0 ? "up" : "down");
    const eventId = pendingScroll?.target === target ? pendingScroll.eventId : nextEventId();
    pendingScroll = { target, position, baseline, direction, eventId, at: Date.now() };
    checkpoint(pendingScroll, captureEvent("scroll", document.documentElement, { eventId, at: pendingScroll.at, direction }));
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => { void flushScroll(); }, 250);
  };

  const checkpoint = (pending, event) => {
    trackAction(event, () => { pending.acknowledged = true; });
  };
  const trackAndSend = (kind, target, extra = {}) => {
    const event = captureEvent(kind, target, { eventId: nextEventId(), ...extra });
    trackAction(event);
    return event;
  };

  const flushBeforeAction = () => Promise.all([flushInput(), flushScroll()]);
  let latestClick = null;
  const clickTargetRect = (target) => {
    if (globalThis.top !== globalThis || typeof target?.getBoundingClientRect !== "function") return undefined;
    const rect = target.getBoundingClientRect();
    const viewportWidth = Number(globalThis.innerWidth), viewportHeight = Number(globalThis.innerHeight);
    const devicePixelRatio = Number(globalThis.devicePixelRatio || 1);
    if (![rect.left, rect.top, rect.width, rect.height, viewportWidth, viewportHeight, devicePixelRatio].every(Number.isFinite)
      || viewportWidth <= 0 || viewportHeight <= 0 || devicePixelRatio <= 0 || devicePixelRatio > 8) return undefined;
    const x = Math.max(0, rect.left), y = Math.max(0, rect.top);
    const width = Math.min(viewportWidth, rect.right) - x, height = Math.min(viewportHeight, rect.bottom) - y;
    if (width <= 0 || height <= 0) return undefined;
    const scrollX = Number(globalThis.scrollX || 0), scrollY = Number(globalThis.scrollY || 0);
    if (![scrollX, scrollY].every(Number.isFinite)) return undefined;
    return { x, y, width, height, viewportWidth, viewportHeight, devicePixelRatio, scrollX, scrollY, topFrame: true };
  };
  const click = (event) => {
    const target = event.target instanceof Element
      ? event.target.closest("button,a,input,select,textarea,[role=button],[role=link],[role=menuitem]") || event.target
      : event.target;
    void flushBeforeAction();
    const recorded = trackAndSend("click", target);
    latestClick = recorded.clickTarget ? { target, eventId: recorded.eventId, rect: recorded.clickTarget } : null;
  };

  let pendingNavigation;
  let navigationTimer;
  let retainedEvents = [];
  const flushNavigation = () => {
    clearTimeout(navigationTimer);
    navigationTimer = undefined;
    if (!pendingNavigation) return;
    const event = pendingNavigation;
    pendingNavigation = undefined;
    trackAction(event);
  };
  const recordSameDocumentNavigation = () => {
    void flushBeforeAction();
    if (!pendingNavigation) pendingNavigation = captureEvent("navigation", document.documentElement, { eventId: nextEventId() });
    clearTimeout(navigationTimer);
    navigationTimer = setTimeout(flushNavigation, 40);
  };

  const flushBeforeNavigation = () => { void flushInput(); void flushScroll(); };
  const pagehide = () => { flushBeforeNavigation(); flushNavigation(); };
  const beforeunload = (event) => {
    if (failedActionIds.size || retainedEvents.length) {
      flushBeforeNavigation();
      flushNavigation();
      event.preventDefault();
      event.returnValue = "";
    }
  };
  const historyNavigation = () => recordSameDocumentNavigation();

  const cloneEvent = (event) => ({ ...event, target: event.target && { ...event.target } });
  const collectPendingEvents = () => {
    const pendingEvents = [];
    if (pendingInput) pendingEvents.push(captureEvent("input", pendingInput.target, { eventId: pendingInput.eventId, at: pendingInput.at }));
    if (pendingScroll) pendingEvents.push(captureEvent("scroll", document.documentElement, {
      eventId: pendingScroll.eventId,
      at: pendingScroll.at,
      direction: pendingScroll.direction
    }));
    if (pendingNavigation) pendingEvents.push(pendingNavigation);
    pendingEvents.push(...trackedActions.values());
    const uniqueEvents = [];
    const seen = new Set();
    for (const event of pendingEvents) {
      if (event.eventId && seen.has(event.eventId)) continue;
      if (event.eventId) seen.add(event.eventId);
      uniqueEvents.push(event);
    }
    pendingInput = undefined;
    pendingScroll = undefined;
    pendingNavigation = undefined;
    trackedActions.clear();
    failedActionIds.clear();
    actionGenerations.clear();
    return uniqueEvents.sort((left, right) => (Number(left.at) || 0) - (Number(right.at) || 0));
  };
  const removeRecordingListeners = ({ keepBeforeUnload = false } = {}) => {
    latestClick = null;
    removeEventListener("click", click, true);
    removeEventListener("input", queueInput, true);
    removeEventListener("change", commitInput, true);
    removeEventListener("scroll", scroll, true);
    removeEventListener("pagehide", pagehide, true);
    if (!keepBeforeUnload) removeEventListener("beforeunload", beforeunload, true);
    removeEventListener("popstate", historyNavigation, true);
    removeEventListener("hashchange", historyNavigation, true);
    removeEventListener(HISTORY_EVENT, historyNavigation, true);
    clearTimeout(scrollTimer);
    clearTimeout(navigationTimer);
  };

  addEventListener("click", click, true);
  addEventListener("input", queueInput, true);
  addEventListener("change", commitInput, true);
  addEventListener("scroll", scroll, true);
  addEventListener("pagehide", pagehide, true);
  addEventListener("beforeunload", beforeunload, true);
  addEventListener("popstate", historyNavigation, true);
  addEventListener("hashchange", historyNavigation, true);
  addEventListener(HISTORY_EVENT, historyNavigation, true);

  globalThis.__mecchaManualRecorder = (command = "drain", eventId) => {
    if (command === "click-target") {
      if (!latestClick || latestClick.eventId !== eventId || !latestClick.target?.isConnected) return null;
      const current = clickTargetRect(latestClick.target);
      if (!current || Object.keys(latestClick.rect).some(key => current[key] !== latestClick.rect[key])) return null;
      return current;
    }
    if (command === "retain") {
      if (!retainedEvents.length) retainedEvents = collectPendingEvents().map(cloneEvent);
      removeRecordingListeners({ keepBeforeUnload: true });
      return retainedEvents.map(cloneEvent);
    }
    if (command === "release") {
      retainedEvents = [];
      collectPendingEvents();
      removeRecordingListeners();
      delete globalThis.__mecchaManualRecorder;
      return [];
    }
    const pendingEvents = [...retainedEvents, ...collectPendingEvents()].map(cloneEvent);
    retainedEvents = [];
    removeRecordingListeners();
    delete globalThis.__mecchaManualRecorder;
    return pendingEvents.sort((left, right) => (Number(left.at) || 0) - (Number(right.at) || 0));
  };
})();
