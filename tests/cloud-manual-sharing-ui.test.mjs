import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { chromium } from "@playwright/test";
import { CLOUD_MANUAL_CSS, CLOUD_MANUAL_JS, renderCloudManualsPage } from "../apps/worker/src/cloud-manual-assets.ts";

test("cloud manual sharing requires confirmation, keeps token in memory, and stops after reload", { timeout: 20_000 }, async () => {
  const workspaceId = "workspace-share";
  const manualId = "manual-share";
  let share = null;
  let createBody = null;
  const createBodies = [];
  let failPostOnce = false;
  let revokeBody = null;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    response.setHeader("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    const json = (status, body) => { response.writeHead(status, { "content-type": "application/json; charset=utf-8" }); response.end(JSON.stringify(body)); };
    if (url.pathname === "/manuals") { response.setHeader("content-type", "text/html; charset=utf-8"); response.end(renderCloudManualsPage({ workspaceId })); return; }
    if (url.pathname === "/assets/cloud-manual.css") { response.setHeader("content-type", "text/css; charset=utf-8"); response.end(CLOUD_MANUAL_CSS); return; }
    if (url.pathname === "/assets/cloud-manual.js") { response.setHeader("content-type", "application/javascript; charset=utf-8"); response.end(CLOUD_MANUAL_JS); return; }
    if (url.pathname === `/api/workspaces/${workspaceId}/manuals` && request.method === "GET") { json(200, { manuals: [{ id: manualId, title: "共有テスト" }] }); return; }
    if (url.pathname === `/api/workspaces/${workspaceId}/manuals/${manualId}` && request.method === "GET") { json(200, { manual: { id: manualId, title: "共有テスト" }, draft: { id: "draft-1", contentVersion: "0123456789abcdef0123456789abcdef", title: "共有テスト", description: "説明", updatedAt: "v1" }, steps: [{ id: "step-1", position: 1, title: "手順", instruction: "操作" }], permissions: { canEdit: true } }); return; }
    if (url.pathname === `/api/workspaces/${workspaceId}/manuals/${manualId}/share-links`) {
      if (request.method === "GET") { json(200, { share }); return; }
      let body = ""; for await (const chunk of request) body += chunk;
      if (request.method === "POST") { createBody = JSON.parse(body); createBodies.push(createBody); if (failPostOnce) { failPostOnce = false; json(503, { message: "発行結果を確認できません" }); return; } share = { shareLinkId: "share-1", expiresAt: createBody.expiresAt, revokedAt: null, permission: "read_only", viewerPath: "/s/" }; json(200, { ...share, reused: false }); return; }
      if (request.method === "DELETE") { revokeBody = JSON.parse(body); share = null; json(200, { revoked: true, shareLinkId: revokeBody.shareLinkId }); return; }
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
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/manuals`);
    await page.getByRole("button", { name: "共有テスト" }).click();
    await page.getByLabel("パスコード（12〜128文字）").fill("十分に長い共有用コードです");
    await page.getByRole("button", { name: "共有リンクを発行" }).click();
    await page.getByText("共有内容と期限を確認してから発行してください。").waitFor();
    assert.equal(createBodies.length, 0);
    await page.getByLabel("発行時点の内容と期限を確認しました").check();
    await page.getByRole("button", { name: "共有リンクを発行" }).click();
    const shareLink = page.locator("input.share-link-value");
    await shareLink.waitFor();
    assert.equal(createBody.confirmed, true);
    assert.equal(createBody.token.length, 43);
    assert.equal(createBody.expectedDraftRevisionId, "draft-1");
    assert.match(await shareLink.inputValue(), /\/s\/#token=[A-Za-z0-9_-]{43}/);
    await page.reload();
    await page.getByRole("button", { name: "共有テスト" }).click();
    await page.getByText("共有リンクは再読み込み後に復元できません").waitFor();
    await page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "共有を停止して再発行" }).click();
    assert.deepEqual(revokeBody, { shareLinkId: "share-1" });
    await page.getByRole("button", { name: "共有リンクを発行" }).waitFor();
    failPostOnce = true;
    await page.getByLabel("パスコード（12〜128文字）").fill("十分に長い共有用コードです");
    await page.getByLabel("発行時点の内容と期限を確認しました").check();
    await page.getByRole("button", { name: "共有リンクを発行" }).click();
    await page.getByText("共有リンクの発行結果を確認できません").waitFor();
    await page.getByRole("button", { name: "共有リンクを発行" }).click();
    await page.locator("input.share-link-value").waitFor();
    assert.equal(createBodies.length, 3);
    assert.equal(createBodies[1].operationId, createBodies[2].operationId);
    assert.equal(createBodies[1].token, createBodies[2].token);
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
