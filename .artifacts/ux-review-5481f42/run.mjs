import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve, sep, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const extensionRoot = resolve(root, "apps/extension");
const outDir = resolve(root, ".artifacts/ux-review-5481f42");
const sha = process.env.UX_REVIEW_SHA || "5481f426207816b3699bd36d2409405684122b07";
const viewports = [{ width: 1366, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }];

function serveExtension() {
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url || "/", "http://127.0.0.1").pathname;
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
      const contentType = filePath.endsWith(".html") ? "text/html; charset=utf-8"
        : filePath.endsWith(".js") ? "text/javascript; charset=utf-8"
          : filePath.endsWith(".css") ? "text/css; charset=utf-8" : "application/octet-stream";
      response.writeHead(200, { "content-type": contentType });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  return server;
}

async function seedDraft(page, baseUrl, draftId) {
  await page.goto(`${baseUrl}/seed.html`);
  await page.evaluate(async (id) => {
    const canvas = document.createElement("canvas");
    canvas.width = 960; canvas.height = 540;
    const context = canvas.getContext("2d");
    context.fillStyle = "#eef8fa"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#173d46"; context.font = "bold 30px system-ui";
    context.fillText("操作記録の画像", 72, 100);
    const { draftStore } = await import("/storage/draft-store.js");
    await draftStore.put({ id, title: "画像編集のUX確認", description: "synthetic画像による独立評価", steps: [{ id: "step-1", order: 1, instruction: "最初の操作を確認", screenshotId: "image-1" }], screenshots: [{ id: "image-1", dataUrl: canvas.toDataURL("image/png"), annotations: [], masks: [] }] });
  }, draftId);
  await page.goto(`${baseUrl}/editor/editor.html#${draftId}`);
  await page.locator("#steps button").first().waitFor();
}

async function drag(page, selector, from, to) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box, `bounding box missing: ${selector}`);
  const point = ([x, y]) => ({ x: box.x + box.width * x, y: box.y + box.height * y });
  await page.mouse.move(point(from).x, point(from).y);
  await page.mouse.down();
  await page.mouse.move(point(to).x, point(to).y, { steps: 5 });
  await page.mouse.up();
}

async function collectMetrics(page) {
  return page.evaluate(() => {
    const visible = (element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; };
    const controls = [...document.querySelectorAll("button, input:not([type=file]), textarea, select")].filter(visible);
    const heights = controls.map((element) => ({ tag: element.tagName.toLowerCase(), id: element.id || "", text: element.textContent?.trim() || element.getAttribute("aria-label") || "", height: Math.round(element.getBoundingClientRect().height * 100) / 100 }));
    const modal = document.querySelector("#imageEditorDialog");
    return {
      h1Count: document.querySelectorAll("h1").length,
      heading: document.querySelector("h1")?.textContent?.trim() || null,
      headingId: document.querySelector("h1")?.id || null,
      headingTabIndex: document.querySelector("h1")?.getAttribute("tabindex") || null,
      activeId: document.activeElement?.id || null,
      activeRole: document.activeElement?.getAttribute("role") || null,
      controlsUnder44: heights.filter((item) => item.height < 44),
      minControlHeight: Math.min(...heights.map((item) => item.height)),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1,
      modalOverflowX: modal ? modal.scrollWidth > modal.clientWidth + 1 : false,
      modalOverflowY: modal ? modal.scrollHeight > modal.clientHeight + 1 : false,
      viewport: { width: innerWidth, height: innerHeight }
    };
  });
}

async function launchWithRetry(viewport, profileDir) {
  let firstError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return { context: await chromium.launchPersistentContext(profileDir, { channel: "chrome", headless: true, viewport, reducedMotion: "reduce", colorScheme: "light" }), attempts: attempt, firstError: firstError?.message || null };
    } catch (error) {
      firstError ||= error;
      if (attempt === 2) throw error;
    }
  }
  throw firstError;
}

async function readDraft(page, id) {
  return page.evaluate(async (draftId) => (await (await import("/storage/draft-store.js")).draftStore.get(draftId)), id);
}

