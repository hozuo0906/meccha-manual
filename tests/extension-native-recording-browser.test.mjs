import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "./support/test-browser.mjs";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const TERMINAL = new Set(["ready", "unavailable", "failed", "protected", "none"]);
const OPERATIONS = 20;

async function until(read, predicate, description, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let value;
  do {
    value = await read();
    if (predicate(value)) return value;
    await delay(25);
  } while (Date.now() < deadline);
  throw new Error(`${description}; last value: ${JSON.stringify(value)}`);
}

function fixture(pathname) {
  const color = pathname === "/next" ? "rgb(25,115,65)" : "rgb(24,60,140)";
  return `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;width:100%;height:100%;overflow:hidden}body{background:${color};font:20px Arial,sans-serif;color:#172b4d}
    main{position:absolute;inset:80px;padding:32px;background:#fff}button{font:20px Arial;padding:10px 16px;margin-top:20px}
    input{display:block;width:420px;height:42px;margin-top:8px;font:20px Arial;color:#172b4d;-webkit-text-fill-color:rgb(208,0,127);background:#fff}
    .marker{position:fixed;width:54px;height:54px}.one{left:0;top:0;background:rgb(220,30,60)}.two{right:0;top:0;background:rgb(230,190,20)}.three{left:0;bottom:0;background:rgb(20,180,170)}.four{right:0;bottom:0;background:rgb(30,90,220)}
  </style><div class="marker one"></div><div class="marker two"></div><div class="marker three"></div><div class="marker four"></div>
  <main><h1>合成の操作画面</h1><label for="secret">入力欄</label><input id="secret" value="Synthetic Input Value"><button id="record">記録 ${pathname === "/next" ? "次" : "前"}</button></main>`;
}

async function liveSession(worker) {
  return worker.evaluate(async () => (await chrome.storage.session.get("activeCaptureSession")).activeCaptureSession ?? null);
}

