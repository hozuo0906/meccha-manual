import { EDITOR_TOOLS_JS } from "../apps/worker/src/editor-tools-assets.ts";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { chromium } from "./support/test-browser.mjs";
import { CLOUD_MANUAL_CSS, CLOUD_MANUAL_JS, renderCloudManualsPage } from "../apps/worker/src/cloud-manual-assets.ts";

test("cloud list keyboard retry restores focus after repeated failures and preserves focus moved during loading", { timeout: 60_000 }, async () => {
  const server = createServer((request, response) => {
    const assets = {
      "/manuals": ["text/html; charset=utf-8", renderCloudManualsPage({ workspaceId: "workspace-retry" })],
      "/assets/cloud-manual.css": ["text/css", CLOUD_MANUAL_CSS],
      "/assets/cloud-manual.js": ["application/javascript", CLOUD_MANUAL_JS],
      "/assets/editor-tools.js": ["application/javascript", EDITOR_TOOLS_JS]
    };
    const asset = assets[new URL(request.url, "http://localhost").pathname];
    if (asset) response.writeHead(200, { "content-type": asset[0] }).end(asset[1]);
    else response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  let pendingResponse;
  try {
    browser = await chromium.launch({ channel: "chromium", headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let requests = 0;
    await page.route("**/api/workspaces/workspace-retry/manuals", async (route) => {
      requests += 1;
      await pendingResponse?.promise;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "一時的に読み込めません。" }) });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/manuals`);
    const retry = page.getByRole("button", { name: "もう一度読み込む", exact: true });
    const search = page.locator("#manual-search");
    await retry.waitFor();
    assert.equal(await retry.evaluate((button) => document.activeElement === button), false, "初回失敗ではフォーカスを奪わない");
    assert.equal(requests, 1);
    for (const moveFocus of [false, true]) {
      await retry.focus();
      for (const key of ["Enter", "Space"]) {
        const previousButton = await retry.elementHandle();
        pendingResponse = Promise.withResolvers();
        await page.keyboard.press(key);
        await page.locator(".cloud-loading-library").waitFor();
        assert.equal(await previousButton.evaluate((button) => button.isConnected), false);
        if (moveFocus) await search.focus();
        pendingResponse.resolve();
        await retry.waitFor();
        assert.equal(await (moveFocus ? search : retry).evaluate((element) => document.activeElement === element), true,
          moveFocus ? `${key}: 待機中に移動した検索欄のフォーカスを維持する` : `${key}: 新しい再試行ボタンへ復帰し続けて再試行できる`);
        await previousButton.dispose();
        if (moveFocus) await retry.focus();
      }
    }
    assert.equal(requests, 5, "初回取得とキーボードによる4回の再取得が対象APIへ到達する");
    assert.deepEqual(errors, []);
  } finally {
    pendingResponse?.resolve();
    await browser?.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("cloud manual editor keeps local edits until one batch save and reloads returned step ids", { timeout: 60_000 }, async () => {
  const workspaceId = "workspace-1";
  const manualId = "manual-1";
  const patches = [];
  const png = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#f3fbfa"/><rect x="40" y="32" width="880" height="76" rx="12" fill="#087f7a"/><text x="72" y="82" fill="white" font-family="sans-serif" font-size="32" font-weight="700">申請画面を開く</text><rect x="72" y="150" width="816" height="290" rx="12" fill="white" stroke="#b6deda"/><text x="104" y="215" fill="#20282e" font-family="sans-serif" font-size="26">今月の申請一覧</text><text x="104" y="276" fill="#52666a" font-family="sans-serif" font-size="22">交通費  12,400円</text><text x="104" y="326" fill="#52666a" font-family="sans-serif" font-size="22">備品費   8,900円</text></svg>`, "utf8");
  let currentSteps = [{ id: "step-1", position: 1, title: "最初", instruction: "開く", assetId: "asset-1", assetUrl: `/api/workspaces/${workspaceId}/assets/asset-1` }];
  let currentTitle = "業務手順";
  let currentDescription = "説明";
  let updatedAt = "v1";
  let failNextImage = false;
  let delayPatch = false;
  let returnUnauthorized = false;
  let detailFailure = false;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    response.setHeader("content-security-policy", "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; script-src 'self'; style-src 'self'");
    if (url.pathname === "/manuals") {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(renderCloudManualsPage({ workspaceId }));
      return;
    }
    if (url.pathname === "/assets/cloud-manual.css") {
      response.setHeader("content-type", "text/css; charset=utf-8");
      response.end(CLOUD_MANUAL_CSS);
      return;
    }
    if (url.pathname === "/assets/editor-tools.js") { response.writeHead(200,{"content-type":"application/javascript"});response.end(EDITOR_TOOLS_JS);return; }
    if (url.pathname === "/assets/cloud-manual.js") {
      response.setHeader("content-type", "application/javascript; charset=utf-8");
      response.end(CLOUD_MANUAL_JS);
      return;
    }
    const brandAsset = url.pathname === "/s/assets/brand/logo.png" ? "meccha-manual-logo-mark.png" : url.pathname === "/s/assets/brand/mascot.png" ? "meccha-manual-mascot-me-clear-eyes.png" : null;
    if (brandAsset) { response.writeHead(200, { "content-type": "image/png" }); response.end(await readFile(new URL(`../apps/worker/brand-assets/assets/${brandAsset}`, import.meta.url))); return; }
    if (url.pathname === `/api/workspaces/${workspaceId}/assets/asset-1`) {
      if (failNextImage) { failNextImage = false; response.writeHead(503).end(); return; }
      response.setHeader("content-type", "image/svg+xml");
      response.end(png);
      return;
    }
    if (url.pathname === `/api/workspaces/${workspaceId}/manuals` && request.method === "GET") {
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ manuals: [{ id: manualId, title: "業務手順" }] }));
      return;
    }
    if (url.pathname === `/api/workspaces/${workspaceId}/manuals/${manualId}` && request.method === "GET") {
      if (detailFailure) { detailFailure = false; response.writeHead(503, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify({ code: "D1_UNAVAILABLE", message: "一時的に確認できません。" })); return; }
      if (returnUnauthorized) { response.writeHead(401).end(JSON.stringify({ message: "unauthorized" })); return; }
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ manual: { id: manualId, title: currentTitle }, draft: { title: currentTitle, description: currentDescription, updatedAt }, steps: currentSteps, permissions: { canEdit: true } }));
      return;
    }
    if (url.pathname === `/api/workspaces/${workspaceId}/manuals/${manualId}/draft` && request.method === "PATCH") {
      let body = "";
      for await (const chunk of request) body += chunk;
      const payload = JSON.parse(body);
      patches.push(payload);
      if (delayPatch) await new Promise((resolve) => setTimeout(resolve, 250));
      updatedAt = `v${patches.length + 1}`;
      currentTitle = payload.title;
      currentDescription = payload.description;
      currentSteps = payload.steps.map((step, index) => ({ ...step, id: step.id || `server-step-${index + 1}`, position: index + 1, assetUrl: `/api/workspaces/${workspaceId}/assets/asset-1` }));
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ status: "saved", updatedAt }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();page.setDefaultTimeout(5000);
    const consoleErrors = [];
    page.on("console", (message) => { if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) consoleErrors.push(message.text()); });
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    await page.addInitScript(() => { window.addEventListener("securitypolicyviolation", (event) => { window.__cloudManualPolicyViolations = window.__cloudManualPolicyViolations || []; window.__cloudManualPolicyViolations.push(`${event.effectiveDirective}: ${event.blockedURI}`); }); });
    page.on("requestfailed", (request) => { if (request.resourceType() === "document") consoleErrors.push(request.failure()?.errorText || "document request failed"); });
    await page.goto(`${baseUrl}/manuals`);
    assert.equal(await page.locator(".cloud-brand-name").textContent(), "めっちゃマニュアル");
    assert.equal(await page.locator("#cloud-list").getAttribute("class"), "cloud-list");
    await page.getByRole("button", { name: "業務手順" }).click();
    await page.getByLabel("タイトル", { exact: true }).waitFor();
    await page.locator("img.cloud-step-image").waitFor();
    await page.waitForFunction(() => document.querySelector("img.cloud-step-image")?.naturalWidth >= 900);
    assert.ok(await page.locator(".cloud-step input, .cloud-step textarea").first().evaluate((field) => field.getBoundingClientRect().height >= 44));
    const titleBeforeImageRetry = page.getByLabel("タイトル", { exact: true });
    await titleBeforeImageRetry.fill("編集中のタイトル");
    failNextImage = true;
    await page.locator("img.cloud-step-image").evaluate((image, source) => { image.src = source; }, `/api/workspaces/${workspaceId}/assets/asset-1?force-error=1`);
    await page.locator(".cloud-image-retry").waitFor();
    await page.locator(".cloud-image-retry").click();
    await page.waitForFunction(() => document.querySelector("img.cloud-step-image")?.naturalWidth >= 900);
    assert.equal(await titleBeforeImageRetry.inputValue(), "編集中のタイトル");
    await page.screenshot({ path: ".artifacts/experience-repair/cloud-editor-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.querySelector("img.cloud-step-image")?.getBoundingClientRect().width <= 358);
    await page.screenshot({ path: ".artifacts/experience-repair/cloud-editor-mobile.png", fullPage: true });
    await page.setViewportSize({width:1366,height:900});
    const titleField = page.getByLabel("タイトル", { exact: true });
    assert.equal(await titleField.getAttribute("maxlength"), null);
    assert.equal(await titleField.getAttribute("data-code-point-max"), "64");
    await titleField.fill("😀".repeat(65));
    await page.getByRole("button", { name: "変更を保存" }).click();
    await page.getByText("タイトルは64文字以内で入力してください。").waitFor();
    assert.equal(patches.length, 0);
    assert.equal(await titleField.inputValue(), "😀".repeat(65));
    await page.getByLabel("タイトル", { exact: true }).fill("保存前タイトル");
    await page.getByLabel("手順 1のタイトル").fill("更新した手順");
    await page.getByRole("button", { name: "手順を追加" }).click();
    await page.getByLabel("手順 2のタイトル").fill("追加手順");
    await page.locator(".cloud-step").first().getByRole("button", { name: "上へ" }).click();
    await page.locator(".cloud-step").nth(0).getByRole("button", { name: "下へ" }).click();
    await page.locator(".cloud-step").first().getByRole("button", { name: "この手順を削除" }).click();
    assert.equal(await page.getByLabel("手順 1のタイトル").inputValue(), "更新した手順");

    delayPatch = true;
    const saveResponse = page.waitForRequest((request) => request.url().endsWith(`/api/workspaces/${workspaceId}/manuals/${manualId}/draft`) && request.method() === "PATCH");
    await page.getByRole("button", { name: "変更を保存" }).click();
    const patchRequest = await saveResponse;
    assert.equal(await page.getByRole("button", { name: "最新の内容を読み込む" }).isDisabled(), true);
    assert.equal(await page.locator("#cloud-list button").first().isDisabled(), true);
    await page.getByLabel("タイトル", { exact: true }).fill("保存中に変更したタイトル");
    await page.getByLabel("タイトル", { exact: true }).focus();
    await page.getByLabel("タイトル", { exact: true }).selectText();
    await page.waitForResponse((response) => response.url().endsWith(`/api/workspaces/${workspaceId}/manuals/${manualId}/draft`) && response.request().method() === "PATCH");
    assert.equal(JSON.parse(patchRequest.postData()).title, "保存前タイトル");
    assert.equal(await page.getByLabel("タイトル", { exact: true }).inputValue(), "保存中に変更したタイトル");
    assert.deepEqual(await page.getByLabel("タイトル", { exact: true }).evaluate((input) => ({ active: document.activeElement === input, selected: [input.selectionStart, input.selectionEnd] })), { active: true, selected: [0, "保存中に変更したタイトル".length] });
    assert.match(await page.locator("#cloud-message").textContent(), /入力が変更されました/);

    delayPatch = false;
    await page.getByRole("button", { name: "変更を保存" }).click();
    await page.getByText("手順書を表示しています。").waitFor();
    assert.equal(patches.length, 2);
    assert.equal(await page.getByLabel("手順 1のタイトル").inputValue(), "更新した手順");
    assert.equal(await page.getByRole("img", { name: "手順 1の画像" }).count(), 1);
    assert.equal(await page.locator('#cloud-list button[aria-label="保存中に変更したタイトル"]').count(), 1);
    await page.getByLabel("タイトル", { exact: true }).fill("503でも保持");
    detailFailure = true;
    await page.getByRole("button", { name: "変更を保存" }).click();
    await page.getByText("保存結果と最新内容を確認できませんでした。入力内容を保持しています。").waitFor();
    assert.equal(await page.getByLabel("タイトル", { exact: true }).inputValue(), "503でも保持");

    await page.evaluate(() => {
      const add = document.querySelector("[data-step-add]");
      for (let index = 0; index < 199; index += 1) add.click();
    });
    const addStep = page.locator("[data-step-add]");
    assert.equal(await page.locator(".manual-step-nav li").count(), 200);
    assert.equal(await page.locator(".cloud-step").count(), 1);
    assert.equal(await addStep.isDisabled(), true);
    assert.equal(await addStep.textContent(), "手順は200件まで");
    await page.locator(".cloud-step").first().getByRole("button", { name: "この手順を削除" }).click();
    assert.equal(await addStep.isDisabled(), false);
    assert.equal(await addStep.textContent(), "手順を追加");
    await addStep.click();
    assert.equal(await addStep.isDisabled(), true);
    assert.equal(await page.locator(".manual-step-nav li").count(), 200);
    assert.equal(await page.locator(".cloud-step").count(), 1);

    returnUnauthorized = true;
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "最新の内容を読み込む" }).click();
    await page.getByText("認証または権限を確認できません。画面を更新してください。").waitFor();
    assert.equal(await page.getByText("一覧から手順書を選んでください。").count(), 1);
    assert.deepEqual(await page.evaluate(() => window.__cloudManualPolicyViolations || []), []);
    assert.deepEqual(consoleErrors, []);
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
