import { EDITOR_TOOLS_JS } from "../apps/worker/src/editor-tools-assets.ts";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { chromium } from "./support/test-browser.mjs";
import { CLOUD_MANUAL_CSS, CLOUD_MANUAL_JS, renderCloudManualsPage } from "../apps/worker/src/cloud-manual-assets.ts";

// Mask credentials even though this test uses only synthetic values.
async function captureSharingEvidence(page, name, observations) {
  const directory = ".artifacts/uiux-20261001/screens";
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true,
    mask: [page.locator("[data-share-passcode]"), page.locator("input.share-link-value")] });
  await writeFile(`${directory}/${name}.json`, JSON.stringify({
    candidateCommit: process.env.GITHUB_SHA || null,
    fixture: "synthetic-cloud-sharing-mock-API", screenshot: `${name}.png`,
    viewport: page.viewportSize(), status: await page.locator("#cloud-message").textContent(),
    observations
  }, null, 2) + "\n");
}

test("cloud sharing keeps explicit failures, dirty edits, and stale delayed responses recoverable", { timeout: 60_000 }, async () => {
  const workspaceId = "workspace-share-failure";
  const manuals = [
    { id: "manual-1", title: "Manual One", draftId: "draft-1" },
    { id: "manual-2", title: "Manual Two", draftId: "draft-2" }
  ];
  const shares = new Map();
  const postBodies = [];
  let failureStatus = null;
  let revokeFailureStatus = null;
  const revokeBodies = [];
  let delayedManualId = null;
  let releaseDelayedPost = null;
  let delayedPostReadyResolve;
  const delayedPostReady = new Promise((resolve) => { delayedPostReadyResolve = resolve; });
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    response.setHeader("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    const json = (status, body) => { response.writeHead(status, { "content-type": "application/json; charset=utf-8" }); response.end(JSON.stringify(body)); };
    if (url.pathname === "/manuals") { response.setHeader("content-type", "text/html; charset=utf-8"); response.end(renderCloudManualsPage({ workspaceId })); return; }
    if (url.pathname === "/assets/cloud-manual.css") { response.setHeader("content-type", "text/css; charset=utf-8"); response.end(CLOUD_MANUAL_CSS); return; }
    if (url.pathname === "/assets/editor-tools.js") { response.writeHead(200,{"content-type":"application/javascript"});response.end(EDITOR_TOOLS_JS);return; }
    if (url.pathname === "/assets/cloud-manual.js") { response.setHeader("content-type", "application/javascript; charset=utf-8"); response.end(CLOUD_MANUAL_JS); return; }
    if (url.pathname === `/api/workspaces/${workspaceId}/manuals` && request.method === "GET") { json(200, { manuals: manuals.map(({ id, title }) => ({ id, title })) }); return; }
    const detailMatch = url.pathname.match(new RegExp(`/api/workspaces/${workspaceId}/manuals/(manual-[12])$`));
    if (detailMatch && request.method === "GET") {
      const manual = manuals.find((item) => item.id === detailMatch[1]);
      json(200, { manual: { id: manual.id, title: manual.title }, draft: { id: manual.draftId, contentVersion: "0123456789abcdef0123456789abcdef", title: manual.title, description: "Description", updatedAt: "v1" }, steps: [{ id: `${manual.id}-step`, position: 1, title: "Step", instruction: "Instruction" }], permissions: { canEdit: true } });
      return;
    }
    const shareMatch = url.pathname.match(new RegExp(`/api/workspaces/${workspaceId}/manuals/(manual-[12])/share-links$`));
    if (shareMatch) {
      const manualId = shareMatch[1];
      if (request.method === "GET") { json(200, { share: shares.get(manualId) || null }); return; }
      let body = ""; for await (const chunk of request) body += chunk;
      if (request.method === "POST") {
        const parsed = JSON.parse(body); postBodies.push({ manualId, body: parsed });
        if (failureStatus) { const status = failureStatus; failureStatus = null; json(status, { message: `拒否 ${status}` }); return; }
        if (delayedManualId === manualId) {
          await new Promise((resolve) => { releaseDelayedPost = resolve; delayedPostReadyResolve(); });
        }
        const share = { shareLinkId: `share-${manualId}`, expiresAt: parsed.expiresAt, revokedAt: null, permission: "read_only", viewerPath: "/s/" };
        shares.set(manualId, share); json(200, { ...share, reused: false }); return;
      }
      if (request.method === "DELETE") { const parsed = JSON.parse(body); revokeBodies.push({ manualId, body: parsed }); if (revokeFailureStatus) { const status = revokeFailureStatus; revokeFailureStatus = null; json(status, { message: `停止拒否 ${status}` }); return; } shares.delete(manualId); json(200, { revoked: true, shareLinkId: parsed.shareLinkId }); return; }
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
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/manuals`);
    const list = page.locator("#cloud-list button");
    await list.first().waitFor();
    await list.nth(0).click();
    await page.getByRole("button", {name:"共有",exact:true}).click();
    await page.locator("[data-share-passcode]").waitFor();
    const passcode = "A secure passcode";
    const fillShareForm = async () => {
      await page.locator("[data-share-passcode]").fill(passcode);
      await page.locator("[data-share-confirm]").check();
      await page.locator(".share-form button.primary").click();
    };

    await page.locator(".manual-share-drawer").getByRole("button",{name:"閉じる",exact:true}).click();
    await page.locator('input[aria-label="タイトル"]').fill("Unsaved title");
    await page.getByRole("button",{name:"共有",exact:true}).click();
    await fillShareForm();
    await page.locator("#cloud-message.warning").waitFor();
    assert.equal(postBodies.length, 0);
    await page.locator(".manual-share-drawer").getByRole("button",{name:"閉じる",exact:true}).click();
    await page.getByRole("button", {name:"手順書一覧",exact:true}).click();
    page.once("dialog", (dialog) => dialog.accept());
    // Start response clocks at the reload action, not while the drawer/list is
    // still being operated. Await both together so neither rejects unobserved.
    const [detailReloadResponse, metadataReloadResponse] = await Promise.all([
      page.waitForResponse((response) => response.url() === `${baseUrl}/api/workspaces/${workspaceId}/manuals/manual-1` && response.request().method() === "GET" && response.status() === 200),
      page.waitForResponse((response) => response.url() === `${baseUrl}/api/workspaces/${workspaceId}/manuals/manual-1/share-links` && response.request().method() === "GET" && response.status() === 200),
      list.nth(0).click()
    ]);
    assert.equal(detailReloadResponse.status(), 200);
    assert.equal(metadataReloadResponse.status(), 200);
    await page.waitForFunction(() => document.querySelector('input[aria-label="タイトル"]')?.value === "Manual One" && document.querySelector("[data-share-passcode]")?.isConnected);

    await page.getByRole("button",{name:"共有",exact:true}).click();
    for (const status of [400, 403, 409]) {
      failureStatus = status;
      const expectedPostCount = postBodies.length + 1;
      const responsePromise = page.waitForResponse((response) => response.url() === `${baseUrl}/api/workspaces/${workspaceId}/manuals/manual-1/share-links` && response.request().method() === "POST" && response.status() === status);
      await fillShareForm();
      const response = await responsePromise;
      assert.equal(response.status(), status);
      assert.equal(postBodies.length, expectedPostCount);
      await page.locator("#cloud-message").filter({hasText:`拒否 ${status}`}).waitFor();
      assert.equal(postBodies.at(-1)?.body.confirmed, true);
      assert.equal(await page.locator("input.share-link-value").count(), 0);
      await captureSharingEvidence(page, `share-create-rejected-${status}`, { operation: "create-rejected", responseStatus: status, exposedLinkCount: await page.locator("input.share-link-value").count() });
    }

    delayedManualId = "manual-1";
    await fillShareForm();
    await delayedPostReady;
    assert.equal(typeof releaseDelayedPost, "function");
    await page.getByRole("button", {name:"閉じる",exact:true}).click();
    await page.getByRole("button", {name:"手順書一覧",exact:true}).click();
    await list.nth(1).click();
    await page.waitForFunction(() => document.querySelector(".manual-title")?.value === "Manual Two");
    await page.getByRole("button", {name:"共有",exact:true}).click();
    const postsBeforeBusyAttempt = postBodies.length;
    await fillShareForm();
    await page.locator("#cloud-message.warning").waitFor();
    assert.equal(postBodies.length, postsBeforeBusyAttempt);
    const delayedResponse = page.waitForResponse((response) => response.url() === `${baseUrl}/api/workspaces/${workspaceId}/manuals/manual-1/share-links` && response.request().method() === "POST" && response.status() === 200);
    releaseDelayedPost();
    releaseDelayedPost = null;
    assert.equal((await delayedResponse).status(), 200);
    assert.equal(await page.getByLabel("タイトル",{exact:true}).inputValue(), "Manual Two");
    assert.equal(await page.locator("[data-share-passcode]").isVisible(), true);

    delayedManualId = null;
    await fillShareForm();
    await page.locator("#cloud-message").filter({hasText:"共有リンクを作成しました。"}).waitFor();
    const shareLink = await page.locator("input.share-link-value").inputValue();
    for (const status of [400, 403]) {
      revokeFailureStatus = status;
      const responsePromise = page.waitForResponse((response) => response.url() === `${baseUrl}/api/workspaces/${workspaceId}/manuals/manual-2/share-links` && response.request().method() === "DELETE" && response.status() === status);
      await page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "共有を停止" }).click();
      assert.equal((await responsePromise).status(), status);
      await page.locator("#cloud-message").filter({hasText:`停止拒否 ${status}`}).waitFor();
      assert.equal(await page.locator("input.share-link-value").inputValue(), shareLink);
    }
    const shareEndpoint = `${baseUrl}/api/workspaces/${workspaceId}/manuals/manual-2/share-links`;
    let abortRevoke = true;
    await page.route(shareEndpoint, async (route) => {
      if (abortRevoke && route.request().method() === "DELETE") {
        abortRevoke = false;
        await route.abort("failed");
        return;
      }
      await route.continue();
    });
    const transportRequest = page.waitForRequest((request) => request.url() === shareEndpoint && request.method() === "DELETE");
    await page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "共有を停止" }).click();
    const actualTransportRequest = await transportRequest;
    await page.locator("#cloud-message").filter({hasText:"共有リンクを停止できたか確認できません。画面を閉じずに、共有設定の停止ボタンから同じリンクの停止を再試行してください。"}).waitFor();
    assert.equal(await page.locator("input.share-link-value").inputValue(), shareLink);
    const transportFailedShareLinkId = actualTransportRequest.postDataJSON()?.shareLinkId;
    assert.equal(transportFailedShareLinkId, shares.get("manual-2")?.shareLinkId);
    await captureSharingEvidence(page, "share-revoke-transport-result-unknown", { operation: "revoke-transport-interrupted", linkStillAvailable: (await page.locator("input.share-link-value").inputValue()) === shareLink, retryTargetsSameLink: transportFailedShareLinkId === shares.get("manual-2")?.shareLinkId });
    await page.unroute(shareEndpoint);

    revokeFailureStatus = 503;
    const unknownResponse = page.waitForResponse((response) => response.url() === `${baseUrl}/api/workspaces/${workspaceId}/manuals/manual-2/share-links` && response.request().method() === "DELETE" && response.status() === 503);
    await page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "共有を停止" }).click();
    assert.equal((await unknownResponse).status(), 503);
    await page.locator("#cloud-message").filter({hasText:"共有リンクを停止できたか確認できません。画面を閉じずに、共有設定の停止ボタンから同じリンクの停止を再試行してください。"}).waitFor();
    assert.equal(await page.locator("input.share-link-value").inputValue(), shareLink);
    const failedShareLinkId = revokeBodies.at(-1)?.body.shareLinkId;
    assert.equal(failedShareLinkId, transportFailedShareLinkId);
    await captureSharingEvidence(page, "share-revoke-server-result-unknown", { operation: "revoke-503", responseStatus: 503, retryTargetsSameLink: failedShareLinkId === transportFailedShareLinkId });
    const retryResponse = page.waitForResponse((response) => response.url() === `${baseUrl}/api/workspaces/${workspaceId}/manuals/manual-2/share-links` && response.request().method() === "DELETE" && response.status() === 200);
    await page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "共有を停止" }).click();
    assert.equal((await retryResponse).status(), 200);
    await page.locator("#cloud-message").filter({hasText:"共有リンクを停止しました。必要なら新しいリンクを作成してください。"}).waitFor();
    assert.equal(await page.locator("input.share-link-value").count(), 0);
    assert.equal(failedShareLinkId, transportFailedShareLinkId);
    assert.equal(revokeBodies.at(-1)?.body.shareLinkId, failedShareLinkId);
    await captureSharingEvidence(page, "share-revoke-retry-completed", { operation: "retry-revoke-same-link", retryTargetsSameLink: revokeBodies.at(-1)?.body.shareLinkId === failedShareLinkId, exposedLinkCount: await page.locator("input.share-link-value").count(), serverSharePresent: shares.has("manual-2") });
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
