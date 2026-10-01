import assert from "node:assert/strict";
import { stat, readFile, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve, sep } from "node:path";
import test from "node:test";
import { chromium } from "./support/test-browser.mjs";

const extensionRoot = resolve(fileURLToPath(new URL("../apps/extension/", import.meta.url)));

// Synthetic fixtures only. These checkpoints supplement assertions; they do not
// establish real authentication or remote persistence.
async function captureEditorEvidence(page, name, observations = {}) {
  const directory = ".artifacts/unified-editor";
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true });
  await writeFile(`${directory}/${name}.json`, JSON.stringify({
    candidateCommit: process.env.GITHUB_SHA || null,
    fixture: "synthetic-local-editor", screenshot: `${name}.png`,
    viewport: page.viewportSize(),
    selectedStep: await page.evaluate(() => document.querySelector(".step-article")?.dataset.stepId || null),
    observations
  }, null, 2) + "\n");
}

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

async function seedImageEditorDraft(page, baseUrl, id, count = 22) {
  await page.goto(baseUrl + "/seed.html");
  await page.evaluate(async ({ draftId, count }) => {
    const screenshots = [];
    const steps = [];
    for (let index = 1; index <= count; index += 1) {
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
  }, { draftId: id, count });
  await page.goto(baseUrl + "/editor/editor.html#" + id);
}

function canvasPoint(box, x, y) {
  return { x: box.x + box.width * x, y: box.y + box.height * y };
}

async function dragCanvas(page, canvas, fromX, fromY, toX, toY) {
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  assert.ok(box);
  const start = canvasPoint(box, fromX, fromY);
  const end = canvasPoint(box, toX, toY);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
}

async function selectStep(page, stepId) {
  if (await page.locator(`#step-${stepId}`).count()) return;
  if (!(await page.locator("#stepNavigation").isVisible())) await page.locator("#openNavigation").click();
  await page.locator(`#steps button[data-step-id="${stepId}"]`).click();
  await page.locator(`#step-${stepId}`).waitFor();
}
async function openStepMenu(page, stepId) {
  await selectStep(page, stepId);
  await page.locator(`#step-${stepId} .step-menu summary`).click();
}
async function openUploadPanel(page, stepId) {
  await selectStep(page, stepId);
  await page.locator(`#step-${stepId} .image-file-actions`).evaluate((node) => { node.open = true; });
}
async function openImageEditor(page, stepId = "step-1") {
  await selectStep(page, stepId);
  await page.locator("#step-" + stepId + " .image-edit-button").click();
  await page.locator("#imageEditorDialog").waitFor({ state: "visible" });
  await page.locator(".advanced-tools").evaluate((node) => { node.open = true; });
}

async function readScreenshot(page, draftId, screenshotId = "image-1") {
  return page.evaluate(async ({ draftId: currentDraftId, screenshotId: currentScreenshotId }) => {
    const { draftStore } = await import("/storage/draft-store.js");
    return (await draftStore.get(currentDraftId)).screenshots.find((item) => item.id === currentScreenshotId);
  }, { draftId, screenshotId });
}

test("selected-only preview contains portrait images and releases the previous pixel buffer", { timeout: 35_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const baseUrl = "http://127.0.0.1:" + server.address().port;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  const draftId = "editor-preview-buffer-regression";
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true, viewport: { width: 1024, height: 768 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(6_000);
    await seedImageEditorDraft(page, baseUrl, draftId);
    const portraitDataUrl = await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 240; canvas.height = 1200;
      const context = canvas.getContext("2d"); context.fillStyle = "#eaf8fb"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#087f7a"; context.fillRect(42, 120, 156, 960);
      return canvas.toDataURL("image/png");
    });
    await page.evaluate(async ({ draftId: currentDraftId, portrait }) => {
      const { draftStore } = await import("/storage/draft-store.js");
      const draft = await draftStore.get(currentDraftId);
      draft.screenshots.find((screenshot) => screenshot.id === "image-1").dataUrl = portrait;
      await draftStore.put(draft);
    }, { draftId, portrait: portraitDataUrl });
    await page.reload();

    const preview = page.locator("#step-step-1 .screenshot-preview");
    const canvas = page.locator("#step-step-1 .screenshot-canvas");
    await page.waitForFunction(() => {
      const target = document.querySelector("#step-step-1 .screenshot-canvas");
      return target?.width === 240 && target?.height === 1200 && target?.dataset.previewRendered === "true";
    });
    const firstFrame = await preview.boundingBox();
    assert.ok(firstFrame && Math.abs(firstFrame.width / firstFrame.height - 16 / 9) < .03, "画像の縦横比にかかわらずプレビュー枠を固定する");
    assert.equal(await canvas.evaluate((element) => element.style.aspectRatio), "", "canvasへ画像ごとの比率を設定しない");

    await canvas.evaluate((element) => { globalThis.__previousPreview = element; });
    await selectStep(page, "step-22");
    assert.equal(await page.locator(".step-article").count(), 1, "画像は選択手順の1枚だけを描画する");
    assert.equal(await page.evaluate(() => globalThis.__previousPreview.isConnected), false);
    assert.equal(await page.evaluate(() => globalThis.__previousPreview.width), 1, "非選択画像のpixel bufferを解放する");
    await selectStep(page, "step-1");
    await page.waitForFunction(() => {
      const target = document.querySelector("#step-step-1 .screenshot-canvas");
      return target?.width === 240 && target?.height === 1200 && target?.dataset.previewRendered === "true";
    });
    const restoredFrame = await preview.boundingBox();
    assert.ok(restoredFrame && Math.abs(restoredFrame.width / restoredFrame.height - 16 / 9) < .03, "再表示時も目次の移動先を変えない");
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

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
    assert.equal(await page.locator("h1#editor-heading").textContent(), "手順書を編集");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "editor-heading", "編集画面の初期フォーカスはページ見出しから開始する");

    await page.locator('#steps button[aria-controls="step-step-17"]').click();
    await page.waitForFunction(() => {
      const article = document.querySelector("#step-step-17");
      return article && article.getBoundingClientRect().top >= 0 && article.getBoundingClientRect().top < innerHeight;
    });
    const step17Box = await page.locator("#step-step-17").boundingBox();
    assert.ok(step17Box && step17Box.y < 160, "手順17の画像を同じ作業領域で編集する");
    assert.equal(await page.locator("#step-step-18").count(), 0, "長い本文へ全手順を並べない");
    await page.locator("#step-step-17 textarea").fill("手順17の説明を保持");
    assert.equal(await page.locator("#step-step-17 textarea").inputValue(), "手順17の説明を保持");
    await page.locator('#steps button[aria-controls="step-step-1"]').click();
    await page.locator("#step-step-1").scrollIntoViewIfNeeded();
    assert.equal(await page.locator(".step-article").count(), 1);

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
    await captureEditorEvidence(page, "image-save-failed", { operation: "apply-image-text", failure: "synthetic-IDB-write", editorStillOpen: await page.locator("#imageEditorDialog").isVisible() });
    await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      draftStore.put = globalThis.__originalPut;
    });
    await page.locator("[data-editor-save]").click();
    await page.locator("#imageEditorDialog").waitFor({ state: "hidden" });
    const retried = await readScreenshot(page, draftId);
    assert.equal(retried.annotations.find((item) => item.type === "text")?.text, "保存再試行");
    assert.equal(retried.annotations.find((item) => item.type === "text")?.fontSize, 10);
    await captureEditorEvidence(page, "image-save-retried", { operation: "retry-same-image-edit", persistedTextMatches: retried.annotations.some((item) => item.type === "text" && item.text === "保存再試行" && item.fontSize === 10) });

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
    await captureEditorEvidence(page, "image-save-pending", { operation: "delayed-IDB-write-and-Escape", writeCalls: await page.evaluate(() => globalThis.__putCalls), controlsDisabled: await editorControls.evaluateAll((elements) => elements.every((element) => element.disabled)) });
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

