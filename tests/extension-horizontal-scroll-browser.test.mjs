import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "./support/test-browser.mjs";

const extensionRoot = fileURLToPath(new URL("../apps/extension/", import.meta.url));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(read, predicate, message) {
  const deadline = Date.now() + 15_000;
  do {
    const value = await read();
    if (predicate(value)) return value;
    await delay(50);
  } while (Date.now() < deadline);
  // Do not print page contents or captured payloads on failure.
  throw new Error(message);
}

function nativeEvaluator(cdp, sessionId) {
  let nextId = 0;
  return (expression) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const cleanup = () => { clearTimeout(timer); cdp.off("Target.receivedMessageFromTarget", receive); };
    const receive = (event) => {
      if (event.sessionId !== sessionId) return;
      const response = JSON.parse(event.message);
      if (response.id !== id) return;
      cleanup();
      if (response.error || response.result?.exceptionDetails) reject(new Error("Native sidepanel evaluation failed"));
      else resolve(response.result?.result?.value);
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error("Native sidepanel evaluation timed out")); }, 5_000);
    cdp.on("Target.receivedMessageFromTarget", receive);
    cdp.send("Target.sendMessageToTarget", { sessionId, message: JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }) })
      .catch((error) => { cleanup(); reject(error); });
  });
}

