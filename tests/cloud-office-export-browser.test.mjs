import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { chromium } from "./support/test-browser.mjs";
import { CLOUD_MANUAL_CSS, CLOUD_MANUAL_JS, renderCloudManualsPage } from "../apps/worker/src/cloud-manual-assets.ts";
import { EDITOR_TOOLS_JS } from "../apps/worker/src/editor-tools-assets.ts";

const WORKER_CSP = "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; script-src 'self'; style-src 'self'";

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

async function inspectPng(page, bytes, xRatio, yRatio) {
  return page.evaluate(async ({ base64, x, y }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      pixel: [...context.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data]
    };
  }, { base64: Buffer.from(bytes).toString("base64"), x: xRatio, y: yRatio });
}

test("cloud Office actions download both formats and refuse a failed image", { timeout: 180_000 }, async () => {
  let imageBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  let assetStatus = 200;
  let assetDelayMs = 0;
  const requests = [];
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, "http://localhost").pathname;
    requests.push({ method: req.method, path });
    const send = (body, type = "application/json", status = 200) => {
      res.writeHead(status, { "content-type": type, "cache-control": "no-store", "content-security-policy": WORKER_CSP });
      res.end(type === "application/json" ? JSON.stringify(body) : body);
    };
    if (path === "/manuals") return send(renderCloudManualsPage({ workspaceId: "team" }), "text/html");
    if (path === "/assets/cloud-manual.css") return send(CLOUD_MANUAL_CSS, "text/css");
    if (path === "/assets/cloud-manual.js") return send(CLOUD_MANUAL_JS, "application/javascript");
    if (path === "/assets/editor-tools.js") return send(EDITOR_TOOLS_JS, "application/javascript");
    if (path === "/s/assets/brand/logo.png" || path === "/s/assets/brand/mascot.png") return send(imageBytes, "image/png");
    if (path === "/api/workspaces/team/manuals") return send({ manuals: [{ id: "manual", title: "Office出力確認" }] });
    if (path === "/api/workspaces/team/manuals/manual") return send({
      manual: { id: "manual", title: "Office出力確認" },
      draft: { id: "draft", title: "Office出力確認", description: "長い日本語の操作説明", updatedAt: "v1", contentVersion: "a".repeat(32) },
      steps: [{ id: "step-1", position: 1, type: "action", title: "画像付き手順", instruction: "操作を記録した画面を確認して保存します。", assetId: "asset-1", assetUrl: "/api/workspaces/team/assets/asset-1", annotations: [{ id: "mask-1", type: "rectangle", x: 0.2, y: 0.2, width: 0.2, height: 0.1, color: "#df4a36", strokeWidth: 4 }] }],
      branding: { versionId: null, themeColor: "#087f7a", foregroundColor: "#ffffff", logoId: null, logoUrl: null },
      permissions: { canEdit: true }
    });
    if (path === "/api/workspaces/team/manuals/manual/share-links") return send({ share: null });
    if (path === "/api/workspaces/team/assets/asset-1") {
      if (assetDelayMs) await new Promise((resolve) => setTimeout(resolve, assetDelayMs));
      return assetStatus === 200 ? send(imageBytes, "image/png") : send({ message: "asset failed" }, "application/json", assetStatus);
    }
    send({ message: "not found" }, "application/json", 404);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ channel: process.platform === "win32" ? "chrome" : "chromium", headless: true });
    const seed = await browser.newPage();
    await seed.goto(origin + "/manuals");
    imageBytes = Buffer.from(await seed.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 360;
      const context = canvas.getContext("2d"); context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#087f7a"; context.fillRect(0, 0, canvas.width, 50); context.fillStyle = "#ffffff"; context.font = "24px sans-serif"; context.fillText("Office export canary", 20, 34);
      context.fillStyle = "#111827"; context.fillRect(canvas.width * 0.25, canvas.height * 0.25, canvas.width * 0.1, canvas.height * 0.1);
      return canvas.toDataURL("image/png").split(",")[1];
    }), "base64");
    await seed.close();
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, locale: "ja-JP" });
    await page.goto(origin + "/manuals");
    await page.getByRole("button", { name: /Office出力確認/ }).click();
    const word = page.getByRole("button", { name: /Word/ });
    const powerpoint = page.getByRole("button", { name: /PowerPoint/ });
    await word.waitFor();
    await page.locator("[data-step-add]").click();
    await page.locator(".manual-step-center textarea").fill("画像がない手順も本文を出力します。");
    const wordDownload = await Promise.all([page.waitForEvent("download"), word.click()]);
    const wordBytes = await readFile(await wordDownload[0].path());
    assert.equal(wordBytes.subarray(0, 2).toString(), "PK");
    assert.ok(wordBytes.includes(Buffer.from("Office", "utf8")), "DOCX keeps the title/body text");
    assert.ok(wordBytes.includes(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "DOCX keeps the edited PNG image");
    const wordEntries = zipEntries(wordBytes);
    const wordImage = await inspectPng(page, wordEntries.get("word/media/image1.png"), 0.3, 0.27);
    assert.deepEqual({ width: wordImage.width, height: wordImage.height }, { width: 640, height: 360 }, "DOCX keeps the source PNG dimensions");
    assert.deepEqual(wordImage.pixel.slice(0, 3), [17, 24, 39], "DOCX keeps the masked image pixel");
    assert.equal([...wordEntries.keys()].filter((name) => /^word\/media\/image\d+\.png$/u.test(name)).length, 1, "text-only steps do not create a fake image");
    assert.match(await page.locator("#cloud-message").textContent(), /Word/);
    const powerpointDownload = await Promise.all([page.waitForEvent("download"), powerpoint.click()]);
    const powerpointBytes = await readFile(await powerpointDownload[0].path());
    assert.equal(powerpointBytes.subarray(0, 2).toString(), "PK");
    assert.ok(powerpointBytes.includes(Buffer.from("Office", "utf8")), "PPTX keeps the title/body text");
    assert.ok(powerpointBytes.includes(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "PPTX keeps the edited PNG image");
    const powerpointEntries = zipEntries(powerpointBytes);
    const powerpointImage = await inspectPng(page, powerpointEntries.get("ppt/media/image1.png"), 0.3, 0.27);
    assert.deepEqual({ width: powerpointImage.width, height: powerpointImage.height }, { width: 640, height: 360 }, "PPTX keeps the source PNG dimensions");
    assert.deepEqual(powerpointImage.pixel.slice(0, 3), [17, 24, 39], "PPTX keeps the masked image pixel");
    assert.equal([...powerpointEntries.keys()].filter((name) => /^ppt\/media\/image\d+\.png$/u.test(name)).length, 1, "text-only steps do not create a fake image");
    assert.match(await page.locator("#cloud-message").textContent(), /PowerPoint/);
    assetStatus = 404;
    await word.click();
    await page.locator("#cloud-message").filter({ hasText: "画像を読み込めない" }).waitFor();
    assert.match(await page.locator("#cloud-message").textContent(), /書き出しませんでした/);
    assetStatus = 200;
    assetDelayMs = 100;
    await word.click();
    await page.locator(".manual-title").fill("編集中のタイトル");
    await page.locator("#cloud-message").filter({ hasText: "編集中の内容が変わったため" }).waitFor();
    assetDelayMs = 0;

    let oversizedArrayBufferCalls = 0;
    await page.evaluate(() => {
      const original = HTMLCanvasElement.prototype.toBlob;
      window.__restoreCloudOfficeToBlob = () => { HTMLCanvasElement.prototype.toBlob = original; };
      HTMLCanvasElement.prototype.toBlob = function oversizedToBlob(callback) {
        callback({ size: 64 * 1024 * 1024 + 1, arrayBuffer: async () => { window.__oversizedArrayBufferCalls = (window.__oversizedArrayBufferCalls || 0) + 1; throw new Error("arrayBuffer must not run"); } });
      };
      window.__oversizedArrayBufferCalls = 0;
    });
    let oversizedDownloads = 0;
    const countOversizedDownload = () => { oversizedDownloads += 1; };
    page.on("download", countOversizedDownload);
    await word.click();
    await page.locator("#cloud-message").filter({ hasText: "画像容量が大きいため" }).waitFor();
    assert.equal(oversizedDownloads, 0, "oversized rendered images do not trigger a cloud download");
    oversizedArrayBufferCalls = await page.evaluate(() => window.__oversizedArrayBufferCalls);
    assert.equal(oversizedArrayBufferCalls, 0, "cloud oversized rendered images fail before arrayBuffer");
    page.off("download", countOversizedDownload);
    await page.evaluate(() => window.__restoreCloudOfficeToBlob?.());
    const recoveredDownload = await Promise.all([page.waitForEvent("download"), word.click()]);
    assert.equal((await readFile(await recoveredDownload[0].path())).subarray(0, 2).toString(), "PK", "cloud Office export can be retried after a capacity failure");
    assert.equal(requests.some(({ method }) => method !== "GET"), false, "cloud Office export does not issue writes");
    assert.equal(requests.some(({ path }) => path.includes("token") || path.includes("secret")), false, "cloud Office export does not expose secret-like values in asset URLs");
    await page.close();
  } finally {
    await browser?.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
