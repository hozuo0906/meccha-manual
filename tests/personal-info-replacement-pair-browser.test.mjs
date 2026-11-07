import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve, sep } from "node:path";
import test from "node:test";
import { chromium } from "./support/test-browser.mjs";

const extensionRoot = resolve(fileURLToPath(new URL("../apps/extension/", import.meta.url)));

function serveExtension() {
  return createServer(async (request, response) => {
    const pathname = new URL(request.url || "/", "http://127.0.0.1").pathname;
    const relativePath = decodeURIComponent(pathname.replace(/^\/+/, ""));
    const filePath = resolve(extensionRoot, relativePath);
    if (filePath !== extensionRoot && !filePath.startsWith(`${extensionRoot}${sep}`)) {
      response.writeHead(404).end();
      return;
    }
    try {
      const info = await stat(filePath);
      if (!info.isFile()) throw new Error("not a file");
      response.setHeader("Content-Type", filePath.endsWith(".html") ? "text/html; charset=utf-8" : filePath.endsWith(".js") ? "text/javascript; charset=utf-8" : "application/octet-stream");
      response.end(await readFile(filePath));
    } catch {
      response.writeHead(404).end();
    }
  });
}

test("browser reload restores a synthetic pair and keyboard selection aligns name and kana", { timeout: 30_000 }, async () => {
  const server = serveExtension();
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true, viewport: { width: 1200, height: 800 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(6_000);
    await page.goto(`${baseUrl}/editor/editor.html#pair-browser-fixture`);
    await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 640; canvas.height = 360;
      const context = canvas.getContext("2d"); context.fillStyle = "#eef8fa"; context.fillRect(0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png");
      const { draftStore } = await import("/storage/draft-store.js");
      await draftStore.put({
        id: "pair-browser-fixture", title: "合成人物確認", description: "", steps: [{ id: "pair-step", order: 1, instruction: "人物を確認", screenshotId: "pair-image" }],
        screenshots: [{ id: "pair-image", dataUrl, annotations: [
          { id: "pair-name", type: "replacement", category: "name", x: .1, y: .1, width: .3, height: .1, text: "高橋一郎" },
          { id: "pair-kana", type: "replacement", category: "kana", x: .1, y: .22, width: .3, height: .1, text: "タカハシイチロウ" }
        ], masks: [] }]
      });
    });
    await page.reload();
    await page.locator("#step-pair-step .image-edit-button").click();
    await page.locator("#imageEditorDialog").waitFor({ state: "visible" });
    await page.locator('[data-editor-tool="replacement"]').click();
    const person = page.locator("[data-editor-replacement-person]");
    assert.equal(await person.inputValue(), "0");
    await person.focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    assert.equal(await person.inputValue(), "1");
    await page.locator("[data-editor-save]").click();
    await page.waitForFunction(() => !document.querySelector("#imageEditorDialog")?.open);
    await page.reload();
    const persisted = await page.evaluate(async () => (await (await import("/storage/draft-store.js")).draftStore.get("pair-browser-fixture")).screenshots[0].annotations);
    assert.deepEqual(persisted.map(({ category, text }) => ({ category, text })), [
      { category: "name", text: "佐藤直子" },
      { category: "kana", text: "サトウナオコ" }
    ]);
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((done) => server.close(done));
  }
});