test("real MV3 records horizontal element/document scrolls once in a private local draft", { timeout: 120_000 }, async () => {
  // Synthetic canaries only. Existing raw screenshots may contain visible text;
  // the privacy assertions below cover structured events/steps, not raster pixels.
  const canaries = ["synthetic-scroll-path", "synthetic-query-canary", "synthetic-fragment-canary", "SYNTHETIC_CELL_CONTENT", "SYNTHETIC_INPUT_VALUE", "SYNTHETIC_SECRET_VALUE", "SYNTHETIC_TARGET_LABEL"];
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>合成横スクロール試験</title>
      <style>html{scroll-behavior:auto}body{margin:0;width:4000px;height:4000px}.panel{width:420px;height:180px;overflow:auto;scroll-behavior:auto;margin:16px}table{width:1800px;height:900px;table-layout:fixed}td{vertical-align:top}</style></head>
      <body><div id="panel" class="panel" aria-label="${canaries[6]}"><table><tr><td>${canaries[3]}<input value="${canaries[4]}"><input type="password" value="${canaries[5]}"></td><td>合成列</td></tr></table></div>
      <script>document.querySelector('#panel').scrollLeft=320;window.fixtureScrollEvents=0;addEventListener('scroll',()=>{window.fixtureScrollEvents++},true);</script></body></html>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const fixtureUrl = `http://127.0.0.1:${server.address().port}/${canaries[0]}?probe=${canaries[1]}#${canaries[2]}`;
  const profile = await mkdtemp(join(tmpdir(), "meccha-horizontal-scroll-"));
  let context;
  try {
    // Real unmodified MV3 action grants activeTab, injects recorder, and opens
    // native sidepanel. No fake capture:event messages or recorder/API patches.
    context = await chromium.launchPersistentContext(profile, {
      channel: "chromium", headless: true, viewport: null,
      args: ["--window-size=1366,1000", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${extensionRoot}`, `--load-extension=${extensionRoot}`]
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 15_000 });
    const extensionId = new URL(worker.url()).hostname;
    const target = await context.newPage();
    await target.goto(fixtureUrl);
    await target.bringToFront();
    const cdp = await context.browser().newBrowserCDPSession();
    const tab = await until(async () => (await cdp.send("Target.getTargets", { filter: [{ type: "tab", exclude: false }] })).targetInfos.find((entry) => entry.url === fixtureUrl), Boolean, "Fixture tab target missing");
    await until(() => worker.evaluate(() => chrome.action.onClicked.hasListeners()), Boolean, "Action listener missing");
    await cdp.send("Extensions.triggerAction", { id: extensionId, targetId: tab.targetId });
    await until(() => worker.evaluate(() => chrome.runtime.getContexts({ contextTypes: ["SIDE_PANEL"] })), (value) => value.length === 1, "Native sidepanel context missing");
    const panel = await until(async () => (await cdp.send("Target.getTargets", { filter: [{}] })).targetInfos.find((entry) => entry.type === "page" && entry.url === `chrome-extension://${extensionId}/sidepanel/sidepanel.html`), Boolean, "Native sidepanel target missing");
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: panel.targetId, flatten: false });
    const evaluatePanel = nativeEvaluator(cdp, sessionId);
    await until(() => evaluatePanel("document.readyState === 'complete' && document.visibilityState === 'visible' && !!document.querySelector('#start:not([hidden]):not([disabled])') && !document.querySelector('#startSection')?.hidden && innerWidth > 0 && innerHeight > 0"), Boolean, "Recording start control missing");
    await evaluatePanel("document.querySelector('#start').click(); true");
    const readLive = () => worker.evaluate(async () => (await chrome.storage.session.get("activeCaptureSession")).activeCaptureSession);
    const initial = await until(readLive, (value) => value?.phase === "recording", "Recording did not start");
    await until(() => worker.evaluate(async (tabId) => {
      const [result] = await chrome.scripting.executeScript({ target: { tabId }, func: () => typeof globalThis.__mecchaManualRecorder === "function" });
      return result?.result;
    }, initial.tabId), Boolean, "Real recorder was not injected");
    assert.equal(initial.events.length, 0);
    assert.equal(await target.locator("#panel").evaluate((element) => element.scrollLeft), 320, "Existing nonzero baseline must be preserved");

    const directions = [];
    const labels = { right: "右", left: "左", down: "下", up: "上" };
    const move = async (selector, x, y) => {
      const before = await target.evaluate(() => window.fixtureScrollEvents);
      const position = await target.evaluate(({ selector, x, y }) => {
        const element = selector ? document.querySelector(selector) : window;
        element.scrollTo({ left: x, top: y, behavior: "instant" });
        return selector ? [element.scrollLeft, element.scrollTop] : [scrollX, scrollY];
      }, { selector, x, y });
      assert.deepEqual(position, [x, y], "Fixture must actually reach the requested scroll offset");
      await until(() => target.evaluate(() => window.fixtureScrollEvents), (count) => count > before, "Browser did not dispatch a real scroll event");
    };
    const assertSettled = async () => {
      // Longer than the real 250ms coalesce window; no fake clocks. Check after
      // its flush too, since checkpoint and flush must share one event identity.
      await delay(700);
      const live = await readLive();
      assert.deepEqual(live.events.map((event) => event.direction), directions);
      assert.equal(new Set(live.events.map((event) => event.eventId)).size, directions.length);
      assert.equal(live.phase, "recording");
    };
    const recordMove = async (selector, x, y, direction) => {
      await move(selector, x, y);
      directions.push(direction);
      await until(readLive, (value) => value?.events.length === directions.length, "Scroll did not produce exactly one event");
      await assertSettled();
      await until(() => evaluatePanel("document.querySelector('#liveCurrentStep')?.textContent"), (text) => text?.includes(`画面を${labels[direction]}へスクロールする`), "Native sidepanel lost the scroll direction");
    };

    await recordMove("#panel", 480, 0, "right");
    await recordMove("#panel", 320, 0, "left");
    await recordMove(null, 240, 0, "right");
    await recordMove(null, 0, 0, "left");
    await recordMove("#panel", 320, 160, "down");
    await recordMove("#panel", 320, 0, "up");
    await recordMove(null, 0, 160, "down");
    await recordMove(null, 0, 0, "up");

    // Both axes below the threshold must stay silent for element and document.
    await move("#panel", 399, 79);
    await assertSettled();
    await move("#panel", 320, 0);
    await assertSettled();
    await move(null, 79, 79);
    await assertSettled();
    await move(null, 0, 0);
    await assertSettled();
    // The 80px boundary is inclusive; mixed-axis moves choose the larger delta.
    await recordMove("#panel", 400, 0, "right");
    await recordMove("#panel", 320, 0, "left");
    await recordMove("#panel", 500, 100, "right");
    await recordMove("#panel", 400, 300, "down");

    // ADR-0031 / DEC-071: a newly mounted element has no known baseline.
    await target.evaluate(() => {
      const dynamic = document.createElement("div");
      dynamic.id = "dynamic";
      dynamic.className = "panel";
      dynamic.innerHTML = '<div style="width:1800px;height:100px">合成動的パネル</div>';
      document.body.append(dynamic);
    });
    await move("#dynamic", 160, 0);
    await assertSettled();
    await recordMove("#dynamic", 320, 0, "right");
    const live = await readLive();
    for (const event of live.events) {
      assert.deepEqual(Object.keys(event).sort(), ["at", "direction", "eventId", "kind"], "Scroll events must contain only the established metadata");
      assert.equal(event.kind, "scroll");
      assert.equal(Number.isFinite(event.at), true);
      assert.equal(typeof event.eventId, "string");
    }

    await evaluatePanel("document.querySelector('#finish').click(); true");
    const editor = await until(() => context.pages().find((page) => page.url().startsWith(`chrome-extension://${extensionId}/editor/editor.html#`)), Boolean, "Finish did not open local draft editor");
    await editor.waitForSelector("#steps li");
    // Read the committed IndexedDB record, not a mocked draftStore or UI count.
    const draft = await worker.evaluate((draftId) => new Promise((resolve, reject) => {
      const open = indexedDB.open("meccha-manual-guest", 1);
      open.onupgradeneeded = () => { open.transaction.abort(); reject(new Error("Persisted draft database missing")); };
      open.onerror = () => reject(new Error("Cannot open draft database"));
      open.onsuccess = () => {
        const db = open.result;
        const transaction = db.transaction("drafts", "readonly");
        const request = transaction.objectStore("drafts").get(draftId);
        transaction.oncomplete = () => { db.close(); resolve(request.result); };
        transaction.onabort = transaction.onerror = () => { db.close(); reject(new Error("Cannot read committed draft")); };
      };
    }), initial.id);
    assert.ok(draft);
    assert.equal(draft.steps.length, directions.length);
    assert.equal(await editor.locator("#steps li").count(), directions.length);
    const allowedStepKeys = new Set(["id", "order", "instruction", "screenshotId", "privacyReview", "kind", "at", "direction", "eventId", "imageState"]);
    for (const [index, step] of draft.steps.entries()) {
      assert.ok(Object.keys(step).every((key) => allowedStepKeys.has(key)), "No page-derived fields may enter draft steps");
      assert.equal(step.eventId, live.events[index].eventId);
      assert.equal(step.direction, directions[index]);
      assert.equal(step.kind, "scroll");
      assert.equal(step.order, index + 1);
      assert.equal(step.instruction, `画面を${labels[directions[index]]}へスクロールする`);
    }
    const metadata = JSON.stringify({ events: live.events, steps: draft.steps });
    for (const value of [fixtureUrl, new URL(fixtureUrl).origin, ...canaries]) {
      assert.equal(metadata.includes(value), false, "Synthetic page canary leaked into structured scroll metadata");
    }
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await new Promise((resolve) => server.close(resolve));
  }
});
