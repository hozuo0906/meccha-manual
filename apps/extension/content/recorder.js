(() => {
  if (globalThis.__mecchaManualRecorder) return;

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
  const send = (kind, target, extra = {}) => chrome.runtime.sendMessage({ type: "capture:event", event: captureEvent(kind, target, extra) });

  let pendingInputTarget;
  let lastCommittedInputTarget;
  let inputTimer;
  const takePendingInput = () => {
    clearTimeout(inputTimer);
    inputTimer = undefined;
    if (!pendingInputTarget) return undefined;
    const target = pendingInputTarget;
    pendingInputTarget = undefined;
    lastCommittedInputTarget = target;
    return captureEvent("input", target);
  };
  const flushInput = () => {
    const event = takePendingInput();
    if (event) chrome.runtime.sendMessage({ type: "capture:event", event });
  };
  const queueInput = (event) => {
    if (pendingInputTarget && pendingInputTarget !== event.target) flushInput();
    pendingInputTarget = event.target;
    lastCommittedInputTarget = undefined;
    clearTimeout(inputTimer);
    inputTimer = setTimeout(flushInput, 450);
  };
  const commitInput = (event) => {
    if (pendingInputTarget && pendingInputTarget !== event.target) flushInput();
    if (!pendingInputTarget && lastCommittedInputTarget === event.target) return;
    pendingInputTarget = event.target;
    flushInput();
  };
  const click = (event) => {
    flushInput();
    const target = event.target instanceof Element
      ? event.target.closest("button,a,input,select,textarea,[role=button],[role=link],[role=menuitem]") || event.target
      : event.target;
    send("click", target);
  };

  let lastY = scrollY;
  let scrollTimer;
  const scroll = () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const nextY = scrollY;
      if (Math.abs(nextY - lastY) >= 80) send("scroll", document.documentElement, { direction: nextY < lastY ? "up" : "down" });
      lastY = nextY;
    }, 250);
  };
  const flushBeforeNavigation = () => flushInput();

  addEventListener("click", click, true);
  addEventListener("input", queueInput, true);
  addEventListener("change", commitInput, true);
  addEventListener("scroll", scroll, true);
  addEventListener("pagehide", flushBeforeNavigation, true);

  globalThis.__mecchaManualRecorder = () => {
    const pendingEvent = takePendingInput();
    removeEventListener("click", click, true);
    removeEventListener("input", queueInput, true);
    removeEventListener("change", commitInput, true);
    removeEventListener("scroll", scroll, true);
    removeEventListener("pagehide", flushBeforeNavigation, true);
    clearTimeout(inputTimer);
    clearTimeout(scrollTimer);
    delete globalThis.__mecchaManualRecorder;
    return pendingEvent;
  };
})();