test("a pending image write preserves concurrent title, step text, order, add, and delete edits", { timeout: 25_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true, viewport: { width: 1024, height: 768 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(5_000);
    await page.goto(`${baseUrl}/seed.html`);
    const originalDataUrl = await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 2; canvas.height = 2;
      const context = canvas.getContext("2d"); context.fillStyle = "#ffffff"; context.fillRect(0, 0, 2, 2);
      return canvas.toDataURL("image/png");
    });
    await page.evaluate(async (dataUrl) => {
      const { draftStore } = await import("/storage/draft-store.js");
      await draftStore.put({
        id: "pending-image-concurrent-edits",
        title: "元のタイトル",
        description: "説明",
        steps: [
          { id: "step-1", order: 1, instruction: "元の手順1", screenshotId: "image-1" },
          { id: "step-2", order: 2, instruction: "元の手順2" },
          { id: "step-3", order: 3, instruction: "削除する手順" }
        ],
        screenshots: [{ id: "image-1", dataUrl, annotations: [], masks: [] }]
      });
    }, originalDataUrl);
    await page.goto(`${baseUrl}/editor/editor.html#pending-image-concurrent-edits`);
    await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      globalThis.__originalDraftPut = draftStore.put;
      globalThis.__pendingDraftPut = null;
      globalThis.__draftPutCalls = 0;
      draftStore.put = async (candidate) => {
        globalThis.__draftPutCalls += 1;
        if (globalThis.__draftPutCalls === 1) return new Promise((resolve) => { globalThis.__pendingDraftPut = { candidate, resolve }; });
        return globalThis.__originalDraftPut(candidate);
      };
    });
    const replacementDataUrl = await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 2; canvas.height = 2;
      const context = canvas.getContext("2d"); context.fillStyle = "#087f7a"; context.fillRect(0, 0, 2, 2);
      return canvas.toDataURL("image/png");
    });
    await page.locator("#step-step-1 .image-upload-panel input[type=file]").setInputFiles({
      name: "replacement.png", mimeType: "image/png", buffer: Buffer.from(replacementDataUrl.split(",")[1], "base64")
    });
    await page.waitForFunction(() => globalThis.__pendingDraftPut !== null && globalThis.__draftPutCalls === 1);

    // These edits happen while the first IDB write is still unresolved. The
    // controls deliberately use the real editor event handlers so the test
    // covers the same queued persistence path as a user interaction.
    await page.locator("#title").fill("同時編集後のタイトル");
    await page.locator("#step-step-1 textarea").fill("同時編集後の説明");
    await page.locator("#addStep").click();
    await openStepMenu(page, "step-2");
    await page.locator("#step-step-2 button").filter({ hasText: "前へ移動" }).click();
    await openStepMenu(page, "step-3");
    await page.locator("#step-step-3 button").filter({ hasText: "削除" }).click();
    await page.evaluate(() => globalThis.__pendingDraftPut.resolve());
    await page.waitForFunction(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      const value = await draftStore.get("pending-image-concurrent-edits");
      return value?.title === "同時編集後のタイトル" && value.steps.length === 3 && value.steps.every((step, index) => step.order === index + 1);
    });
    const stored = await page.evaluate(async () => (await (await import("/storage/draft-store.js")).draftStore.get("pending-image-concurrent-edits")));
    assert.equal(stored.title, "同時編集後のタイトル");
    assert.equal(stored.steps.find((step) => step.id === "step-1")?.instruction, "同時編集後の説明");
    assert.equal(stored.steps.some((step) => step.id === "step-3"), false, "削除した手順を復活させない");
    assert.equal(stored.steps.some((step) => step.instruction === "新しい手順"), true, "追加した手順を保持する");
    assert.deepEqual(stored.steps.map((step) => step.id), ["step-1", "step-2", stored.steps.find((step) => step.instruction === "新しい手順")?.id]);
    assert.notEqual(stored.screenshots[0].dataUrl, originalDataUrl, "画像の変更を保持する");
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

