export async function captureWithMaskBoundary({ applyMasks, capture, removeMasks }) {
  let maskingApplied = false;
  try {
    const result = await applyMasks();
    if (!result?.applied) throw new Error("SCREENSHOT_MASK_FAILED");
    maskingApplied = true;
    const image = await capture();
    if (typeof image !== "string" || !image.startsWith("data:image/")) throw new Error("SCREENSHOT_CAPTURE_FAILED");
    return image;
  } finally {
    if (maskingApplied) await removeMasks();
  }
}

export function installSensitiveMasks() {
  if (globalThis.__mecchaManualScreenshotMasks) return { applied: true };
  try {
    const sensitive = /(?:pass(?:word)?|token|secret|auth(?:orization)?|cookie|card|credit|cvv|cvc|pin|one-time-code|cc-|個人番号|マイナンバー|カード|クレジット|暗証|認証コード|ワンタイム|eyJ[A-Za-z0-9_-]{10,}\.|\b(?:\d[ -]?){13,19}\b|\b[A-Fa-f0-9]{24,}\b|\b[A-Za-z0-9_-]{32,}\b)/i;
    const overlays = [];
    for (const element of document.querySelectorAll("input, textarea, select")) {
      const id = element.id;
      const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : "";
      const metadata = [element.type, element.name, element.id, element.autocomplete, element.getAttribute("aria-label"), element.placeholder, label].filter(Boolean).join(" ");
      if (!sensitive.test(metadata)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const overlay = document.createElement("div");
      overlay.dataset.mecchaManualMask = "true";
      Object.assign(overlay.style, { position: "fixed", zIndex: "2147483647", background: "#111827", pointerEvents: "none", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      document.documentElement.append(overlay);
      overlays.push(overlay);
    }
    globalThis.__mecchaManualScreenshotMasks = overlays;
    return { applied: true, count: overlays.length };
  } catch {
    for (const overlay of overlays) overlay.remove();
    delete globalThis.__mecchaManualScreenshotMasks;
    return { applied: false };
  }
}

export function removeSensitiveMasks() {
  for (const overlay of globalThis.__mecchaManualScreenshotMasks || []) overlay.remove();
  delete globalThis.__mecchaManualScreenshotMasks;
  return true;
}