const server = serveExtension();
await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const results = [];
try {
  for (const viewport of viewports) {
    const key = `${viewport.width}x${viewport.height}`;
    const profileDir = join(outDir, "profiles", key);
    await mkdir(profileDir, { recursive: true });
    const launch = await launchWithRetry(viewport, profileDir);
    const context = launch.context;
    const page = await context.newPage();
    page.setDefaultTimeout(8_000);
    const draftId = `ux-review-${viewport.width}-${viewport.height}`;
    const result = { viewport, launchAttempts: launch.attempts, firstLaunchError: launch.firstError, pass: true, defects: [], metrics: {} };
    try {
      await seedDraft(page, baseUrl, draftId);
      result.metrics.initial = await collectMetrics(page);
      await page.screenshot({ path: join(outDir, "screens", `${key}-editor.png`), fullPage: false });
      await page.locator("#addStep").click();
      await page.waitForFunction(() => document.querySelectorAll(".step-article").length >= 2);
      await page.locator(".step-article").last().locator("textarea").fill("追加した手順を確認");
      result.metrics.stepsAfterAdd = await page.locator(".step-article").count();
      await page.locator("#step-step-1 .image-edit-button").click();
      await page.locator("#imageEditorDialog").waitFor({ state: "visible" });
      result.metrics.modal = await collectMetrics(page);
      await page.screenshot({ path: join(outDir, "screens", `${key}-image-editor-before.png`), fullPage: false });
      await page.locator('[data-editor-tool="text"]').click();
      await drag(page, "#imageEditorCanvas", [.08, .08], [.08, .08]);
      await page.locator("[data-editor-text]").fill("確認文字");
      await page.locator('[data-editor-tool="rectangle"]').click();
      await drag(page, "#imageEditorCanvas", [.15, .3], [.38, .52]);
      await page.locator('[data-editor-tool="mask"]').click();
      await drag(page, "#imageEditorCanvas", [.55, .18], [.75, .32]);
      await page.locator("[data-editor-save]").click();
      await page.locator("#imageEditorDialog").waitFor({ state: "hidden" });
      const saved = await readDraft(page, draftId);
      result.metrics.saved = { annotations: saved.screenshots[0].annotations.length, masks: saved.screenshots[0].masks.length, text: saved.screenshots[0].annotations.find((item) => item.type === "text")?.text || null };
      await page.locator("#step-step-1 .image-edit-button").click();
      await page.locator("#imageEditorDialog").waitFor({ state: "visible" });
      const beforeCancel = await readDraft(page, draftId);
      await page.locator('[data-editor-tool="ellipse"]').click();
      await drag(page, "#imageEditorCanvas", [.78, .6], [.92, .78]);
      await page.locator("[data-editor-cancel]").first().click();
      await page.locator("#imageEditorDialog").waitFor({ state: "hidden" });
      const afterCancel = await readDraft(page, draftId);
      result.metrics.cancelPreserved = JSON.stringify(beforeCancel.screenshots[0]) === JSON.stringify(afterCancel.screenshots[0]);
      await page.reload();
      await page.locator("#steps button").first().waitFor();
      result.metrics.reloadHeadingFocus = await page.evaluate(() => document.activeElement?.id || null);
      await page.locator("#step-step-1 .image-edit-button").click();
      await page.locator("#imageEditorDialog").waitFor({ state: "visible" });
      const reloaded = await readDraft(page, draftId);
      result.metrics.reloadPreserved = { annotations: reloaded.screenshots[0].annotations.length, masks: reloaded.screenshots[0].masks.length };
      await page.screenshot({ path: join(outDir, "screens", `${key}-image-editor-after-reload.png`), fullPage: false });
      await page.locator("[data-editor-cancel]").first().click();
      result.metrics.final = await collectMetrics(page);
      const under44 = [...(result.metrics.initial.controlsUnder44 || []), ...(result.metrics.modal.controlsUnder44 || [])];
      if (result.metrics.initial.h1Count !== 1) result.defects.push({ severity: "P2", id: "heading-missing", detail: "編集画面にページ見出しh1がありません" });
      if (result.metrics.stepsAfterAdd !== 2) result.defects.push({ severity: "P1", id: "step-add", detail: "手順追加後の件数が2件になりません" });
      if (result.metrics.saved.annotations !== 2 || result.metrics.saved.masks !== 1) result.defects.push({ severity: "P1", id: "image-edit-save", detail: "文字・図形・黒塗りの保存値が期待値と一致しません" });
      if (!result.metrics.cancelPreserved) result.defects.push({ severity: "P1", id: "image-edit-cancel", detail: "キャンセルで未保存編集が破棄されません" });
      if (result.metrics.reloadPreserved.annotations !== 2 || result.metrics.reloadPreserved.masks !== 1) result.defects.push({ severity: "P1", id: "image-edit-reload", detail: "再読み込み後に画像編集内容が保持されません" });
      if (result.metrics.initial.horizontalOverflow || result.metrics.final.horizontalOverflow) result.defects.push({ severity: "P2", id: "horizontal-overflow", detail: "viewport幅を超える横スクロールがあります" });
      if (under44.length) result.defects.push({ severity: "P2", id: "control-target", detail: `${under44.length}個の可視操作要素が44px未満です` });
      result.pass = result.defects.length === 0;
    } catch (error) {
      result.pass = false;
      result.defects.push({ severity: "P1", id: "evaluation-error", detail: error.message });
    } finally {
      await context.close();
    }
    results.push(result);
  }
} finally {
  server.closeAllConnections?.();
  await new Promise((resolveServer) => server.close(resolveServer));
}

const metadata = { generatedAt: new Date().toISOString(), timezone: "Asia/Tokyo", sourceSha: sha, browser: "Chrome channel (Playwright)", syntheticDataOnly: true, viewports };
await writeFile(join(outDir, "metadata.json"), JSON.stringify(metadata, null, 2) + "\n");
await writeFile(join(outDir, "metrics.json"), JSON.stringify(results, null, 2) + "\n");
const defects = results.flatMap((result) => result.defects.map((defect) => ({ viewport: result.viewport, ...defect })));
const score = defects.some((defect) => defect.severity === "P0" || defect.severity === "P1") ? 0 : defects.some((defect) => defect.severity === "P2") ? 4 : 5;
const report = [`# 独立UI/UX評価`, ``, `- 対象SHA: \`${sha}\``, `- 実施日時: ${metadata.generatedAt}`, `- ブラウザ: ${metadata.browser}`, `- 合否: ${score === 5 ? "PASS" : "FAIL"}`, `- 評点: ${score}/5`, `- synthetic画像のみ: ${metadata.syntheticDataOnly ? "確認済み" : "未確認"}`, ``, `## viewport別結果`, ``, ...results.map((result) => `- ${result.viewport.width}x${result.viewport.height}: ${result.pass ? "PASS" : "FAIL"}（起動試行${result.launchAttempts}回、欠陥${result.defects.length}件）`), ``, `## 欠陥`, ``, ...(defects.length ? defects.map((defect) => `- [${defect.severity}] ${defect.id} (${defect.viewport.width}x${defect.viewport.height}): ${defect.detail}`) : ["- なし"]), ``, `metrics.json と screens/ に実測値・スクリーンショットを保存した。`, ``].join("\n");
await writeFile(join(outDir, "report.md"), report);
console.log(JSON.stringify({ score, pass: score === 5, sourceSha: sha, results, defects }, null, 2));
