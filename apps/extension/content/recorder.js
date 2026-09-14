(() => {
  if (globalThis.__mecchaManualRecorder) return;

  const HISTORY_EVENT = "meccha-manual:history-navigation";
  const recorderId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  let eventSequence = 0;
  const nextEventId = () => `${recorderId}:${++eventSequence}`;

  const describe = (element) => {
    if (!(element instanceof Element)) return {};
    const id = element.id;
    const associatedLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : undefined;
    return {
      type: element.getAttribute("type"),
      name: element.getAttribute("name"),
      id,
      autocomplete: element.getAttribute("autocomplete"),
      ariaLabel: element.getAttribute("aria-label"),
      placeholder: element.getAttribute("placeholder"),
      associatedLabel: associatedLabel?.trim(),
      role: element.getAttribute("role"),
      tagName: element.tagName.toLowerCase()
    };
  };
  const captureEvent = (kind, target, extra = {}) => ({ kind, target: describe(target), at: Date.now(), ...extra });
  const sendEvent = (event) => chrome.runtime.sendMessage({ type: "capture:event", event })
    .then((response) => Boolean(response?.ok && response?.value?.accepted !== false), () => false);

  let pendingInput;
  let inputFlush = Promise.resolve(true);
  const flushInput = () => {
    if (!pendingInput) return inputFlush;
    const pending = pendingInput;
    const event = captureEvent("input", pending.target, { eventId: pending.eventId, at: pending.at });
    const transmit = async () => {
      const accepted = await sendEvent(event);
      if (accepted && pendingInput?.eventId === pending.eventId) pendingInput = undefined;
      return accepted;
    };
    inputFlush = inputFlush.then(transmit, transmit);
    return inputFlush;
  };
  const queueInput = (event) => {
    if (pendingInput && pendingInput.target !== event.target) void flushInput();
    if (!pendingInput || pendingInput.target !== event.target) {
      pendingInput = { target: event.target, eventId: nextEventId(), at: Date.now() };
    } else {
      pendingInput.at = Date.now();
    }
  };
  const commitInput = (event) => {
    if (pendingInput?.target === event.target) void flushInput();
  };

  const scrollPositions = new WeakMap();
  scrollPositions.set(document, { x: scrollX, y: scrollY });
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
    const transmit = async () => {
      const accepted = await sendEvent(event);
      if (accepted && pendingScroll?.eventId === pending.eventId) {
        scrollPositions.set(pending.target, pending.position);
        pendingScroll = undefined;
      }
      return accepted;
    };
    scrollFlush = scrollFlush.then(transmit, transmit);
    return scrollFlush;
  };
  const scroll = (event) => {
    const target = scrollTarget(event);
    const position = scrollPosition(target);
    const baseline = pendingScroll?.target === target
      ? pendingScroll.baseline
      : scrollPositions.get(target) || { x: 0, y: 0 };
    const deltaX = position.x - baseline.x;
    const deltaY = position.y - baseline.y;
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 80) return;
    const horizontal = Math.abs(deltaX) > Math.abs(deltaY);
    const direction = horizontal ? (deltaX < 0 ? "left" : "right") : (deltaY < 0 ? "up" : "down");
    const eventId = pendingScroll?.target === target ? pendingScroll.eventId : nextEventId();
    pendingScroll = { target, position, baseline, direction, eventId, at: Date.now() };
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => { void flushScroll(); }, 250);
  };

  const trackedActions = new Map();
  const trackAndSend = (kind, target, extra = {}) => {
    const event = captureEvent(kind, target, { eventId: nextEventId(), ...extra });
    trackedActions.set(event.eventId, event);
    void sendEvent(event).then((accepted) => {
      if (accepted) trackedActions.delete(event.eventId);
    });
    return event;
  };

  const flushBeforeAction = () => Promise.all([flushInput(), flushScroll()]);
  const click = (event) => {
    const target = event.target instanceof Element
      ? event.target.closest("button,a,input,select,textarea,[role=button],[role=link],[role=menuitem]") || event.target
      : event.target;
    void flushBeforeAction();
    trackAndSend("click", target);
  };

  let pendingNavigation;
  let navigationTimer;
  const flushNavigation = () => {
    clearTimeout(navigationTimer);
    navigationTimer = undefined;
    if (!pendingNavigation) return;
    const event = pendingNavigation;
    pendingNavigation = undefined;
    trackedActions.set(event.eventId, event);
    void sendEvent(event).then((accepted) => {
      if (accepted) trackedActions.delete(event.eventId);
    });
  };
  const recordSameDocumentNavigation = () => {
    void flushBeforeAction();
    if (!pendingNavigation) {
      pendingNavigation = captureEvent("navigation", document.documentElement, { eventId: nextEventId() });
    }
    clearTimeout(navigationTimer);
    navigationTimer = setTimeout(flushNavigation, 40);
  };

  const flushBeforeNavigation = () => {
    void flushInput();
    void flushScroll();
    flushNavigation();
  };
  const historyNavigation = () => recordSameDocumentNavigation();

  addEventListener("click", click, true);
  addEventListener("input", queueInput, true);
  addEventListener("change", commitInput, true);
  addEventListener("scroll", scroll, true);
  addEventListener("pagehide", flushBeforeNavigation, true);
  addEventListener("popstate", historyNavigation, true);
  addEventListener("hashchange", historyNavigation, true);
  addEventListener(HISTORY_EVENT, historyNavigation, true);

  globalThis.__mecchaManualRecorder = () => {
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
    removeEventListener("click", click, true);
    removeEventListener("input", queueInput, true);
    removeEventListener("change", commitInput, true);
    removeEventListener("scroll", scroll, true);
    removeEventListener("pagehide", flushBeforeNavigation, true);
    removeEventListener("popstate", historyNavigation, true);
    removeEventListener("hashchange", historyNavigation, true);
    removeEventListener(HISTORY_EVENT, historyNavigation, true);
    clearTimeout(scrollTimer);
    clearTimeout(navigationTimer);
    delete globalThis.__mecchaManualRecorder;
    return uniqueEvents.sort((left, right) => (Number(left.at) || 0) - (Number(right.at) || 0));
  };
})();
