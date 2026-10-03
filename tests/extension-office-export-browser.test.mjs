import assert from "node:assert/strict";
import { mkdir, stat, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve, sep } from "node:path";
import test from "node:test";
import { chromium } from "./support/test-browser.mjs";

const extensionRoot = resolve(fileURLToPath(new URL("../apps/extension/", import.meta.url)));

function serveExtension() {
  const requests = [];
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url || "/", "http://127.0.0.1").pathname;
    requests.push({ method: request.method, pathname });
    if (pathname === "/seed.html") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<!doctype html><meta charset='utf-8'><title>seed</title>");
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
      if (filePath.endsWith("apps\\extension\\export\\office-export.js") && server.officeModuleDelayMs) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, server.officeModuleDelayMs));
      }
      const contentType = filePath.endsWith(".html")
        ? "text/html; charset=utf-8"
        : filePath.endsWith(".js")
          ? "text/javascript; charset=utf-8"
          : filePath.endsWith(".css")
            ? "text/css; charset=utf-8"
            : "application/octet-stream";
      response.writeHead(200, { "content-type": contentType });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  server.requests = requests;
  server.officeModuleDelayMs = 0;
  return server;
}

function zipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = new Map();
  let cursor = 0;
  while (cursor + 4 <= bytes.length) {
    const signature = view.getUint32(cursor, true);
    if (signature === 0x04034b50) {
      const compressedLength = view.getUint32(cursor + 18, true);
      const nameLength = view.getUint16(cursor + 26, true);
      const extraLength = view.getUint16(cursor + 28, true);
      const nameStart = cursor + 30;
      const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength));
      const bodyStart = nameStart + nameLength + extraLength;
      entries.set(name, bytes.subarray(bodyStart, bodyStart + compressedLength));
      cursor = bodyStart + compressedLength;
      continue;
    }
    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    throw new Error(`unexpected ZIP signature 0x${signature.toString(16)}`);
  }
  return entries;
}

function entryText(entries, name) {
  return new TextDecoder().decode(entries.get(name));
}

async function seedDraft(page, baseUrl, draftId) {
  await page.goto(`${baseUrl}/seed.html`);
  return page.evaluate(async (id) => {
    const screenshots = [];
    const steps = [];
    for (let index = 1; index <= 20; index += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = index % 2 ? 1200 : 660;
      canvas.height = index % 2 ? 660 : 1200;
      const context = canvas.getContext("2d");
      context.fillStyle = index % 2 ? "#e9f6f7" : "#f4f0fa";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#173d46";
      context.font = "bold 32px sans-serif";
      context.fillText(`操作手順 ${index}（架空）`, 32, 56);
      context.font = "24px sans-serif";
      context.fillText("顧客名: 山田花子（架空）", 32, 102);
      context.fillText(`受付番号: DEMO-${String(index).padStart(3, "0")}`, 32, 140);
      context.fillStyle = "#087f7a";
      context.fillRect(canvas.width * 0.62, canvas.height * 0.18, canvas.width * 0.2, canvas.height * 0.12);
      screenshots.push({
        id: `image-${index}`,
        dataUrl: canvas.toDataURL("image/png"),
        masks: [{ id: `mask-${index}`, x: 0.6, y: 0.16, width: 0.24, height: 0.16 }]
      });
      steps.push({ id: `step-${index}`, order: index, instruction: `手順 ${index} の操作を確認して保存します。`, screenshotId: `image-${index}` });
    }
    const { draftStore } = await import("/storage/draft-store.js");
    await draftStore.put({ id, title: "ローカルOffice出力の確認", description: "20手順の編集済み画像を端末へ保存します。", steps, screenshots });
    return { sourceDataUrl: screenshots[0].dataUrl };
  }, draftId);
}

async function captureEvidence(page, name) {
  const directory = ".artifacts/unified-editor";
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true });
}

async function downloadBytes(page, button) {
  const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
  return readFile(await download.path());
}

async function pixelAt(page, bytes, xRatio, yRatio) {
  return page.evaluate(async ({ values, xRatio: x, yRatio: y }) => {
    const blob = new Blob([Uint8Array.from(values)], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d").drawImage(image, 0, 0);
      const point = canvas.getContext("2d").getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data;
      return [...point];
    } finally {
      URL.revokeObjectURL(url);
    }
  }, { values: [...bytes], xRatio, yRatio });
}

