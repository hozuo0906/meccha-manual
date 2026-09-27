import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "@playwright/test";

const extensionRoot = resolve(fileURLToPath(new URL("../apps/extension/", import.meta.url)));

test("real MV3 action opens sidepanel and records separate step images", { timeout: 60_000 }, async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end("<!doctype html><meta charset='utf-8'><title>合成記録ページ</title><button id='do'>操作</button><p id='result'>0</p><script>document.querySelector('#do').addEventListener('click',()=>document.querySelector('#result').textContent=String(Number(document.querySelector('#result').textContent)+1));</script>");
  });
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const baseUrl = `http://127.0.0.1:${server.address().port}/`;
  const userDataDir = await mkdtemp(join(tmpdir(), "meccha-manual-sidepanel-runtime-"));
  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: ["--enable-unsafe-extension-debugging", `--disable-extensions-except=${extensionRoot}`, `--load-extension=${extensionRoot}`]
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 15_000 });
    const extensionId = new URL(worker.url()).hostname;
    const target = await context.newPage();
    await target.goto(baseUrl);
    const browserCdp = await context.browser().newBrowserCDPSession();
    const targets = await browserCdp.send("Target.getTargets", { filter: [{ type: "tab", exclude: false }] });
    const targetInfo = targets.targetInfos.find((info) => info.url === baseUrl);
    assert.ok(targetInfo, "synthetic tab target should be discoverable");
    const panelPromise = context.waitForEvent("page", {
      predicate: (page) => page.url().startsWith(`chrome-extension://${extensionId}/sidepanel/`),
      timeout: 5_000
    }).catch(() => null);
    try {
      await browserCdp.send("Extensions.triggerAction", { id: extensionId, targetId: targetInfo.targetId });
    } catch (error) {
      throw error;
    }
    const panel = await panelPromise || await context.newPage();
    if (!panel.url().startsWith(`chrome-extension://${extensionId}/sidepanel/`)) {
      await panel.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`);
    }
    await panel.locator("#start").waitFor();
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id);
    assert.ok(tabId, "synthetic target tab should be discoverable");
    const send = (message) => panel.evaluate((payload) => new Promise((resolve) => chrome.runtime.sendMessage(payload, resolve)), message);
    const started = await send({ type: "capture:start", tabId, mode: "pc" });
    assert.equal(started.ok, true);
    await target.bringToFront();
    await target.locator("#do").click();
    await target.locator("#do").click();
    await panel.locator(".step-card:nth-child(2)").waitFor({ timeout: 15_000 });
    const liveImages = panel.locator(".step-card img");
    assert.equal(await liveImages.count(), 2, "two captured events should have two image cards");
    assert.ok(await liveImages.nth(0).evaluate((image) => image.complete && image.naturalWidth > 0));
    assert.ok(await liveImages.nth(1).evaluate((image) => image.complete && image.naturalWidth > 0));
    assert.notEqual(await liveImages.nth(0).getAttribute("src"), await liveImages.nth(1).getAttribute("src"), "each operation should retain its own screenshot");
    await target.bringToFront();
    const finished = await send({ type: "capture:finish" });
    assert.equal(finished.ok, true);
    await panel.locator(".draft-card").waitFor({ timeout: 15_000 });
    assert.ok(await panel.locator(".draft-card img").count(), "saved draft should retain its step image");
    const screenshotPath = process.env.MECCHA_SIDEPANEL_SCREENSHOT || join(userDataDir, "sidepanel.png");
    await panel.screenshot({ path: screenshotPath, fullPage: true });
  } finally {
    await context?.close();
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => undefined);
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});