test("image replacement invalidates an open editor before its stale save can reuse the screenshot id", { timeout: 25_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  const draftId = "stale-image-editor-replacement";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true, viewport: { width: 1024, height: 768 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(5_000);
    await page.goto(`${baseUrl}/seed.html`);
    const { oldDataUrl, replacementDataUrl } = await page.evaluate(() => {
      const makeImage = (color) => {
        const canvas = document.createElement("canvas"); canvas.width = 4; canvas.height = 3;
        const context = canvas.getContext("2d"); context.fillStyle = color; context.fillRect(0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/png");
      };
      return { oldDataUrl: makeImage("#173d46"), replacementDataUrl: makeImage("#087f7a") };
    });
    await page.evaluate(async ({ draftId: currentDraftId, oldDataUrl }) => {
      const { draftStore } = await import("/storage/draft-store.js");
      await draftStore.put({
        id: currentDraftId,
        title: "stale editor replacement",
        description: "",
        steps: [{ id: "stale-step", order: 1, instruction: "画像差し替え", screenshotId: "shared-id" }],
        screenshots: [{
          id: "shared-id",
          dataUrl: oldDataUrl,
          annotations: [{ id: "old-annotation", type: "text", x: .1, y: .1, width: .3, height: .1, color: "#087f7a", strokeWidth: 3, text: "旧画像の注釈", fontSize: 24 }],
          masks: [{ id: "old-mask", x: .6, y: .2, width: .2, height: .2 }]
        }]
      });
    }, { draftId, oldDataUrl });
    await page.goto(`${baseUrl}/editor/editor.html#${draftId}`);
    await openImageEditor(page, "stale-step");
    await page.locator("[data-editor-save]:not([disabled])").waitFor();
    await page.evaluate(() => {
      const originalCreateImageBitmap = globalThis.createImageBitmap;
      globalThis.__uploadBitmapStarted = false;
      globalThis.__releaseUploadBitmap = null;
      globalThis.createImageBitmap = async (...args) => {
        const bitmap = await originalCreateImageBitmap(...args);
        globalThis.__uploadBitmapStarted = true;
        await new Promise((resolve) => { globalThis.__releaseUploadBitmap = resolve; });
        return bitmap;
      };
    });
    const input = page.locator("#step-stale-step .image-upload-panel input[type=file]");
    await input.setInputFiles({ name: "replacement.png", mimeType: "image/png", buffer: Buffer.from(replacementDataUrl.split(",")[1], "base64") });
    await page.waitForFunction(() => globalThis.__uploadBitmapStarted && typeof globalThis.__releaseUploadBitmap === "function");
    await page.evaluate(() => globalThis.__releaseUploadBitmap());
    await page.getByText("画像を端末に保存しました。公開できない情報が残っていないか確認してください。", { exact: true }).waitFor();
    assert.equal(await page.locator("#imageEditorDialog").isVisible(), false, "差し替え対象Aの旧editorだけを閉じる");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-editor-trigger")), "shared-id", "対象Aの新画像編集ボタンへフォーカスを戻す");

    const replaced = await readScreenshot(page, draftId, "shared-id");
    assert.notEqual(replaced.dataUrl, oldDataUrl, "置換後は旧bitmapのdata URLを保持しない");
    assert.deepEqual(replaced.annotations, [], "置換後の新bitmapに旧dialogの注釈を引き継がない");
    assert.deepEqual(replaced.masks, [], "置換後の新bitmapに旧dialogのマスクを引き継がない");
    if (await page.locator("#imageEditorDialog").isVisible()) await page.locator("[data-editor-save]").click();
    await page.waitForTimeout(150);
    const afterStaleSave = await readScreenshot(page, draftId, "shared-id");
    assert.deepEqual(afterStaleSave.annotations, [], "置換完了後の旧dialog保存が新bitmapへ注釈を反映しない");
    assert.deepEqual(afterStaleSave.masks, [], "置換完了後の旧dialog保存が新bitmapへマスクを反映しない");
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

test("image upload keeps old content on failure and restores focus for add and replacement actions", { timeout: 25_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  const draftId = "image-upload-focus-contract";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true, viewport: { width: 1024, height: 768 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(5_000);
    await page.goto(`${baseUrl}/seed.html`);
    const { oldDataUrl, replacementDataUrl } = await page.evaluate(() => {
      const makeImage = (color) => {
        const canvas = document.createElement("canvas"); canvas.width = 4; canvas.height = 3;
        const context = canvas.getContext("2d"); context.fillStyle = color; context.fillRect(0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/png");
      };
      return { oldDataUrl: makeImage("#173d46"), replacementDataUrl: makeImage("#087f7a") };
    });
    await page.evaluate(async ({ draftId: currentDraftId, oldDataUrl }) => {
      const { draftStore } = await import("/storage/draft-store.js");
      await draftStore.put({
        id: currentDraftId,
        title: "image upload focus contract",
        description: "",
        steps: [
          { id: "replace-step", order: 1, instruction: "差し替え", screenshotId: "replace-image" },
          { id: "add-step", order: 2, instruction: "追加" }
        ],
        screenshots: [{ id: "replace-image", dataUrl: oldDataUrl, annotations: [], masks: [] }]
      });
    }, { draftId, oldDataUrl });
    await page.goto(`${baseUrl}/editor/editor.html#${draftId}`);
    await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      globalThis.__focusContractOriginalPut = draftStore.put;
      draftStore.put = async () => { throw new Error("synthetic upload failure"); };
    });
    const replaceInput = page.locator("#step-replace-step .image-upload-panel input[type=file]");
    await openUploadPanel(page, "replace-step");
    await page.locator("#step-replace-step .image-upload-panel button").focus();
    await replaceInput.setInputFiles({ name: "replacement.png", mimeType: "image/png", buffer: Buffer.from(replacementDataUrl.split(",")[1], "base64") });
    await page.getByText("画像を差し替えられませんでした。元の内容は変更されていません。もう一度お試しください。", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "画像を選び直す", "差し替え失敗後は再試行ボタンへフォーカスを戻す");
    const afterFailure = await readScreenshot(page, draftId, "replace-image");
    assert.equal(afterFailure.dataUrl, oldDataUrl, "差し替え失敗時は旧bitmapを保持する");

    await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      draftStore.put = globalThis.__focusContractOriginalPut;
    });
    await replaceInput.setInputFiles({ name: "replacement.png", mimeType: "image/png", buffer: Buffer.from(replacementDataUrl.split(",")[1], "base64") });
    await page.getByText("画像を端末に保存しました。公開できない情報が残っていないか確認してください。", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-editor-trigger")), "replace-image", "差し替え成功後は新画像の編集ボタンへフォーカスを戻す");

    await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      draftStore.put = async () => { throw new Error("synthetic add failure"); };
    });
    const addInput = page.locator("#step-add-step .image-upload-panel input[type=file]");
    await openUploadPanel(page, "add-step");
    await page.locator("#step-add-step .image-upload-panel button").focus();
    await addInput.setInputFiles({ name: "addition.png", mimeType: "image/png", buffer: Buffer.from(replacementDataUrl.split(",")[1], "base64") });
    await page.getByText("画像を追加できませんでした。元の内容は変更されていません。もう一度お試しください。", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "画像を選ぶ", "画像追加失敗後は追加ボタンへフォーカスを戻す");
    const afterAdditionFailure = await page.evaluate(async () => (await (await import("/storage/draft-store.js")).draftStore.get("image-upload-focus-contract")));
    assert.equal(afterAdditionFailure.screenshots.length, 1, "追加失敗時は既存画像だけを保持する");
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

test("shared replacement closes the target step editor while retaining the shared source for another step", { timeout: 25_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  const draftId = "shared-target-editor-replacement";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true, viewport: { width: 1024, height: 768 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(5_000);
    await page.goto(`${baseUrl}/seed.html`);
    const { oldDataUrl, replacementDataUrl } = await page.evaluate(() => {
      const makeImage = (color) => {
        const canvas = document.createElement("canvas"); canvas.width = 4; canvas.height = 3;
        const context = canvas.getContext("2d"); context.fillStyle = color; context.fillRect(0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/png");
      };
      return { oldDataUrl: makeImage("#173d46"), replacementDataUrl: makeImage("#087f7a") };
    });
    const oldAnnotations = [{ id: "shared-old-annotation", type: "text", x: .1, y: .1, width: .3, height: .1, color: "#087f7a", strokeWidth: 3, text: "共有元の注釈", fontSize: 24 }];
    const oldMasks = [{ id: "shared-old-mask", x: .6, y: .2, width: .2, height: .2 }];
    await page.evaluate(async ({ draftId: currentDraftId, oldDataUrl: currentOldDataUrl, oldAnnotations: currentAnnotations, oldMasks: currentMasks }) => {
      const { draftStore } = await import("/storage/draft-store.js");
      await draftStore.put({
        id: currentDraftId,
        title: "shared target editor replacement",
        description: "",
        steps: [
          { id: "shared-a-step", order: 1, instruction: "A差し替え", screenshotId: "shared-image" },
          { id: "shared-b-step", order: 2, instruction: "B共有元", screenshotId: "shared-image" }
        ],
        screenshots: [{ id: "shared-image", dataUrl: currentOldDataUrl, annotations: currentAnnotations, masks: currentMasks }]
      });
    }, { draftId, oldDataUrl, oldAnnotations, oldMasks });
    await page.goto(`${baseUrl}/editor/editor.html#${draftId}`);
    await openImageEditor(page, "shared-a-step");
    await page.locator("[data-editor-save]:not([disabled])").waitFor();
    await page.evaluate(() => {
      const originalCreateImageBitmap = globalThis.createImageBitmap;
      globalThis.__sharedTargetUploadStarted = false;
      globalThis.__releaseSharedTargetUpload = null;
      globalThis.createImageBitmap = async (...args) => {
        const bitmap = await originalCreateImageBitmap(...args);
        globalThis.__sharedTargetUploadStarted = true;
        await new Promise((resolve) => { globalThis.__releaseSharedTargetUpload = resolve; });
        return bitmap;
      };
    });
    const input = page.locator("#step-shared-a-step .image-upload-panel input[type=file]");
    await input.setInputFiles({ name: "shared-replacement.png", mimeType: "image/png", buffer: Buffer.from(replacementDataUrl.split(",")[1], "base64") });
    await page.waitForFunction(() => globalThis.__sharedTargetUploadStarted && typeof globalThis.__releaseSharedTargetUpload === "function");
    await page.evaluate(() => globalThis.__releaseSharedTargetUpload());
    await page.getByText("画像を端末に保存しました。公開できない情報が残っていないか確認してください。", { exact: true }).waitFor();
    const after = await page.evaluate(async (currentDraftId) => (await (await import("/storage/draft-store.js")).draftStore.get(currentDraftId)), draftId);
    const newAId = after.steps.find((step) => step.id === "shared-a-step")?.screenshotId;
    const oldB = after.screenshots.find((item) => item.id === "shared-image");
    const newA = after.screenshots.find((item) => item.id === newAId);
    assert.notEqual(newAId, "shared-image", "Aだけ新しい画像IDへ切り替える");
    assert.equal(after.steps.find((step) => step.id === "shared-b-step")?.screenshotId, "shared-image", "Bは共有元画像を保持する");
    assert.deepEqual(oldB.annotations, oldAnnotations, "Bの共有元注釈を保持する");
    assert.deepEqual(oldB.masks, oldMasks, "Bの共有元マスクを保持する");
    assert.deepEqual(newA.annotations, [], "Aの新画像へ旧注釈を混入させない");
    assert.deepEqual(newA.masks, [], "Aの新画像へ旧マスクを混入させない");
    assert.equal(await page.locator("#imageEditorDialog").isVisible(), false, "Aの旧dialogだけを閉じる");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-editor-trigger")), newAId, "Aの新画像編集ボタンへfocusを戻す");
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

test("replacement does not steal focus from another control after an editor was closed", { timeout: 25_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  const draftId = "closed-editor-focus-guard";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true, viewport: { width: 1024, height: 768 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(5_000);
    await seedImageEditorDraft(page, baseUrl, draftId);
    await openImageEditor(page);
    await page.locator("[data-editor-save]:not([disabled])").waitFor();
    await page.locator("[data-editor-cancel]").first().click();
    await page.locator("#imageEditorDialog").waitFor({ state: "hidden" });
    const replacementDataUrl = await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 4; canvas.height = 3;
      const context = canvas.getContext("2d"); context.fillStyle = "#087f7a"; context.fillRect(0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/png");
    });
    await page.evaluate(() => {
      const originalCreateImageBitmap = globalThis.createImageBitmap;
      globalThis.__closedEditorUploadStarted = false;
      globalThis.__releaseClosedEditorUpload = null;
      globalThis.createImageBitmap = async (...args) => {
        const bitmap = await originalCreateImageBitmap(...args);
        globalThis.__closedEditorUploadStarted = true;
        await new Promise((resolve) => { globalThis.__releaseClosedEditorUpload = resolve; });
        return bitmap;
      };
    });
    await page.locator("#title").focus();
    const input = page.locator("#step-step-1 .image-upload-panel input[type=file]");
    await input.setInputFiles({ name: "closed-editor-replacement.png", mimeType: "image/png", buffer: Buffer.from(replacementDataUrl.split(",")[1], "base64") });
    await page.waitForFunction(() => globalThis.__closedEditorUploadStarted && typeof globalThis.__releaseClosedEditorUpload === "function");
    await page.evaluate(() => globalThis.__releaseClosedEditorUpload());
    await page.getByText("画像を端末に保存しました。公開できない情報が残っていないか確認してください。", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.id), "title", "閉じたeditorの参照だけでは別controlのfocusを奪わない");
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

test("replacement closes only the target image editor and preserves another editor through save retry", { timeout: 30_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  const draftId = "image-editor-target-identity";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true, viewport: { width: 1024, height: 768 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(5_000);
    await page.goto(`${baseUrl}/seed.html`);
    const { imageA, replacementA, imageB } = await page.evaluate(() => {
      const makeImage = (color) => {
        const canvas = document.createElement("canvas"); canvas.width = 4; canvas.height = 3;
        const context = canvas.getContext("2d"); context.fillStyle = color; context.fillRect(0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/png");
      };
      const sharedImage = makeImage("#173d46");
      return { imageA: sharedImage, replacementA: makeImage("#087f7a") };
    });
    await page.evaluate(async ({ draftId: currentDraftId, imageA: currentImageA }) => {
      const { draftStore } = await import("/storage/draft-store.js");
      await draftStore.put({
        id: currentDraftId,
        title: "target editor identity",
        description: "",
        steps: [
          { id: "editor-a-step", order: 1, instruction: "差し替え対象", screenshotId: "shared-image" },
          { id: "editor-b-step", order: 2, instruction: "編集中の別画像", screenshotId: "shared-image" }
        ],
        screenshots: [{ id: "shared-image", dataUrl: currentImageA, annotations: [], masks: [] }]
      });
    }, { draftId, imageA });
    await page.goto(`${baseUrl}/editor/editor.html#${draftId}`);
    await page.evaluate(() => {
      const originalCreateImageBitmap = globalThis.createImageBitmap;
      globalThis.__targetUploadStarted = false;
      globalThis.__releaseTargetUpload = null;
      globalThis.createImageBitmap = async (...args) => {
        const bitmap = await originalCreateImageBitmap(...args);
        globalThis.__targetUploadStarted = true;
        await new Promise((resolve) => { globalThis.__releaseTargetUpload = resolve; });
        return bitmap;
      };
    });
    const inputA = page.locator("#step-editor-a-step .image-upload-panel input[type=file]");
    await openUploadPanel(page, "editor-a-step");
    await page.locator("#step-editor-a-step .image-upload-panel button").focus();
    await inputA.setInputFiles({ name: "replacement-a.png", mimeType: "image/png", buffer: Buffer.from(replacementA.split(",")[1], "base64") });
    await page.waitForFunction(() => globalThis.__targetUploadStarted && typeof globalThis.__releaseTargetUpload === "function");

    await openImageEditor(page, "editor-b-step");
    await page.locator("[data-editor-save]:not([disabled])").waitFor();
    await page.locator('[data-editor-tool="text"]').click();
    await dragCanvas(page, page.locator("#imageEditorCanvas"), .08, .08, .08, .08);
    await page.locator("[data-editor-text]").fill("別画像の編集を保持");
    await page.locator("[data-editor-font-size]").fill("24");

    await page.evaluate(() => globalThis.__releaseTargetUpload());
    await page.getByText("画像を端末に保存しました。公開できない情報が残っていないか確認してください。", { exact: true }).waitFor();
    assert.equal(await page.locator("#imageEditorDialog").isVisible(), true, "別画像のeditorは対象画像の差し替え後も開いたままにする");

    await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      globalThis.__targetEditorOriginalPut = draftStore.put;
      draftStore.put = async () => { throw new Error("synthetic editor save failure"); };
    });
    await page.locator("[data-editor-save]").click();
    await page.getByText("保存できませんでした。編集内容を保持したまま、もう一度保存してください。", { exact: true }).waitFor();
    assert.equal(await page.locator("#imageEditorDialog").isVisible(), true, "別画像editorの保存失敗後も編集内容を保持する");
    await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      draftStore.put = globalThis.__targetEditorOriginalPut;
    });
    await page.locator("[data-editor-save]").click();
    await page.locator("#imageEditorDialog").waitFor({ state: "hidden" });
    const stored = await readScreenshot(page, draftId, "shared-image");
    assert.equal(stored.annotations.find((item) => item.type === "text")?.text, "別画像の編集を保持", "別画像の注釈を保存できる");
    const afterSharedReplacement = await page.evaluate(async () => (await (await import("/storage/draft-store.js")).draftStore.get("image-editor-target-identity")));
    assert.notEqual(afterSharedReplacement.steps[0].screenshotId, "shared-image", "差し替え対象stepは新画像IDへ切り替える");
    assert.equal(afterSharedReplacement.steps[1].screenshotId, "shared-image", "共有元の別stepは旧画像IDを保持する");
    assert.deepEqual(afterSharedReplacement.screenshots.find((item) => item.id === afterSharedReplacement.steps[0].screenshotId)?.annotations, [], "新しいA画像へBの注釈を混入させない");
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
    await page.waitForFunction(() => document.querySelector(".screenshot-canvas")?.dataset.previewRendered === "true");
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
    assert.equal(await page.locator("#outputGate").evaluate((element) => element.open), true);
    await page.waitForFunction(() => document.querySelector("#gateStatus")?.textContent.includes("端末に保存できない"));
    assert.equal(await page.locator("#startRegistration").isDisabled(), true);
    await page.locator("#cancelOutput").click();

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
      globalThis.__draftListMode = "ok";
      const originalGetAll = IDBObjectStore.prototype.getAll;
      IDBObjectStore.prototype.getAll = function (...args) {
        if (globalThis.__draftListMode === "fail" && this.name === "drafts") {
          const request = {};
          queueMicrotask(() => request.onerror?.());
          return request;
        }
        return originalGetAll.apply(this, args);
      };
      globalThis.__refreshMode = "ok";
      globalThis.__statusPhase = "recording";
      globalThis.__restorePending = false;
      globalThis.__finishResult = { draftId: "restore-pending-sidepanel-fixture", restorePending: true, imageCount: 2, missingImageCount: 0 };
      globalThis.__finishError = false;
      globalThis.__tabsCreateMode = "ok";
      globalThis.__tabsCreateCalls = [];
      globalThis.__editorReadyListeners = [];
      globalThis.chrome = {
        runtime: {
          getURL: (path) => `chrome-extension://test/${path}`,
          onMessage: {
            addListener: (listener) => globalThis.__editorReadyListeners.push(listener),
            removeListener: (listener) => { globalThis.__editorReadyListeners = globalThis.__editorReadyListeners.filter((candidate) => candidate !== listener); }
          },
          sendMessage: async (message) => {
            if (message?.type === "capture:status") {
              if (globalThis.__refreshMode === "fail") throw new Error("STATUS_UNAVAILABLE");
              return { ok: true, value: { phase: globalThis.__statusPhase, restorePending: globalThis.__restorePending, events: [], stepImageRefs: [] } };
            }
            if (message?.type === "capture:finish") {
              if (globalThis.__finishError) {
                globalThis.__statusPhase = "idle";
                globalThis.__restorePending = false;
                return { ok: false, error: "FINISH_RESPONSE_LOST" };
              }
              const result = globalThis.__finishResult;
              globalThis.__statusPhase = result.restorePending ? "finish_failed" : "idle";
              globalThis.__restorePending = Boolean(result.restorePending);
              return { ok: true, value: result };
            }
            return { ok: true, value: null };
          }
        },
        tabs: {
          create: async (details) => {
            globalThis.__tabsCreateCalls.push(details);
            if (globalThis.__tabsCreateMode === "fail") throw new Error("TABS_UNAVAILABLE");
            const id = globalThis.__tabsCreateCalls.length;
            queueMicrotask(() => {
              const draftId = decodeURIComponent(new URL(details.url).hash.slice(1));
              const sender = { tab: { id }, url: details.url };
              for (const listener of [...globalThis.__editorReadyListeners]) listener({ type: "editor:ready", draftId, ready: true }, sender);
            });
            return { id };
          }
        }
      };
    });
    await page.goto(`${baseUrl}/sidepanel/sidepanel.html`);
    await page.locator("#finish").waitFor({ state: "visible" });

    await page.locator("#finish").click();
    await page.waitForFunction(() => /保存済み/.test(document.querySelector("#status")?.textContent || ""));
    assert.equal(await page.locator("#restore").evaluate((element) => element.hidden), false);
    assert.equal(await page.evaluate(() => globalThis.__tabsCreateCalls.length), 1, "finish success should open the editor once");

    await page.evaluate(() => {
      globalThis.__refreshMode = "ok";
      globalThis.__finishError = true;
      globalThis.__statusPhase = "recording";
    });
    await page.locator("#finish").waitFor({ state: "visible" });
    await page.locator("#finish").click();
    await page.waitForFunction(() => /記録終了の結果を確認できませんでした/.test(document.querySelector("#status")?.textContent || ""));
    assert.equal(await page.locator("#finish").evaluate((element) => element.hidden), true, "idle after a lost finish response must not offer an unverified retry");
    assert.doesNotMatch(await page.locator("#status").textContent(), /保存済み/);

    await page.evaluate(() => {
      globalThis.__refreshMode = "ok";
      globalThis.__finishError = false;
      globalThis.__statusPhase = "recording";
      globalThis.__finishResult = { draftId: "normal-sidepanel-fixture", restorePending: false, imageCount: 2, missingImageCount: 0 };
    });
    await page.locator("#finish").waitFor({ state: "visible" });
    await page.locator("#finish").click();
    await page.waitForFunction(() => /画像付きの手順を保存しました/.test(document.querySelector("#status")?.textContent || ""));
    assert.equal(await page.locator("#restore").evaluate((element) => element.hidden), true, "normal finish should not show restore guidance");

    await page.evaluate(() => {
      globalThis.__refreshMode = "ok";
      globalThis.__tabsCreateMode = "ok";
      globalThis.__draftListMode = "ok";
      globalThis.__statusPhase = "recording";
      globalThis.__finishResult = { draftId: "refresh-failure-sidepanel-fixture", restorePending: true, imageCount: 2, missingImageCount: 0 };
    });
    await page.locator("#finish").waitFor({ state: "visible" });
    await page.evaluate(() => { globalThis.__refreshMode = "fail"; });
    await page.locator("#finish").click();
    await page.waitForFunction(() => /保存済み/.test(document.querySelector("#status")?.textContent || ""));
    assert.equal(await page.locator("#restore").evaluate((element) => element.hidden), false, "restore remains available when status refresh fails");
    assert.equal(await page.locator("#finish").evaluate((element) => element.hidden), true, "saved finish must hide stale recording controls after refresh failure");

    await page.evaluate(() => {
      globalThis.__refreshMode = "ok";
      globalThis.__tabsCreateMode = "fail";
      globalThis.__draftListMode = "ok";
      globalThis.__statusPhase = "recording";
      globalThis.__finishResult = { draftId: "double-failure-sidepanel-fixture", restorePending: false, imageCount: 2, missingImageCount: 0 };
    });
    await page.locator("#finish").waitFor({ state: "visible" });
    await page.evaluate(() => { globalThis.__draftListMode = "fail"; });
    await page.locator("#finish").click();
    await page.waitForFunction(() => /もう一度この画面を開いて確認してください/.test(document.querySelector("#status")?.textContent || ""));
    assert.equal(await page.locator("#finish").evaluate((element) => element.hidden), true, "saved finish must hide stale recording controls after list failure");
    assert.doesNotMatch(await page.locator("#status").textContent(), /下書き一覧から開いてください/);
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
    await page.locator("#startRegistration:not([disabled])").waitFor();
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
    await captureEditorEvidence(page, "auth-handoff-interrupted", { operation: "synthetic-registration-timeout", status: await page.locator("#gateStatus").textContent(), explicitResumeVisible: await page.locator("#activateHandoff").isVisible() });
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
    await captureEditorEvidence(page, "auth-closed-tab-recovery", { operation: "synthetic-closed-registration-tab", freshHandoffAvailable: !(await page.locator("#startRegistration").isDisabled()), status: await page.locator("#gateStatus").textContent() });
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

test("a manually added step accepts a sanitized image and opens the editor", { timeout: 20_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true, viewport: { width: 1024, height: 768 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(4_000);
    await page.goto(`${baseUrl}/seed.html`);
    await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      await draftStore.put({ id: "manual-upload-fixture", title: "合成画像の確認", description: "", steps: [{ id: "manual-step", order: 1, instruction: "手動で追加した手順" }], screenshots: [] });
    });
    await page.goto(`${baseUrl}/editor/editor.html#manual-upload-fixture`);
    const input = page.locator(".image-upload-panel input[type=file]");
    assert.equal(await input.count(), 1, "画像がない手順には画像追加欄を表示する");
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
    await input.setInputFiles({ name: "synthetic-with-metadata.png", mimeType: "image/png", buffer: png });
    await page.waitForFunction(() => Boolean(document.querySelector(".screenshot-canvas")));
    const stored = await page.evaluate(async () => (await (await import("/storage/draft-store.js")).draftStore.get("manual-upload-fixture")));
    assert.equal(stored.screenshots.length, 1);
    assert.equal(stored.steps[0].screenshotId, stored.screenshots[0].id);
    assert.equal(stored.screenshots[0].dataUrl.startsWith("data:image/"), true, "画像は再エンコードしたdata URLとして保存する");
    await page.locator("#step-manual-step .image-edit-button").click();
    await page.locator("#imageEditorDialog").waitFor({ state: "visible" });
    assert.equal(await page.locator("[data-editor-tool]").count(), 7);
    await page.locator("[data-editor-cancel]").first().click();
    assert.equal(await page.locator("#imageEditorDialog").isVisible(), false);
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

test("JPEG header scanning accepts fill bytes and TEM before SOF, while malformed segments fail closed", { timeout: 20_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true, viewport: { width: 1024, height: 768 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(4_000);
    await page.goto(`${baseUrl}/seed.html`);
    await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      await draftStore.put({ id: "jpeg-marker-fixture", title: "JPEGマーカー確認", description: "", steps: [{ id: "jpeg-step", order: 1, instruction: "JPEGを追加" }], screenshots: [] });
    });
    await page.goto(`${baseUrl}/editor/editor.html#jpeg-marker-fixture`);

    const jpegDataUrl = await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 180;
      const context = canvas.getContext("2d"); context.fillStyle = "#087f7a"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#ffffff"; context.font = "bold 24px system-ui"; context.fillText("JPEG fixture", 24, 60);
      return canvas.toDataURL("image/jpeg", .82);
    });
    const jpegBytes = Buffer.from(jpegDataUrl.split(",")[1], "base64");
    assert.deepEqual([...jpegBytes.subarray(0, 2)], [0xff, 0xd8], "canvas JPEGはSOIから始まる");
    const decoratedJpeg = Buffer.concat([jpegBytes.subarray(0, 2), Buffer.from([0xff, 0xff, 0x01, 0xff]), jpegBytes.subarray(2)]);
    const input = page.locator("#step-jpeg-step .image-upload-panel input[type=file]");
    await input.setInputFiles({ name: "fill-tem.jpeg", mimeType: "image/jpeg", buffer: decoratedJpeg });
    await page.getByText("画像を端末に保存しました。公開できない情報が残っていないか確認してください。", { exact: true }).waitFor();
    const stored = await page.evaluate(async () => (await (await import("/storage/draft-store.js")).draftStore.get("jpeg-marker-fixture")));
    assert.equal(stored?.screenshots?.length, 1, "保存完了表示後にIDBへ画像が保存される");
    assert.equal(typeof stored.screenshots[0]?.dataUrl, "string");
    assert.equal(stored.screenshots[0].dataUrl.startsWith("data:image/"), true);
    const storedImage = await page.evaluate(async (dataUrl) => {
      const image = new Image(); image.src = dataUrl; await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight, dataUrl: image.src };
    }, stored.screenshots[0].dataUrl);
    assert.deepEqual({ width: storedImage.width, height: storedImage.height }, { width: 320, height: 180 }, "SOF後の寸法を保存する");
    assert.equal(storedImage.dataUrl.startsWith("data:image/png"), true, "保存時にメタデータを除いたPNGへ正規化する");
    assert.notEqual(storedImage.dataUrl, `data:image/jpeg;base64,${decoratedJpeg.toString("base64")}`, "入力JPEGのマーカー列をそのまま保存しない");

    await page.reload();
    await page.waitForFunction(() => {
      const canvas = document.querySelector("#step-jpeg-step .screenshot-canvas");
      return canvas?.width === 320 && canvas?.height === 180 && canvas?.dataset.previewRendered === "true";
    });
    const reloaded = await page.evaluate(async () => (await (await import("/storage/draft-store.js")).draftStore.get("jpeg-marker-fixture")));
    assert.equal(reloaded.screenshots[0].dataUrl, stored.screenshots[0].dataUrl, "再読込後も保存済み画像bytesを保持する");

    const assertMalformed = async (bytes, name) => {
      await input.setInputFiles({ name, mimeType: "image/jpeg", buffer: bytes });
      await page.getByText("画像の大きさを確認できませんでした。別の画像を選んでください。", { exact: true }).waitFor();
      const afterReject = await page.evaluate(async () => (await (await import("/storage/draft-store.js")).draftStore.get("jpeg-marker-fixture")));
      assert.equal(afterReject.screenshots[0].dataUrl, stored.screenshots[0].dataUrl, `${name}は保存済み画像を変更しない`);
    };
    await assertMalformed(Buffer.from([0xff, 0xd8, 0xff]), "truncated.jpeg");
    await assertMalformed(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x00]), "truncated-segment.jpeg");
    await assertMalformed(Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0a, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03]), "short-sof.jpeg");
    await assertMalformed(Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03, 0x00, 0x00, 0x00]), "mismatched-sof-components.jpeg");
    await assertMalformed(Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0c, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00]), "long-sof-components.jpeg");
    await input.setInputFiles({ name: "jpeg-as-png.png", mimeType: "image/png", buffer: jpegBytes });
    await page.locator("#step-jpeg-step .image-upload-message[data-state=error]").waitFor();
    const wrongMimeDraft = await page.evaluate(async () => (await (await import("/storage/draft-store.js")).draftStore.get("jpeg-marker-fixture")));
    assert.equal(wrongMimeDraft.screenshots[0].dataUrl, stored.screenshots[0].dataUrl, "MIMEとJPEGヘッダーが一致しない入力は保存済み画像を変更しない");
    await input.setInputFiles({ name: "renamed.gif", mimeType: "image/png", buffer: Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00\x00", "binary") });
    await page.locator("#step-jpeg-step .image-upload-message[data-state=error]").waitFor();
    const afterGifReject = await page.evaluate(async () => (await (await import("/storage/draft-store.js")).draftStore.get("jpeg-marker-fixture")));
    assert.equal(afterGifReject.screenshots[0].dataUrl, stored.screenshots[0].dataUrl, "MIME typeを偽装したGIFは保存済み画像を変更しない");
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

test("image upload keeps transparency, isolates shared replacements, and rejects oversized decoded images", { timeout: 20_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true, viewport: { width: 1024, height: 768 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(4_000);
    await page.goto(`${baseUrl}/seed.html`);
    const originalDataUrl = await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 2; canvas.height = 2;
      return canvas.toDataURL("image/png");
    });
    await page.evaluate(async ({ originalDataUrl }) => {
      const { draftStore } = await import("/storage/draft-store.js");
      await draftStore.put({
        id: "shared-image-upload-fixture",
        title: "画像差し替えの確認",
        description: "",
        steps: [
          { id: "shared-step-1", order: 1, instruction: "一つ目", screenshotId: "shared-image" },
          { id: "shared-step-2", order: 2, instruction: "二つ目", screenshotId: "shared-image" }
        ],
        screenshots: [{ id: "shared-image", dataUrl: originalDataUrl, annotations: [], masks: [] }]
      });
    }, { originalDataUrl });
    await page.goto(`${baseUrl}/editor/editor.html#shared-image-upload-fixture`);
    const input = page.locator("#step-shared-step-1 .image-upload-panel input[type=file]");
    assert.equal(await input.getAttribute("tabindex"), "-1", "ファイル選択用の補助入力をTab順から外す");
    const transparentDataUrl = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 2; canvas.height = 2;
      const context = canvas.getContext("2d");
      context.clearRect(0, 0, 2, 2);
      context.fillStyle = "rgba(8, 127, 122, .5)";
      context.fillRect(1, 1, 1, 1);
      return canvas.toDataURL("image/png");
    });
    const transparentPng = Buffer.from(transparentDataUrl.split(",")[1], "base64");
    await input.setInputFiles({ name: "transparent.png", mimeType: "image/png", buffer: transparentPng });
    await page.getByText("画像を端末に保存しました。公開できない情報が残っていないか確認してください。", { exact: true }).waitFor();
    const replaced = await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      const current = await draftStore.get("shared-image-upload-fixture");
      const image = new Image(); image.src = current.screenshots.find((item) => item.id === current.steps[0].screenshotId).dataUrl; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
      return { current, alpha: context.getImageData(0, 0, 1, 1).data[3] };
    });
    assert.notEqual(replaced.current.steps[0].screenshotId, "shared-image", "共有画像の差し替えは対象手順専用の画像に分ける");
    assert.equal(replaced.current.steps[1].screenshotId, "shared-image", "別手順の画像参照を保持する");
    assert.equal(replaced.current.screenshots.find((item) => item.id === "shared-image").dataUrl, originalDataUrl, "共有元画像を変更しない");
    assert.equal(replaced.alpha, 0, "透明PNGの透明度を保持する");

    await page.evaluate(() => {
      globalThis.__originalCreateImageBitmap = globalThis.createImageBitmap;
      globalThis.__decodeCalled = false;
      globalThis.createImageBitmap = async () => {
        globalThis.__decodeCalled = true;
        return { width: 12_001, height: 1, close() {} };
      };
    });
    await selectStep(page, "shared-step-2");
    const secondInput = page.locator("#step-shared-step-2 .image-upload-panel input[type=file]");
    const oversizedPng = Buffer.from(transparentPng);
    oversizedPng.writeUInt32BE(12_001, 16);
    await secondInput.setInputFiles({ name: "too-wide.png", mimeType: "image/png", buffer: oversizedPng });
    await page.getByText("画像の解像度が高すぎます。縦横12,000px以下、合計4,000万画素以内の画像を選んでください。", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => globalThis.__decodeCalled), false, "画像の寸法を確認できないままデコードしない");
    const afterReject = await page.evaluate(async () => (await (await import("/storage/draft-store.js")).draftStore.get("shared-image-upload-fixture")));
    assert.equal(afterReject.steps[1].screenshotId, "shared-image", "解像度超過時は下書きを変更しない");
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

