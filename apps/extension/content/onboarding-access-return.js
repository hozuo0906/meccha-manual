(() => {
  const navigationType = globalThis.performance?.getEntriesByType?.("navigation")?.[0]?.type;
  if (location.hash || (navigationType && navigationType !== "navigate")) return;
  if (!globalThis.chrome?.runtime?.sendMessage) return;
  void chrome.runtime.sendMessage({
    schema: "meccha-manual/cloud-claim-v1",
    type: "handoff.access-return"
  }).catch(() => undefined);
})();
