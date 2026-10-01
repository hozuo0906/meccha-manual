import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import test from "node:test";
import { chromium } from "./support/test-browser.mjs";
import { handleShareLinkRoute } from "../apps/worker/src/share-link-router.ts";

const SHARE_TOKEN = "T".repeat(43);
const SHARE_GRANT = "G".repeat(43);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const BUSINESS_SCREEN_ONE = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="#f3fbfa"/><rect x="42" y="34" width="876" height="72" rx="14" fill="#087f7a"/><text x="72" y="81" fill="white" font-family="sans-serif" font-size="30" font-weight="700">経費申請ポータル</text><rect x="72" y="150" width="816" height="76" rx="10" fill="white" stroke="#b6deda"/><text x="98" y="196" fill="#20282e" font-family="sans-serif" font-size="24">申請一覧を開く</text><rect x="72" y="258" width="390" height="190" rx="10" fill="white" stroke="#b6deda"/><text x="98" y="308" fill="#20282e" font-family="sans-serif" font-size="22" font-weight="700">今月の申請</text><text x="98" y="354" fill="#52666a" font-family="sans-serif" font-size="20">交通費  12,400円</text><text x="98" y="394" fill="#52666a" font-family="sans-serif" font-size="20">備品費   8,900円</text><rect x="500" y="258" width="388" height="190" rx="10" fill="#dff5f1"/><text x="530" y="340" fill="#087f7a" font-family="sans-serif" font-size="26" font-weight="700">新規申請</text></svg>`, "utf8");
const BUSINESS_SCREEN_TWO = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="#fffaf0"/><rect x="42" y="34" width="876" height="72" rx="14" fill="#c86d3b"/><text x="72" y="81" fill="white" font-family="sans-serif" font-size="30" font-weight="700">承認待ち一覧</text><rect x="72" y="150" width="816" height="70" rx="10" fill="white" stroke="#e6c9ad"/><text x="98" y="195" fill="#20282e" font-family="sans-serif" font-size="24">対象月：2026年9月</text><rect x="72" y="252" width="816" height="54" fill="#f7eadf"/><text x="98" y="288" fill="#20282e" font-family="sans-serif" font-size="20" font-weight="700">申請者     金額      状態</text><text x="98" y="350" fill="#52666a" font-family="sans-serif" font-size="20">山田 太郎   12,400円  承認待ち</text><text x="98" y="400" fill="#52666a" font-family="sans-serif" font-size="20">佐藤 花子    8,900円  確認中</text></svg>`, "utf8");

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
  const brandAsset = url.pathname === "/s/assets/brand/logo.png" ? "meccha-manual-logo-mark.png" : url.pathname === "/s/assets/brand/mascot.png" ? "meccha-manual-mascot-me-clear-eyes.png" : null;
  if (brandAsset) { const bytes = await readFile(new URL(`../apps/worker/brand-assets/assets/${brandAsset}`, import.meta.url)); response.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" }); response.end(bytes); return true; }
  const workerResponse = await handleShareLinkRoute(new Request(`http://${request.headers.host}${url.pathname}${url.search}`, { method: request.method }), {});
  if (!workerResponse) return false;
  response.writeHead(workerResponse.status, Object.fromEntries(workerResponse.headers));
  response.end(Buffer.from(await workerResponse.arrayBuffer()));
  return true;
}

