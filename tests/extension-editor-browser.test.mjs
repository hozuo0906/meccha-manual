import assert from "node:assert/strict";
import { stat, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve, sep } from "node:path";
import test from "node:test";
import { chromium } from "@playwright/test";

const extensionRoot = resolve(fileURLToPath(new URL("../apps/extension/", import.meta.url)));

function serveExtension({ onboardingConfig = null } = {}) {
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url || "/", "http://127.0.0.1").pathname;
    if (pathname === "/seed.html") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end("<!doctype html><meta charset='utf-8'><title>seed</title>");
      return;
    }
    if (pathname === "/onboarding-config.js" && onboardingConfig) {
      response.setHeader("Content-Type", "text/javascript; charset=utf-8");
      response.end(onboardingConfig);
      return;
    }
    const relativePath = decodeURIComponent(pathname.replace(/^\/+/, ""));
    const filePath = resolve(extensionRoot, relativePath);
    if (filePath !== extensionRoot && !filePath.startsWith(`${extensionRoot}${sep}`)) {
      response.writeHead(404).end();
      return;
    }
    try {
      const info = await stat(filePath);
      if (!info.isFile()) throw new Error("not a file");
      const body = await readFile(filePath);
      const contentType = filePath.endsWith(".html")
        ? "text/html; charset=utf-8"
        : filePath.endsWith(".js")
          ? "text/javascript; charset=utf-8"
          : filePath.endsWith(".css")
            ? "text/css; charset=utf-8"
            : "application/octet-stream";
      response.setHeader("Content-Type", contentType);
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  return server;
}

async function seedImageEditorDraft(page, baseUrl, id) {
  await page.goto(baseUrl + "/seed.html");
  await page.evaluate(async (draftId) => {
    const screenshots = [];
    const steps = [];
    for (let index = 1; index <= 22; index += 1) {
      const imageCanvas = document.createElement("canvas");
      imageCanvas.width = 960;
      imageCanvas.height = 540;
      const context = imageCanvas.getContext("2d");
      context.fillStyle = index % 2 ? "#eef8fa" : "#eff8f1";
      context.fillRect(0, 0, imageCanvas.width, imageCanvas.height);
      context.fillStyle = "#173d46";
      context.font = "bold 30px system-ui";
      context.fillText("画像編集テスト " + index, 70, 90);
      context.font = "18px system-ui";
      context.fillText("手順画像の位置と保存値を確認します", 70, 130);
      const dataUrl = index % 2 ? imageCanvas.toDataURL("image/jpeg", 0.75) : imageCanvas.toDataURL("image/png");
      screenshots.push({ id: "image-" + index, dataUrl, masks: [{ id: "original-mask-" + index, x: .72, y: .12, width: .1, height: .08 }] });
      steps.push({ id: "step-" + index, order: index, instruction: "手順 " + index, screenshotId: "image-" + index });
    }
    const { draftStore } = await import("/storage/draft-store.js");
    await draftStore.put({
      id: draftId,
      title: "画像編集の回帰確認",
      description: "JPEGとPNGの手順画像",
      steps,
      screenshots
    });
  }, id);
  await page.goto(baseUrl + "/editor/editor.html#" + id);
}

function canvasPoint(box, x, y) {
  return { x: box.x + box.width * x, y: box.y + box.height * y };
}

async function dragCanvas(page, canvas, fromX, fromY, toX, toY) {
  const box = await canvas.boundingBox();
  assert.ok(box);
  const start = canvasPoint(box, fromX, fromY);
  const end = canvasPoint(box, toX, toY);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
}

async function openImageEditor(page, stepId = "step-1") {
  await page.locator("#step-" + stepId + " .image-edit-button").click();
  await page.locator("#imageEditorDialog").waitFor({ state: "visible" });
}

async function readScreenshot(page, draftId, screenshotId = "image-1") {
  return page.evaluate(async ({ draftId: currentDraftId, screenshotId: currentScreenshotId }) => {
    const { draftStore } = await import("/storage/draft-store.js");
    return (await draftStore.get(currentDraftId)).screenshots.find((item) => item.id === currentScreenshotId);
  }, { draftId, screenshotId });
}

