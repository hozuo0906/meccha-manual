import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { chromium } from "@playwright/test";
import { handleShareLinkRoute } from "../apps/worker/src/share-link-router.ts";

const SHARE_TOKEN = "T".repeat(43);
const SHARE_GRANT = "G".repeat(43);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

async function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : null;
}

async function serveStaticWorkerRoute(request, response) {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname !== "/s/" && !url.pathname.startsWith("/s/assets/")) return false;
  const workerResponse = await handleShareLinkRoute(new Request(`http://${request.headers.host}${url.pathname}${url.search}`, { method: request.method }), {});
  if (!workerResponse) return false;
  response.writeHead(workerResponse.status, Object.fromEntries(workerResponse.headers));
  response.end(Buffer.from(await workerResponse.arrayBuffer()));
  return true;
}

async function startViewerServer({ assetStatus = 200, resolvePasscode = null } = {}) {
  const state = { tokens: [], grants: [], passcodes: [], assetGrants: [], contentGrants: [] };
  const server = createServer(async (request, response) => {
    try {
      if (await serveStaticWorkerRoute(request, response)) return;
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (url.pathname === "/s/api/resolve" && request.method === "POST") {
        const body = await readBody(request);
        state.tokens.push(request.headers["x-share-token"] || "");
        state.passcodes.push(body?.passcode || "");
        if (resolvePasscode !== null && body?.passcode !== resolvePasscode) return sendJson(response, 401, { code: "SHARE_UNAVAILABLE" });
        return sendJson(response, 200, { grant: SHARE_GRANT, expiresAt: "2099-01-01T00:00:00.000Z", permission: "read_only" });
      }
      if (url.pathname === "/s/api/content" && request.method === "POST") {
        state.contentGrants.push(request.headers["x-share-grant"] || "");
        if ((request.headers["x-share-grant"] || "") !== SHARE_GRANT) return sendJson(response, 401, { code: "SHARE_UNAVAILABLE" });
        return sendJson(response, 200, { title: "共有された手順書", description: "ブラウザ確認用", permission: "read_only", expiresAt: "2099-01-01T00:00:00.000Z", steps: [{ id: "step-1", position: 0, title: "画像付き手順", instruction: "画像を確認", assetId: "asset-1" }] });
      }
      if (url.pathname === "/s/api/assets/asset-1" && request.method === "GET") {
        state.assetGrants.push(request.headers["x-share-grant"] || "");
        if ((request.headers["x-share-grant"] || "") !== SHARE_GRANT) return sendJson(response, 401, { code: "SHARE_UNAVAILABLE" });
        if (assetStatus !== 200) return sendJson(response, assetStatus, { code: "SHARE_UNAVAILABLE" });
        response.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
        return response.end(PNG);
      }
      response.writeHead(404).end();
    } catch (error) {
      response.writeHead(500).end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, server, state };
}

async function launchPage() {
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  const context = await chromium.launchPersistentContext("", { channel, headless: true, viewport: { width: 1280, height: 900 } });
  return { context, page: await context.newPage() };
}

test("share viewer renders a snapshot, passes grant headers to image fetch, and removes the token fragment", { timeout: 30_000 }, async () => {
  const { baseUrl, server, state } = await startViewerServer();
  let context;
  try {
    const launched = await launchPage();
    context = launched.context;
    const page = launched.page;
    await page.goto(`${baseUrl}/s/#token=${SHARE_TOKEN}`);
    await page.locator("#share-passcode").fill("correct-passcode");
    await page.locator("#share-submit").click();
    await page.locator("#share-content").waitFor({ state: "visible" });
    await page.waitForFunction(() => document.querySelector("img")?.naturalWidth === 1);

    const finalUrl = new URL(page.url());
    assert.equal(finalUrl.pathname, "/s/");
    assert.equal(finalUrl.hash.length, 0);
    assert.equal(state.tokens.length, 1);
    assert.equal(state.tokens[0] === SHARE_TOKEN, true);
    assert.equal(state.contentGrants.length, 1);
    assert.equal(state.contentGrants[0] === SHARE_GRANT, true);
    assert.equal(state.assetGrants.length, 1);
    assert.equal(state.assetGrants[0] === SHARE_GRANT, true);
    assert.equal(await page.locator("#share-content").getByText("共有された手順書").count(), 1);
    assert.equal(await page.locator("#share-content").getByText("画像付き手順").count(), 1);
    assert.equal(await page.locator("#share-content img").count(), 1);
    assert.equal(await page.locator("button").count(), 1);
    assert.equal(await page.locator("input").count(), 1);
    assert.equal(await page.locator("#share-auth").isHidden(), true);

    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.setViewportSize({ width: 1280, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("share viewer hides auth for an invalid token and retries a rejected passcode", { timeout: 30_000 }, async () => {
  const invalid = await startViewerServer({ resolvePasscode: "correct-passcode" });
  const retry = await startViewerServer({ resolvePasscode: "correct-passcode" });
  let invalidContext;
  let retryContext;
  try {
    const invalidLaunched = await launchPage();
    invalidContext = invalidLaunched.context;
    const invalidPage = invalidLaunched.page;
    await invalidPage.goto(`${invalid.baseUrl}/s/#token=invalid`);
    await invalidPage.waitForFunction(() => document.querySelector("#share-auth")?.hidden === true);
    assert.equal(invalid.state.tokens.length, 0);

    const retryLaunched = await launchPage();
    retryContext = retryLaunched.context;
    const retryPage = retryLaunched.page;
    await retryPage.goto(`${retry.baseUrl}/s/#token=${SHARE_TOKEN}`);
    await retryPage.locator("#share-passcode").fill("wrong-passcode");
    await retryPage.locator("#share-submit").click();
    await retryPage.waitForFunction(() => document.querySelector("#share-auth")?.hidden === false && document.querySelector("#share-content")?.hidden === true);
    assert.equal(retry.state.passcodes.length, 1);
    assert.equal(await retryPage.locator("#share-content").isHidden(), true);

    await retryPage.locator("#share-passcode").fill("correct-passcode");
    await retryPage.locator("#share-submit").click();
    await retryPage.locator("#share-content").waitFor({ state: "visible" });
    assert.equal(retry.state.passcodes.length, 2);
    const finalUrl = new URL(retryPage.url());
    assert.equal(finalUrl.pathname, "/s/");
    assert.equal(finalUrl.hash.length, 0);
  } finally {
    await invalidContext?.close();
    await retryContext?.close();
    invalid.server.closeAllConnections?.();
    retry.server.closeAllConnections?.();
    await Promise.all([new Promise((resolve) => invalid.server.close(resolve)), new Promise((resolve) => retry.server.close(resolve))]);
  }
});

test("share viewer removes an image when the grant is rejected on asset fetch", { timeout: 30_000 }, async () => {
  const { baseUrl, server, state } = await startViewerServer({ assetStatus: 401 });
  let context;
  try {
    const launched = await launchPage();
    context = launched.context;
    const page = launched.page;
    await page.goto(`${baseUrl}/s/#token=${SHARE_TOKEN}`);
    await page.locator("#share-passcode").fill("correct-passcode");
    await page.locator("#share-submit").click();
    await page.locator("#share-content").waitFor({ state: "visible" });
    await page.waitForFunction(() => document.querySelectorAll("#share-content img").length === 0);
    assert.equal(state.assetGrants.length, 1);
    assert.equal(state.assetGrants[0] === SHARE_GRANT, true);
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
