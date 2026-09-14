(() => {
  if (globalThis.__mecchaManualRecorder) return;

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
  const send = (kind, target, extra = {}) => sendEvent(captureEvent(kind, target, { eventId: nextEventId(), ...extra }));

  let pendingInput;
  let inputFlush = Promise.resolve(true);
  const flushInput = () => {
    if (!pendingInput) return inputFlush;
    const pending = pendingInput;
    const event = captureEvent("input", pending.target, { eventId: pending.eventId });
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
    if (!pendingInput || pendingInput.target !== event.target) pendingInput = { target: event.target, eventId: nextEventId() };
  };
  const commitInput = (event) => {
    if (pendingInput?.target === event.target) void flushInput();
  };
  const click = (event) => {
    const target = event.target instanceof Element
      ? event.target.closest("button,a,input,select,textarea,[role=button],[role=link],[role=menuitem]") || event.target
      : event.target;
    void flushInput().then((accepted) => {
      if (accepted || !pendingInput) return send("click", target);
      return false;
    });
  };

  let lastY = scrollY;
  let scrollTimer;
  const scroll = () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const nextY = scrollY;
      if (Math.abs(nextY - lastY) >= 80) void send("scroll", document.documentElement, { direction: nextY < lastY ? "up" : "down" });
      lastY = nextY;
    }, 250);
  };

  const recordSameDocumentNavigation = () => {
    void flushInput().then((accepted) => {
      if (accepted || !pendingInput) return send("navigation", document.documentElement);
      return false;
    });
  };
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  const wrappedPushState = function (...args) {
    const result = originalPushState.apply(this, args);
    recordSameDocumentNavigation();
    return result;
  };
  const wrappedReplaceState = function (...args) {
    const result = originalReplaceState.apply(this, args);
    recordSameDocumentNavigation();
    return result;
  };
  history.pushState = wrappedPushState;
  history.replaceState = wrappedReplaceState;

  const flushBeforeNavigation = () => { void flushInput(); };
  const historyNavigation = () => recordSameDocumentNavigation();

  addEventListener("click", click, true);
  addEventListener("input", queueInput, true);
  addEventListener("change", commitInput, true);
  addEventListener("scroll", scroll, true);
  addEventListener("pagehide", flushBeforeNavigation, true);
  addEventListener("popstate", historyNavigation, true);
  addEventListener("hashchange", historyNavigation, true);

  globalThis.__mecchaManualRecorder = () => {
    const pendingEvent = pendingInput
      ? captureEvent("input", pendingInput.target, { eventId: pendingInput.eventId })
      : undefined;
    pendingInput = undefined;
    removeEventListener("click", click, true);
    removeEventListener("input", queueInput, true);
    removeEventListener("change", commitInput, true);
    removeEventListener("scroll", scroll, true);
    removeEventListener("pagehide", flushBeforeNavigation, true);
    removeEventListener("popstate", historyNavigation, true);
    removeEventListener("hashchange", historyNavigation, true);
    if (history.pushState === wrappedPushState) history.pushState = originalPushState;
    if (history.replaceState === wrappedReplaceState) history.replaceState = originalReplaceState;
    clearTimeout(scrollTimer);
    delete globalThis.__mecchaManualRecorder;
    return pendingEvent;
  };
})();