test("editor navigation and image edits persist exact annotation and mask coordinates", { timeout: 45_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const baseUrl = "http://127.0.0.1:" + server.address().port;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  const draftId = "editor-image-workspace-regression";
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true, viewport: { width: 1366, height: 768 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(4_000);
    await seedImageEditorDraft(page, baseUrl, draftId);

    await page.locator('#steps button[aria-controls="step-step-17"]').click();
    await page.waitForFunction(() => {
      const article = document.querySelector("#step-step-17");
      return article && article.getBoundingClientRect().top >= 0 && article.getBoundingClientRect().top < innerHeight;
    });
    const step17Box = await page.locator("#step-step-17").boundingBox();
    const step18Box = await page.locator("#step-step-18").boundingBox();
    assert.ok(step17Box && step18Box && step18Box.y > step17Box.y, "目次17番は説明と画像を画面内へ移動する");
    await page.locator("#step-step-17 textarea").fill("手順17の説明を保持");
    assert.equal(await page.locator("#step-step-17 textarea").inputValue(), "手順17の説明を保持");
    await page.locator('#steps button[aria-controls="step-step-1"]').click();
    await page.locator("#step-step-1").scrollIntoViewIfNeeded();
    assert.equal(await page.locator(".step-article").count(), 22);

    await openImageEditor(page);
    const canvas = page.locator("#imageEditorCanvas");
    await page.locator('[data-editor-tool="text"]').click();
    await dragCanvas(page, canvas, .05, .05, .05, .05);
    await page.locator("[data-editor-text]").fill("保存する文字");
    await page.locator("[data-editor-font-size]").fill("32");
    await page.locator("[data-editor-font-size]").press("Enter");
    assert.equal(await page.locator("#imageEditorDialog").isVisible(), true, "文字サイズ入力中のEnterでdialogを閉じない");

    await page.locator('[data-editor-tool="rectangle"]').click();
    await dragCanvas(page, canvas, .1, .35, .3, .5);
    await page.locator('[data-editor-tool="ellipse"]').click();
    await dragCanvas(page, canvas, .45, .35, .65, .5);
    await page.locator('[data-editor-tool="arrow"]').click();
    await dragCanvas(page, canvas, .4, .8, .15, .65);
    await page.locator('[data-editor-tool="mask"]').click();
    await dragCanvas(page, canvas, .35, .15, .5, .25);
    assert.equal(await page.locator("[data-editor-selection] > div").count(), 6);
    await page.locator("[data-editor-save]").click();
    await page.locator("#imageEditorDialog").waitFor({ state: "hidden" });

    const firstSaved = await readScreenshot(page, draftId);
    assert.deepEqual(firstSaved.annotations.map((item) => item.type).sort(), ["arrow", "ellipse", "rectangle", "text"]);
    const firstText = firstSaved.annotations.find((item) => item.type === "text");
    assert.equal(firstText.text, "保存する文字");
    assert.equal(firstText.fontSize, 32);
    const firstArrow = firstSaved.annotations.find((item) => item.type === "arrow");
    assert.ok(firstArrow.x1 > firstArrow.x2, "逆向き矢印の向きを保存する");
    assert.equal(firstSaved.masks.length, 2);
    assert.deepEqual(firstSaved.masks.find((item) => item.id === "original-mask-1"), { id: "original-mask-1", x: .72, y: .12, width: .1, height: .08 }, "既存maskを元の座標で保持する");

    await openImageEditor(page);
    const selectRow = async (index) => {
      const row = page.locator("[data-editor-selection] > div").nth(index);
      await row.scrollIntoViewIfNeeded();
      await row.locator("button").first().click();
    };
    const beforeTransforms = structuredClone(await readScreenshot(page, draftId));
    await page.locator('[data-editor-tool="select"]').click();
    await selectRow(1);
    await dragCanvas(page, canvas, .2, .42, .25, .47);
    await selectRow(2);
    const ellipseBefore = beforeTransforms.annotations.find((item) => item.type === "ellipse");
    await dragCanvas(page, canvas, ellipseBefore.x + ellipseBefore.width - .01, ellipseBefore.y + ellipseBefore.height - .01, ellipseBefore.x + ellipseBefore.width + .1, ellipseBefore.y + ellipseBefore.height + .1);
    await selectRow(3);
    const arrowBefore = beforeTransforms.annotations.find((item) => item.type === "arrow");
    const arrowBounds = { x: Math.min(arrowBefore.x1, arrowBefore.x2), y: Math.min(arrowBefore.y1, arrowBefore.y2), width: Math.abs(arrowBefore.x2 - arrowBefore.x1), height: Math.abs(arrowBefore.y2 - arrowBefore.y1) };
    await dragCanvas(page, canvas, arrowBounds.x + arrowBounds.width - .01, arrowBounds.y + arrowBounds.height - .01, arrowBounds.x + arrowBounds.width + .1, arrowBounds.y + arrowBounds.height + .1);
    await selectRow(4);
    const maskBefore = beforeTransforms.masks.find((item) => item.id !== "original-mask-1");
    await dragCanvas(page, canvas, maskBefore.x + maskBefore.width / 2, maskBefore.y + maskBefore.height / 2, maskBefore.x + maskBefore.width / 2 + .06, maskBefore.y + maskBefore.height / 2 + .06);
    await page.locator("[data-editor-save]").click();
    await page.locator("#imageEditorDialog").waitFor({ state: "hidden" });

    const moved = await readScreenshot(page, draftId);
    const newMaskAfterMove = moved.masks.find((item) => item.id !== "original-mask-1");
    assert.ok(newMaskAfterMove.x !== maskBefore.x || newMaskAfterMove.y !== maskBefore.y, "new mask move must change coordinates before deletion");
    await openImageEditor(page);
    await selectRow(5);
    const maskBeforeResize = moved.masks.find((item) => item.id !== "original-mask-1");
    await dragCanvas(page, canvas, maskBeforeResize.x + maskBeforeResize.width - .01, maskBeforeResize.y + maskBeforeResize.height - .01, maskBeforeResize.x + maskBeforeResize.width + .05, maskBeforeResize.y + maskBeforeResize.height + .05);
    await page.locator("[data-editor-save]").click();
    await page.locator("#imageEditorDialog").waitFor({ state: "hidden" });
    const resized = await readScreenshot(page, draftId);
    const newMaskAfterResize = resized.masks.find((item) => item.id !== "original-mask-1");
    assert.ok(newMaskAfterResize.width > maskBeforeResize.width && newMaskAfterResize.height > maskBeforeResize.height, "new mask resize must persist width and height");
    await openImageEditor(page);
    await page.locator("[data-editor-selection] > div").nth(4).locator("[data-editor-delete]").click();
    await page.locator("[data-editor-save]").click();
    await page.locator("#imageEditorDialog").waitFor({ state: "hidden" });

    const transformed = await readScreenshot(page, draftId);
    const beforeRectangle = beforeTransforms.annotations.find((item) => item.type === "rectangle");
    const afterRectangle = transformed.annotations.find((item) => item.type === "rectangle");
    assert.ok(afterRectangle.x !== beforeRectangle.x || afterRectangle.y !== beforeRectangle.y, "四角の移動座標を保存する");
    const beforeEllipse = beforeTransforms.annotations.find((item) => item.type === "ellipse");
    const afterEllipse = transformed.annotations.find((item) => item.type === "ellipse");
    assert.ok(afterEllipse.width > beforeEllipse.width && afterEllipse.height > beforeEllipse.height, "丸のresize寸法を保存する");
    const afterArrow = transformed.annotations.find((item) => item.type === "arrow");
    assert.ok(afterArrow.x1 > afterArrow.x2 && afterArrow.x1 !== arrowBefore.x1 && afterArrow.x2 === arrowBefore.x2, "逆向き矢印のresizeで向きを維持する");
    assert.equal(transformed.masks.length, 1, "既存mask削除を保存する");

    await page.reload();
    await openImageEditor(page);
    assert.equal(await page.locator("[data-editor-selection] > div").count(), 5, "保存後reloadでも注釈を再編集できる");
    await page.locator("[data-editor-cancel]").first().click();
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

test("image editor cancel, empty text, and save retry preserve draft values", { timeout: 30_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const baseUrl = "http://127.0.0.1:" + server.address().port;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  const draftId = "editor-image-cancel-retry";
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    page.setDefaultTimeout(4_000);
    await seedImageEditorDraft(page, baseUrl, draftId);
    await openImageEditor(page);
    await page.locator('[data-editor-tool="text"]').click();
    await dragCanvas(page, page.locator("#imageEditorCanvas"), .08, .08, .08, .08);
    const textField = page.locator("[data-editor-text]");
    await textField.fill("");
    await textField.fill("再入力した文字");
    await page.locator("[data-editor-font-size]").fill("32");
    const baseline = await readScreenshot(page, draftId);
    await page.keyboard.press("Escape");
    await page.locator("#imageEditorDialog").waitFor({ state: "hidden" });
    assert.deepEqual(await readScreenshot(page, draftId), baseline, "cancel/EscでIDBを変更しない");

    await openImageEditor(page);
    const originalPut = await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      globalThis.__originalPut = draftStore.put;
      draftStore.put = async () => { throw new Error("synthetic failure"); };
      return true;
    });
    assert.equal(originalPut, true);
    await page.locator("[data-editor-tool=\"text\"]").click();
    await dragCanvas(page, page.locator("#imageEditorCanvas"), .12, .12, .12, .12);
    await page.locator("[data-editor-text]").fill("保存再試行");
    await page.locator("[data-editor-font-size]").fill("10");
    await page.locator("[data-editor-save]").click();
    await page.getByText("保存できませんでした。編集内容を保持したまま、もう一度保存してください。", { exact: true }).waitFor();
    assert.equal(await page.locator("[data-editor-text]").inputValue(), "保存再試行");
    assert.equal(await page.locator("[data-editor-font-size]").inputValue(), "10");
    await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      draftStore.put = globalThis.__originalPut;
    });
    await page.locator("[data-editor-save]").click();
    await page.locator("#imageEditorDialog").waitFor({ state: "hidden" });
    const retried = await readScreenshot(page, draftId);
    assert.equal(retried.annotations.find((item) => item.type === "text")?.text, "保存再試行");
    assert.equal(retried.annotations.find((item) => item.type === "text")?.fontSize, 10);

    await openImageEditor(page);
    const savingRow = page.locator("[data-editor-selection] > div").first();
    await savingRow.scrollIntoViewIfNeeded();
    const savingButton = savingRow.locator("button").first();
    await savingButton.focus();
    await savingButton.press("Enter");
    await page.locator("[data-editor-text]").fill("保存中も保持");
    await page.locator("[data-editor-font-size]").fill("32");
    await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      globalThis.__pendingPut = null;
      globalThis.__putCalls = 0;
      draftStore.put = async (candidate) => {
        globalThis.__putCalls += 1;
        return new Promise((resolve) => { globalThis.__pendingPut = { candidate, resolve }; });
      };
    });
    await page.locator("[data-editor-save]").click();
    await page.waitForFunction(() => globalThis.__pendingPut !== null && globalThis.__putCalls === 1);
    const editorControls = page.locator("[data-editor-tool], [data-editor-text], [data-editor-font-size], [data-editor-selection] button, [data-editor-save]");
    assert.ok(await editorControls.evaluateAll((elements) => elements.every((element) => element.disabled)), "保存中は編集入力・一覧・保存をdisabledにする");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#imageEditorDialog").isVisible(), true, "保存中のEscapeでdialogを閉じない");
    await page.evaluate(async () => {
      const pending = globalThis.__pendingPut;
      await globalThis.__originalPut(pending.candidate);
      pending.resolve();
    });
    await page.locator("#imageEditorDialog").waitFor({ state: "hidden" });
    await page.reload();
    await openImageEditor(page);
    const reloadedRow = page.locator("[data-editor-selection] > div").first();
    await reloadedRow.scrollIntoViewIfNeeded();
    const reloadedButton = reloadedRow.locator("button").first();
    await reloadedButton.focus();
    await reloadedButton.press("Enter");
    assert.equal(await page.locator("[data-editor-text]").inputValue(), "保存中も保持");
    assert.equal(await page.locator("[data-editor-font-size]").inputValue(), "32");
    await page.locator("[data-editor-cancel]").first().click();
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

