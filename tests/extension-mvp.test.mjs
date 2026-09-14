import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { recoverWindowSession } from "../apps/extension/background/session-recovery.js";
import { isSensitiveInput, normalizeCaptureEvent, safeTargetLabel } from "../apps/extension/capture/privacy.js";
import { captureWithMaskBoundary } from "../apps/extension/capture/screenshot.js";
import { addMask, deleteStep, moveStep, removeMask, updateStepInstruction } from "../apps/extension/editor/draft-model.js";
import { VIEWPORTS, targetOuterBounds } from "../apps/extension/responsive/viewports.js";
import { applyResponsiveViewport, originalWindowSnapshot, restoreOriginalWindow } from "../apps/extension/responsive/window-lifecycle.js";

test("manifest uses required minimal MV3 permissions", async () => {
  const manifest = JSON.parse(await readFile(new URL("../apps/extension/manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.permissions.includes("activeTab"), true);
  assert.equal(manifest.permissions.includes("scripting"), true);
  assert.equal(manifest.permissions.includes("debugger"), false);
  assert.equal(manifest.permissions.includes("tabs"), false);
  assert.equal("host_permissions" in manifest, false);
});

test("original state and bounds form a serializable suspension-safe snapshot", () => {
  assert.deepEqual(originalWindowSnapshot({ id: 9, left: 1, top: 2, width: 1200, height: 800, state: "maximized", ignored: true }), { id: 9, left: 1, top: 2, width: 1200, height: 800, state: "maximized" });
});

test("responsive lifecycle normalizes before bounds and verifies corrected inner viewport", async () => {
  const calls = [];
  let state = "maximized";
  let bounds = { width: 1200, height: 800 };
  const windowsApi = {
    get: async () => ({ id: 9, state, ...bounds }),
    update: async (_id, update) => { calls.push(update); if (update.state) state = update.state; bounds = { ...bounds, ...update }; }
  };
  const measurements = [{ innerWidth: 1180, innerHeight: 720 }, { innerWidth: 380, innerHeight: 834 }, { innerWidth: 390, innerHeight: 844 }];
  const result = await applyResponsiveViewport({ windowId: 9, tabId: 3, viewport: VIEWPORTS.smartphonePortrait, windowsApi, measure: async () => measurements.shift() });
  assert.deepEqual(calls[0], { state: "normal" });
  assert.equal(calls.length, 3);
  assert.deepEqual(result, { actual: { innerWidth: 390, innerHeight: 844 }, attempts: 2 });
});

test("responsive correction is bounded and fails closed when clamped", async () => {
  let updates = 0;
  const windowsApi = { get: async () => ({ id: 1, state: "normal", width: 500, height: 500 }), update: async () => { updates += 1; } };
  await assert.rejects(applyResponsiveViewport({ windowId: 1, tabId: 1, viewport: VIEWPORTS.tabletPortrait, windowsApi, measure: async () => ({ innerWidth: 400, innerHeight: 400 }) }), /RESPONSIVE_VIEWPORT_UNAVAILABLE/);
  assert.equal(updates, 3);
});

test("restore returns to normal, restores bounds, then restores non-normal state", async () => {
  const calls = [];
  const windowsApi = { get: async () => ({ state: "fullscreen" }), update: async (_id, value) => { calls.push(value); } };
  await restoreOriginalWindow({ id: 1, left: 2, top: 3, width: 1000, height: 700, state: "maximized" }, windowsApi);
  assert.deepEqual(calls, [{ state: "normal" }, { left: 2, top: 3, width: 1000, height: 700 }, { state: "maximized" }]);
});

test("restore failure retains a retryable session instead of clearing recovery data", async () => {
  const persisted = [];
  const session = { id: "capture", originalWindow: { id: 1, state: "normal" }, events: [{ kind: "click" }] };
  const result = await recoverWindowSession(session, { persist: async (value) => persisted.push(value), restore: async () => { throw new Error("window unavailable"); } });
  assert.deepEqual(result, { restored: false });
  assert.equal(persisted.at(-1).restorePending, true);
  assert.equal(persisted.at(-1).phase, "restore_pending");
  assert.deepEqual(persisted.at(-1).events, session.events);
  assert.equal(persisted.at(-1).restoreErrorCategory, "responsive_mode_failed");
});

test("all five responsive modes remain available", () => {
  assert.deepEqual(Object.keys(VIEWPORTS), ["pc", "smartphonePortrait", "smartphoneLandscape", "tabletPortrait", "tabletLandscape"]);
  assert.deepEqual(targetOuterBounds(VIEWPORTS.smartphonePortrait, { innerWidth: 1000, innerHeight: 700 }, { width: 1016, height: 788 }), { width: 406, height: 932 });
});

test("input values never enter normalized events", () => {
  const event = normalizeCaptureEvent({ kind: "input", at: 1, target: { ariaLabel: "顧客名", value: "秘密の値" } });
  assert.deepEqual(event, { kind: "input", at: 1, label: "顧客名" });
  assert.equal(JSON.stringify(event).includes("秘密の値"), false);
});

test("associated labels participate in sensitive classification", () => {
  for (const target of [{ type: "password" }, { autocomplete: "cc-number" }, { name: "access_token" }, { associatedLabel: "個人番号" }, { associatedLabel: "カード CVC" }, { ariaLabel: "eyJabcdefghijk.payload.signature" }, { associatedLabel: "4111 1111 1111 1111" }]) {
    assert.equal(isSensitiveInput(target), true);
    assert.equal(normalizeCaptureEvent({ kind: "input", at: 1, target }).label, "保護された入力欄");
  }
});

test("click labels use bounded semantic metadata, not arbitrary container text", () => {
  assert.equal(safeTargetLabel({ tagName: "button", textContent: "秘密を含むページ本文" }), "ボタン");
  assert.equal(safeTargetLabel({ ariaLabel: "実行".repeat(100) }).length, 80);
});

test("masked screenshot is captured only after masking and always unmasked afterward", async () => {
  const order = [];
  const image = await captureWithMaskBoundary({ applyMasks: async () => { order.push("mask"); return { applied: true }; }, capture: async () => { order.push("capture"); return "data:image/jpeg;base64,AA"; }, removeMasks: async () => { order.push("remove"); } });
  assert.equal(image.startsWith("data:image/"), true);
  assert.deepEqual(order, ["mask", "capture", "remove"]);
});

test("masking failure cannot fall back to an unmasked screenshot and still runs cleanup", async () => {
  let captured = false;
  let removed = false;
  await assert.rejects(captureWithMaskBoundary({ applyMasks: async () => ({ applied: false }), capture: async () => { captured = true; return "data:image/jpeg;base64,AA"; }, removeMasks: async () => { removed = true; } }), /SCREENSHOT_MASK_FAILED/);
  assert.equal(captured, false);
  assert.equal(removed, true);
});

test("capture failure still removes temporary masks", async () => {
  let removed = false;
  await assert.rejects(captureWithMaskBoundary({ applyMasks: async () => ({ applied: true }), capture: async () => { throw new Error("capture failed"); }, removeMasks: async () => { removed = true; } }), /capture failed/);
  assert.equal(removed, true);
});

test("screenshot masking covers ordinary value-bearing controls and iframe surfaces", async () => {
  const source = await readFile(new URL("../apps/extension/capture/screenshot.js", import.meta.url), "utf8");
  for (const selectorFragment of ["input", "textarea", "select", "contenteditable", "textbox", "iframe"]) assert.equal(source.includes(selectorFragment), true);
  assert.match(source, /const overlays = \[\];\s*try \{/);
  assert.doesNotMatch(source, /if \(!sensitive\.test\(metadata\)\) continue/);
  assert.match(source, /host\.shadowRoot/);
  assert.match(source, /dialog\[open\],\[popover\]:popover-open/);
  assert.match(source, /host\.localName\.includes\("-"\)/);
});

test("draft model edits, deletes, reorders and manages normalized masks", () => {
  const draft = { steps: [{ id: "a", order: 1, instruction: "A" }, { id: "b", order: 2, instruction: "B" }], screenshots: [{ id: "s", masks: [] }] };
  updateStepInstruction(draft, "a", "新しい説明");
  moveStep(draft, "b", "up");
  assert.deepEqual(draft.steps.map(({ id, order }) => ({ id, order })), [{ id: "b", order: 1 }, { id: "a", order: 2 }]);
  addMask(draft, "s", { x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
  assert.equal(draft.screenshots[0].masks.length, 1);
  removeMask(draft, "s", draft.screenshots[0].masks[0].id);
  assert.equal(draft.screenshots[0].masks.length, 0);
  deleteStep(draft, "b");
  assert.deepEqual(draft.steps.map((step) => step.instruction), ["新しい説明"]);
});

test("recorder coalesces field edits and flushes pending edits on shutdown/navigation", async () => {
  const source = await readFile(new URL("../apps/extension/content/recorder.js", import.meta.url), "utf8");
  for (const event of ["click", "input", "change", "scroll", "pagehide"]) assert.equal(source.includes(`removeEventListener("${event}"`), true);
  assert.match(source, /setTimeout\(flushInput, 450\)/);
  assert.match(source, /const commitInput =/);
  assert.match(source, /lastCommittedInputTarget === event\.target/);
  assert.match(source, /const pendingEvent = takePendingInput\(\)/);
  assert.match(source, /return pendingEvent/);
  assert.match(source, /\.closest\("button,a,input,select,textarea/);
  assert.match(source, /clearTimeout\(inputTimer\)/);
  assert.match(source, /clearTimeout\(scrollTimer\)/);
  assert.doesNotMatch(source, /element\.textContent/);
  assert.doesNotMatch(source, /value:/);
});

test("service worker serializes mutations and preserves retryable finish/navigation failures", async () => {
  const source = await readFile(new URL("../apps/extension/background/service-worker.js", import.meta.url), "utf8");
  assert.match(source, /serializeSessionOperation/);
  assert.match(source, /phase: "finish_failed"/);
  assert.match(source, /phase: "reinjection_failed"/);
  assert.match(source, /finishFailed: true/);
  assert.match(source, /remainingTabs\.length === 0/);
  assert.match(source, /capture:resume/);
  assert.match(source, /index === lastIndex \? \{ screenshotId: screenshot\.id \} : \{\}/);
});

test("service worker keeps restoration data on failure and exposes retry", async () => {
  const source = await readFile(new URL("../apps/extension/background/service-worker.js", import.meta.url), "utf8");
  assert.match(source, /chrome\.storage\.session\.get\(SESSION_KEY\)/);
  assert.match(source, /chrome\.storage\.session\.set\(\{ \[SESSION_KEY\]: session \}\)/);
  assert.ok(source.indexOf("await setSession(session)") < source.indexOf("if (mode !== \"pc\") await applyResponsiveViewport"), "restore snapshot must be persisted before responsive mutation");
  assert.match(source, /capture:restore/);
  assert.match(source, /async function finishCapture[\s\S]*?stopRecorder\(session\.tabId\)/);
  assert.match(source, /async function cancelCapture[\s\S]*?stopRecorder\(session\.tabId\)/);
  assert.match(source, /if \(!tab\.active \|\| tab\.windowId !== session\.windowId\)/);
  assert.match(source, /session = await appendCaptureEvent\(session, pendingEvent\)/);
});

test("popup exposes local recent draft reopening and explicit reinjection recovery", async () => {
  const popup = await readFile(new URL("../apps/extension/popup/popup.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../apps/extension/popup/popup.html", import.meta.url), "utf8");
  assert.match(popup, /draftStore\.list\(\)/);
  assert.match(popup, /capture:resume/);
  assert.match(popup, /editor\/editor\.html#/);
  assert.match(popup, /if \(state\.mode\) mode\.value = state\.mode/);
  assert.match(html, /id="recentDraft"/);
  assert.match(html, /id="openDraft"/);
  assert.match(html, /id="resume"/);
});

test("S1 extension has no application network-write primitive", async () => {
  const root = new URL("../apps/extension/", import.meta.url);
  async function files(url) {
    const entries = await readdir(url, { withFileTypes: true });
    return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(new URL(`${entry.name}/`, url)) : [new URL(entry.name, url)]))).flat();
  }
  for (const file of await files(root)) {
    if (!/\.(?:js|html)$/.test(file.pathname)) continue;
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket\s*\(/, file.pathname);
  }
});
