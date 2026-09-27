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
  const click = (event) => {
    const target = event.target instanceof Element
      ? event.target.closest("button,a,input,select,textarea,[role=button],[role=link],[role=menuitem]") || event.target
      : event.target;
    void flushBeforeAction();
    trackAndSend("click", target);
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

  globalThis.__mecchaManualRecorder = (command = "drain") => {
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
