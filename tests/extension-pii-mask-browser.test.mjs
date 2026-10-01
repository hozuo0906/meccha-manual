import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import nodeTest from "node:test";
import { chromium } from "@playwright/test";
import { captureWithMaskBoundary, installSensitiveMasks, removeSensitiveMasks, verifySensitiveMasks } from "../apps/extension/capture/screenshot.js";

const test = (name, fn) => nodeTest(name, { timeout: 60_000 }, fn);

async function waitForPaint(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

test("PII candidates are replaced in pixels with temporary dummy overlays and restored", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<!doctype html><style>
      body { margin: 0; background: #eaf7fa; color: #102a43; font: 18px Arial, sans-serif; }
      dl { width: 520px; margin: 24px; background: #fff; padding: 18px; }
      dt { float: left; clear: left; width: 90px; font-weight: 700; }
      dd { min-height: 28px; margin-left: 110px; }
      #email { color: #0b7285; }
    </style><dl>
      <dt>氏名</dt><dd id="name">佐藤花子</dd>
      <dt>住所</dt><dd id="address">東京都千代田区1-2-3</dd>
      <dt>電話</dt><dd id="phone">03-1234-5678</dd>
      <dt>メール</dt><dd id="email">customer@example.com</dd>
    </dl>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const tabId = await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    const before = await page.screenshot({ type: "png" });
    const mask = await inject(installSensitiveMasks);
    assert.equal(mask.applied, true);
    assert.equal(mask.privacyMaskedCount, 4);
    await waitForPaint(page);
    const overlayState = await page.evaluate(() => ({
      count: document.querySelectorAll(".meccha-manual-pii-overlay").length,
      values: [...document.querySelectorAll(".meccha-manual-pii-overlay")].map((element) => element.textContent),
      original: ["name", "address", "phone", "email"].map((id) => document.getElementById(id).textContent)
    }));
    const rawState = await inject(() => JSON.stringify(globalThis.__mecchaManualScreenshotMasks) || "");
    assert.equal(overlayState.count, 4);
    assert.deepEqual(overlayState.values.sort(), ["100-0000 東京都千代田区", "03-0000-0000", "manual@example.invalid", "山田太郎"].sort());
    assert.deepEqual(overlayState.original, ["佐藤花子", "東京都千代田区1-2-3", "03-1234-5678", "customer@example.com"]);
    assert.equal(rawState.includes("佐藤花子"), false);
    assert.equal(rawState.includes("customer@example.com"), false);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), true);

    const after = await page.screenshot({ type: "png" });
    const changedPixels = await page.evaluate(async ({ beforeBase64, afterBase64 }) => {
      const decode = async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const [before, after] = await Promise.all([decode(beforeBase64), decode(afterBase64)]);
      let changed = 0;
      for (let index = 0; index < before.length; index += 4) {
        if (Math.abs(before[index] - after[index]) + Math.abs(before[index + 1] - after[index + 1]) + Math.abs(before[index + 2] - after[index + 2]) > 18) changed += 1;
      }
      return changed;
    }, { beforeBase64: before.toString("base64"), afterBase64: after.toString("base64") });
    assert.ok(changedPixels > 100, `expected dummy overlays to change captured pixels, got ${changedPixels}`);

    await page.evaluate(() => { document.getElementById("name").style.marginTop = "40px"; });
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false);
    await inject(removeSensitiveMasks);
    assert.equal(await page.locator(".meccha-manual-pii-overlay").count(), 0);
    assert.deepEqual(await page.evaluate(() => ["name", "address", "phone", "email"].map((id) => document.getElementById(id).textContent)), ["佐藤花子", "東京都千代田区1-2-3", "03-1234-5678", "customer@example.com"]);
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("repeated PII text nodes are all replaced and transformed body geometry fails closed", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<!doctype html><style>
      html { background: #f4fbfc; }
      body { margin: 0; transform: translate(18px, 14px); filter: saturate(1); contain: paint; color: #102a43; font: 20px Arial, sans-serif; }
      main { width: 620px; margin: 24px; background: #fff; padding: 18px; }
      .copy { display: block; margin: 14px 0; }
    </style><main>
      <span class="copy" id="email-one">repeat@example.com</span>
      <span class="copy" id="email-two">repeat@example.com</span>
      <span class="copy" id="phone-one">03-1234-5678</span>
      <span class="copy" id="phone-two">03-1234-5678</span>
      <span class="copy" id="postal-one">123-4567</span>
      <span class="copy" id="postal-two">123-4567</span>
    </main>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const tabId = await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    const before = await page.screenshot({ type: "png" });
    const beforeRects = await page.evaluate(() => ["email-one", "email-two", "phone-one", "phone-two", "postal-one", "postal-two"].map((id) => {
      const rect = document.getElementById(id).getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }));
    const mask = await inject(installSensitiveMasks);
    assert.equal(mask.applied, true);
    assert.equal(mask.privacyMaskedCount, 6, "電話番号の一部を郵便番号として重ねて処理しない");
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), true);
    assert.deepEqual(await page.evaluate(() => [
      document.getElementById("email-one").textContent,
      document.getElementById("email-two").textContent
    ]), ["repeat@example.com", "repeat@example.com"]);
    const after = await page.screenshot({ type: "png" });
    const changedByRect = await page.evaluate(async ({ beforeBase64, afterBase64, rects }) => {
      const decode = async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        return { width: canvas.width, height: canvas.height, pixels: context.getImageData(0, 0, canvas.width, canvas.height).data };
      };
      const [before, after] = await Promise.all([decode(beforeBase64), decode(afterBase64)]);
      return rects.map((rect) => {
        let changed = 0;
        const left = Math.max(0, Math.floor(rect.left));
        const top = Math.max(0, Math.floor(rect.top));
        const right = Math.min(before.width, Math.ceil(rect.left + rect.width));
        const bottom = Math.min(before.height, Math.ceil(rect.top + rect.height));
        for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
          const index = (y * before.width + x) * 4;
          if (Math.abs(before.pixels[index] - after.pixels[index]) + Math.abs(before.pixels[index + 1] - after.pixels[index + 1]) + Math.abs(before.pixels[index + 2] - after.pixels[index + 2]) > 18) changed += 1;
        }
        return changed;
      });
    }, { beforeBase64: before.toString("base64"), afterBase64: after.toString("base64"), rects: beforeRects });
    assert.ok(changedByRect.every((changed) => changed > 10), `expected both repeated PII ranges to change pixels, got ${changedByRect.join(",")}`);
    await inject(removeSensitiveMasks);
    assert.equal(await page.locator(".meccha-manual-pii-overlay").count(), 0);
    assert.deepEqual(await page.evaluate(() => [
      document.getElementById("email-one").textContent,
      document.getElementById("email-two").textContent
    ]), ["repeat@example.com", "repeat@example.com"]);
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("PII split across adjacent rendered text nodes is replaced and restored", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<!doctype html><style>
      body { margin: 0; padding: 24px; background: #f7fbfc; color: #102a43; font: 22px Arial, sans-serif; }
      .value { display: block; width: 520px; margin: 12px 0; padding: 8px; background: #fff; }
    </style>
    <div class="value" id="split-email"><span>alice@</span><span>example.com</span></div>
    <div class="value" id="split-phone"><span>03-1234-</span><span>5678</span></div>
    <div class="value" id="split-postal"><span>123-</span><span>4567</span></div>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const tabId = await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    const before = await page.screenshot({ type: "png" });
    const beforeRects = await page.evaluate(() => ["split-email", "split-phone", "split-postal"].map((id) => {
      const rect = document.getElementById(id).getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }));
    const mask = await inject(installSensitiveMasks);
    assert.equal(mask.applied, true);
    assert.equal(mask.privacyMaskedCount, 3);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), true);
    assert.deepEqual(await page.evaluate(() => [
      document.querySelector("#split-email").textContent,
      document.querySelector("#split-phone").textContent,
      document.querySelector("#split-postal").textContent
    ]), ["alice@example.com", "03-1234-5678", "123-4567"]);
    const after = await page.screenshot({ type: "png" });
    const changedByRect = await page.evaluate(async ({ beforeBase64, afterBase64, rects }) => {
      const decode = async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        return { width: canvas.width, height: canvas.height, pixels: context.getImageData(0, 0, canvas.width, canvas.height).data };
      };
      const [beforePixels, afterPixels] = await Promise.all([decode(beforeBase64), decode(afterBase64)]);
      return rects.map((rect) => {
        let changed = 0;
        const left = Math.max(0, Math.floor(rect.left));
        const top = Math.max(0, Math.floor(rect.top));
        const right = Math.min(beforePixels.width, Math.ceil(rect.left + rect.width));
        const bottom = Math.min(beforePixels.height, Math.ceil(rect.top + rect.height));
        for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
          const index = (y * beforePixels.width + x) * 4;
          if (Math.abs(beforePixels.pixels[index] - afterPixels.pixels[index]) + Math.abs(beforePixels.pixels[index + 1] - afterPixels.pixels[index + 1]) + Math.abs(beforePixels.pixels[index + 2] - afterPixels.pixels[index + 2]) > 18) changed += 1;
        }
        return changed;
      });
    }, { beforeBase64: before.toString("base64"), afterBase64: after.toString("base64"), rects: beforeRects });
    assert.ok(changedByRect.every((changed) => changed > 10), `expected split PII ranges to change pixels, got ${changedByRect.join(",")}`);
    await inject(removeSensitiveMasks);
    assert.equal(await page.locator(".meccha-manual-pii-overlay").count(), 0);
    assert.deepEqual(await page.evaluate(() => [
      document.querySelector("#split-email").textContent,
      document.querySelector("#split-phone").textContent,
      document.querySelector("#split-postal").textContent
    ]), ["alice@example.com", "03-1234-5678", "123-4567"]);
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("bounded split recovery keeps complete suffixes, precedence, and boundary failures", async () => {
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    if (path === "/complete") {
      response.end(`<!doctype html><style>body{margin:0;padding:24px;font:22px Arial,sans-serif}</style>
        <div id="complete-email"><span>alice@example.co</span><span>m</span></div>
        <div id="postal"><span>123-</span><span>4567</span></div>`);
      return;
    }
    if (path === "/block") {
      response.end(`<!doctype html><style>body{margin:0;padding:24px;font:22px Arial,sans-serif}</style>
        <div id="block"><span>block@example.co</span></div><span>m</span>`);
      return;
    }
    if (path === "/br") {
      response.end(`<!doctype html><style>body{margin:0;padding:24px;font:22px Arial,sans-serif}</style>
        <span id="br">line@example.co</span><br><span>m</span>`);
      return;
    }
    response.end(`<!doctype html><style>body{margin:0;padding:24px;font:22px Arial,sans-serif}</style>
      <div id="hidden"><span>hidden@</span><span hidden>ignored</span><span>example.com</span></div>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/complete`);
    const tabId = await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    const run = async (path) => {
      await page.goto(`http://127.0.0.1:${server.address().port}${path}`);
      const mask = await inject(installSensitiveMasks);
      const state = await page.evaluate(() => ({
        overlays: [...document.querySelectorAll(".meccha-manual-pii-overlay")].map((element) => ({ text: element.textContent, width: element.getBoundingClientRect().width })),
        completeRange: (() => {
          const root = document.querySelector("#complete-email");
          if (!root) return null;
          const range = document.createRange();
          range.setStart(root.firstElementChild.firstChild, 0);
          range.setEnd(root.lastElementChild.firstChild, root.lastElementChild.firstChild.nodeValue.length);
          return { text: range.toString(), width: range.getBoundingClientRect().width };
        })()
      }));
      const verified = await inject(verifySensitiveMasks, [mask.token]);
      await inject(removeSensitiveMasks);
      return { mask, state, verified };
    };

    const complete = await run("/complete");
    assert.equal(complete.mask.privacyMaskedCount, 2);
    assert.deepEqual(complete.state.overlays.map(({ text }) => text).sort(), ["100-0000 東京都千代田区", "manual@example.invalid"]);
    const completeEmailOverlay = complete.state.overlays.find(({ text }) => text === "manual@example.invalid");
    assert.equal(complete.state.completeRange.text, "alice@example.com");
    assert.ok(Math.abs(completeEmailOverlay.width - complete.state.completeRange.width) < 1, "complete adjacent email suffix is protected");
    assert.equal(complete.verified, true);

    const block = await run("/block");
    assert.equal(block.mask.privacyMaskedCount, 1);
    assert.equal(block.verified, true);
    const br = await run("/br");
    assert.equal(br.mask.privacyMaskedCount, 1);
    assert.equal(br.verified, true);

    const hidden = await run("/hidden");
    assert.equal(hidden.mask.privacyMaskedCount, 0);
    assert.equal(hidden.verified, false, "hidden text between visible fragments fails closed");
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("split candidates respect rendering boundaries and finite recovery budgets", async () => {
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    if (path === "/boundary") {
      response.end(`<!doctype html><style>body{margin:0;padding:24px;font:20px Arial}.hidden{display:none}</style>
        <div><span>alice@</span></div><div><span>example.com</span></div>
        <p><span>03-1234-</span><br><span>5678</span></p>
        <p><span>123-</span><span class="hidden">4567</span></p>`);
      return;
    }
    if (path === "/mutation") {
      response.end("<!doctype html><style>body{margin:0;padding:24px;font:20px Arial}</style><p id=value><span>alice@</span><span id=tail>example.com</span></p>");
      return;
    }
    if (path === "/long") {
      response.end(`<!doctype html><style>body{margin:0;padding:24px;font:20px Arial}</style><p id=value>${"x".repeat(300)}alice@example.com</p>`);
      return;
    }
    if (path === "/budget") {
      const nodes = [...Array(128)].map(() => "<span>x</span>").join("");
      response.end(`<!doctype html><style>body{margin:0;padding:24px;font:20px Arial}</style><p id=value><span>alice@</span>${nodes}<span>example.com</span></p>`);
      return;
    }
    if (path === "/char-budget") {
      response.end(`<!doctype html><style>body{margin:0;padding:24px;font:20px Arial}</style><p id=value><span>${"alice@" + "x".repeat(1018)}</span><span>example.com</span></p>`);
      return;
    }
    if (path === "/char-budget-after-long-token") {
      response.end(`<!doctype html><style>body{margin:0;padding:24px;font:20px Arial}</style><p id=value><span>${" ordinary text ".repeat(73) + " alice"}</span><span>@example.com</span></p>`);
      return;
    }
    if (path === "/hidden-normal") {
      response.end(`<!doctype html><style>body{margin:0;padding:24px;font:20px Arial}</style><p><span>Help center</span><span hidden>menu item</span><span> next</span></p>`);
      return;
    }
    if (path === "/richtext-budget") {
      const nodes = [...Array(128)].map(() => "<span>操作手順</span>").join("");
      response.end(`<!doctype html><style>body{margin:0;padding:24px;font:20px Arial}</style><p>${nodes}<span>完了</span></p>`);
      return;
    }
    if (path === "/token-budget") {
      const nodes = ["<span>alice</span>", ...Array(127).fill("<span>x</span>")].join("");
      response.end(`<!doctype html><style>body{margin:0;padding:24px;font:20px Arial}</style><p>${nodes}<span>@example.com</span></p>`);
      return;
    }
    if (path === "/english-richtext") {
      response.end(`<!doctype html><style>body{margin:0;padding:24px;font:20px Arial}</style><p><span>Help</span><span>${" ordinary help text without private data.".repeat(80)}</span></p>`);
      return;
    }
    if (path === "/english-richtext-mutation") {
      response.end(`<!doctype html><style>body{margin:0;padding:24px;font:20px Arial}</style><p><span>${" ordinary help text without private data.".repeat(80)}</span><span id=status>status</span></p>`);
      return;
    }
    if (path === "/hidden-visible-continuation") {
      response.end("<!doctype html><style>body{margin:0;padding:24px;font:20px Arial}</style><p><span>alice</span><span hidden>ignored</span><span>@example.com</span></p>");
      return;
    }
    response.end("<!doctype html><p>unknown</p>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const tabId = async () => (await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id));
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${await tabId()}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    await page.goto(`${baseUrl}/boundary`);
    const boundary = await inject(installSensitiveMasks);
    assert.equal(boundary.applied, true);
    assert.equal(boundary.privacyMaskedCount, 1, "the visible phone prefix remains an independent single-node candidate");
    assert.equal(await inject(verifySensitiveMasks, [boundary.token]), false, "block, br, and hidden split boundaries fail closed");
    await inject(removeSensitiveMasks);

    await page.goto(`${baseUrl}/mutation`);
    const mutation = await inject(installSensitiveMasks);
    assert.equal(mutation.privacyMaskedCount, 1);
    assert.equal(await inject(verifySensitiveMasks, [mutation.token]), true);
    await page.locator("#tail").evaluate((node) => { node.firstChild.nodeValue = "example.net"; });
    await page.evaluate(() => new Promise((resolve) => queueMicrotask(resolve)));
    assert.equal(await inject(verifySensitiveMasks, [mutation.token]), false, "a protected adjacent node mutation invalidates the capture");
    await inject(removeSensitiveMasks);

    await page.goto(`${baseUrl}/long`);
    const longNode = await inject(installSensitiveMasks);
    assert.equal(longNode.privacyMaskedCount, 1, "a long single text node keeps the existing detector");
    assert.equal(await inject(verifySensitiveMasks, [longNode.token]), true);
    await inject(removeSensitiveMasks);

    await page.goto(`${baseUrl}/budget`);
    const budget = await inject(installSensitiveMasks);
    assert.equal(budget.privacyMaskedCount, 0);
    assert.equal(await inject(verifySensitiveMasks, [budget.token]), false, "a candidate continuing beyond the adjacent node budget fails closed");
    await inject(removeSensitiveMasks);

    await page.goto(`${baseUrl}/char-budget`);
    const charBudget = await inject(installSensitiveMasks);
    assert.equal(charBudget.privacyMaskedCount, 0);
    assert.equal(await inject(verifySensitiveMasks, [charBudget.token]), false, "a candidate continuing beyond the adjacent character budget fails closed");
    await inject(removeSensitiveMasks);

    await page.goto(`${baseUrl}/char-budget-after-long-token`);
    const longTokenBudget = await inject(installSensitiveMasks);
    assert.equal(longTokenBudget.privacyMaskedCount, 0);
    assert.equal(await inject(verifySensitiveMasks, [longTokenBudget.token]), false, "a long token ending before the next email node fails closed");
    await inject(removeSensitiveMasks);

    await page.goto(`${baseUrl}/hidden-normal`);
    const hiddenNormal = await inject(installSensitiveMasks);
    assert.equal(hiddenNormal.privacyMaskedCount, 0);
    assert.equal(await inject(verifySensitiveMasks, [hiddenNormal.token]), true, "PII-free hidden help/menu boundaries remain recordable");
    await inject(removeSensitiveMasks);

    await page.goto(`${baseUrl}/richtext-budget`);
    const richText = await inject(installSensitiveMasks);
    assert.equal(richText.privacyMaskedCount, 0);
    assert.equal(await inject(verifySensitiveMasks, [richText.token]), true, "CJK rich text at the node budget remains recordable");
    await inject(removeSensitiveMasks);

    await page.goto(`${baseUrl}/token-budget`);
    const tokenBudget = await inject(installSensitiveMasks);
    assert.equal(tokenBudget.privacyMaskedCount, 0);
    assert.equal(await inject(verifySensitiveMasks, [tokenBudget.token]), false, "an email token continuing after the node budget fails closed");
    await inject(removeSensitiveMasks);

    await page.goto(`${baseUrl}/english-richtext`);
    const englishRichText = await inject(installSensitiveMasks);
    assert.equal(englishRichText.privacyMaskedCount, 0);
    assert.equal(await inject(verifySensitiveMasks, [englishRichText.token]), true, "PII-free English rich text remains recordable");
    await inject(removeSensitiveMasks);

    await page.goto(`${baseUrl}/english-richtext-mutation`);
    const englishRichTextMutation = await inject(installSensitiveMasks);
    await page.evaluate(() => { document.querySelector("#status").firstChild.nodeValue = "updated"; });
    await page.waitForTimeout(25);
    assert.equal(await inject(verifySensitiveMasks, [englishRichTextMutation.token]), true, "PII-free long prose status mutation remains recordable");
    await inject(removeSensitiveMasks);

    await page.goto(`${baseUrl}/hidden-visible-continuation`);
    const hiddenVisibleContinuation = await inject(installSensitiveMasks);
    assert.equal(hiddenVisibleContinuation.privacyMaskedCount, 0);
    assert.equal(await inject(verifySensitiveMasks, [hiddenVisibleContinuation.token]), false, "visible PII split by hidden text fails closed");
    await inject(removeSensitiveMasks);
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("open shadow text is replaced and later shadow mutations fail closed", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<!doctype html><style>body{margin:0;padding:24px;font:20px Arial,sans-serif;color:#102a43}open-pii-host{display:block}</style><open-pii-host></open-pii-host><script>
      const host = document.querySelector('open-pii-host');
      const root = host.attachShadow({mode:'open'});
      root.innerHTML = '<span id="shadow-email">open@example.com</span>';
    </script>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const tabId = await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    const mask = await inject(installSensitiveMasks);
    assert.equal(mask.applied, true);
    assert.equal(mask.privacyMaskedCount, 1);
    assert.equal(await page.locator(".meccha-manual-pii-overlay").textContent(), "manual@example.invalid");
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), true);
    await page.evaluate(() => document.querySelector("open-pii-host").shadowRoot.querySelector("#shadow-email").firstChild.nodeValue = "changed@example.com");
    await page.evaluate(() => new Promise((resolve) => queueMicrotask(resolve)));
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false);
    await inject(removeSensitiveMasks);
    assert.equal(await page.locator(".meccha-manual-pii-overlay").count(), 0);
    assert.equal(await page.evaluate(() => document.querySelector("open-pii-host").shadowRoot.querySelector("#shadow-email").textContent), "changed@example.com");
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("fractional overlay style and zero-opacity ancestors fail closed without changing source text", async () => {
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    if (request.url === "/hidden") {
      response.end(`<!doctype html><style>body{opacity:0}</style><p id="hidden-email">hidden@example.com</p>`);
      return;
    }
    response.end(`<!doctype html><style>body{margin:0;padding:24px;font:20px Arial,sans-serif}</style><p id="email">visible@example.com</p>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const tabId = await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    const mask = await inject(installSensitiveMasks);
    assert.equal(mask.applied, true);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), true);
    await page.locator(".meccha-manual-pii-overlay").evaluate((overlay) => overlay.style.setProperty("opacity", "0.5", "important"));
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false);
    await inject(removeSensitiveMasks);

    await page.goto(`http://127.0.0.1:${server.address().port}/hidden`);
    const hiddenMask = await inject(installSensitiveMasks);
    assert.equal(hiddenMask.applied, true);
    assert.equal(hiddenMask.privacyMaskedCount, 0);
    assert.equal(await page.locator(".meccha-manual-pii-overlay").count(), 0);
    assert.equal(await page.locator("#hidden-email").textContent(), "hidden@example.com");
    await inject(removeSensitiveMasks);
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("a visible aria-hidden value is masked and overlay paint is a full opaque rectangle", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<!doctype html><style>
      body { margin: 0; padding: 24px; font: 20px Arial, sans-serif; }
      .meccha-manual-pii-overlay { background: linear-gradient(red, blue); background-clip: text; -webkit-background-clip: text; clip: rect(0px, 11px, 11px, 0px); border-radius: 40px; box-shadow: 0 0 20px red; }
    </style><span id="visible-hidden" aria-hidden="true">visible@example.com</span>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const tabId = await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    const mask = await inject(installSensitiveMasks);
    assert.equal(mask.applied, true);
    assert.equal(mask.privacyMaskedCount, 1);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), true);
    const style = await page.locator(".meccha-manual-pii-overlay").evaluate((overlay) => {
      const computed = getComputedStyle(overlay);
      return { backgroundClip: computed.backgroundClip, clip: computed.clip, borderRadius: computed.borderRadius, backgroundImage: computed.backgroundImage, boxShadow: computed.boxShadow };
    });
    assert.equal(style.backgroundClip, "border-box");
    assert.equal(style.clip, "auto");
    assert.equal(style.borderRadius, "0px");
    assert.equal(style.backgroundImage, "none");
    assert.equal(style.boxShadow, "none");
    await inject(removeSensitiveMasks);
    assert.equal(await page.locator("#visible-hidden").textContent(), "visible@example.com");
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("initially empty capture fails closed when a later open shadow root adds PII", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end("<!doctype html><open-pii-host></open-pii-host>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const tabId = await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    const mask = await inject(installSensitiveMasks);
    assert.equal(mask.applied, true);
    assert.equal(mask.privacyMaskedCount, 0);
    await page.evaluate(() => {
      const root = document.querySelector("open-pii-host").attachShadow({ mode: "open" });
      root.innerHTML = "<span>late@example.com</span>";
      root.textContent = "";
    });
    await page.evaluate(() => new Promise((resolve) => queueMicrotask(resolve)));
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false);
    await inject(removeSensitiveMasks);
    assert.equal(await page.locator("open-pii-host").evaluate((host) => host.shadowRoot.textContent), "");
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("hidden subtree transient visibility probe", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end("<!doctype html><div id=hidden-pii style=display:none><span>hidden@example.com</span></div>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const tabId = await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    const mask = await inject(installSensitiveMasks);
    assert.equal(mask.applied, true);
    assert.equal(mask.privacyMaskedCount, 0);
    await page.evaluate(() => {
      const host = document.getElementById("hidden-pii");
      host.style.display = "block";
      host.style.display = "none";
    });
    await page.evaluate(() => new Promise((resolve) => queueMicrotask(resolve)));
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false);
    await inject(removeSensitiveMasks);
    assert.equal(await page.locator("#hidden-pii").textContent(), "hidden@example.com");
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("unrelated dashboard mutations remain valid but transient PII is rejected", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end("<!doctype html><main id='dashboard'><span id='clock'>10:20</span><p>稼働中</p></main>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const tabId = await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    const mask = await inject(installSensitiveMasks);
    assert.equal(mask.applied, true);
    assert.equal(mask.privacyMaskedCount, 0);
    await page.evaluate(() => {
      const dashboard = document.getElementById("dashboard");
      dashboard.classList.toggle("updated");
      document.getElementById("clock").textContent = "10:21";
    });
    await page.evaluate(() => new Promise((resolve) => queueMicrotask(resolve)));
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), true);
    await page.evaluate(() => {
      const transient = document.createElement("span");
      transient.textContent = "transient@example.com";
      document.body.append(transient);
      transient.remove();
      const splitTransient = document.createElement("p");
      const mailbox = document.createElement("span");
      mailbox.textContent = "alice@";
      const domain = document.createElement("span");
      domain.textContent = "example.com";
      splitTransient.append(mailbox, domain);
      document.body.append(splitTransient);
      mailbox.remove();
      domain.remove();
      splitTransient.remove();
      const pair = document.createElement("dl");
      pair.innerHTML = "<dt>氏名</dt><dd>佐藤花子</dd>";
      document.body.append(pair);
      pair.querySelector("dd").textContent = "";
      pair.remove();
    });
    await page.evaluate(() => new Promise((resolve) => queueMicrotask(resolve)));
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false);
    await inject(removeSensitiveMasks);
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("split transient PII is rejected after connected child nodes are removed", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end("<!doctype html><main id='dashboard'><span>稼働中</span><p id='transient'></p></main>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const tabId = await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    const mask = await inject(installSensitiveMasks);
    assert.equal(mask.applied, true);
    assert.equal(mask.privacyMaskedCount, 0);
    await page.evaluate(() => {
      const transient = document.getElementById("transient");
      const mailbox = document.createElement("span");
      mailbox.textContent = "alice@";
      const domain = document.createElement("span");
      domain.textContent = "example.com";
      transient.append(mailbox);
      transient.append(domain);
      mailbox.remove();
      domain.remove();
    });
    await page.evaluate(() => new Promise((resolve) => queueMicrotask(resolve)));
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false, "removed split PII must fail closed");
    await inject(removeSensitiveMasks);
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("large transient split PII fails closed when the mutation budget is exceeded", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end("<!doctype html><main><p id='large-transient'></p></main>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const tabId = await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    const mask = await inject(installSensitiveMasks);
    assert.equal(mask.applied, true);
    assert.equal(mask.privacyMaskedCount, 0);
    await page.evaluate(() => {
      const target = document.getElementById("large-transient");
      const prefix = document.createElement("span");
      for (let index = 0; index < 140; index += 1) {
        const chunk = document.createElement("span");
        chunk.textContent = "ordinary update ";
        prefix.append(chunk);
      }
      const mailbox = document.createElement("span");
      mailbox.textContent = "alice@";
      prefix.append(mailbox);
      const domain = document.createElement("span");
      domain.textContent = "example.com";
      target.append(prefix);
      target.append(domain);
      prefix.remove();
      domain.remove();
    });
    await page.evaluate(() => new Promise((resolve) => queueMicrotask(resolve)));
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false, "mutation budget overflow must fail closed");
    await inject(removeSensitiveMasks);
    const emptyPrefixMask = await inject(installSensitiveMasks);
    assert.equal(emptyPrefixMask.applied, true);
    assert.equal(emptyPrefixMask.privacyMaskedCount, 0);
    await page.evaluate(() => {
      const target = document.getElementById("large-transient");
      const prefix = document.createElement("span");
      for (let index = 0; index < 140; index += 1) prefix.append(document.createElement("span"));
      const mailbox = document.createElement("span");
      mailbox.textContent = "alice@";
      prefix.append(mailbox);
      const domain = document.createElement("span");
      domain.textContent = "example.com";
      target.append(prefix);
      target.append(domain);
      prefix.remove();
      domain.remove();
    });
    await page.evaluate(() => new Promise((resolve) => queueMicrotask(resolve)));
    assert.equal(await inject(verifySensitiveMasks, [emptyPrefixMask.token]), false, "empty mutation budget overflow must fail closed");
    await inject(removeSensitiveMasks);
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("characterData split PII is rejected after the text is restored", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end("<!doctype html><main><p><span id='char-a'>safe</span><span id='char-b'>value</span></p></main>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const tabId = await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    const mask = await inject(installSensitiveMasks);
    assert.equal(mask.applied, true);
    assert.equal(mask.privacyMaskedCount, 0);
    await page.evaluate(() => {
      const a = document.querySelector("#char-a").firstChild;
      const b = document.querySelector("#char-b").firstChild;
      a.nodeValue = "alice@";
      b.nodeValue = "example.com";
      a.nodeValue = "safe";
      b.nodeValue = "value";
    });
    await page.evaluate(() => new Promise((resolve) => queueMicrotask(resolve)));
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false, "characterData split PII must fail closed");
    await inject(removeSensitiveMasks);
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("leading at marker is rejected across separate mutation tasks", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end("<!doctype html><main><p id='split-transient'></p></main>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const tabId = await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    const mask = await inject(installSensitiveMasks);
    assert.equal(mask.applied, true);
    assert.equal(mask.privacyMaskedCount, 0);
    await page.evaluate(() => {
      const mailbox = document.createElement("span");
      mailbox.id = "split-mailbox";
      mailbox.textContent = "alice";
      document.getElementById("split-transient").append(mailbox);
    });
    await page.waitForTimeout(25);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), true, "ASCII-only precursor remains recordable");
    await page.evaluate(() => {
      const mailbox = document.getElementById("split-mailbox");
      const suffix = document.createElement("span");
      suffix.id = "split-suffix";
      suffix.textContent = "@example.com, ordinary text";
      document.getElementById("split-transient").append(suffix);
    });
    await page.waitForTimeout(25);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false, "leading at continuation must fail closed");
    await page.evaluate(() => {
      document.getElementById("split-mailbox").remove();
    });
    await page.waitForTimeout(25);
    await page.evaluate(() => {
      document.getElementById("split-suffix").remove();
    });
    await page.waitForTimeout(25);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false, "removal after leading at marker remains invalid");
    await inject(removeSensitiveMasks);
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("isolated at prose mutation remains recordable", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end("<!doctype html><main><p id='ordinary-at'></p></main>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const tabId = await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    const mask = await inject(installSensitiveMasks);
    assert.equal(mask.applied, true);
    assert.equal(mask.privacyMaskedCount, 0);
    await page.evaluate(() => {
      const text = document.createElement("span");
      text.textContent = "保存 @ 次へ";
      document.getElementById("ordinary-at").append(text);
    });
    await page.waitForTimeout(25);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), true, "isolated at prose must remain recordable");
    await inject(removeSensitiveMasks);
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("numeric fragments stay bounded across mutation callbacks", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end("<!doctype html><main><p id='stream'></p><p id='unrelated'>status</p><p id='char-stream'><span id='char-a'>safe</span><span id='char-b'>value</span></p></main>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const tabIdForPage = async () => (await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id));
    const install = async () => {
      const tabId = await tabIdForPage();
      return {
        tabId,
        inject: async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result
      };
    };
    await page.goto(`${baseUrl}/`);
    let { inject } = await install();
    let mask = await inject(installSensitiveMasks);
    assert.equal(mask.applied, true);
    await page.evaluate(() => {
      const fragment = document.createElement("span");
      fragment.id = "postal-fragment";
      fragment.textContent = "123";
      document.getElementById("stream").append(fragment);
    });
    await page.waitForTimeout(25);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), true, "single numeric prefix remains recordable");
    await page.evaluate(() => {
      const suffix = document.createElement("span");
      suffix.id = "postal-suffix";
      suffix.textContent = "-4567";
      document.getElementById("stream").append(suffix);
    });
    await page.waitForTimeout(25);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false, "postal fragments across callbacks must fail closed");
    await page.evaluate(() => document.getElementById("postal-fragment").remove());
    await page.waitForTimeout(25);
    await page.evaluate(() => document.getElementById("postal-suffix").remove());
    await page.waitForTimeout(25);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false, "postal removal remains invalid");
    await inject(removeSensitiveMasks);

    await page.reload();
    ({ inject } = await install());
    mask = await inject(installSensitiveMasks);
    await page.evaluate(() => {
      const fragment = document.createElement("span");
      fragment.id = "phone-fragment";
      fragment.textContent = "0";
      document.getElementById("stream").append(fragment);
    });
    await page.waitForTimeout(25);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), true, "single phone prefix remains recordable");
    await page.evaluate(() => { document.getElementById("unrelated").textContent = "updated"; });
    await page.waitForTimeout(25);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), true, "unrelated callback does not reject a lone prefix");
    await page.evaluate(() => {
      const suffix = document.createElement("span");
      suffix.id = "phone-suffix";
      suffix.textContent = "90-1234-5678";
      document.getElementById("stream").append(suffix);
    });
    await page.waitForTimeout(25);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false, "phone fragments across callbacks must fail closed");
    await page.evaluate(() => document.getElementById("phone-fragment").remove());
    await page.waitForTimeout(25);
    await page.evaluate(() => document.getElementById("phone-suffix").remove());
    await page.waitForTimeout(25);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false, "phone removal remains invalid");
    await inject(removeSensitiveMasks);

    await page.reload();
    ({ inject } = await install());
    mask = await inject(installSensitiveMasks);
    await page.evaluate(() => {
      const status = document.createElement("span");
      status.id = "stream-status";
      status.textContent = "status";
      document.getElementById("stream").append(status);
    });
    await page.waitForTimeout(25);
    await page.evaluate(() => {
      const prefix = document.createElement("span");
      prefix.id = "stream-prefix";
      prefix.textContent = "123";
      document.getElementById("stream").append(prefix);
    });
    await page.waitForTimeout(25);
    await page.evaluate(() => {
      const status = document.getElementById("stream-status");
      status.replaceChildren(document.createTextNode("updated"));
    });
    await page.waitForTimeout(25);
    await page.evaluate(() => {
      const suffix = document.createElement("span");
      suffix.id = "stream-suffix";
      suffix.textContent = "-4567";
      document.getElementById("stream").append(suffix);
    });
    await page.waitForTimeout(25);
    await page.evaluate(() => document.getElementById("stream-prefix").remove());
    await page.waitForTimeout(25);
    await page.evaluate(() => document.getElementById("stream-suffix").remove());
    await page.waitForTimeout(25);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false, "unrelated sibling updates must not clear adjacent numeric evidence");
    await inject(removeSensitiveMasks);

    await page.reload();
    ({ inject } = await install());
    mask = await inject(installSensitiveMasks);
    await page.evaluate(() => {
      const prefix = document.createElement("span");
      prefix.id = "mixed-character-prefix";
      prefix.textContent = "safe";
      document.getElementById("stream").append(prefix);
    });
    await page.waitForTimeout(25);
    await page.evaluate(() => { document.getElementById("mixed-character-prefix").firstChild.nodeValue = "123"; });
    await page.waitForTimeout(25);
    await page.evaluate(() => {
      const suffix = document.createElement("span");
      suffix.id = "mixed-character-suffix";
      suffix.textContent = "-4567";
      document.getElementById("stream").append(suffix);
    });
    await page.waitForTimeout(25);
    await page.evaluate(() => document.getElementById("mixed-character-prefix").remove());
    await page.waitForTimeout(25);
    await page.evaluate(() => document.getElementById("mixed-character-suffix").remove());
    await page.waitForTimeout(25);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false, "characterData to childList numeric fragments must remain invalid after removal");
    await inject(removeSensitiveMasks);

    await page.reload();
    ({ inject } = await install());
    mask = await inject(installSensitiveMasks);
    await page.evaluate(() => {
      const prefix = document.createElement("span");
      prefix.id = "mixed-child-prefix";
      prefix.textContent = "0";
      document.getElementById("stream").append(prefix);
    });
    await page.waitForTimeout(25);
    await page.evaluate(() => {
      const suffix = document.createElement("span");
      suffix.id = "mixed-child-suffix";
      suffix.textContent = "safe";
      document.getElementById("stream").append(suffix);
    });
    await page.waitForTimeout(25);
    await page.evaluate(() => { document.getElementById("mixed-child-suffix").firstChild.nodeValue = "90-1234-5678"; });
    await page.waitForTimeout(25);
    await page.evaluate(() => document.getElementById("mixed-child-prefix").remove());
    await page.waitForTimeout(25);
    await page.evaluate(() => document.getElementById("mixed-child-suffix").remove());
    await page.waitForTimeout(25);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false, "childList to characterData phone fragments must remain invalid after removal");
    await inject(removeSensitiveMasks);

    await page.reload();
    await page.evaluate(() => {
      const prefix = document.createElement("span");
      prefix.id = "initial-numeric-prefix";
      prefix.textContent = "123";
      document.getElementById("stream").append(prefix);
    });
    ({ inject } = await install());
    mask = await inject(installSensitiveMasks);
    await page.evaluate(() => {
      const suffix = document.createElement("span");
      suffix.id = "initial-numeric-suffix";
      suffix.textContent = "-4567";
      document.getElementById("stream").append(suffix);
    });
    await page.waitForTimeout(25);
    await page.evaluate(() => document.getElementById("initial-numeric-prefix").remove());
    await page.waitForTimeout(25);
    await page.evaluate(() => document.getElementById("initial-numeric-suffix").remove());
    await page.waitForTimeout(25);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false, "an existing visible numeric prefix must join a later adjacent suffix");
    await inject(removeSensitiveMasks);

    await page.reload();
    ({ inject } = await install());
    mask = await inject(installSensitiveMasks);
    await page.evaluate(() => {
      const prefix = document.createElement("span");
      prefix.id = "long-phone-prefix";
      prefix.textContent = "09012";
      document.getElementById("stream").append(prefix);
    });
    await page.waitForTimeout(25);
    await page.evaluate(() => {
      const suffix = document.createElement("span");
      suffix.id = "long-phone-suffix";
      suffix.textContent = "345678";
      document.getElementById("stream").append(suffix);
    });
    await page.waitForTimeout(25);
    await page.evaluate(() => document.getElementById("long-phone-prefix").remove());
    await page.waitForTimeout(25);
    await page.evaluate(() => document.getElementById("long-phone-suffix").remove());
    await page.waitForTimeout(25);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false, "long phone fragments must remain invalid after removal");
    await inject(removeSensitiveMasks);

    await page.reload();
    ({ inject } = await install());
    mask = await inject(installSensitiveMasks);
    await page.evaluate(() => {
      document.querySelector("#char-a").firstChild.nodeValue = "123";
    });
    await page.waitForTimeout(25);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), true, "single characterData prefix remains recordable");
    await page.evaluate(() => { document.getElementById("unrelated").textContent = "updated again"; });
    await page.waitForTimeout(25);
    await page.evaluate(() => {
      document.querySelector("#char-b").firstChild.nodeValue = "-4567";
    });
    await page.waitForTimeout(25);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false, "characterData numeric fragments must fail closed");
    await inject(removeSensitiveMasks);

    await page.reload();
    ({ inject } = await install());
    mask = await inject(installSensitiveMasks);
    await page.evaluate(() => {
      const prefix = document.createElement("span");
      prefix.id = "same-node-prefix";
      prefix.textContent = "123";
      document.getElementById("stream").append(prefix);
    });
    await page.waitForTimeout(25);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), true, "same-node numeric prefix remains recordable");
    await page.evaluate(() => { document.getElementById("same-node-prefix").firstChild.nodeValue = "-4567"; });
    await page.waitForTimeout(25);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), true, "same-node numeric continuation remains recordable");
    await inject(removeSensitiveMasks);

    await page.reload();
    ({ inject } = await install());
    mask = await inject(installSensitiveMasks);
    await page.evaluate(() => {
      const prefix = document.createElement("span");
      prefix.id = "nonadjacent-prefix";
      prefix.textContent = "123";
      document.getElementById("stream").append(prefix);
    });
    await page.waitForTimeout(25);
    await page.evaluate(() => {
      const separator = document.createElement("span");
      separator.textContent = "ordinary separator";
      document.getElementById("stream").append(separator);
    });
    await page.waitForTimeout(25);
    await page.evaluate(() => {
      const suffix = document.createElement("span");
      suffix.textContent = "-4567";
      document.getElementById("stream").append(suffix);
    });
    await page.waitForTimeout(25);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), true, "nonadjacent numeric fragments remain recordable");
    await inject(removeSensitiveMasks);

    await page.reload();
    ({ inject } = await install());
    mask = await inject(installSensitiveMasks);
    await page.evaluate(() => {
      const target = document.getElementById("stream");
      for (let index = 0; index < 129; index += 1) {
        const span = document.createElement("span");
        span.textContent = "visible";
        target.append(span);
      }
    });
    await page.waitForTimeout(25);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false, "childList node budget overflow must fail closed");
    await inject(removeSensitiveMasks);

    await page.reload();
    ({ inject } = await install());
    mask = await inject(installSensitiveMasks);
    await page.evaluate(() => {
      const target = document.getElementById("stream");
      for (const value of ["x".repeat(800), "y".repeat(800)]) {
        const span = document.createElement("span");
        span.textContent = value;
        target.append(span);
      }
    });
    await page.waitForTimeout(25);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false, "childList character budget overflow must fail closed");
    await inject(removeSensitiveMasks);
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("visibility mutations inspect bounded composed PII candidates and refuse the 65th candidate", async () => {
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    if (request.url === "/composed") {
      response.end(`<!doctype html><style>body{margin:0;font:16px Arial,sans-serif}#ancestor{display:none}</style><div id="ancestor"><span id="light">light@example.com</span><composed-host id="host"></composed-host></div><script>
        const host = document.getElementById("host");
        const outer = host.attachShadow({ mode: "open" });
        outer.innerHTML = "<section><nested-host></nested-host><dl><dt>メール</dt><dd id=semantic>shadow-semantic@example.com</dd></dl></section>";
        const nested = outer.querySelector("nested-host").attachShadow({ mode: "open" });
        nested.innerHTML = "<span>nested@example.com</span>";
      </script>`);
      return;
    }
    const count = request.url === "/sixty-five" ? 65 : 64;
    response.end(`<!doctype html><style>body{margin:0;font:10px Arial,sans-serif}span{position:fixed;left:0;top:0;width:160px;height:10px}</style>${Array.from({ length: count }, (_, index) => `<span>${index}@example.com</span>`).join("")}`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${baseUrl}/composed`);
    const tabId = await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    for (const mutation of ["host-style", "ancestor-style", "ancestor-class", "ancestor-hidden", "ancestor-opacity"]) {
      await page.goto(`${baseUrl}/composed`);
      const mask = await inject(installSensitiveMasks);
      assert.equal(mask.applied, true);
      assert.equal(mask.privacyMaskedCount, 0);
      await page.evaluate((kind) => {
        const host = document.getElementById("host");
        const ancestor = document.getElementById("ancestor");
        if (kind === "host-style") { host.style.display = "block"; host.style.display = "none"; }
        if (kind === "ancestor-style") { ancestor.style.display = "block"; ancestor.style.display = "none"; }
        if (kind === "ancestor-class") { ancestor.classList.add("visibility-changed"); ancestor.classList.remove("visibility-changed"); }
        if (kind === "ancestor-hidden") { ancestor.hidden = false; ancestor.hidden = true; }
        if (kind === "ancestor-opacity") { ancestor.style.opacity = "1"; ancestor.style.opacity = "0"; }
      }, mutation);
      await page.evaluate(() => new Promise((resolve) => queueMicrotask(resolve)));
      assert.equal(await inject(verifySensitiveMasks, [mask.token]), false, `${mutation} must reject composed candidates`);
      await inject(removeSensitiveMasks);
    }

    await page.goto(`${baseUrl}/sixty-four`);
    const withinLimit = await inject(installSensitiveMasks);
    assert.equal(withinLimit.applied, true);
    assert.equal(withinLimit.privacyMaskedCount, 64);
    assert.equal(await inject(verifySensitiveMasks, [withinLimit.token]), true);
    await inject(removeSensitiveMasks);

    await page.goto(`${baseUrl}/sixty-five`);
    const overLimit = await inject(installSensitiveMasks);
    assert.equal(overLimit.applied, true);
    assert.equal(overLimit.privacyMaskedCount, 64);
    assert.equal(await inject(verifySensitiveMasks, [overLimit.token]), false, "the 65th PII candidate must fail closed");
    await inject(removeSensitiveMasks);
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("same text range chooses postal masking over the broader phone pattern", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end("<!doctype html><span id='postal'>060-0001</span>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const tabId = await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    const mask = await inject(installSensitiveMasks);
    assert.equal(mask.applied, true);
    assert.equal(mask.privacyMaskedCount, 1);
    assert.equal(await page.locator(".meccha-manual-pii-overlay").textContent(), "100-0000 東京都千代田区");
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), true);
    await inject(removeSensitiveMasks);
    assert.equal(await page.locator("#postal").textContent(), "060-0001");
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("transient semantic label changes fail closed for strict dt/dd and th/td pairs", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<!doctype html><style>body{margin:0;padding:24px;font:20px Arial,sans-serif}dt,th{font-weight:700}dd,td{padding-left:16px}</style>
      <dl><dt id="name-label">表示名</dt><dd id="name-value">佐藤花子</dd></dl>
      <dl><dt id="nested-name-label"><span>表示名</span></dt><dd id="nested-name-value">佐藤花子</dd></dl>
      <table><tbody><tr><th id="address-label">項目</th><td id="address-value">東京都千代田区1-2-3</td></tr></tbody></table>
      <table><tbody><tr><th id="nested-address-label"><span>項目</span></th><td id="nested-address-value">東京都千代田区1-2-3</td></tr></tbody></table>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    const baseUrl = `http://127.0.0.1:${server.address().port}/`;
    await page.goto(baseUrl);
    const tabId = await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    for (const mutation of ["direct-character", "nested-character", "direct-child-list", "nested-child-list"]) {
      await page.goto(baseUrl);
      const mask = await inject(installSensitiveMasks);
      assert.equal(mask.applied, true);
      assert.equal(mask.privacyMaskedCount, 0);
      assert.equal(await inject(verifySensitiveMasks, [mask.token]), true);
      await page.evaluate((kind) => {
        const replaceText = (element, value) => element.replaceChildren(document.createTextNode(value));
        if (kind === "direct-character") {
          const node = document.getElementById("name-label").firstChild;
          node.nodeValue = "name";
          node.nodeValue = "display";
        } else if (kind === "nested-character") {
          const node = document.querySelector("#nested-name-label span").firstChild;
          node.nodeValue = "name";
          node.nodeValue = "display";
        } else if (kind === "direct-child-list") {
          const label = document.getElementById("address-label");
          replaceText(label, "address");
          replaceText(label, "item");
        } else {
          const label = document.querySelector("#nested-address-label span");
          replaceText(label, "address");
          replaceText(label, "item");
        }
      }, mutation);
      await page.evaluate(() => new Promise((resolve) => queueMicrotask(resolve)));
      let captureCalls = 0;
      await assert.rejects(() => captureWithMaskBoundary({
        applyMasks: () => inject(installSensitiveMasks),
        waitForPaint: () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))),
        capture: async () => { captureCalls += 1; return "data:image/png;base64,AA"; },
        verifyMasks: (token) => inject(verifySensitiveMasks, [token]),
        removeMasks: () => inject(removeSensitiveMasks)
      }), /SCREENSHOT_MASK_INVALIDATED/, `${mutation} semantic PII must invalidate the capture`);
      assert.equal(captureCalls, 0, `${mutation} semantic PII must be rejected before the capture callback`);
    }
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("partially visible top-layer dialog fails closed when it covers the overlay paint", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<!doctype html><style>
      html,body{margin:0;width:100vw;height:100vh;overflow:hidden}
      dialog{position:fixed!important;left:calc(100vw - 20px);top:40px;margin:0;width:260px;height:80px;padding:10px;font:20px Arial,sans-serif}
    </style><dialog id="partial-dialog"><p id="dialog-email">visible@example.com</p></dialog><script>document.getElementById("partial-dialog").showModal()</script>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const tabId = await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    const mask = await inject(installSensitiveMasks);
    assert.equal(mask.applied, true);
    assert.equal(mask.privacyMaskedCount, 1);
    const paintEvidence = await page.locator("#dialog-email").evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const viewportWidth = innerWidth;
      const x = (Math.max(0, rect.left) + Math.min(viewportWidth, rect.right)) / 2;
      const top = document.elementFromPoint(x, rect.top + rect.height / 2);
      return { partiallyVisible: rect.left < viewportWidth && rect.right > viewportWidth, topLayerHit: top?.closest("dialog")?.id === "partial-dialog" };
    });
    assert.equal(paintEvidence.partiallyVisible, true);
    assert.equal(paintEvidence.topLayerHit, true, "the real painted top-layer dialog must cover the overlay hit-test point");
    let captureCalls = 0;
    await assert.rejects(() => captureWithMaskBoundary({
      applyMasks: () => inject(installSensitiveMasks),
      waitForPaint: () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))),
      capture: async () => { captureCalls += 1; return "data:image/png;base64,AA"; },
      verifyMasks: (token) => inject(verifySensitiveMasks, [token]),
      removeMasks: () => inject(removeSensitiveMasks)
    }), /SCREENSHOT_MASK_INVALIDATED/);
    assert.equal(captureCalls, 0, "a null or non-overlay hit at the visible viewport intersection must fail closed before capture");
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("class-only mutations over many PII-free nodes remain valid", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    const children = Array.from({ length: 70 }, (_, index) => `<span data-index="${index}">status-${index}</span>`).join("");
    response.end(`<!doctype html><style>body{margin:0;padding:24px;font:16px Arial,sans-serif}</style><section id="dashboard">${children}</section>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const tabId = await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    const mask = await inject(installSensitiveMasks);
    assert.equal(mask.applied, true);
    assert.equal(mask.privacyMaskedCount, 0);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), true);
    await page.evaluate(() => document.getElementById("dashboard").classList.add("refreshed"));
    await page.evaluate(() => new Promise((resolve) => queueMicrotask(resolve)));
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), true);
    await page.evaluate(() => {
      const transient = document.createElement("span");
      transient.textContent = "transient@example.com";
      document.body.append(transient);
      transient.remove();
    });
    await page.evaluate(() => new Promise((resolve) => queueMicrotask(resolve)));
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false, "transient PII must fail closed");
    await inject(removeSensitiveMasks);
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("composed visibility traversal fails closed after 4096 inspected nodes", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end("<!doctype html><main id=dashboard></main>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${baseUrl}/`);
    const tabId = await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    for (const [nested, target, expected] of [[false, 4096, true], [false, 4097, false], [true, 4096, true], [true, 4097, false]]) {
      await page.goto(`${baseUrl}/`);
      const actual = await page.evaluate(({ nested: useNested, target: targetCount }) => {
        const countNodes = () => {
          let count = 0;
          const stack = [document];
          while (stack.length) {
            const current = stack.pop();
            count += 1;
            for (const child of current.childNodes || []) stack.push(child);
            if (current.nodeType === 1 && current.shadowRoot) stack.push(current.shadowRoot);
          }
          return count;
        };
        let parent = document.getElementById("dashboard");
        if (useNested) {
          const host = document.createElement("budget-host");
          parent.append(host);
          parent = host.attachShadow({ mode: "open" });
        }
        let remaining = targetCount - countNodes();
        if (useNested) {
          const nestedDepth = Math.min(256, remaining);
          for (let index = 0; index < nestedDepth; index += 1) {
            const node = document.createElement("div");
            parent.append(node);
            parent = node;
          }
          remaining -= nestedDepth;
        }
        while (remaining-- > 0) parent.append(document.createElement("span"));
        return countNodes();
      }, { nested, target });
      assert.equal(actual, target, `${nested ? "nested" : "flat"} fixture must contain the exact visited-node budget`);
      const bounded = await inject(installSensitiveMasks);
      assert.equal(bounded.applied, true);
      assert.equal(bounded.privacyMaskedCount, 0);
      assert.equal(await inject(verifySensitiveMasks, [bounded.token]), expected, `${nested ? "nested" : "flat"} ${target}th inspected node must ${expected ? "remain valid" : "fail closed"}`);
      await inject(removeSensitiveMasks);
    }
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("PII overlay ownership, arbitrary attributes, and candidate scan budgets stay fail closed", async () => {
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/boundary") {
      response.end(`<!doctype html><style>
        body{margin:0;font:16px Arial,sans-serif}
        .meccha-manual-pii-overlay{color:transparent!important}
        [data-state="open"]{display:block}
      </style><div id="fake-ancestor" class="meccha-manual-pii-overlay"><span id="fake-inherited">ancestor@example.com</span></div><span id="fake-direct" class="meccha-manual-pii-overlay">direct@example.com</span><span id="real">real@example.com</span><section><div>name</div><dd id="bad-semantic">Jane Doe</dd></section>`);
      return;
    }
    if (url.pathname === "/clean") {
      response.end("<!doctype html><style>[data-state=open]{display:block}</style><div id=clean>時計だけ</div>");
      return;
    }
    if (url.pathname === "/attribute") {
      response.end("<!doctype html><style>[data-state=closed]{display:none}[data-state=open]{display:block}</style><div id=hidden data-state=closed><span>hidden@example.com</span></div>");
      return;
    }
    if (url.pathname === "/budget") {
      response.end("<!doctype html><main id=dashboard></main>");
      return;
    }
    if (url.pathname === "/nested-budget") {
      response.end("<!doctype html><main id=dashboard></main>");
      return;
    }
    response.end("<!doctype html><p>unknown</p>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${baseUrl}/boundary`);
    const tabId = await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    const mask = await inject(installSensitiveMasks);
    assert.equal(mask.applied, true);
    assert.equal(mask.privacyMaskedCount, 3, "class-matching page elements are still candidates");
    assert.equal(await page.locator("#bad-semantic").evaluate((node) => node.classList.contains("meccha-manual-pii-overlay")), false, "semantic masking requires an adjacent dt/dd or th/td pair");
    await inject(() => {
      const state = globalThis.__mecchaManualScreenshotMasks;
      for (const item of state?.privacyOverlays || []) item.overlay.setAttribute("data-state", "extension-owned");
    });
    await page.evaluate(() => new Promise((resolve) => queueMicrotask(resolve)));
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), true, "owned overlay mutations are ignored by identity");
    await page.evaluate(() => document.getElementById("fake-ancestor").setAttribute("data-state", "open"));
    await page.evaluate(() => new Promise((resolve) => queueMicrotask(resolve)));
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false, "arbitrary candidate attributes fail closed");
    await inject(removeSensitiveMasks);

    await page.goto(`${baseUrl}/attribute`);
    const transient = await inject(installSensitiveMasks);
    assert.equal(transient.applied, true);
    assert.equal(transient.privacyMaskedCount, 0);
    await page.evaluate(() => {
      const node = document.getElementById("hidden");
      node.setAttribute("data-state", "open");
      node.setAttribute("open", "");
      node.setAttribute("aria-hidden", "false");
      node.setAttribute("data-custom-reveal", "1");
    });
    await page.evaluate(() => new Promise((resolve) => queueMicrotask(resolve)));
    assert.equal(await inject(verifySensitiveMasks, [transient.token]), false, "arbitrary reveal attributes fail closed for transient PII");
    await inject(removeSensitiveMasks);

    await page.goto(`${baseUrl}/clean`);
    const clean = await inject(installSensitiveMasks);
    assert.equal(clean.applied, true);
    assert.equal(clean.privacyMaskedCount, 0);
    await page.evaluate(() => {
      const node = document.getElementById("clean");
      node.setAttribute("data-state", "open");
      node.setAttribute("open", "");
      node.setAttribute("aria-expanded", "true");
      node.setAttribute("data-custom-reveal", "1");
    });
    await page.evaluate(() => new Promise((resolve) => queueMicrotask(resolve)));
    assert.equal(await inject(verifySensitiveMasks, [clean.token]), true, "unrelated arbitrary attributes remain valid");
    await inject(removeSensitiveMasks);

    for (const [path, target, expected] of [["budget", 4096, true], ["budget", 4097, false], ["nested-budget", 4096, true], ["nested-budget", 4097, false]]) {
      await page.goto(`${baseUrl}/${path}`);
      const actual = await page.evaluate(({ nested, target: targetCount }) => {
        const countNodes = () => {
          let count = 0;
          const stack = [document];
          while (stack.length) {
            const current = stack.pop();
            count += 1;
            for (const child of current.childNodes || []) stack.push(child);
            if (current.nodeType === 1 && current.shadowRoot) stack.push(current.shadowRoot);
          }
          return count;
        };
        let parent = document.getElementById("dashboard");
        if (nested) {
          const host = document.createElement("aggregate-host");
          parent.append(host);
          const outer = host.attachShadow({ mode: "open" });
          const nestedHost = document.createElement("nested-host");
          outer.append(nestedHost);
          parent = nestedHost.attachShadow({ mode: "open" });
        }
        let remaining = targetCount - countNodes();
        if (nested) {
          const nestedDepth = Math.min(256, remaining);
          for (let index = 0; index < nestedDepth; index += 1) {
            const node = document.createElement("div");
            parent.append(node);
            parent = node;
          }
          remaining -= nestedDepth;
        }
        while (remaining-- > 0) parent.append(document.createElement("span"));
        return countNodes();
      }, { nested: path === "nested-budget", target });
      assert.equal(actual, target, `${path} fixture must contain the exact visited-node budget`);
      const bounded = await inject(installSensitiveMasks);
      assert.equal(bounded.applied, true);
      assert.equal(await inject(verifySensitiveMasks, [bounded.token]), expected, `${path} target=${target} must use one aggregate traversal budget`);
      await inject(removeSensitiveMasks);
    }
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