test("image upload enforces draft image count and total capacity", { timeout: 20_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true, viewport: { width: 1024, height: 768 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(4_000);
    await page.goto(`${baseUrl}/seed.html`);
    const tinyPng = await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 2; canvas.height = 2;
      return canvas.toDataURL("image/png");
    });
    await page.evaluate(async ({ tinyPng }) => {
      const { draftStore } = await import("/storage/draft-store.js");
      await draftStore.put({
        id: "image-limit-fixture",
        title: "画像上限の確認",
        description: "",
        steps: [
          { id: "limit-step-1", order: 1, instruction: "一つ目", screenshotId: "image-0" },
          { id: "limit-step-2", order: 2, instruction: "二つ目", screenshotId: "image-0" }
        ],
        screenshots: Array.from({ length: 100 }, (_, index) => ({ id: `image-${index}`, dataUrl: tinyPng, annotations: [], masks: [] }))
      });
    }, { tinyPng });
    await page.goto(`${baseUrl}/editor/editor.html#image-limit-fixture`);
    const countInput = page.locator("#step-limit-step-1 .image-upload-panel input[type=file]");
    const upload = Buffer.from(tinyPng.split(",")[1], "base64");
    await countInput.setInputFiles({ name: "count-limit.png", mimeType: "image/png", buffer: upload });
    await page.getByText("画像は100件まで追加できます。", { exact: true }).waitFor();
    const countDraft = await page.evaluate(async () => (await (await import("/storage/draft-store.js")).draftStore.get("image-limit-fixture")));
    assert.equal(countDraft.screenshots.length, 100, "画像件数超過時は下書きを変更しない");

    await page.evaluate(async ({ tinyPng }) => {
      const { draftStore } = await import("/storage/draft-store.js");
      await draftStore.put({ id: "image-total-fixture", title: "画像合計サイズの確認", description: "", steps: [{ id: "total-step", order: 1, instruction: "一つ目", screenshotId: "total-image" }], screenshots: [{ id: "total-image", dataUrl: tinyPng, annotations: [], masks: [] }] });
    }, { tinyPng });
    await page.goto(`${baseUrl}/seed.html`);
    await page.goto(`${baseUrl}/editor/editor.html#image-total-fixture`);
    await page.evaluate(() => {
      globalThis.__originalReadAsDataURL = FileReader.prototype.readAsDataURL;
      FileReader.prototype.readAsDataURL = function () {
        Object.defineProperty(this, "result", { configurable: true, value: `data:image/png;base64,${"A".repeat(140_000_000)}` });
        queueMicrotask(() => this.onload?.());
      };
    });
    const totalInput = page.locator("#step-total-step .image-upload-panel input[type=file]");
    await totalInput.setInputFiles({ name: "total-limit.png", mimeType: "image/png", buffer: upload });
    await page.getByText("画像の合計サイズが大きすぎます。画像を減らすか、小さい画像を選んでください。", { exact: true }).waitFor();
    const totalDraft = await page.evaluate(async () => (await (await import("/storage/draft-store.js")).draftStore.get("image-total-fixture")));
    assert.equal(totalDraft.screenshots[0].id, "total-image", "合計サイズ超過時は元画像を保持する");
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

test("20-step image-first editor keeps selection, undo, image color and responsive controls", { timeout: 60_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true, reducedMotion: "reduce" });
    const page = await context.newPage(); page.setDefaultTimeout(5_000);
    for (const width of [1366, 1024, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const draftId = `twenty-step-unified-${width}`;
      await seedImageEditorDraft(page, baseUrl, draftId, 20);
      assert.equal(await page.locator(".step-article").count(), 1);
      const header = await page.locator(".editor-header").boundingBox();
      const preview = await page.locator(".screenshot-preview").boundingBox();
      const caption = await page.locator(".instruction-label textarea").boundingBox();
      assert.ok(header.height >= 64 && header.height <= 72, "コンパクトな固定ヘッダー");
      assert.ok(preview.y < 180 && preview.y + preview.height < 700, "画像が初期画面に収まる");
      assert.ok(caption.y < 760, "画像の下に操作文が見える");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "横方向にはみ出さない");
      if (width === 1024) assert.equal(await page.locator("#contextTools").isVisible(), false);
      if (width === 390) assert.equal(await page.locator("#stepNavigation").isVisible(), false);
      await selectStep(page, "step-17");
      await page.locator("#step-step-17 textarea").fill("17番の説明を修正");
      assert.equal(await page.locator(".step-article").getAttribute("data-step-id"), "step-17");
      await openStepMenu(page, "step-17");
      await page.getByRole("button", { name: "前へ移動", exact: true }).click();
      assert.match(await page.locator("#step-step-17 h3").textContent(), /16 \/ 20/);
      await page.keyboard.press("Control+z");
      assert.match(await page.locator("#step-step-17 h3").textContent(), /17 \/ 20/);
      await openStepMenu(page, "step-17");
      await page.locator(".step-controls .danger").click();
      assert.equal(await page.locator(".step-article").getAttribute("data-step-id"), "step-18");
      await page.keyboard.press("Control+z");
      assert.equal(await page.locator(".step-article").getAttribute("data-step-id"), "step-17");
      assert.equal(await page.locator("#step-step-17 textarea").inputValue(), "17番の説明を修正");
      if (width === 390) await page.locator("#openNavigation").click();
      await page.locator("#addStep").click();
      const addedId = await page.locator(".step-article").getAttribute("data-step-id");
      assert.notEqual(addedId, "step-17");
      assert.match(await page.locator(".step-article h3").textContent(), /18 \/ 21/);
      assert.equal(await page.locator(".instruction-label textarea").evaluate((node) => node === document.activeElement), true);
      await page.keyboard.press("Control+z");
      await selectStep(page, "step-17");
      await openImageEditor(page, "step-17");
      assert.equal(await page.locator("#imageEditorDialog").evaluate((node) => node.matches(":modal")), false, "別画面ではなく中央で画像を編集する");
      await page.locator('[data-editor-tool="rectangle"]').click();
      await dragCanvas(page, page.locator("#imageEditorCanvas"), .2, .2, .45, .4);
      await page.locator("[data-editor-color]").evaluate((node) => { node.value = "#df4a36"; node.dispatchEvent(new Event("input", { bubbles: true })); });
      await mkdir(".artifacts/unified-editor", { recursive: true });
      await page.screenshot({ path: `.artifacts/unified-editor/inline-tools-${width}.png` });
      await page.locator("[data-editor-save]").click();
      await page.locator("#imageEditorDialog").waitFor({ state: "hidden" });
      assert.equal((await readScreenshot(page, draftId, "image-17")).annotations[0].color, "#df4a36");
      assert.equal(await page.locator(".step-article").getAttribute("data-step-id"), "step-17");
      await page.screenshot({ path: `.artifacts/unified-editor/selected-step-${width}.png` });
      await page.reload();
      assert.equal(await page.locator(".step-article").getAttribute("data-step-id"), "step-17", "再読込でも選択IDを引き継ぐ");
    }
  } finally { await context?.close(); server.closeAllConnections?.(); await new Promise((resolveServer) => server.close(resolveServer)); }
});

