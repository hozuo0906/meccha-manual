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
      associatedLabel: associatedLabel?.trim() || element.textContent?.trim().slice(0, 80)
    };
  };
  const send = (kind, target, extra = {}) => chrome.runtime.sendMessage({ type: "capture:event", event: { kind, target: describe(target), at: Date.now(), ...extra } });
  const click = (event) => send("click", event.target);
  const change = (event) => send("input", event.target);
  let lastY = scrollY;
  let timer;
  const scroll = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const nextY = scrollY;
      if (Math.abs(nextY - lastY) >= 80) send("scroll", document.documentElement, { direction: nextY < lastY ? "up" : "down" });
      lastY = nextY;
    }, 250);
  };
  addEventListener("click", click, true);
  addEventListener("change", change, true);
  addEventListener("scroll", scroll, true);
  globalThis.__mecchaManualRecorder = () => {
    removeEventListener("click", click, true);
    removeEventListener("change", change, true);
    removeEventListener("scroll", scroll, true);
    clearTimeout(timer);
    delete globalThis.__mecchaManualRecorder;
  };
})();
