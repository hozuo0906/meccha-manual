import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { chromium } from "@playwright/test";
import { ONBOARDING_CSS, ONBOARDING_JS, renderOnboardingContinuePage } from "../apps/worker/src/onboarding-assets.ts";

test("onboarding browser retries the same operation after response loss and rejects expired reload metadata", { timeout: 20_000 }, async () => {
  const calls = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    response.setHeader("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    if (url.pathname === "/onboarding/continue") { response.setHeader("content-type", "text/html; charset=utf-8"); response.end(renderOnboardingContinuePage({ bootstrapEnabled: true })); return; }
    if (url.pathname === "/assets/onboarding.css") { response.setHeader("content-type", "text/css; charset=utf-8"); response.end(ONBOARDING_CSS); return; }
    if (url.pathname === "/assets/onboarding.js") { response.setHeader("content-type", "application/javascript; charset=utf-8"); response.end(ONBOARDING_JS); return; }
    if (url.pathname === "/api/onboarding/bootstrap" && request.method === "POST") {
      let body = "";
      for await (const chunk of request) body += chunk;
      const payload = JSON.parse(body);
      calls.push(payload);
      response.setHeader("content-type", "application/json; charset=utf-8");
      if (calls.length === 1) { response.writeHead(503); response.end(JSON.stringify({ code: "ONBOARDING_UNAVAILABLE" })); return; }
      response.end(JSON.stringify({ status: "ready", workspaceId: "server-workspace", createdIdentity: true }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const handoff = "A".repeat(43);
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/onboarding/continue#handoff=${handoff}`);
    await page.getByRole("button", { name: "保存先を準備する" }).click();
    await page.getByRole("button", { name: "同じ操作で再試行" }).waitFor();
    assert.match(await page.locator("#status").textContent(), /失敗しました/);
    const firstOperation = calls[0]?.operationId;
    assert.match(firstOperation, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(JSON.stringify(calls[0]).includes("title"), false);

    await page.reload();
    await page.locator("#bootstrap").click();
    await page.getByText(/保存先の準備が完了しました/).waitFor();
    assert.equal(calls.length, 2);
    assert.equal(calls[1].operationId, firstOperation);

    await page.evaluate(() => {
      const value = JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation"));
      value.createdAt = new Date(Date.now() - 16 * 60 * 1000).toISOString();
      sessionStorage.setItem("meccha-manual:onboarding-operation", JSON.stringify(value));
    });
    await page.reload();
    assert.equal(await page.locator("#bootstrap").isDisabled(), true);
    assert.match(await page.locator("#status").textContent(), /識別情報が確認できません/);
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