test("local extension editor downloads 20 edited images to Word and PowerPoint without SSO", { timeout: 180_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const draftId = "extension-office-browser-fixture";
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true, viewport: { width: 1366, height: 900 }, locale: "ja-JP" });
    const page = await context.newPage();
    page.setDefaultTimeout(8_000);
    const { sourceDataUrl } = await seedDraft(page, baseUrl, draftId);
    await page.goto(`${baseUrl}/editor/editor.html#${draftId}`);
    await page.waitForFunction(() => document.querySelectorAll('.step-image-status[data-state="ready"]').length === 20);
    await captureEvidence(page, "office-extension-editor-1366");
    await page.locator(".office-actions").evaluate((details) => { details.open = true; });
    await captureEvidence(page, "office-extension-header-menu-1366");
    await page.setViewportSize({ width: 390, height: 844 });
    const headerMenu = page.locator(".header-office-menu");
    const headerSummary = page.locator(".office-actions > summary");
    await page.locator(".office-actions").evaluate((details) => { details.open = true; });
    const headerMenuBox = await headerMenu.boundingBox();
    assert.ok(headerMenuBox && headerMenuBox.x >= 0 && headerMenuBox.y >= 0 && headerMenuBox.x + headerMenuBox.width <= 390 && headerMenuBox.y + headerMenuBox.height <= 844, "390pxの書き出しメニューが画面内に収まる");
    await captureEvidence(page, "office-extension-header-menu-390");
    await page.locator(".office-actions").evaluate((details) => { details.open = false; });
    await page.setViewportSize({ width: 1366, height: 900 });

    // Exercise the real image editor before export so at least one output pixel
    // is changed through the editor path, while all twenty references remain.
    await page.locator("#step-step-1 .image-edit-button").click();
    await page.locator("#imageEditorDialog").waitFor({ state: "visible" });
    await captureEvidence(page, "office-extension-image-editor-1366");
    await page.locator('[data-editor-tool="replacement"]').click();
    await page.keyboard.press("Enter");
    await page.locator('[data-editor-selection] button').first().waitFor({ state: "visible" });
    await captureEvidence(page, "office-extension-replacement-1366");
    await page.setViewportSize({ width: 390, height: 844 });
    await captureEvidence(page, "office-extension-replacement-390");
    await page.locator('[data-replacement-action="add"]').evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
    await captureEvidence(page, "office-extension-replacement-390-controls");
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.locator("[data-editor-save]").click();
    await page.locator("#imageEditorDialog").waitFor({ state: "hidden" });
    await page.waitForFunction(() => document.querySelectorAll('.step-image-status[data-state="ready"]').length === 20);

    const officeDetails = page.locator(".office-actions");
    await officeDetails.locator("summary").click();
    const word = page.locator("#exportWord");
    const powerpoint = page.locator("#exportPowerPoint");
    assert.equal(await word.isVisible(), true);
    assert.equal(await powerpoint.isVisible(), true);
    assert.equal(await page.locator("#outputGate").isVisible(), false, "local Office output must not open the cloud gate");

    const wordBytes = await downloadBytes(page, word);
    const wordEntries = zipEntries(wordBytes);
    const wordImages = [...wordEntries.keys()].filter((name) => /^word\/media\/image\d+\.(png|jpeg)$/u.test(name));
    assert.equal(wordImages.length, 20, "Word keeps every referenced image");
    assert.match(entryText(wordEntries, "word/document.xml"), /20手順/u);
    assert.match(entryText(wordEntries, "word/document.xml"), /手順 20/u);
    assert.notDeepEqual([...wordEntries.get("word/media/image1.png")], [...Buffer.from(sourceDataUrl.split(",")[1], "base64")], "Word receives pixels different from the original capture");
    const wordMaskPixel = await pixelAt(page, wordEntries.get("word/media/image1.png"), 0.7, 0.22);
    assert.deepEqual(wordMaskPixel.slice(0, 3), [17, 24, 39], "Word receives the flattened mask pixel");

    const powerpointBytes = await downloadBytes(page, powerpoint);
    const powerpointEntries = zipEntries(powerpointBytes);
    const powerpointImages = [...powerpointEntries.keys()].filter((name) => /^ppt\/media\/image\d+\.(png|jpeg)$/u.test(name));
    assert.equal(powerpointImages.length, 20, "PowerPoint keeps every referenced image");
    assert.match(entryText(powerpointEntries, "ppt/slides/slide20.xml"), /手順 20/u);
    const powerpointMaskPixel = await pixelAt(page, powerpointEntries.get("ppt/media/image1.png"), 0.7, 0.22);
    assert.deepEqual(powerpointMaskPixel.slice(0, 3), [17, 24, 39], "PowerPoint receives the flattened mask pixel");
    assert.equal(server.requests.some(({ method }) => method !== "GET"), false, "local Office export does not issue writes");
    assert.equal(server.requests.some(({ pathname }) => pathname.startsWith("/api/")), false, "local Office export does not call cloud APIs");

    // An image that is still being prepared blocks output with a retryable message.
    await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      const draft = await draftStore.get("extension-office-browser-fixture");
      draft.steps[19].imageState = { status: "queued", reason: null, attempts: 1, version: 1 };
      await draftStore.put(draft);
    });
    await page.reload();
    await page.waitForFunction(async () => (await (await import("/storage/draft-store.js")).draftStore.get("extension-office-browser-fixture"))?.steps?.[19]?.imageState?.status === "unavailable");
    await page.locator(".office-actions").evaluate((details) => { details.open = true; });
    let unreadyDownloads = 0;
    const countUnreadyDownload = () => { unreadyDownloads += 1; };
    page.on("download", countUnreadyDownload);
    await page.locator("#exportWord").click();
    await page.locator("#officeExportStatus[data-state=warning]").waitFor();
    assert.match(await page.locator("#officeExportStatus").textContent(), /準備中|要確認/u);
    assert.equal(unreadyDownloads, 0, "unready images do not trigger a download");
    page.off("download", countUnreadyDownload);

    await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      const draft = await draftStore.get("extension-office-browser-fixture");
      delete draft.steps[19].imageState;
      await draftStore.put(draft);
    });
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('.step-image-status[data-state="ready"]').length === 20);

    // Changing the title while the first dynamic Office module load is pending
    // must be rejected before any stale package is downloaded.
    await page.locator(".office-actions > summary").click();
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('.step-image-status[data-state="ready"]').length === 20);
    await page.locator(".office-actions > summary").click();
    server.officeModuleDelayMs = 300;
    let delayedImportDownloads = 0;
    const countDelayedImportDownload = () => { delayedImportDownloads += 1; };
    page.on("download", countDelayedImportDownload);
    await page.locator("#exportWord").click();
    await page.waitForFunction(() => document.querySelector("#officeExportStatus")?.textContent?.includes("作成") === true);
    await page.locator("#title").fill("dynamic import待機中の変更");
    await page.locator("#officeExportStatus[data-state=warning]").waitFor();
    assert.equal(delayedImportDownloads, 0, "async import待機中の変更はダウンロードしない");
    page.off("download", countDelayedImportDownload);
    server.officeModuleDelayMs = 0;

    // Delay the real canvas encoding, mutate the title during export, and verify
    // the snapshot guard refuses the stale package before a retry succeeds.
    await page.locator(".office-actions").evaluate((details) => { details.open = true; });
    await page.evaluate(() => {
      const original = HTMLCanvasElement.prototype.toBlob;
      window.__restoreOfficeToBlob = () => { HTMLCanvasElement.prototype.toBlob = original; };
      HTMLCanvasElement.prototype.toBlob = function delayedToBlob(...args) { setTimeout(() => original.apply(this, args), 25); };
    });
    let changedDownloads = 0;
    const countChangedDownload = () => { changedDownloads += 1; };
    page.on("download", countChangedDownload);
    await page.locator("#exportWord").click();
    await page.waitForFunction(() => document.querySelector("#officeExportStatus")?.textContent?.includes("作成") === true);
    await page.locator("#title").fill("編集中に変更したタイトル");
    await page.locator("#officeExportStatus[data-state=warning]").waitFor();
    assert.match(await page.locator("#officeExportStatus").textContent(), /内容が変わった|中止/u);
    assert.equal(changedDownloads, 0, "changed snapshots do not trigger a download");
    page.off("download", countChangedDownload);
    await page.evaluate(() => window.__restoreOfficeToBlob?.());

    const retryBytes = await downloadBytes(page, page.locator("#exportWord"));
    assert.equal(zipEntries(retryBytes).get("word/media/image20.png")?.length > 0, true, "retry exports the final image");
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});