test("image editor cancels stale decode generation", { timeout: 20_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const baseUrl = "http://127.0.0.1:" + server.address().port;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  const draftId = "editor-image-late-decode";
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    page.setDefaultTimeout(4_000);
    await seedImageEditorDraft(page, baseUrl, draftId);
    await page.evaluate(() => {
      globalThis.__decodeQueue = [];
      globalThis.__originalDecode = Image.prototype.decode;
      Image.prototype.decode = () => new Promise((resolve, reject) => globalThis.__decodeQueue.push({ resolve, reject }));
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      for (const pending of globalThis.__decodeQueue) pending.reject(new Error("discard preview decode"));
      globalThis.__decodeQueue = [];
    });
    await page.evaluate(() => { globalThis.__firstDecodeStart = globalThis.__decodeQueue.length; });
    await openImageEditor(page);
    await page.waitForFunction(() => globalThis.__decodeQueue.length > globalThis.__firstDecodeStart);
    await page.evaluate(() => { globalThis.__firstEditorDecode = globalThis.__decodeQueue.length - 1; });
    await page.locator("[data-editor-cancel]").first().click();
    await page.locator("#imageEditorDialog").waitFor({ state: "hidden" });
    await page.evaluate(() => { globalThis.__secondDecodeStart = globalThis.__decodeQueue.length; });
    await openImageEditor(page);
    await page.waitForFunction(() => globalThis.__decodeQueue.length > globalThis.__secondDecodeStart);
    await page.evaluate(() => { globalThis.__secondEditorDecode = globalThis.__decodeQueue.length - 1; globalThis.__decodeQueue[globalThis.__firstEditorDecode].reject(new Error("stale decode")); });
    assert.equal(await page.locator("#imageEditorDialog").isVisible(), true);
    await page.evaluate(() => globalThis.__decodeQueue[globalThis.__secondEditorDecode].resolve());
    await page.waitForFunction(() => document.querySelector("[data-editor-save]")?.disabled === false);
    await page.locator("[data-editor-cancel]").first().click();
    await page.evaluate(() => { Image.prototype.decode = globalThis.__originalDecode; });
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

test("output gate cancel preserves edits, save failure blocks handoff, and pending config stays local", { timeout: 20_000 }, async () => {
  const server = serveExtension({ onboardingConfig: 'export const STAGING_ONBOARDING_ORIGIN = "https://meccha-manual-staging.meccha-iiyatsu.com"; export function getOnboardingOrigin() { return null; }' });
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    await page.addInitScript(() => {
      globalThis.__handoffStorageWrites = 0;
      globalThis.chrome = { runtime: { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }, storage: { local: { set: async () => { globalThis.__handoffStorageWrites += 1; }, get: async () => ({}), remove: async () => undefined } } };
    });
    await page.goto(`${baseUrl}/seed.html`);
    await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      await draftStore.put({ id: "output-gate-fixture", title: "元のタイトル", description: "説明", steps: [], screenshots: [] });
    });
    await page.goto(`${baseUrl}/editor/editor.html#output-gate-fixture`);
    await page.locator("#title").fill("取消後も残るタイトル");
    await page.locator("#save").click();
    await page.locator("#outputGate").waitFor({ state: "visible" });
    await page.locator("#cancelOutput").click();
    assert.equal(await page.locator("#title").inputValue(), "取消後も残るタイトル");
    await page.reload();
    assert.equal(await page.locator("#title").inputValue(), "取消後も残るタイトル");

    await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      draftStore.put = async () => { throw new Error("storage unavailable"); };
    });
    await page.locator("#save").click();
    assert.equal(await page.locator("#outputGate").evaluate((element) => element.open), false);
    assert.match(await page.locator("#status").textContent(), /保存できませんでした/);

    await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      draftStore.put = async () => undefined;
    });
    await page.locator("#save").click();
    assert.equal(await page.locator("#startRegistration").isDisabled(), true);
    assert.match(await page.locator("#gateStatus").textContent(), /保存先を準備できません/);
    assert.equal(await page.locator("#outputGate").evaluate((element) => element.open), true);
    assert.equal(await page.evaluate(() => globalThis.__handoffStorageWrites), 0, "pending CTA must not persist unused handoffs");
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

