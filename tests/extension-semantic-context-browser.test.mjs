import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "./support/test-browser.mjs";
import { captureWithMaskBoundary, installSensitiveMasks, removeSensitiveMasks, verifySensitiveMasks } from "../apps/extension/capture/screenshot.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(read, accept, message) {
  const end = Date.now() + 15_000;
  do { const value = await read(); if (accept(value)) return value; await delay(30); } while (Date.now() < end);
  assert.fail(message);
}
const canaries = ["Synthetic Person", "Column Person Alpha", "Column Person Beta", "Span Person Gamma", "Ambiguous Person", "Explicit Person", "Zero Span Person", "Header Person One", "Header Person Two"];
const fixture = `<!doctype html><meta charset="utf-8"><style>
body{margin:20px;font:16px Arial,sans-serif;color:#172b4d;background:#f4f8fa}
table{border-collapse:collapse;margin:8px 0;table-layout:fixed;width:670px}td,th{border:2px solid #456;padding:4px;height:24px;background:#fff}th{text-align:left}
dt{width:170px;white-space:nowrap;overflow:hidden}dd{margin:0;width:350px;height:36px;padding:4px;background:#fff}button{font:16px Arial;border:0;padding:0;background:transparent;color:rgb(208,0,127)}
#safe{color:#172b4d}h1{font-size:20px;margin:8px}
</style><h1>合成データの意味境界</h1>
<dl><dt>${"X".repeat(201)} 氏名</dt><dd id="long-value"><button id="long-name">Synthetic Person</button></dd></dl>
<table id="standard"><tbody><tr><td colspan="2">顧客一覧</td></tr><tr><th id="standard-name-heading">氏名</th><th>操作</th></tr>
<tr><td id="column-a"><button id="column-name">Column Person Alpha</button></td><td><button id="safe">確認</button></td></tr>
<tr><td id="column-copy"><button>Column Person Alpha</button></td><td>未処理</td></tr>
<tr><td id="column-b"><button>Column Person Beta</button></td><td>処理済み</td></tr>
<tr><th id="all-th-explicit" headers="standard-name-heading"><button>Header Person One</button></th><th><button id="safe-th">確認</button></th></tr>
<tr><th id="all-th-implicit"><button>Header Person Two</button></th><th>確認</th></tr></tbody></table>
<table id="spans"><thead><tr><th rowspan="2">区分</th><th colspan="2">基本情報</th></tr><tr><th>氏名</th><th>会社</th></tr></thead><tbody>
<tr><td rowspan="2">受付</td><td id="span-name"><button>Span Person Gamma</button></td><td>合成企業</td></tr>
<tr><td colspan="2" id="ambiguous"><button>Ambiguous Person</button></td></tr></tbody></table>
<table><thead><tr><th id="explicit-heading">氏名</th><th>操作</th></tr></thead><tbody><tr><td>合成氏名</td><td id="explicit-value" headers="explicit-heading"><button>Explicit Person</button></td></tr></tbody></table>
<table><tbody><tr><th rowspan="0" scope="row">氏名</th><td id="zero-first"><button>Zero Span Person</button></td></tr><tr><td id="zero-second"><button>Zero Span Person</button></td></tr></tbody></table>`;

