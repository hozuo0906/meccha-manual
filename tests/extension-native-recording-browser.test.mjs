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
    channel: process.platform === "win32" ? "chrome" : "chromium",
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
  const tabId = await worker.evaluate(async (url) => (await chrome.tabs.query({ url }))[0].id, `${base}/`);
  const extensionId = new URL(worker.url()).hostname;
  const cdp = await context.browser().newBrowserCDPSession();
  const target = await until(async () => (await cdp.send("Target.getTargets", { filter: [{ type: "tab", exclude: false }] })).targetInfos.find((entry) => entry.url === `${base}/`), Boolean, "synthetic target missing");
  await cdp.send("Extensions.triggerAction", { id: extensionId, targetId: target.targetId });

  const started = await worker.evaluate((tabId) => chrome.runtime.sendMessage({ type: "capture:start", tabId, mode: "pc" }), tabId);
  assert.equal(started.ok, true, "capture must start through the real MV3 worker");
  const session = await until(() => liveSession(worker), (value) => value?.phase === "recording", "recording did not start");

  await page.locator("#secret").fill("Synthetic Input Value");
  await page.locator("#record").click();
  await until(() => liveSession(worker), (value) => value?.events.some((event) => event.kind === "input"), "input event was not recorded");
  const inputState = await liveSession(worker);
  assert.doesNotMatch(JSON.stringify(inputState.events), /Synthetic Input Value/, "input values must never enter recorded events");

  // Force a real MV3 worker lifecycle boundary and verify session storage
  // restores the recording before continuing the native sequence.
  await worker.evaluate(() => chrome.runtime.reload()).catch(() => undefined);
  worker = context.serviceWorkers().find((candidate) => candidate !== worker) || await context.waitForEvent("serviceworker");
  await until(() => liveSession(worker), (value) => value?.id === session.id && value.phase === "recording", "recording did not recover after worker restart");

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
    await page.locator("#record").click();
    await until(() => liveSession(worker), (value) => value?.events.some((event) => event.kind === "click" && event.at >= 0) && value.stepImageRefs.filter((entry) => TERMINAL.has(entry.status)).length >= index + 2, `operation ${index + 1} did not settle`, 20_000);
  }
  const final = await liveSession(worker);
  assert.equal(final.phase, "recording");
  assert.ok(final.stepImageRefs.filter((entry) => entry.status === "ready").length >= OPERATIONS, "stable native operations must keep their images");
  assert.doesNotMatch(JSON.stringify(final), /Synthetic Input Value/, "worker state must exclude input values");
  const images = await liveImages(worker, session.id);
  assert.ok(images.filter((entry) => entry.status === "ready" && entry.dataUrl).length >= OPERATIONS, "native screenshots must be persisted as useful image bytes");
  assert.ok(images.every((entry) => entry.status !== "ready" || /^data:image\/(jpeg|png);base64,/.test(entry.dataUrl)), "stored image bytes must remain native data URLs");
  const rawPixelCounts = await worker.evaluate(async (dataUrls) => {
    const counts = [];
    for (const dataUrl of dataUrls.slice(0, 3)) {
      const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      const width = Math.min(bitmap.width - 120, 460), height = Math.min(bitmap.height - 180, 70);
      const pixels = context.getImageData(100, 180, width, height).data;
      let magenta = 0;
      for (let index = 0; index < pixels.length; index += 4) if (pixels[index] > 130 && pixels[index + 1] < 100 && pixels[index + 2] > 75 && pixels[index + 2] < 185) magenta += 1;
      bitmap.close(); counts.push(magenta);
    }
    return counts;
  }, images.filter((entry) => entry.status === "ready" && entry.dataUrl).map((entry) => entry.dataUrl));
  assert.ok(rawPixelCounts.some((count) => count > 20), "native recording must preserve the fixture pixels without automatic replacement");

  const finished = await worker.evaluate(() => chrome.runtime.sendMessage({ type: "capture:finish" }));
  assert.equal(finished.ok, true, "native recording must finish after navigation and inactive target rejection");
});