test("output waits from file decode through IDB and blocks unreviewed or failed images", { timeout: 30_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true, viewport: { width: 1366, height: 900 } });
    const page = await context.newPage(); page.setDefaultTimeout(5_000);
    await seedImageEditorDraft(page, baseUrl, "pending-file-output", 20);
    await selectStep(page, "step-17");
    await page.evaluate(() => {
      const original = globalThis.createImageBitmap;
      globalThis.__decodeStarted = false;
      globalThis.createImageBitmap = async (...args) => { globalThis.__decodeStarted = true; await new Promise((resolve) => { globalThis.__releaseDecode = resolve; }); return original(...args); };
    });
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
    await page.locator("#detail input[type=file]").setInputFiles({ name: "safe-synthetic.png", mimeType: "image/png", buffer: png });
    await page.waitForFunction(() => globalThis.__decodeStarted);
    await page.locator("#share").click();
    assert.equal(await page.locator("#startShare").isDisabled(), true, "decode開始直後に共有が先行しない");
    assert.match(await page.locator("#outputIssues").textContent(), /手順17/);
    await captureEditorEvidence(page, "image-decode-pending-share-blocked", { operation: "share-during-delayed-image-decode", shareDisabled: await page.locator("#startShare").isDisabled(), issues: await page.locator("#outputIssues").textContent() });
    await page.locator("#cancelOutput").click();
    assert.equal(await page.locator(".step-article").getAttribute("data-step-id"), "step-17");
    await page.evaluate(() => globalThis.__releaseDecode());
    await page.waitForFunction(() => document.querySelector("#step-step-17 .image-status")?.textContent.includes("確認が必要"));
    await page.locator("#share").click();
    assert.equal(await page.locator("#startShare").isDisabled(), true, "手動画像は明示確認まで共有しない");
    await captureEditorEvidence(page, "image-needs-review-share-blocked", { operation: "share-before-image-review", shareDisabled: await page.locator("#startShare").isDisabled() });
    await page.locator("#outputIssues button").click();
    await page.getByRole("button", { name: "画像に公開できない情報がないことを確認", exact: true }).click();
    await page.locator("#share").click();
    await page.locator("#startShare:not([disabled])").waitFor();
    assert.equal(await page.locator("#startShare").isDisabled(), false);
    await page.locator("#cancelOutput").click();
    await page.locator("#detail input[type=file]").setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("broken") });
    await page.locator(".image-upload-message[data-state=error]").waitFor();
    await page.locator("#share").click();
    assert.equal(await page.locator("#startShare").isDisabled(), true, "失敗した差し替えを黙って除外しない");
    await captureEditorEvidence(page, "image-replacement-failed-share-blocked", { operation: "share-after-invalid-image-replacement", shareDisabled: await page.locator("#startShare").isDisabled(), issues: await page.locator("#outputIssues").textContent() });
    await page.locator("#outputIssues button").click();
    await page.getByRole("button", { name: "元の画像を使う", exact: true }).click();
    await page.locator("#share").click();
    await page.locator("#startShare:not([disabled])").waitFor();
    assert.equal(await page.locator("#startShare").isDisabled(), false);
    await captureEditorEvidence(page, "image-original-restored-share-ready", { operation: "explicitly-keep-original-image-after-replacement-failure", shareDisabled: await page.locator("#startShare").isDisabled() });
  } finally { await context?.close(); server.closeAllConnections?.(); await new Promise((resolveServer) => server.close(resolveServer)); }
});