async function launchFixture(t, html = fixture) {
  const server = createServer((_req, res) => { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(html); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections?.(); return new Promise((resolve) => server.close(resolve)); });
  const extensionPath = fileURLToPath(new URL("../apps/extension", import.meta.url));
  const context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true, viewport: null,
    args: ["--window-size=1280,1000", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
  t.after(() => context.close());
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).hostname;
  const page = await context.newPage();
  const url = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(url);
  const cdp = await context.browser().newBrowserCDPSession();
  const target = (await cdp.send("Target.getTargets", { filter: [{ type: "tab", exclude: false }] })).targetInfos.find((item) => item.url === url);
  await until(() => worker.evaluate(() => chrome.action.onClicked.hasListeners()), Boolean, "Extension action unavailable");
  await cdp.send("Extensions.triggerAction", { id: extensionId, targetId: target.targetId });
  const controls = await context.newPage();
  await controls.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`);
  const command = (message) => controls.evaluate((message) => chrome.runtime.sendMessage(message), message);
  const tabId = await worker.evaluate(async (url) => (await chrome.tabs.query({ url }))[0].id, url);
  const inject = async (fn, args = []) => (await worker.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
  await page.bringToFront();
  await page.evaluate(() => document.fonts.ready);
  await delay(500); // Let the native side panel and headed window finish resizing.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return { worker, page, command, tabId, inject };
}
const rectangles = (page, ids) => page.evaluate((ids) => Object.fromEntries(ids.map((id) => {
  const r = document.getElementById(id).getBoundingClientRect();
  return [id, { x: r.x, y: r.y, width: r.width, height: r.height }];
})), ids);
async function pixelCounts(page, dataUrl, boxes) {
  return page.evaluate(async ({ dataUrl, boxes }) => {
    const image = new Image(); image.src = dataUrl; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const scale = canvas.width / innerWidth;
    return Object.fromEntries(Object.entries(boxes).map(([id, box]) => {
      let original = 0, ink = 0;
      for (let y = Math.ceil((box.y + 3) * scale); y < Math.floor((box.y + box.height - 3) * scale); y += 1) {
        for (let x = Math.ceil((box.x + 3) * scale); x < Math.floor((box.x + box.width - 3) * scale); x += 1) {
          const i = (y * canvas.width + x) * 4, r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
          if (r > 130 && g < 90 && b > 75 && b < 185) original += 1;
          if (r < 90 && g < 100 && b < 140) ink += 1;
        }
      }
      return [id, { original, ink }];
    }));
  }, { dataUrl, boxes });
}

test("native capture protects long-label and span-aware table values in pixels and captions", { timeout: 90_000 }, async (t) => {
  const { worker, page, command, tabId } = await launchFixture(t);
  const ids = ["long-value", "column-a", "column-copy", "column-b", "span-name", "ambiguous", "explicit-value", "zero-first", "zero-second", "all-th-explicit", "all-th-implicit"];
  const before = await rectangles(page, ids);
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const originals = await page.locator("body").textContent();
  const beforeImage = `data:image/png;base64,${(await page.screenshot()).toString("base64")}`;
  const unmasked = await pixelCounts(page, beforeImage, before);
  for (const id of ids) assert.ok(unmasked[id].original > 15, `${id}: synthetic original glyphs must be present before capture (count=${unmasked[id].original})`);
  assert.equal((await command({ type: "capture:start", tabId, mode: "pc" })).ok, true);
  const state = () => worker.evaluate(async () => (await chrome.storage.session.get("activeCaptureSession")).activeCaptureSession);
  const collect = async (selector) => {
    const previous = (await state()).events.length;
    await page.locator(selector).click();
    const session = await until(state, (s) => s.events.length > previous && s.stepImageRefs.some((r) => r.eventId === s.events.at(-1).eventId && ["ready", "protected", "failed"].includes(r.status)), "Native semantic capture did not finish");
    const event = session.events.at(-1), ref = session.stepImageRefs.find((r) => r.eventId === event.eventId);
    assert.equal(ref.status, "protected", `Ambiguous semantic cells require a protected stored image, received ${ref.reason}`);
    const image = await worker.evaluate(({ eventId, sessionId }) => new Promise((resolve, reject) => {
      const request = indexedDB.open("meccha-manual-capture-live", 1);
      request.onerror = () => reject(new Error("Cannot read native capture store"));
      request.onsuccess = () => { const db = request.result; const tx = db.transaction("step-images", "readonly"); const get = tx.objectStore("step-images").getAll(); tx.oncomplete = () => { db.close(); resolve(get.result.find((item) => item.eventId === eventId && item.sessionId === sessionId)); }; };
    }), { eventId: event.eventId, sessionId: session.id });
    return { image, event };
  };
  const { image, event } = await collect("#long-name");
  assert.equal(event.label, "ボタン");
  assert.equal(event.labelSource, undefined);
  assert.ok(image?.dataUrl?.startsWith("data:image/"));
  const replacements = image.privacyReview.replacements;
  const find = (id) => replacements.find((item) => {
    const rect = before[id];
    return Math.abs(item.x * viewport.width - (rect.x + 2)) < 4 && Math.abs(item.y * viewport.height - (rect.y + 2)) < 4;
  });
  for (const id of ids) assert.ok(find(id), `${id}: stored image must record its replacement`);
  assert.equal(find("column-a").kind, "name");
  assert.equal(find("column-copy").id, find("column-a").id);
  assert.notEqual(find("column-b").id, find("column-a").id);
  assert.equal(find("span-name").kind, "name");
  assert.equal(find("all-th-explicit").kind,"name");assert.equal(find("all-th-implicit").kind,"name");
  assert.equal(find("ambiguous").kind, "unknown");
  assert.equal(find("ambiguous").text, "サンプル値");
  assert.equal(find("zero-first").id, find("zero-second").id);
  const protectedPixels = await pixelCounts(page, image.dataUrl, before);
  for (const id of ids) {
    assert.equal(protectedPixels[id].original, 0, `${id}: native PNG must contain no original-colored canary glyphs`);
    assert.ok(protectedPixels[id].ink > 10, `${id}: readable replacement must remain`);
  }
  assert.deepEqual(await rectangles(page, ids), before, "No table/definition-list layout changes are allowed");
  assert.equal(await page.locator("body").textContent(), originals, "Original DOM values stay unchanged");
  await delay(650);
  const second = await collect("#column-name");
  assert.equal(second.event.label, "ボタン");
  assert.equal(second.event.labelSource, undefined);
  await delay(650);
  const headerValue=await collect("#all-th-explicit button");assert.equal(headerValue.event.label,"ボタン");assert.equal(headerValue.event.labelSource,undefined);
  await delay(650);
  const safe = await collect("#safe-th");
  assert.equal(safe.event.label, "確認", "A clearly unrelated action column retains its caption");
  assert.equal((await command({ type: "capture:finish" })).ok, true);
  const exported = await worker.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("meccha-manual-guest", 1);
    request.onerror = () => reject(new Error("Cannot read saved draft"));
    request.onsuccess = () => { const db = request.result; const tx = db.transaction("drafts", "readonly"); const get = tx.objectStore("drafts").getAll(); tx.oncomplete = () => { db.close(); resolve(JSON.stringify(get.result)); }; };
  }));
  for (const value of canaries) assert.equal(exported.includes(value), false, "Saved draft captions/metadata must exclude every original canary");
});

test("semantic label/table exhaustion and transient column changes fail closed", { timeout: 90_000 }, async (t) => {
  const { page, inject } = await launchFixture(t);
  // Exercise the actual recorder without recording images on every click.
  const recorder = await readFile(new URL("../apps/extension/content/recorder.js", import.meta.url), "utf8");
  const start = recorder.indexOf("  const semanticKind = ");
  const end = recorder.indexOf("\n  const describe = ", start);
  const contextFor = async (id) => page.evaluate(({ source, id }) => new Function("element", `${source}; return privateValueContext(element);`)(document.getElementById(id)), { source: recorder.slice(start, end), id });
  await page.evaluate(() => { document.querySelector("dt").textContent = "X".repeat(4097); });
  assert.equal(await contextFor("long-name"), true, "Label exhaustion must suppress original captions even with no marker in the prefix");
  let result = await inject(installSensitiveMasks);
  assert.equal(result.applied, true);
  assert.ok(result.privacyReview.replacements.some((item) => item.kind === "unknown"));
  assert.equal(await inject(verifySensitiveMasks, [result.token]), true);
  await inject(removeSensitiveMasks);

  await page.evaluate(() => { document.body.innerHTML = '<table><thead><tr><th colspan="1000">氏名</th></tr></thead><tbody><tr><td colspan="1000" rowspan="5"><button id="budget">Synthetic Budget Person</button></td></tr><tr></tr><tr></tr><tr></tr><tr></tr></tbody></table>'; });
  assert.equal(await contextFor("budget"), true, "Table span budget exhaustion must suppress original captions");
  result = await inject(installSensitiveMasks);
  assert.equal(result.applied, false);
  assert.equal(result.reason, "SCREENSHOT_BUDGET_EXCEEDED");
  let captures = 0;
  await assert.rejects(captureWithMaskBoundary({ applyMasks: () => inject(installSensitiveMasks), capture: async () => { captures += 1; return "data:image/png;base64,unused"; }, removeMasks: () => inject(removeSensitiveMasks) }), /SCREENSHOT_BUDGET_EXCEEDED/);
  assert.equal(captures, 0, "Never capture unredacted pixels as a budget fallback");

  await page.evaluate(() => { document.body.innerHTML = '<table><thead><tr><th id="header">区分</th></tr></thead><tbody><tr><td><button id="transient">Synthetic Transient Person</button></td></tr></tbody></table>'; });
  result = await inject(installSensitiveMasks);
  assert.equal(result.applied, true);
  assert.equal(await inject(verifySensitiveMasks, [result.token]), true);
  await page.evaluate(() => { const text = document.getElementById("header").firstChild; text.nodeValue = "氏名"; text.nodeValue = "区分"; });
  assert.equal(await inject(verifySensitiveMasks, [result.token]), false, "A temporary private column heading must invalidate the capture");
  await inject(removeSensitiveMasks);
});

test("caption and screenshot table classifiers remain identical", async () => {
  const sources = await Promise.all(["../apps/extension/capture/screenshot.js", "../apps/extension/content/recorder.js"].map((file) => readFile(new URL(file, import.meta.url), "utf8")));
  const body = (source) => source.slice(source.indexOf("    const semanticTableKinds = "), source.indexOf("      return kinds;", source.indexOf("    const semanticTableKinds = ")) + "      return kinds;\n    };".length);
  assert.ok(body(sources[0]).includes("const semanticTableKinds"));
  assert.equal(body(sources[0]), body(sources[1]));
});
