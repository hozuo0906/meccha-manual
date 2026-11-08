import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import test from "node:test";
import worker from "../apps/worker/src/index.ts";
import { chromium } from "./support/test-browser.mjs";
import { CLOUD_MANUAL_CSS, CLOUD_MANUAL_JS, renderCloudManualsPage } from "../apps/worker/src/cloud-manual-assets.ts";
import { MANUAL_SAMPLE_DETAIL, MANUAL_SAMPLE_IMAGE_PATHS } from "../apps/worker/src/manual-sample-assets.ts";

const origin = "https://meccha-manual-staging.meccha-iiyatsu.com";

test("unauthenticated sample edits only in memory, resets fixture and sends zero API requests at three widths", { timeout: 120_000 }, async () => {
  const browser = await chromium.launch({ channel: "chromium", headless: true });
  const storageCalls = [];
  const deny = () => { storageCalls.push("business storage"); throw new Error("unexpected business storage access"); };
  const env = {
    APP_ENV: "staging", APP_BASE_URL: origin,
    GOOGLE_OIDC_CLIENT_ID: "sample-browser-test", GOOGLE_OIDC_CLIENT_SECRET: "synthetic-secret",
    DB: { prepare: deny, batch: deny }, MANUAL_ASSETS: { get: deny, put: deny },
    ONBOARDING_RATE_LIMITER: { limit: deny },
    ASSETS: { async fetch(request) {
      const path = new URL(request.url).pathname;
      if (!Object.values(MANUAL_SAMPLE_IMAGE_PATHS).includes(path)) return new Response(null, { status: 404 });
      return new Response(await readFile(new URL(`../apps/worker/brand-assets${path}`, import.meta.url)), { headers: { "content-type": "image/png" } });
    } }
  };
  try {
    for (const [width, height] of [[1366, 900], [1024, 768], [390, 844]]) {
      const page = await browser.newPage({ viewport: { width, height }, locale: "ja-JP" });
      page.setDefaultTimeout(7000);
      const writes = [], apiReads = [], errors = [], violations = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => {
        if (!new URL(request.url()).pathname.startsWith("/api/")) return;
        (request.method() === "GET" || request.method() === "HEAD" ? apiReads : writes).push(request.method() + " " + new URL(request.url()).pathname);
      });
      await page.exposeFunction("recordCspViolation", (directive) => violations.push(directive));
      await page.addInitScript(() => addEventListener("securitypolicyviolation", (event) => window.recordCspViolation(event.violatedDirective)));
      await page.route(origin + "/**", async (route) => {
        const request = route.request();
        const result = await worker.fetch(new Request(request.url(), { method: request.method(), headers: request.headers(), ...(request.postDataBuffer() ? { body: request.postDataBuffer() } : {}) }), env, {});
        await route.fulfill({ status: result.status, headers: Object.fromEntries(result.headers), body: new URL(request.url()).pathname === "/assets/manual-sample.js"
          ? (await result.text()).replace('  const librarySettings=', '  globalThis.sampleSnapshot = () => JSON.parse(JSON.stringify({ editorState, dirty, undo: undoStack.length, redo: redoStack.length }));\n  const librarySettings=')
          : Buffer.from(await result.arrayBuffer()) });
      });
      const response = await page.goto(origin + "/manuals/sample?shareManualId=ignored");
      assert.equal(response.status(), 200);
      const badge = page.locator(".cloud-save-state");
      await badge.filter({ hasText: "サンプル・保存されません" }).waitFor();
      assert.equal(await page.locator("#cloud-manuals").getAttribute("data-workspace-id"), "");
      assert.equal(await page.getByLabel("タイトル", { exact: true }).inputValue(), MANUAL_SAMPLE_DETAIL.draft.title);
      const openSteps = async () => { if (width <= 760) await page.locator(".manual-mobile-actions").getByRole("button", { name: "手順", exact: true }).click(); };
      const openTools = async () => { if (width <= 1100 && !await page.locator(".manual-context-tools[data-panel-open=true]").count()) await page.getByRole("button", { name: "操作案内", exact: true }).filter({ visible: true }).click(); };
      for (const [index, step] of MANUAL_SAMPLE_DETAIL.steps.entries()) {
        await openSteps();
        // Navigation is the ordinary editor navigation, fed by the sample fixture.
        await page.locator(`.manual-step-nav button[data-step-key="${step.clientKey}"]`).click();
        assert.equal(await page.getByLabel(`手順 ${index + 1}のタイトル`, { exact: true }).inputValue(), step.title);
        assert.equal(await page.getByLabel(`手順 ${index + 1}の説明`, { exact: true }).inputValue(), step.instruction);
        assert.equal(await page.getByLabel(`手順 ${index + 1}の説明`, { exact: true }).isDisabled(), false);
        await page.waitForFunction(() => { const image = document.querySelector(".cloud-step-image"); return image?.complete && image.naturalWidth === 800 && !image.hidden; });
        assert.equal(new URL(await page.locator(".cloud-step-image").getAttribute("src"), origin).pathname, step.assetUrl);
        assert.equal(await badge.isVisible(), true);
        await page.getByRole("button", { name: "画像を拡大して確認", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "手順画像を拡大して確認" });
        await dialog.waitFor();
        assert.match(await dialog.getByRole("heading").textContent(), /サンプル/);
        await dialog.getByRole("button", { name: "原寸表示", exact: true }).click();
        await dialog.getByRole("button", { name: "全体表示", exact: true }).click();
        await page.keyboard.press("Escape");
        assert.equal(await page.getByRole("button", { name: "画像を拡大して確認", exact: true }).evaluate((button) => document.activeElement === button), true);
      }
      await page.getByText("手順書の説明", { exact: true }).click();
      assert.equal(await page.getByLabel("説明", { exact: true }).inputValue(), MANUAL_SAMPLE_DETAIL.draft.description);
      assert.equal(await page.getByLabel("説明", { exact: true }).isDisabled(), false);
      const state = () => page.evaluate(() => globalThis.sampleSnapshot());
      const keys = () => page.locator(".manual-step-nav ol button").evaluateAll(buttons => buttons.map(button => button.dataset.stepKey));
      const closePanels = async () => { if (await page.locator(".manual-panel-backdrop:visible").count()) await page.keyboard.press("Escape"); };
      const history = async (name) => { await openTools(); await page.getByRole("button", { name, exact: true }).click(); };
      await page.getByLabel("タイトル", { exact: true }).fill("編集したサンプル");
      await page.getByLabel("説明", { exact: true }).fill("説明を編集しました");
      assert.equal((await state()).editorState.title, "編集したサンプル");
      assert.equal((await state()).editorState.description, "説明を編集しました");
      await history("取り消す");
      assert.equal((await state()).editorState.description, MANUAL_SAMPLE_DETAIL.draft.description);
      await history("やり直す");
      await closePanels();
      await page.getByText("手順書の説明", { exact: true }).click();
      assert.equal(await page.getByLabel("説明", { exact: true }).inputValue(), "説明を編集しました");
      await page.getByText("手順書の説明", { exact: true }).click();

      await openSteps();
      await page.locator('.manual-step-nav button[data-step-key="sample-step-1"]').click();
      await openSteps();
      await page.locator('.manual-step-nav button[data-step-key="sample-step-1"]').focus();
      await page.keyboard.press("ArrowDown");
      assert.equal(await page.locator('.manual-step-nav [aria-current="step"]').getAttribute("data-step-key"), "sample-step-2");
      await page.keyboard.press("ArrowUp");
      assert.equal(await page.locator('.manual-step-nav [aria-current="step"]').getAttribute("data-step-key"), "sample-step-1");
      await closePanels();
      await page.getByLabel("手順 1のタイトル", { exact: true }).fill("編集した手順");
      await page.getByLabel("手順 1の説明", { exact: true }).fill("操作を編集しました");
      assert.equal((await state()).editorState.steps[0].title, "編集した手順");
      assert.equal((await state()).editorState.steps[0].instruction, "操作を編集しました");
      await page.getByRole("button", { name: "下へ", exact: true }).click();
      assert.equal((await keys())[1], "sample-step-1");
      assert.equal(await page.getByLabel("手順 2の説明", { exact: true }).inputValue(), "操作を編集しました");
      await page.getByRole("button", { name: "上へ", exact: true }).click();
      await openSteps();
      const first = page.locator('.manual-step-nav button[data-step-key="sample-step-1"]');
      await first.focus();
      await page.keyboard.press("Alt+ArrowDown");
      assert.equal((await state()).editorState.steps[1].clientKey, "sample-step-1");
      await page.keyboard.press("Alt+ArrowUp");
      assert.deepEqual(await keys(), MANUAL_SAMPLE_DETAIL.steps.map(step => step.clientKey));
      await closePanels();
      // Undo/redo shortcuts outside inputs use the shared memory history.
      await page.locator("[data-manual-save]").focus();
      await page.keyboard.press("Control+z");
      assert.equal((await state()).editorState.steps[1].clientKey, "sample-step-1");
      await page.locator("[data-manual-save]").focus();
      await page.keyboard.press("Control+Shift+z");
      assert.equal((await state()).editorState.steps[0].clientKey, "sample-step-1");

      await openSteps();
      await page.locator("[data-step-add]").focus();
      await page.keyboard.press("Enter");
      assert.equal(await page.locator(".cloud-image-empty").textContent(), "説明のみの手順");
      assert.equal(await page.getByLabel("手順 2の説明", { exact: true }).evaluate(input => input === document.activeElement), true);
      await page.keyboard.type("Keyboard instruction");
      const added = (await state()).editorState.steps[1];
      assert.equal(added.instruction, "Keyboard instruction");
      assert.equal(added.assetId, undefined);
      assert.equal(added.assetUrl, undefined);
      assert.equal((await state()).editorState.steps.length, 7);
      await openTools();
      const addImage = page.getByRole("button", { name: "画像を追加する", exact: true });
      assert.equal(await addImage.isDisabled(), true);
      await addImage.dispatchEvent("click");
      await closePanels();
      await page.getByRole("button", { name: "この手順を削除", exact: true }).click();
      assert.equal((await state()).editorState.steps.length, 6);
      await history("取り消す");
      assert.equal((await state()).editorState.steps[1].instruction, "Keyboard instruction");
      await history("やり直す");
      assert.equal((await state()).editorState.steps.length, 6);
      await closePanels();
      assert.equal(await badge.textContent(), "サンプル・保存されません");
      assert.equal(await page.locator(".manual-toolbar").getByText(/クラウドに未保存/).count(), 0);
      await page.locator("[data-manual-save]").click();
      assert.match(await page.locator("#cloud-message").textContent(), /保存するにはアカウント登録／ログインが必要/);
      await page.locator(".manual-editor").dispatchEvent("submit");
      assert.match(await page.locator("#cloud-message").textContent(), /アカウント登録／ログイン/);
      for (const selector of [".manual-share", ".manual-mobile-actions .primary"]) {
        assert.equal(await page.locator(selector).isDisabled(), true);
        assert.match(await page.locator(selector).getAttribute("title"), /登録／ログイン/);
        await page.locator(selector).dispatchEvent("click");
      }
      await page.locator(".share-form").dispatchEvent("submit");
      assert.equal(await page.locator(".share-form button[type=submit]").isDisabled(), true);
      assert.equal(await page.locator(".manual-share-drawer").isVisible(), false);
      for (const name of ["PDF・印刷プレビュー", "Wordで書き出す", "PowerPointで書き出す", "チームの見た目", "矢印・文字を追加", "切り抜き", "画像を差し替える"]) {
        await openTools();
        const button = page.getByRole("button", { name, exact: true });
        assert.equal(await button.isDisabled(), true);
        await button.dispatchEvent("click"); // Exercise handler gates even on disabled DOM.
      }
      await page.locator('.cloud-image-tools input[type=file]').setInputFiles({ name: "synthetic.png", mimeType: "image/png", buffer: await readFile(new URL("../apps/worker/brand-assets/assets/manual-sample/list.png", import.meta.url)) });
      assert.equal(await page.locator(".image-editor-dialog,.branding-dialog,.manual-print-dialog").count(), 0);
      await openTools();
      const note = page.locator(".manual-context-tools > .cloud-note").first();
      assert.match(await note.textContent(), /編集できます/);
      assert.match(await note.textContent(), /ページを離れると編集内容は消えます/);
      assert.equal(await note.isVisible(), true);
      await closePanels();

      if (width === 1366) {
        await page.locator("[data-step-add]").evaluate(button => { for (let i = 0; i < 195; i++) button.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
        assert.equal((await state()).editorState.steps.length, 200);
        assert.equal(await page.locator("[data-step-add]").isDisabled(), true);
      }
      await openTools();
      const beforeReload = await state();
      page.once("dialog", async dialog => { assert.equal(dialog.type(), "confirm"); await dialog.dismiss(); });
      await page.getByRole("button", { name: "サンプルを読み直す", exact: true }).click();
      assert.deepEqual(await state(), beforeReload, "cancel reload keeps edits and history");
      page.once("dialog", async dialog => { assert.match(dialog.message(), /編集中の変更を破棄/); await dialog.accept(); });
      await page.getByRole("button", { name: "サンプルを読み直す", exact: true }).click();
      const reset = await state();
      assert.equal(reset.editorState.title, MANUAL_SAMPLE_DETAIL.draft.title);
      assert.equal(reset.editorState.description, MANUAL_SAMPLE_DETAIL.draft.description);
      assert.deepEqual(reset.editorState.steps, MANUAL_SAMPLE_DETAIL.steps);
      assert.equal(reset.dirty, false);
      assert.equal(reset.undo, 0);
      assert.equal(reset.redo, 0);
      assert.equal(await page.getByLabel("タイトル", { exact: true }).inputValue(), MANUAL_SAMPLE_DETAIL.draft.title);
      assert.equal(await page.locator(".manual-step-nav ol button").count(), 6);
      await openTools();
      assert.equal(await page.getByRole("button", { name: "取り消す", exact: true }).isDisabled(), true);
      assert.equal(await page.getByRole("button", { name: "やり直す", exact: true }).isDisabled(), true);
      // No pending edits: reload does not ask for confirmation.
      const unexpectedDialog = dialog => { errors.push("unexpected clean reload confirmation"); dialog.dismiss(); };
      page.on("dialog", unexpectedDialog);
      await page.getByRole("button", { name: "サンプルを読み直す", exact: true }).click();
      page.off("dialog", unexpectedDialog);
      await page.waitForFunction(() => document.querySelector(".cloud-step-image")?.naturalWidth === 800);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no horizontal page overflow at ${width}`);
      assert.deepEqual(apiReads, [], "sample requires no API reads");
      assert.deepEqual(writes, [], "sample sends zero API writes");
      if (width === 390) {
        await mkdir(".artifacts/manual-sample", { recursive: true });
        await page.screenshot({ path: ".artifacts/manual-sample/sample-stage-b-390.png" });
      }
      await page.getByRole("button", { name: "ログイン画面へ戻る", exact: true }).click();
      const entry = page.getByRole("link", { name: "サンプルを見る", exact: true });
      await entry.waitFor();
      await entry.focus();
      await page.keyboard.press("Enter");
      await badge.waitFor();
      assert.equal(new URL(page.url()).pathname, "/manuals/sample");
      assert.deepEqual(writes, []);
      assert.deepEqual(errors, []);
      assert.deepEqual(violations, []);
      await page.close();
    }
    assert.deepEqual(storageCalls, []);
  } finally { await browser.close(); }
});


test("cloud sample entry appears only in the unfiltered zero-manual state", { timeout: 30_000 }, async () => {
  const browser = await chromium.launch({ channel: "chromium", headless: true });
  try {
    for (const state of ["empty", "loaded", "failed"]) {
      const page = await browser.newPage();
      page.setDefaultTimeout(5000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route(origin + "/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/manuals") return route.fulfill({ contentType: "text/html", body: renderCloudManualsPage({ workspaceId: "sample-entry" }) });
        if (path === "/assets/cloud-manual.css") return route.fulfill({ contentType: "text/css", body: CLOUD_MANUAL_CSS });
        if (path === "/assets/cloud-manual.js") return route.fulfill({ contentType: "application/javascript", body: CLOUD_MANUAL_JS });
        if (path === "/api/workspaces/sample-entry/manuals") return route.fulfill({
          status: state === "failed" ? 503 : 200, contentType: "application/json",
          body: JSON.stringify(state === "failed" ? { message: "一時的に読み込めません。" } : { manuals: state === "empty" ? [] : [{ id: "synthetic-manual", title: "既存の手順書" }] })
        });
        return route.fulfill({ status: 404, body: "" });
      });
      await page.goto(origin + "/manuals");
      const entry = page.getByRole("link", { name: "サンプルを見る", exact: true });
      if (state === "empty") {
        await entry.waitFor();
        assert.equal(await entry.getAttribute("href"), "/manuals/sample");
      } else {
        if (state === "failed") await page.getByRole("button", { name: "もう一度読み込む", exact: true }).waitFor();
        else await page.locator(".cloud-list-button").waitFor();
        assert.equal(await entry.count(), 0);
      }
      if (state !== "failed") {
        await page.getByLabel("手順書を検索").fill("検索0件");
        await page.getByText("一致する手順書がありません。検索する言葉を変えてください。", { exact: true }).waitFor();
        assert.equal(await entry.count(), 0);
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});
