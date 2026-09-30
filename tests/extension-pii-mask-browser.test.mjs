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
