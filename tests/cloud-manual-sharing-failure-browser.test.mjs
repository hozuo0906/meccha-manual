import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { chromium } from "@playwright/test";
import { CLOUD_MANUAL_CSS, CLOUD_MANUAL_JS, renderCloudManualsPage } from "../apps/worker/src/cloud-manual-assets.ts";

test("cloud sharing keeps explicit failures, dirty edits, and stale delayed responses recoverable", { timeout: 20_000 }, async () => {
  const workspaceId = "workspace-share-failure";
  const manuals = [
    { id: "manual-1", title: "Manual One", draftId: "draft-1" },
    { id: "manual-2", title: "Manual Two", draftId: "draft-2" }
  ];
  const shares = new Map();
  const postBodies = [];
  let failureStatus = null;
  let delayedManualId = null;
  let releaseDelayedPost = null;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    response.setHeader("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    const json = (status, body) => { response.writeHead(status, { "content-type": "application/json; charset=utf-8" }); response.end(JSON.stringify(body)); };
    if (url.pathname === "/manuals") { response.setHeader("content-type", "text/html; charset=utf-8"); response.end(renderCloudManualsPage({ workspaceId })); return; }
    if (url.pathname === "/assets/cloud-manual.css") { response.setHeader("content-type", "text/css; charset=utf-8"); response.end(CLOUD_MANUAL_CSS); return; }
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
        if (delayedManualId === manualId) await new Promise((resolve) => { releaseDelayedPost = resolve; });
        const share = { shareLinkId: `share-${manualId}`, expiresAt: parsed.expiresAt, revokedAt: null, permission: "read_only", viewerPath: "/s/" };
        shares.set(manualId, share); json(200, { ...share, reused: false }); return;
      }
      if (request.method === "DELETE") { const parsed = JSON.parse(body); shares.delete(manualId); json(200, { revoked: true, shareLinkId: parsed.shareLinkId }); return; }
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
    const list = page.locator("#cloud-list button");
    await list.first().waitFor();
    await list.nth(0).click();
    await page.locator("[data-share-passcode]").waitFor();
    const passcode = "A secure passcode";
    const fillShareForm = async () => {
      await page.locator("[data-share-passcode]").fill(passcode);
      await page.locator("[data-share-confirm]").check();
      await page.locator(".share-form button.primary").click();
    };

    await page.locator('input[aria-label="タイトル"]').fill("Unsaved title");
    await fillShareForm();
    await page.locator("#cloud-message.warning").waitFor();
    assert.equal(postBodies.length, 0);
    await page.once("dialog", (dialog) => dialog.accept());
    await list.nth(0).click();
    await page.locator("[data-share-passcode]").waitFor();

    for (const status of [400, 403, 409]) {
      failureStatus = status;
      await fillShareForm();
      await page.locator("#cloud-message.error").waitFor();
      assert.equal(postBodies.at(-1).body.confirmed, true);
      assert.equal(await page.locator("input.share-link-value").count(), 0);
    }

    delayedManualId = "manual-1";
    await fillShareForm();
    for (let attempt = 0; attempt < 20 && !releaseDelayedPost; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(typeof releaseDelayedPost, "function");
    await list.nth(1).click();
    await page.locator("#cloud-detail h2").filter({ hasText: "Manual Two" }).waitFor();
    const postsBeforeBusyAttempt = postBodies.length;
    await fillShareForm();
    await page.locator("#cloud-message.warning").waitFor();
    assert.equal(postBodies.length, postsBeforeBusyAttempt);
    releaseDelayedPost();
    releaseDelayedPost = null;
    await page.waitForTimeout(100);
    assert.match(await page.locator("#cloud-detail h2").textContent(), /Manual Two/);
    assert.equal(await page.locator("[data-share-passcode]").isVisible(), true);
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