async function startViewerServer({ assetStatus = 200, assetStatuses = null, resolvePasscode = null, multiImage = false } = {}) {
  const state = { tokens: [], grants: [], passcodes: [], assetGrants: [], contentGrants: [], assetAttempts: 0 };
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
        return sendJson(response, 200, { title: "共有された手順書", description: "ブラウザ確認用", permission: "read_only", expiresAt: "2099-01-01T00:00:00.000Z", ...(multiImage?{branding:{themeColor:"#563aa3",logoId:"synthetic-logo"}}:{}), steps: multiImage ? [{ id: "step-1", position: 0, title: "申請画面を開く", instruction: "申請一覧を表示", assetId: "asset-1", annotations:[{id:"rectangle",type:"rectangle",x:.05,y:.3,width:.8,height:.1,color:"#a14eba",strokeWidth:4}] }, { id: "step-2", position: 1, title: "承認待ちを確認", instruction: "対象月の状態を確認", assetId: "asset-2" }, { id: "step-3", position: 2, title: "画像なしの確認", instruction: "画像が無い場合の案内" }] : [{ id: "step-1", position: 0, title: "画像付き手順", instruction: "画像を確認", assetId: "asset-1" }] });
      }
      if(url.pathname==="/s/api/logos/synthetic-logo"){assert.equal(request.headers["x-share-grant"],SHARE_GRANT);response.writeHead(200,{"content-type":"image/png"});return response.end(PNG);}
      if (/^\/s\/api\/assets\/asset-[12]$/.test(url.pathname) && request.method === "GET") {
        state.assetGrants.push(request.headers["x-share-grant"] || "");
        if ((request.headers["x-share-grant"] || "") !== SHARE_GRANT) return sendJson(response, 401, { code: "SHARE_UNAVAILABLE" });
        const status = Array.isArray(assetStatuses) ? assetStatuses[Math.min(state.assetAttempts, assetStatuses.length - 1)] : assetStatus;
        state.assetAttempts += 1;
        if (status !== 200) return sendJson(response, status, { code: "SHARE_UNAVAILABLE" });
        response.writeHead(200, { "content-type": multiImage ? "image/svg+xml" : "image/png", "cache-control": "no-store" });
        return response.end(multiImage ? (url.pathname.endsWith("asset-2") ? BUSINESS_SCREEN_TWO : BUSINESS_SCREEN_ONE) : PNG);
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

test("share viewer presents readable multi-image steps on desktop and mobile", { timeout: 30_000 }, async () => {
  const { baseUrl, server, state } = await startViewerServer({ multiImage: true });
  let context;
  try {
    const launched = await launchPage(); context = launched.context; const page = launched.page;
    await page.goto(`${baseUrl}/s/#token=${SHARE_TOKEN}`);
    await page.locator("#share-passcode").fill("correct-passcode"); await page.locator("#share-submit").click();
    await page.locator("#share-content").waitFor({ state: "visible" });
    await page.waitForFunction(() => [...document.querySelectorAll("#share-content img")].filter((image) => image.naturalWidth >= 900).length === 2);
    assert.equal(await page.locator("#share-content .share-step").count(), 3);
    assert.equal(await page.getByRole("heading", { name: /手順 1：/ }).count(), 1);
    assert.equal(await page.getByRole("heading", { name: /手順 2：/ }).count(), 1);
    assert.equal(await page.getByText("この手順には画像がありません。", { exact: true }).count(), 1);
    assert.equal(await page.locator("img[src='/s/assets/brand/logo.png']").count(), 1);
    assert.equal(await page.locator("img[src='/s/assets/brand/mascot.png']").count(), 1);
    await page.screenshot({ path: ".artifacts/experience-repair/share-viewer-desktop.png", fullPage: true });
    await mkdir(".artifacts/uiux-20261001/screens",{recursive:true});
    for(const width of [1366,1024,390]){await page.setViewportSize({width,height:width===390?844:900});await page.screenshot({path:`.artifacts/uiux-20261001/screens/reader-${width}.png`});}
    await page.waitForFunction(()=>!document.querySelector(".reader-print")?.disabled);
    assert.equal(await page.locator(".reader-team-logo").isVisible(),true);
    const pixel=await page.locator(".share-step-image-card img").first().evaluate(image=>{const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext("2d");ctx.drawImage(image,0,0);return [...ctx.getImageData(48,180,1,1).data];});
    assert.deepEqual(pixel,[161,78,186,255],"shared output must draw the edited rectangle color");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => [...document.querySelectorAll("#share-content img")].every((image) => image.getBoundingClientRect().width <= 358));
    await page.screenshot({ path: ".artifacts/experience-repair/share-viewer-mobile.png", fullPage: true });
    assert.equal(state.assetAttempts, 2);
  } finally { await context?.close(); server.closeAllConnections?.(); await new Promise((resolve) => server.close(resolve)); }
});

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
    await page.waitForFunction(() => document.querySelector("#share-content img")?.naturalWidth === 1);

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
    assert.equal(await page.locator("#share-content .share-step").getByText("画像付き手順").count(), 1);
    assert.equal(await page.locator("#share-content img").count(), 1);
    assert.equal(await page.locator("#share-submit").count(), 1);
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

test("share viewer keeps a failed image visible with a retry action when the grant is rejected", { timeout: 30_000 }, async () => {
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
    await page.locator("#share-content img").waitFor({ state: "attached" });
    await page.waitForFunction(() => document.querySelector("#share-content img")?.hidden === true);
    assert.equal(state.assetGrants.length, 1);
    assert.equal(state.assetGrants[0] === SHARE_GRANT, true);
    assert.equal(await page.locator(".share-image-error:visible").count(), 1);
    assert.equal(await page.getByRole("button", { name: "画像をもう一度読み込む" }).count(), 1);
    assert.equal(await page.locator("#share-content img").count(), 1);
    assert.equal(await page.locator("#share-content img").isHidden(), true);
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("share viewer retries a failed image with the retained grant", { timeout: 30_000 }, async () => {
  const { baseUrl, server, state } = await startViewerServer({ assetStatuses: [500, 200] });
  let context;
  try {
    const launched = await launchPage();
    context = launched.context;
    const page = launched.page;
    await page.goto(`${baseUrl}/s/#token=${SHARE_TOKEN}`);
    await page.locator("#share-passcode").fill("correct-passcode");
    await page.locator("#share-submit").click();
    await page.locator("#share-content").waitFor({ state: "visible" });
    await page.locator(".share-image-retry").waitFor();
    assert.equal(state.assetAttempts, 1);
    await page.locator(".share-image-retry").click();
    await page.waitForFunction(() => document.querySelector("#share-content img")?.naturalWidth === 1);
    assert.equal(state.assetAttempts, 2);
    assert.deepEqual(state.assetGrants, [SHARE_GRANT, SHARE_GRANT]);
    assert.equal(new URL(page.url()).hash.length, 0);
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("share viewer sends an 80-emoji passcode without truncating it", { timeout: 30_000 }, async () => {
  const passcode = "😀".repeat(80);
  assert.equal([...passcode].length, 80);
  assert.equal(passcode.codePointAt(0), 0x1f600);
  const { baseUrl, server, state } = await startViewerServer({ resolvePasscode: passcode });
  let context;
  try {
    const launched = await launchPage();
    context = launched.context;
    const page = launched.page;
    await page.goto(`${baseUrl}/s/#token=${SHARE_TOKEN}`);
    const input = page.locator("#share-passcode");
    assert.equal(await input.getAttribute("maxlength"), "256");
    await input.fill(passcode);
    assert.equal(await input.inputValue(), passcode);
    await page.locator("#share-submit").click();
    await page.locator("#share-content").waitFor({ state: "visible" });
    assert.deepEqual(state.passcodes, [passcode]);
    assert.equal(await page.locator("#share-content .reader-document-header h2").count(), 1);
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