async function liveImages(worker, sessionId) {
  return worker.evaluate((sessionId) => new Promise((resolve, reject) => {
    const request = indexedDB.open("meccha-manual-capture-live", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("step-images", "readonly");
      const get = transaction.objectStore("step-images").getAll();
      transaction.oncomplete = () => { db.close(); resolve(get.result.filter((entry) => entry.sessionId === sessionId)); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
  }), sessionId);
}

async function savedDraft(worker, draftId) {
  return worker.evaluate((id) => new Promise((resolve, reject) => {
    const request = indexedDB.open("meccha-manual-guest", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("drafts", "readonly");
      const get = transaction.objectStore("drafts").get(id);
      transaction.oncomplete = () => { db.close(); resolve(get.result ?? null); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
  }), draftId);
}

async function evaluateWorker(context, worker, expression, arg) {
  let lastError;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = context.serviceWorkers()[0] || worker;
    try { return { worker: current, value: await current.evaluate(expression, arg) }; }
    catch (error) { lastError = error; await delay(25); }
  }
  throw lastError;
}

async function sendFromTab(worker, tabId, event) {
  return worker.evaluate(async ({ tabId, event }) => {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (event) => chrome.runtime.sendMessage({ type: "capture:event", event }),
      args: [event]
    });
    return result?.result;
  }, { tabId, event });
}

test("native recording keeps raw pixels, excludes input values, rejects inactive targets, and survives 20 operations", { timeout: 180_000 }, async (t) => {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(fixture(new URL(request.url, "http://127.0.0.1").pathname));
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const extensionRoot = fileURLToPath(new URL("../apps/extension", import.meta.url));
  const context = await chromium.launchPersistentContext("", {
    // Playwright's managed Chromium is the isolated extension runner used by
    // the existing MV3 browser tests. Branded Chrome disables unpacked
    // extensions under its Playwright launch defaults on current Windows
    // builds, so it cannot exercise the worker path here.
    channel: "chromium",
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: ["--enable-unsafe-extension-debugging", `--disable-extensions-except=${extensionRoot}`, `--load-extension=${extensionRoot}`]
  });
  t.after(async () => { await context.close(); await new Promise((resolve) => server.close(resolve)); });
  const page = await context.newPage();
  const base = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${base}/`);
  await page.bringToFront();
  let worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  worker = context.serviceWorkers()[0] || worker;
  const tabLookup = await evaluateWorker(context, worker, async (url) => (await chrome.tabs.query({ url }))[0].id, `${base}/`);
  worker = tabLookup.worker;
  const tabId = tabLookup.value;
  const extensionId = new URL(worker.url()).hostname;
  const cdp = await context.browser().newBrowserCDPSession();
  const target = await until(async () => (await cdp.send("Target.getTargets", { filter: [{ type: "tab", exclude: false }] })).targetInfos.find((entry) => entry.url === `${base}/`), Boolean, "synthetic target missing");
  await cdp.send("Extensions.triggerAction", { id: extensionId, targetId: target.targetId });
  const controls = await context.newPage();
  await controls.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`);
  const command = (message) => controls.evaluate((value) => chrome.runtime.sendMessage(value), message);

  const started = await command({ type: "capture:start", tabId, mode: "pc" });
  assert.equal(started.ok, true, `capture must start through the real MV3 worker: ${JSON.stringify(started)}`);
  const session = await until(() => liveSession(worker), (value) => value?.phase === "recording", "recording did not start");
  await page.bringToFront();

  await page.locator("#secret").fill("Synthetic Input Value");
  await page.locator("#record").click();
  await until(() => liveSession(worker), (value) => value?.events.some((event) => event.kind === "input"), "input event was not recorded");
  const inputState = await liveSession(worker);
  assert.doesNotMatch(JSON.stringify(inputState.events), /Synthetic Input Value/, "input values must never enter recorded events");

  // The VM recovery suite exercises runtime.reload and session restoration;
  // this browser sequence keeps the native pixels path focused on tab and
  // navigation races because Playwright loses the worker target on reload.

  const other = await context.newPage();
  await other.goto(`${base}/next`);
  await other.bringToFront();
  const rejected = await sendFromTab(worker, tabId, { kind: "click", at: Date.now(), eventId: "inactive-target:1", target: { tagName: "button" } });
  assert.equal(rejected?.value?.accepted, true, "event metadata may be retained while its image is unavailable");
  const afterReject = await until(() => liveSession(worker), (value) => value?.stepImageRefs.some((entry) => entry.eventId === "inactive-target:1" && TERMINAL.has(entry.status)), "inactive target did not settle");
  assert.equal(afterReject.stepImageRefs.find((entry) => entry.eventId === "inactive-target:1")?.reason, "tab_not_visible");
  await page.bringToFront();
  await page.goto(`${base}/next`);
  await until(() => liveSession(worker), (value) => value?.phase === "recording", "recording did not recover after navigation");

  for (let index = 0; index < OPERATIONS; index += 1) {
    await delay(650);
    await page.locator("#record").click();
    await until(() => liveSession(worker), (value) => value?.events.some((event) => event.kind === "click" && event.at >= 0) && value.stepImageRefs.filter((entry) => TERMINAL.has(entry.status)).length >= index + 2, `operation ${index + 1} did not settle`, 20_000);
  }
  const final = await liveSession(worker);
  assert.equal(final.phase, "recording");
  assert.ok(final.stepImageRefs.filter((entry) => entry.status === "protected").length >= OPERATIONS, `stable native operations must retain protected images: ${JSON.stringify(final.stepImageRefs)}`);
  assert.doesNotMatch(JSON.stringify(final), /Synthetic Input Value/, "worker state must exclude input values");
  const images = await liveImages(worker, session.id);
  const protectedImages = images.filter((entry) => entry.status === "protected" && entry.dataUrl);
  assert.ok(protectedImages.length >= OPERATIONS, "native screenshots must be persisted as protected image bytes");
  assert.ok(protectedImages.every((entry) => entry.privacyReview?.reviewRequired === true && entry.privacyReview.reasonCodes?.includes("manual_image_review")), "protected native screenshots must require explicit manual image review");
  assert.ok(images.every((entry) => !["ready", "protected"].includes(entry.status) || /^data:image\/(jpeg|png);base64,/.test(entry.dataUrl)), "stored image bytes must remain native data URLs");
  const rawPixelCounts = await worker.evaluate(async (dataUrls) => {
    const counts = [];
    for (const dataUrl of dataUrls.slice(0, 3)) {
      const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      let magenta = 0;
      for (let index = 0; index < pixels.length; index += 4) if (pixels[index] > 130 && pixels[index + 1] < 100 && pixels[index + 2] > 75 && pixels[index + 2] < 185) magenta += 1;
      bitmap.close(); counts.push(magenta);
    }
    return counts;
  }, protectedImages.map((entry) => entry.dataUrl));
  assert.ok(rawPixelCounts.some((count) => count > 5), `native recording must preserve the fixture pixels without automatic replacement: ${JSON.stringify(rawPixelCounts)}`);

  const finished = await command({ type: "capture:finish" });
  assert.equal(finished.ok, true, "native recording must finish after navigation and inactive target rejection");
  assert.ok(finished.value?.draftId, "finish must return the saved draft identity");
  assert.ok(finished.value.reviewImageCount >= OPERATIONS, "finish must retain protected image review count");
  const draft = await savedDraft(worker, finished.value.draftId);
  assert.ok(draft, "finish must persist a local draft");
  const persistedProtected = draft.steps.filter((step) => step.imageState?.status === "protected");
  assert.ok(persistedProtected.length >= OPERATIONS, "finished draft must retain protected image states");
  assert.ok(persistedProtected.every((step) => step.privacyReview?.reviewRequired === true && step.privacyReview.reasonCodes?.includes("manual_image_review")), "finished draft must retain explicit manual image review metadata");
  const persistedDataUrls = persistedProtected.map((step) => draft.screenshots.find((image) => image.id === step.screenshotId)?.dataUrl);
  assert.ok(persistedDataUrls.every((dataUrl) => /^data:image\/(jpeg|png);base64,/.test(dataUrl || "")), "finished draft must retain native image bytes for protected steps");
  const persistedRawPixelCounts = await worker.evaluate(async (dataUrls) => {
    const counts = [];
    for (const dataUrl of dataUrls.slice(0, 3)) {
      const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      let magenta = 0;
      for (let index = 0; index < pixels.length; index += 4) if (pixels[index] > 130 && pixels[index + 1] < 100 && pixels[index + 2] > 75 && pixels[index + 2] < 185) magenta += 1;
      bitmap.close(); counts.push(magenta);
    }
    return counts;
  }, persistedDataUrls);
  assert.ok(persistedRawPixelCounts.some((count) => count > 5), `finished draft must retain native pixels: ${JSON.stringify(persistedRawPixelCounts)}`);
});
