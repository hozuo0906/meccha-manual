import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "@playwright/test";
import { installSensitiveMasks, removeSensitiveMasks, verifySensitiveMasks } from "../apps/extension/capture/screenshot.js";

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
      .meccha-manual-pii-overlay { background: linear-gradient(red, blue); background-clip: text; -webkit-background-clip: text; border-radius: 40px; box-shadow: 0 0 20px red; }
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
      return { backgroundClip: computed.backgroundClip, borderRadius: computed.borderRadius, backgroundImage: computed.backgroundImage, boxShadow: computed.boxShadow };
    });
    assert.equal(style.backgroundClip, "border-box");
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
    });
    await page.evaluate(() => new Promise((resolve) => queueMicrotask(resolve)));
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false);
    await inject(removeSensitiveMasks);
    assert.equal(await page.locator("open-pii-host").evaluate((host) => host.shadowRoot.textContent), "late@example.com");
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
