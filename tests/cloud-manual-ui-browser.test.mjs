import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { chromium } from "@playwright/test";
import { CLOUD_MANUAL_CSS, CLOUD_MANUAL_JS, renderCloudManualsPage } from "../apps/worker/src/cloud-manual-assets.ts";

test("cloud manual editor keeps local edits until one batch save and reloads returned step ids", { timeout: 20_000 }, async () => {
  const workspaceId = "workspace-1";
  const manualId = "manual-1";
  const patches = [];
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  let currentSteps = [{ id: "step-1", position: 1, title: "最初", instruction: "開く", assetId: "asset-1", assetUrl: "/assets/image.png" }];
  let currentTitle = "業務手順";
  let currentDescription = "説明";
  let updatedAt = "v1";
  let delayPatch = false;
  let returnUnauthorized = false;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    response.setHeader("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
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
    if (url.pathname === "/assets/cloud-manual.js") {
      response.setHeader("content-type", "application/javascript; charset=utf-8");
      response.end(CLOUD_MANUAL_JS);
      return;
    }
    if (url.pathname === "/assets/image.png") {
      response.setHeader("content-type", "image/png");
      response.end(png);
      return;
    }
    if (url.pathname === `/api/workspaces/${workspaceId}/manuals` && request.method === "GET") {
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ manuals: [{ id: manualId, title: "業務手順" }] }));
      return;
    }
    if (url.pathname === `/api/workspaces/${workspaceId}/manuals/${manualId}` && request.method === "GET") {
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
      currentSteps = payload.steps.map((step, index) => ({ ...step, id: step.id || `server-step-${index + 1}`, position: index + 1, assetUrl: "/assets/image.png" }));
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
    const page = await context.newPage();
    await page.goto(`${baseUrl}/manuals`);
    await page.getByRole("button", { name: "業務手順" }).click();
    await page.getByLabel("タイトル", { exact: true }).waitFor();
    await page.locator("img").waitFor();
    await page.waitForFunction(() => document.querySelector("img")?.naturalWidth > 0);
    await page.getByLabel("タイトル", { exact: true }).fill("保存前タイトル");
    await page.getByLabel("手順 1のタイトル").fill("更新した手順");
    await page.getByRole("button", { name: "手順を追加" }).click();
    await page.getByLabel("手順 2のタイトル").fill("追加手順");
    await page.locator(".cloud-step").nth(1).getByRole("button", { name: "上へ" }).click();
    await page.locator(".cloud-step").nth(0).getByRole("button", { name: "下へ" }).click();
    await page.locator(".cloud-step").nth(1).getByRole("button", { name: "この手順を削除" }).click();
    assert.equal(await page.getByLabel("手順 1のタイトル").inputValue(), "更新した手順");

    delayPatch = true;
    const saveResponse = page.waitForRequest((request) => request.url().endsWith(`/api/workspaces/${workspaceId}/manuals/${manualId}/draft`) && request.method() === "PATCH");
    await page.getByRole("button", { name: "変更を保存" }).click();
    const patchRequest = await saveResponse;
    assert.equal(await page.getByRole("button", { name: "最新の内容を読み込む" }).isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "業務手順" }).isDisabled(), true);
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
    assert.equal(await page.getByRole("img", { name: "手順 1の操作を記録" }).count(), 1);

    returnUnauthorized = true;
    await page.getByRole("button", { name: "最新の内容を読み込む" }).click();
    await page.getByText("認証または権限を確認できません。画面を更新してください。").waitFor();
    assert.equal(await page.getByText("左の一覧から手順書を選んでください。").count(), 1);
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
