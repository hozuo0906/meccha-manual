import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "@playwright/test";
import { installSensitiveMasks, verifySensitiveMasks, removeSensitiveMasks } from "../apps/extension/capture/screenshot.js";

test("real extension API masks standard/custom closed-shadow top-layer controls and canvas", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end("<!doctype html><div id='host'></div><private-editor></private-editor><canvas width='200' height='40'></canvas>");
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
    await page.evaluate(() => {
      globalThis.testDialogs = [];
      for (const host of [document.querySelector("#host"), document.querySelector("private-editor")]) {
        host.style.display = "block";
        const root = host.attachShadow({ mode: "closed" });
        const dialog = document.createElement("dialog");
        dialog.style.visibility = "visible";
        dialog.innerHTML = '<input value="SYNTHETIC-SECRET" style="visibility:visible">';
        root.append(dialog);
        dialog.showModal();
        testDialogs.push(dialog);
      }
      document.querySelector("canvas").getContext("2d").fillText("SYNTHETIC-CANVAS-SECRET", 2, 20);
    });
    const tabId = await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    assert.ok(await page.evaluate(() => testDialogs.every((dialog) => dialog.getClientRects().length > 0)));
    const mask = await inject(installSensitiveMasks);
    assert.equal(mask.applied, true);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), true);
    assert.ok(await page.evaluate(() => testDialogs.every((dialog) => dialog.getClientRects().length === 0)));
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("canvas")).opacity), "0");
    await inject(removeSensitiveMasks);
    assert.ok(await page.evaluate(() => testDialogs.every((dialog) => dialog.getClientRects().length > 0)));
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("canvas")).opacity), "1");
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
