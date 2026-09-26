import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { chromium } from "@playwright/test";
import { ONBOARDING_CSS, ONBOARDING_JS, renderOnboardingContinuePage } from "../apps/worker/src/onboarding-assets.ts";

test("guest share claim returns to manual sharing settings without auto-issuing a link", { timeout: 20_000 }, async () => {
  const handoffId = "A".repeat(43);
  const extensionId = "a".repeat(32);
  const operationId = "O".repeat(43);
  const claimIntentId = "00000000-0000-4000-8000-000000000000";
  const draftFingerprint = "a".repeat(64);
  let bootstrapCalls = 0;
  let claimIntentCalls = 0;
  let claimCalls = 0;
  let sharePosts = 0;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    response.setHeader("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    const json = (status, body) => { response.writeHead(status, { "content-type": "application/json; charset=utf-8" }); response.end(JSON.stringify(body)); };
    if (url.pathname === "/onboarding/continue") { response.setHeader("content-type", "text/html; charset=utf-8"); response.end(renderOnboardingContinuePage({ bootstrapEnabled: true })); return; }
    if (url.pathname === "/assets/onboarding.js") { response.setHeader("content-type", "application/javascript; charset=utf-8"); response.end(ONBOARDING_JS); return; }
    if (url.pathname === "/assets/onboarding.css") { response.setHeader("content-type", "text/css; charset=utf-8"); response.end(ONBOARDING_CSS); return; }
    if (url.pathname === "/manuals") { response.setHeader("content-type", "text/html; charset=utf-8"); response.end("<!doctype html><title>manuals</title>"); return; }
    if (url.pathname === "/api/onboarding/bootstrap" && request.method === "POST") { bootstrapCalls += 1; json(200, { status: "ready", workspaceId: "workspace-share" }); return; }
    if (url.pathname === "/api/onboarding/claim-intents" && request.method === "POST") { claimIntentCalls += 1; json(200, { claimIntentId }); return; }
    if (url.pathname === `/api/onboarding/claims/${claimIntentId}` && request.method === "POST") { claimCalls += 1; json(200, { status: "claimed", manualId: "manual-share" }); return; }
    if (url.pathname.includes("/share-links") && request.method === "POST") { sharePosts += 1; json(500, { message: "unexpected share issue" }); return; }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    await page.addInitScript(({ handoffId: id, operationId: op, claimIntentId: intent, draftFingerprint: fingerprint }) => {
      globalThis.chrome = { runtime: { sendMessage: async (_extensionId, message) => {
        if (message.type === "handoff.begin") return { ok: true, status: "active", operationId: op, expiresAt: new Date(Date.now() + 60_000).toISOString() };
        if (message.type === "handoff.recovery") return { ok: false, error: "RECOVERY_NOT_FOUND" };
        if (message.type === "handoff.prepare") return { ok: true, draft: { title: "共有対象", description: "説明", steps: [{ title: "手順", instruction: "操作" }] }, assets: [], draftFingerprint: fingerprint };
        if (message.type === "handoff.finalize-pending") return { ok: true, status: "finalize-pending", operationId: op, claimIntentId: intent, draftFingerprint: fingerprint };
        if (message.type === "handoff.completed") return { ok: true, status: "completed" };
        throw new Error("unexpected message: " + message.type);
      } } };
      globalThis.__shareHandoff = id;
    }, { handoffId, operationId, claimIntentId, draftFingerprint });
    await page.goto(`${baseUrl}/onboarding/continue#handoff=${handoffId}&extensionId=${extensionId}&action=share`);
    await page.getByRole("button", { name: "保存先を準備する" }).click();
    await page.getByRole("button", { name: "共有設定を開く" }).waitFor({ timeout: 3_000 });
    assert.equal(bootstrapCalls, 1);
    assert.equal(claimIntentCalls, 1);
    assert.equal(claimCalls, 1);
    await page.getByRole("button", { name: "共有設定を開く" }).click();
    await page.waitForURL("**/manuals?shareManualId=manual-share");
    assert.equal(new URL(page.url()).searchParams.get("shareManualId"), "manual-share");
    assert.equal(sharePosts, 0);
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
