import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "@playwright/test";
import { installSensitiveMasks, verifySensitiveMasks, removeSensitiveMasks } from "../apps/extension/capture/screenshot.js";

test("real Chrome masks closed-shadow top-layer controls and canvas, then restores layout", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.goto("about:blank");
    await page.setContent("<private-editor></private-editor><canvas width='200' height='40'></canvas>");
    await page.evaluate(() => {
      const host = document.querySelector("private-editor");
      host.style.display = "block";
      const root = host.attachShadow({ mode: "closed" });
      const dialog = document.createElement("dialog");
      dialog.style.visibility = "visible";
      dialog.innerHTML = '<input value="SYNTHETIC-SECRET" style="visibility:visible">';
      root.append(dialog);
      dialog.showModal();
      globalThis.testDialog = dialog;
      const canvas = document.querySelector("canvas");
      canvas.getContext("2d").fillText("SYNTHETIC-CANVAS-SECRET", 2, 20);
    });
    assert.ok(await page.evaluate(() => testDialog.getClientRects().length > 0));
    const mask = await page.evaluate(installSensitiveMasks);
    assert.equal(mask.applied, true);
    assert.equal(await page.evaluate(verifySensitiveMasks, mask.token), true);
    assert.equal(await page.evaluate(() => testDialog.getClientRects().length), 0);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("canvas")).opacity), "0");
    await page.evaluate(removeSensitiveMasks);
    assert.ok(await page.evaluate(() => testDialog.getClientRects().length > 0));
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("canvas")).opacity), "1");
  } finally { await browser.close(); }
});