test("sidepanel keeps restore-pending finish guidance when refresh succeeds or fails", { timeout: 15_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    await page.addInitScript(() => {
      globalThis.__refreshMode = "ok";
      globalThis.__statusPhase = "recording";
      globalThis.__restorePending = false;
      globalThis.__finishResult = { draftId: "restore-pending-sidepanel-fixture", restorePending: true, imageCount: 2, missingImageCount: 0 };
      globalThis.__finishError = false;
      globalThis.__tabsCreateCalls = [];
      globalThis.chrome = {
        runtime: {
          getURL: (path) => `chrome-extension://test/${path}`,
          sendMessage: async (message) => {
            if (message?.type === "capture:status") {
              if (globalThis.__refreshMode === "fail") throw new Error("STATUS_UNAVAILABLE");
              return { ok: true, value: { phase: globalThis.__statusPhase, restorePending: globalThis.__restorePending, events: [], stepImageRefs: [] } };
            }
            if (message?.type === "capture:finish") {
              if (globalThis.__finishError) return { ok: false, error: "FINISH_RESPONSE_LOST" };
              const result = globalThis.__finishResult;
              globalThis.__statusPhase = result.restorePending ? "finish_failed" : "idle";
              globalThis.__restorePending = Boolean(result.restorePending);
              return { ok: true, value: result };
            }
            return { ok: true, value: null };
          }
        },
        tabs: {
          create: async (details) => { globalThis.__tabsCreateCalls.push(details); return { id: globalThis.__tabsCreateCalls.length }; }
        }
      };
    });
    await page.goto(`${baseUrl}/sidepanel/sidepanel.html`);
    await page.locator("#finish").waitFor({ state: "visible" });

    await page.locator("#finish").click();
    await page.waitForFunction(() => /保存済み/.test(document.querySelector("#status")?.textContent || ""));
    assert.equal(await page.locator("#restore").evaluate((element) => element.hidden), false);
    assert.equal(await page.evaluate(() => globalThis.__tabsCreateCalls.length), 1, "finish success should open the editor once");

    await page.evaluate(() => { globalThis.__refreshMode = "fail"; });
    await page.locator("#finish").click();
    await page.waitForFunction(() => /保存済み/.test(document.querySelector("#status")?.textContent || ""));
    assert.equal(await page.locator("#restore").evaluate((element) => element.hidden), false, "restore remains available when status refresh fails");
    assert.equal(await page.evaluate(() => globalThis.__tabsCreateCalls.length), 2, "refresh failure must not turn a successful finish into a finish failure");

    await page.evaluate(() => {
      globalThis.__refreshMode = "ok";
      globalThis.__finishError = true;
      globalThis.__statusPhase = "idle";
      globalThis.__restorePending = false;
    });
    await page.locator("#finish").click();
    await page.waitForFunction(() => /記録終了の結果を確認できませんでした/.test(document.querySelector("#status")?.textContent || ""));
    assert.equal(await page.locator("#finish").evaluate((element) => element.hidden), true, "idle after a lost finish response must not offer an unverified retry");
    assert.doesNotMatch(await page.locator("#status").textContent(), /保存済み/);

    await page.evaluate(() => {
      globalThis.__refreshMode = "ok";
      globalThis.__finishError = false;
      globalThis.__finishResult = { draftId: "normal-sidepanel-fixture", restorePending: false, imageCount: 2, missingImageCount: 0 };
    });
    await page.locator("#finish").click();
    await page.waitForFunction(() => /画像付きの手順を保存しました/.test(document.querySelector("#status")?.textContent || ""));
    assert.equal(await page.locator("#restore").evaluate((element) => element.hidden), true, "normal finish should not show restore guidance");
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

test("sidepanel exposes a retryable cancel failure and returns to the empty state", { timeout: 15_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    await page.addInitScript(() => {
      globalThis.__phase = "cancel_failed";
      globalThis.__cancelCalls = 0;
      globalThis.chrome = {
        runtime: {
          getURL: (path) => `chrome-extension://test/${path}`,
          sendMessage: async (message) => {
            if (message?.type === "capture:status") {
              return {
                ok: true,
                value: {
                  phase: globalThis.__phase,
                  events: [],
                  stepImageRefs: [],
                  sessionId: null,
                  hasDrafts: false,
                  restorePending: false
                }
              };
            }
            if (message?.type === "capture:cancel") {
              globalThis.__cancelCalls += 1;
              globalThis.__phase = null;
              return { ok: true, value: { cancelled: true, restorePending: false } };
            }
            return { ok: true, value: null };
          }
        },
        tabs: {
          query: async () => [],
          create: async () => ({ id: 1 })
        }
      };
    });
    await page.goto(`${baseUrl}/sidepanel/sidepanel.html`);
    await page.waitForFunction(() => /キャンセルが完了していません/.test(document.querySelector("#status")?.textContent || ""));
    assert.equal(await page.locator("#start").isDisabled(), true, "start must be unavailable while cancellation is retryable");
    assert.equal(await page.locator("#finish").evaluate((element) => element.hidden), true, "finish must be unavailable after cancel failure");
    assert.equal(await page.locator("#resume").evaluate((element) => element.hidden), true, "resume must be unavailable after cancel failure");
    assert.equal(await page.locator("#cancel").evaluate((element) => element.hidden), false, "cancel retry must remain available");
    assert.equal(await page.locator("#emptyState").evaluate((element) => element.hidden), true, "empty state must stay hidden while retry is pending");

    await page.locator("#cancel").click();
    await page.waitForFunction(() => globalThis.__phase === null
      && document.querySelector("#emptyState")?.hidden === false
      && document.querySelector("#cancel")?.hidden === true);
    assert.equal(await page.evaluate(() => globalThis.__cancelCalls), 1, "cancel retry should be sent once");
    assert.equal(await page.locator("#start").isDisabled(), false, "start must be available after cancellation succeeds");
    assert.equal(await page.locator("#finish").evaluate((element) => element.hidden), true);
    assert.equal(await page.locator("#resume").evaluate((element) => element.hidden), true);
    assert.equal(await page.locator("#cancel").evaluate((element) => element.hidden), true);
    assert.equal(await page.locator("#emptyState").evaluate((element) => element.hidden), false);
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

test("sidepanel refreshes drafts independently from unchanged capture state", { timeout: 20_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const sourcePage = await context.newPage();
    await sourcePage.goto(`${baseUrl}/seed.html`);
    await sourcePage.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      await draftStore.put({
        id: "sidepanel-draft-refresh-fixture",
        title: "最初のタイトル",
        description: "説明",
        updatedAt: "2026-09-27T00:00:00.000Z",
        steps: [{ id: "step", order: 1, instruction: "手順" }],
        screenshots: []
      });
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      globalThis.__statusCalls = 0;
      globalThis.chrome = {
        runtime: {
          getURL: (path) => `chrome-extension://test/${path}`,
          sendMessage: async (message) => {
            if (message?.type === "capture:status") {
              globalThis.__statusCalls += 1;
              return { ok: true, value: { phase: "idle", events: [], stepImageRefs: [], sessionId: null } };
            }
            return { ok: true, value: null };
          }
        },
        tabs: { create: async () => ({ id: 1 }) }
      };
    });
    await page.goto(`${baseUrl}/sidepanel/sidepanel.html`);
    await page.locator(".draft-card h3").waitFor();
    assert.equal(await page.locator(".draft-card h3").textContent(), "最初のタイトル");
    const openButton = page.locator(".draft-card button");
    await openButton.focus();
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.draftId), "sidepanel-draft-refresh-fixture");

    await sourcePage.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      await draftStore.put({
        id: "sidepanel-draft-refresh-fixture",
        title: "別ページから更新したタイトル",
        description: "説明",
        updatedAt: "2026-09-27T00:01:00.000Z",
        steps: [{ id: "step", order: 1, instruction: "手順" }],
        screenshots: []
      });
    });
    await page.waitForFunction(() => document.querySelector(".draft-card h3")?.textContent === "別ページから更新したタイトル", null, { timeout: 5_000 });
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.draftId), "sidepanel-draft-refresh-fixture", "draft refresh should preserve button focus");
    assert.ok(await page.evaluate(() => globalThis.__statusCalls > 1), "draft refresh should poll while capture status is unchanged");

    await sourcePage.evaluate(async () => {
      await new Promise((resolve, reject) => {
        const request = indexedDB.open("meccha-manual-guest", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const transaction = request.result.transaction("drafts", "readwrite");
          transaction.objectStore("drafts").delete("sidepanel-draft-refresh-fixture");
          transaction.oncomplete = () => { request.result.close(); resolve(); };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    });
    await page.waitForFunction(() => document.querySelectorAll(".draft-card").length === 0
      && document.querySelector("#draftSection")?.hidden === true
      && document.querySelector("#emptyState")?.hidden === false, null, { timeout: 5_000 });
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

test("ready config opens the registration tab once and keeps local edits", { timeout: 20_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    await page.addInitScript(() => {
      globalThis.__tabsCreateCalls = 0;
      globalThis.__tabsUpdateCalls = [];
      globalThis.__createdTabUrl = null;
      globalThis.__handoffStorageWrites = 0;
      globalThis.__expireNextReady = false;
      globalThis.__delayReadyPoll = false;
      globalThis.__handoffStorage = {};
      globalThis.chrome = {
        runtime: { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        storage: { local: {
          set: async (values) => { globalThis.__handoffStorageWrites += 1; Object.assign(globalThis.__handoffStorage, values); },
          get: async (key) => {
            const result = key ? { [key]: globalThis.__handoffStorage[key] } : globalThis.__handoffStorage;
            if (globalThis.__delayReadyPoll && typeof key === "string" && key.includes(":handoff-ready:") && result[key]?.pageReadyAt) {
              globalThis.__delayReadyPoll = false;
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
            return result;
          },
          remove: async () => undefined
        } },
        tabs: {
          create: async ({ url, active }) => { globalThis.__tabsCreateCalls += 1; globalThis.__createdTabUrl = url; return { id: 17, active }; },
          update: async (tabId, details) => {
            globalThis.__tabsUpdateCalls.push({ tabId, ...details });
            if (details.url) {
              const readyKey = Object.keys(globalThis.__handoffStorage).find((key) => key.includes(":handoff-ready:") && !globalThis.__handoffStorage[key]?.pageReadyAt);
              globalThis.__handoffStorage[readyKey] = {
                ...globalThis.__handoffStorage[readyKey],
                pageReadyAt: new Date().toISOString(),
                activationDeadlineAt: globalThis.__expireNextReady ? new Date(Date.now() + 10).toISOString() : globalThis.__handoffStorage[readyKey]?.activationDeadlineAt,
                activatedAt: null
              };
              globalThis.__expireNextReady = false;
            }
            return { id: tabId, ...details };
          }
        }
      };
    });
    await page.goto(`${baseUrl}/seed.html`);
    await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      await draftStore.put({ id: "ready-output-gate-fixture", title: "元のタイトル", description: "説明", steps: [], screenshots: [] });
    });
    await page.goto(`${baseUrl}/editor/editor.html#ready-output-gate-fixture`);
    await page.locator("#title").fill("編集を保持するタイトル");
    await page.locator("#save").click();
    assert.equal(await page.locator("#startRegistration").isDisabled(), false);
    await page.evaluate(() => {
      chrome.storage.local.set = async () => { throw new Error("HANDOFF_STORAGE_UNAVAILABLE"); };
    });
    await page.locator("#startRegistration").click();
    await page.waitForFunction(() => /^保存の準備ができませんでした。編集画面からもう一度お試しください。/.test(document.querySelector("#gateStatus")?.textContent || ""));
    assert.equal(await page.evaluate(() => globalThis.__tabsUpdateCalls.length), 0, "handoff storage failure must not navigate to a registration URL");
    await page.evaluate(() => {
      chrome.storage.local.set = async (values) => { globalThis.__handoffStorageWrites += 1; Object.assign(globalThis.__handoffStorage, values); };
    });
    await page.locator("#startRegistration").click();
    await page.waitForFunction(() => globalThis.__tabsUpdateCalls.length === 2);
    assert.equal(await page.evaluate(() => globalThis.__tabsUpdateCalls.length), 2);
    assert.equal(await page.evaluate(() => globalThis.__createdTabUrl), "about:blank");
    assert.equal(await page.evaluate(() => globalThis.__tabsUpdateCalls.length), 2);
    assert.equal(await page.evaluate(() => globalThis.__tabsUpdateCalls[0]?.tabId), 17);
    assert.equal(await page.evaluate(() => globalThis.__tabsUpdateCalls[0]?.active), false);
    assert.equal(await page.evaluate(() => globalThis.__tabsUpdateCalls[1]?.tabId), 17);
    assert.equal(await page.evaluate(() => globalThis.__tabsUpdateCalls[1]?.active), true);
    assert.match(await page.evaluate(() => globalThis.__tabsUpdateCalls.find(({ url }) => url)?.url || ""), /^https:\/\/meccha-manual-staging\.meccha-iiyatsu\.com\/onboarding\/continue#handoff=[A-Za-z0-9_-]{43}&extensionId=a{32}&launchId=[A-Za-z0-9_-]{43}$/);
    assert.equal(await page.locator("#title").inputValue(), "編集を保持するタイトル");
    assert.equal(await page.evaluate(() => globalThis.__handoffStorageWrites), 3);
    assert.equal(await page.locator("#handoffProgress").evaluate((element) => element.hidden), true);

    await page.evaluate(() => { globalThis.__expireNextReady = true; globalThis.__delayReadyPoll = true; });
    await page.locator("#save").click();
    await page.locator("#startRegistration").click();
    await page.waitForFunction(() => document.querySelector("#activateHandoff")?.hidden === false, null, { timeout: 12_000 });
    assert.equal(await page.locator("#outputGate").evaluate((element) => element.open), true, "an expired automatic activation should remain in the gate");
    assert.equal(await page.evaluate(() => globalThis.__tabsUpdateCalls.filter(({ active }) => active === true).length), 1);
    await page.locator("#activateHandoff").click();
    await page.waitForFunction(() => globalThis.__tabsUpdateCalls.filter(({ active }) => active === true).length === 2);
    await page.locator("#outputGate").waitFor({ state: "hidden" });
    const activeTabIds = await page.evaluate(() => globalThis.__tabsUpdateCalls.filter(({ active }) => active === true).map(({ tabId }) => tabId));
    assert.deepEqual(activeTabIds, [17, 17], "manual activation should reuse the prepared tab");
    assert.equal(await page.locator("#outputGate").evaluate((element) => element.open), false, "the same prepared tab should be manually activated");
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

test("handoff timeout keeps the editor visible and activation is explicit and idempotent", { timeout: 25_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    page.setDefaultTimeout(3_000);
    await page.addInitScript(() => {
      globalThis.__tabsCreateCalls = 0;
      globalThis.__tabsUpdateCalls = [];
      globalThis.__failActivationUpdate = false;
      globalThis.__delayActivationUpdate = false;
      globalThis.__releaseActivationUpdate = null;
      globalThis.__handoffStorage = {};
      globalThis.chrome = {
        runtime: { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        storage: { local: {
          set: async (values) => Object.assign(globalThis.__handoffStorage, values),
          get: async (key) => key ? { [key]: globalThis.__handoffStorage[key] } : globalThis.__handoffStorage,
          remove: async () => undefined
        } },
        tabs: {
          create: async ({ url, active }) => { globalThis.__tabsCreateCalls += 1; return { id: 21 + globalThis.__tabsCreateCalls, url, active }; },
          update: async (tabId, details) => {
            globalThis.__tabsUpdateCalls.push({ tabId, ...details });
            if (details.active && globalThis.__delayActivationUpdate) {
              globalThis.__delayActivationUpdate = false;
              await new Promise((resolve) => { globalThis.__releaseActivationUpdate = resolve; });
            }
            if (details.active && globalThis.__failActivationUpdate) throw new Error("TAB_CLOSED");
            return { id: tabId, ...details };
          }
        }
      };
    });
    await page.goto(`${baseUrl}/seed.html`);
    await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      await draftStore.put({ id: "timeout-output-gate-fixture", title: "元のタイトル", description: "説明", steps: [], screenshots: [] });
    });
    await page.goto(`${baseUrl}/editor/editor.html#timeout-output-gate-fixture`);
    await page.locator("#save").click();
    await page.locator("#startRegistration").click();
    await page.waitForFunction(() => document.querySelector("#activateHandoff")?.hidden === false, null, { timeout: 12_000 });
    assert.equal(await page.locator("#outputGate").evaluate((element) => element.open), true);
    assert.equal(await page.locator("#handoffProgress").evaluate((element) => element.hidden), true);
    assert.match(await page.locator("#gateStatus").textContent(), /ログインや接続が必要な場合があります/);
    await page.evaluate(() => { globalThis.__delayActivationUpdate = true; });
    await page.locator("#activateHandoff").click();
    await page.waitForFunction(() => typeof globalThis.__releaseActivationUpdate === "function");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#outputGate").evaluate((element) => element.open), true, "Esc must not cancel an activation already in progress");
    assert.equal(await page.locator("#cancelOutput").isDisabled(), true, "cancel must wait for activation to settle");
    assert.equal(await page.locator("#startRegistration").isDisabled(), true, "a new handoff must wait for activation to settle");
    await page.evaluate(() => document.querySelector("#activateHandoff")?.click());
    await page.evaluate(() => globalThis.__releaseActivationUpdate?.());
    await page.waitForFunction(() => document.querySelector("#outputGate")?.open === false);
    assert.equal(await page.evaluate(() => globalThis.__tabsUpdateCalls.filter(({ active }) => active === true).length), 1);

    await page.locator("#save").click();
    await page.locator("#startRegistration").click();
    await page.waitForFunction(() => globalThis.__tabsUpdateCalls.filter(({ url }) => url).length === 2, null, { timeout: 5_000 });
    const launchIds = await page.evaluate(() => globalThis.__tabsUpdateCalls.filter(({ url }) => url).map(({ url }) => new URL(url).hash.match(/[&?]launchId=([A-Za-z0-9_-]{43})$/)?.[1]));
    assert.equal(launchIds.length, 2);
    assert.notEqual(launchIds[0], launchIds[1], "retry must use a new launch id");
    await page.waitForFunction(() => document.querySelector("#activateHandoff")?.hidden === false, null, { timeout: 12_000 });
    await page.evaluate(() => { globalThis.__failActivationUpdate = true; });
    await page.locator("#activateHandoff").click();
    await page.waitForFunction(() => /保存の準備に進む/.test(document.querySelector("#gateStatus")?.textContent || ""));
    assert.equal(await page.locator("#activateHandoff").evaluate((element) => element.hidden), true, "closed activation tab should require a fresh handoff");
    assert.equal(await page.locator("#startRegistration").isDisabled(), false, "fresh handoff should remain available after activation failure");
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

test("cancel during delayed handoff preparation cannot activate a late tab", { timeout: 15_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    page.setDefaultTimeout(3_000);
    await page.addInitScript(() => {
      globalThis.__tabsUpdateCalls = [];
      globalThis.__tabsRemoveCalls = [];
      globalThis.__handoffStorage = {};
      globalThis.__delayFirstStorageSet = true;
      globalThis.__delayNextStorageSet = false;
      globalThis.__storageSetStarted = false;
      globalThis.__releaseStorageSet = null;
      globalThis.__delayTabsCreate = false;
      globalThis.__tabsCreateStarted = false;
      globalThis.__releaseTabsCreate = null;
      globalThis.__nextTabId = 31;
      globalThis.__tabUrlState = { url: "", pendingUrl: "about:blank" };
      globalThis.chrome = {
        runtime: { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        storage: { local: {
          set: async (values) => {
            if (globalThis.__delayFirstStorageSet || globalThis.__delayNextStorageSet) {
              globalThis.__delayFirstStorageSet = false;
              globalThis.__delayNextStorageSet = false;
              globalThis.__storageSetStarted = true;
              await new Promise((resolve) => { globalThis.__releaseStorageSet = resolve; });
            }
            Object.assign(globalThis.__handoffStorage, values);
          },
          get: async (key) => key ? { [key]: globalThis.__handoffStorage[key] } : globalThis.__handoffStorage,
          remove: async () => undefined
        } },
        tabs: {
          create: async ({ url, active }) => {
            if (globalThis.__delayTabsCreate) {
              globalThis.__delayTabsCreate = false;
              globalThis.__tabsCreateStarted = true;
              await new Promise((resolve) => { globalThis.__releaseTabsCreate = resolve; });
            }
            return { id: globalThis.__nextTabId++, url, active };
          },
          get: async (tabId) => ({ id: tabId, ...globalThis.__tabUrlState }),
          remove: async (tabId) => { globalThis.__tabsRemoveCalls.push(tabId); },
          update: async (tabId, details) => { globalThis.__tabsUpdateCalls.push({ tabId, ...details }); return { id: tabId, ...details }; }
        }
      };
    });
    await page.goto(`${baseUrl}/seed.html`);
    await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      await draftStore.put({ id: "cancel-during-handoff-fixture", title: "元のタイトル", description: "説明", steps: [], screenshots: [] });
    });
    await page.goto(`${baseUrl}/editor/editor.html#cancel-during-handoff-fixture`);
    await page.locator("#save").click();
    await page.locator("#startRegistration").click();
    await page.waitForFunction(() => globalThis.__storageSetStarted === true);
    await page.locator("#cancelOutput").click();
    await page.waitForFunction(() => document.querySelector("#outputGate")?.open === false);
    await page.evaluate(() => globalThis.__releaseStorageSet?.());
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => globalThis.__tabsUpdateCalls.some(({ active }) => active === true)), false);
    assert.equal(await page.evaluate(() => globalThis.__tabsUpdateCalls.some(({ url }) => Boolean(url))), false);
    assert.deepEqual(await page.evaluate(() => globalThis.__tabsRemoveCalls), [31], "cancel must remove its own provisional tab");
    assert.ok(await page.evaluate(async () => Boolean(await (await import("/storage/draft-store.js")).draftStore.get("cancel-during-handoff-fixture"))), "cancel must keep the local draft");

    await page.locator("#save").click();
    await page.waitForFunction(() => document.querySelector("#outputGate")?.open === true);
    assert.equal(await page.locator("#outputGate").evaluate((element) => element.open), true, "cancelled preparation must leave the editor resumable");

    await page.evaluate(() => { globalThis.__delayTabsCreate = true; });
    await page.locator("#startRegistration").click();
    await page.waitForFunction(() => globalThis.__tabsCreateStarted === true);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector("#outputGate")?.open === false);
    await page.evaluate(() => globalThis.__releaseTabsCreate?.());
    await page.waitForTimeout(150);
    assert.deepEqual(await page.evaluate(() => globalThis.__tabsRemoveCalls), [31, 32], "cancel after delayed tab creation must remove the returned provisional tab");

    await page.locator("#save").click();
    await page.waitForFunction(() => document.querySelector("#outputGate")?.open === true);
    await page.evaluate(() => {
      globalThis.__delayNextStorageSet = true;
      globalThis.__storageSetStarted = false;
      globalThis.__tabUrlState = { url: "", pendingUrl: "about:blank" };
    });
    await page.locator("#startRegistration").click();
    await page.waitForFunction(() => globalThis.__storageSetStarted === true);
    await page.evaluate(() => { globalThis.__tabUrlState = { url: "https://user.example.test/page" }; });
    await page.locator("#cancelOutput").click();
    await page.waitForFunction(() => document.querySelector("#outputGate")?.open === false);
    await page.evaluate(() => globalThis.__releaseStorageSet?.());
    await page.waitForTimeout(150);
    assert.deepEqual(await page.evaluate(() => globalThis.__tabsRemoveCalls), [31, 32], "cancel must keep a provisional tab after the user navigates it away");
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

test("cancel prevents late editor activation when cancellation persistence fails", { timeout: 15_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    page.setDefaultTimeout(3_000);
    await page.addInitScript(() => {
      globalThis.__handoffStorage = {};
      globalThis.__tabsUpdateCalls = [];
      globalThis.__failCancelPolicySet = true;
      globalThis.__holdReadyRead = false;
      globalThis.__releaseReadyRead = null;
      globalThis.chrome = {
        runtime: { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        storage: { local: {
          set: async (values) => {
            if (globalThis.__failCancelPolicySet && Object.values(values).some((value) => value?.activationPolicy === "cancelled")) {
              globalThis.__failCancelPolicySet = false;
              throw new Error("CANCEL_POLICY_STORAGE_UNAVAILABLE");
            }
            Object.assign(globalThis.__handoffStorage, values);
          },
          get: async (key) => {
            if (key && key.includes(":handoff-ready:") && globalThis.__holdReadyRead) {
              globalThis.__holdReadyRead = false;
              await new Promise((resolve) => { globalThis.__releaseReadyRead = resolve; });
            }
            return key ? { [key]: globalThis.__handoffStorage[key] } : globalThis.__handoffStorage;
          },
          remove: async () => undefined
        } },
        tabs: {
          create: async ({ url, active }) => ({ id: 41, url, active }),
          update: async (tabId, details) => {
            globalThis.__tabsUpdateCalls.push({ tabId, ...details });
            if (details.url) {
              const readyKey = Object.keys(globalThis.__handoffStorage).find((key) => key.includes(":handoff-ready:"));
              globalThis.__handoffStorage[readyKey] = { ...globalThis.__handoffStorage[readyKey], pageReadyAt: new Date().toISOString(), activatedAt: null };
              globalThis.__holdReadyRead = true;
            }
            return { id: tabId, ...details };
          }
        }
      };
    });
    await page.goto(`${baseUrl}/seed.html`);
    await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      await draftStore.put({ id: "cancel-ready-storage-failure-fixture", title: "cancel ready fixture", description: "", steps: [], screenshots: [] });
    });
    await page.goto(`${baseUrl}/editor/editor.html#cancel-ready-storage-failure-fixture`);
    await page.locator("#save").click();
    await page.locator("#startRegistration").click();
    await page.waitForFunction(() => globalThis.__holdReadyRead === false && typeof globalThis.__releaseReadyRead === "function");
    await page.locator("#cancelOutput").click();
    await page.waitForFunction(() => document.querySelector("#outputGate")?.open === false);
    await page.evaluate(() => globalThis.__releaseReadyRead?.());
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => globalThis.__tabsUpdateCalls.some(({ active }) => active === true)), false, "late ready must not foreground after synchronous cancellation");
    assert.equal(await page.evaluate(() => Object.values(globalThis.__handoffStorage).find((value) => value?.launchId)?.activationPolicy), "auto", "the failed cancellation write must be observable in the fixture");
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});
