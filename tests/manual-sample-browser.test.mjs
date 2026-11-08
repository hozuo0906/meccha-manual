import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import test from "node:test";
import worker from "../apps/worker/src/index.ts";
import { chromium } from "./support/test-browser.mjs";
import { CLOUD_MANUAL_CSS, CLOUD_MANUAL_JS, renderCloudManualsPage } from "../apps/worker/src/cloud-manual-assets.ts";
import { MANUAL_SAMPLE_DETAIL, MANUAL_SAMPLE_IMAGE_PATHS } from "../apps/worker/src/manual-sample-assets.ts";

const origin = "https://meccha-manual-staging.meccha-iiyatsu.com";

test("unauthenticated sample renders every step and image; all viewing and attempted editing actions send zero API writes at three widths", { timeout: 120_000 }, async () => {
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
        await route.fulfill({ status: result.status, headers: Object.fromEntries(result.headers), body: Buffer.from(await result.arrayBuffer()) });
      });
      const response = await page.goto(origin + "/manuals/sample?shareManualId=ignored");
      assert.equal(response.status(), 200);
      const badge = page.locator(".cloud-save-state");
      await badge.filter({ hasText: "サンプル・閲覧のみ" }).waitFor();
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
        assert.equal(await page.getByLabel(`手順 ${index + 1}の説明`, { exact: true }).isDisabled(), true);
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
      assert.equal(await page.getByLabel("説明", { exact: true }).isDisabled(), true);
      await openSteps();
      const first = page.locator(".manual-step-nav ol button").first();
      await first.focus();
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Alt+ArrowDown");
      assert.deepEqual(await page.locator(".manual-step-nav ol button").evaluateAll((buttons) => buttons.map((button) => button.dataset.stepKey)), MANUAL_SAMPLE_DETAIL.steps.map((step) => step.clientKey));
      if (width <= 760) {
        await page.keyboard.press("Escape");
        assert.equal(await page.locator(".manual-mobile-actions").getByRole("button", { name: "手順", exact: true }).evaluate((button) => document.activeElement === button), true);
        await openSteps();
        await page.locator(".manual-panel-backdrop").click({ position: { x: width - 2, y: 10 } });
      }
      for (const name of ["PDF・印刷プレビュー", "Wordで書き出す", "PowerPointで書き出す"]) {
        await openTools();
        const button = page.getByRole("button", { name, exact: true });
        assert.equal(await button.isDisabled(), true);
        await button.dispatchEvent("click"); // Disabled DOM alone must not be the write boundary.
      }
      await page.locator("[data-manual-save]").dispatchEvent("click");
      await page.locator(".manual-share").dispatchEvent("click");
      await page.locator(".manual-mobile-actions .primary").dispatchEvent("click");
      await page.locator(".share-form").dispatchEvent("submit");
      await page.locator("[data-step-add]").dispatchEvent("click");
      await page.locator(".cloud-step-actions button").evaluateAll((buttons) => buttons.forEach((button) => button.dispatchEvent(new MouseEvent("click", { bubbles: true }))));
      await page.getByLabel("タイトル", { exact: true }).evaluate((input) => { input.value = "attempted edit"; input.dispatchEvent(new Event("input", { bubbles: true })); });
      await page.keyboard.press("Control+z");
      await page.keyboard.press("Control+Shift+z");
      if (width <= 1100 && !await page.getByRole("button", { name: "サンプルを読み直す", exact: true }).isVisible()) await openTools();
      await page.getByRole("button", { name: "サンプルを読み直す", exact: true }).click();
      assert.equal(await page.getByLabel("タイトル", { exact: true }).inputValue(), MANUAL_SAMPLE_DETAIL.draft.title);
      assert.equal(await page.locator(".manual-step-nav ol button").count(), 6);
      await page.waitForFunction(() => document.querySelector(".cloud-step-image")?.naturalWidth === 800);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no horizontal page overflow at ${width}`);
      assert.deepEqual(apiReads, [], "sample requires no API reads");
      assert.deepEqual(writes, [], "sample sends zero API writes");
      if (width === 390) {
        await mkdir(".artifacts/manual-sample", { recursive: true });
        await page.screenshot({ path: ".artifacts/manual-sample/sample-390.png" });
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
