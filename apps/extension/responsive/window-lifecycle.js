import { targetOuterBounds } from "./viewports.js";

export const MAX_RESIZE_ATTEMPTS = 3;
export const VIEWPORT_TOLERANCE_PX = 4;

export function originalWindowSnapshot(window) {
  return {
    id: window.id,
    left: window.left,
    top: window.top,
    width: window.width,
    height: window.height,
    state: window.state
  };
}

function withinTolerance(actual, target, tolerance) {
  return Math.abs(actual.innerWidth - target.width) <= tolerance && Math.abs(actual.innerHeight - target.height) <= tolerance;
}

export async function applyResponsiveViewport({ windowId, tabId, viewport, windowsApi, measure, maxAttempts = MAX_RESIZE_ATTEMPTS, tolerance = VIEWPORT_TOLERANCE_PX }) {
  let current = await windowsApi.get(windowId);
  if (current.state !== "normal") {
    await windowsApi.update(windowId, { state: "normal" });
    current = await windowsApi.get(windowId);
  }

  let actual = await measure(tabId);
  let bounds = targetOuterBounds(viewport, actual, current);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await windowsApi.update(windowId, bounds);
    current = await windowsApi.get(windowId);
    actual = await measure(tabId);
    if (withinTolerance(actual, viewport, tolerance)) return { actual, attempts: attempt + 1 };
    bounds = {
      width: Math.max(320, current.width + viewport.width - actual.innerWidth),
      height: Math.max(320, current.height + viewport.height - actual.innerHeight)
    };
  }
  throw new Error("RESPONSIVE_VIEWPORT_UNAVAILABLE");
}

export async function restoreOriginalWindow(original, windowsApi) {
  const current = await windowsApi.get(original.id);
  if (current.state !== "normal") await windowsApi.update(original.id, { state: "normal" });
  await windowsApi.update(original.id, { left: original.left, top: original.top, width: original.width, height: original.height });
  if (original.state !== "normal") await windowsApi.update(original.id, { state: original.state });
}
