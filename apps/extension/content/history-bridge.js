(() => {
  if (globalThis.__mecchaManualHistoryBridge) return;

  const EVENT_NAME = "meccha-manual:history-navigation";
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  const notify = () => dispatchEvent(new Event(EVENT_NAME));

  history.pushState = function (...args) {
    const result = Reflect.apply(originalPushState, this, args);
    notify();
    return result;
  };

  history.replaceState = function (...args) {
    const result = Reflect.apply(originalReplaceState, this, args);
    notify();
    return result;
  };

  globalThis.__mecchaManualHistoryBridge = true;
})();
