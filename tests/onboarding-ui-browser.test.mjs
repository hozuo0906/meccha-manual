import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { chromium } from "@playwright/test";
import { ONBOARDING_CSS, ONBOARDING_JS, renderOnboardingContinuePage } from "../apps/worker/src/onboarding-assets.ts";

test("onboarding browser retries the same operation after a 503 and rejects expired reload metadata", { timeout: 20_000 }, async () => {
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
    const firstCreatedAt = await page.evaluate(() => { const value = JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation")); return value.entries.find((entry) => entry.handoffId === value.activeHandoffId).createdAt; });

    await page.goto(`${baseUrl}/onboarding/continue?same=1#handoff=${handoff}`);
    assert.equal(await page.evaluate(() => { const value = JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation")); return value.entries.find((entry) => entry.handoffId === value.activeHandoffId).createdAt; }), firstCreatedAt);
    await page.reload();
    await page.locator("#bootstrap").click();
    await page.getByText(/保存先の準備が完了しました/).waitFor();
    assert.equal(calls.length, 2);
    assert.equal(calls[1].operationId, firstOperation);

    await page.evaluate(() => {
      const value = JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation"));
      value.entries.find((entry) => entry.handoffId === value.activeHandoffId).createdAt = new Date(Date.now() - 16 * 60 * 1000).toISOString();
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

test("onboarding rejects malformed or empty fragments even when a fresh saved handoff exists", { timeout: 20_000 }, async () => {
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
      calls.push(JSON.parse(body));
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ status: "ready" }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const handoff = "B".repeat(43);
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/onboarding/continue#handoff=${handoff}`);
    const savedBefore = await page.evaluate(() => sessionStorage.getItem("meccha-manual:onboarding-operation"));
    assert.match(savedBefore, new RegExp(handoff));

    for (const [index, fragment] of ["handoff=", "handoff=malformed", `handoff=${handoff}&handoff=${handoff}`].entries()) {
      await page.goto(`${baseUrl}/onboarding/continue?case=${index}#${fragment}`);
      assert.equal(await page.locator("#bootstrap").isDisabled(), true, `${fragment} url=${page.url()} status=${await page.locator("#status").textContent()}`);
      assert.equal(await page.evaluate(() => sessionStorage.getItem("meccha-manual:onboarding-operation")), savedBefore, fragment);
    }
    assert.equal(calls.length, 0);
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("onboarding does not mint or retry an expired operation after a failed request", { timeout: 20_000 }, async () => {
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
      calls.push(JSON.parse(body));
      response.writeHead(503, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ code: "ONBOARDING_UNAVAILABLE" }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const handoff = "C".repeat(43);
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const realNow = Date.now.bind(Date);
      let offset = 0;
      Date.now = () => realNow() + offset;
      globalThis.advanceOnboardingClock = (milliseconds) => { offset += milliseconds; };
    });
    const initialHandoff = "D".repeat(43);
    await page.goto(`${baseUrl}/onboarding/continue#handoff=${initialHandoff}`);
    const initialOperation = await page.evaluate(() => { const value = JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation")); return value.entries.find((entry) => entry.handoffId === value.activeHandoffId).operationId; });
    await page.evaluate(() => globalThis.advanceOnboardingClock(16 * 60 * 1000));
    await page.locator("#bootstrap").click();
    await page.waitForFunction(() => document.querySelector("#bootstrap")?.disabled === true);
    assert.equal(calls.length, 0);
    assert.equal(await page.evaluate(() => { const value = JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation")); return value.entries.find((entry) => entry.handoffId === value.activeHandoffId).operationId; }), initialOperation);

    await page.goto(`${baseUrl}/onboarding/continue?retry=1#handoff=${handoff}`);
    const firstOperation = await page.evaluate(() => { const value = JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation")); return value.entries.find((entry) => entry.handoffId === value.activeHandoffId).operationId; });
    await page.locator("#bootstrap").click();
    await page.waitForFunction(() => document.querySelector("#status")?.className.includes("error"));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].operationId, firstOperation);

    await page.evaluate(() => globalThis.advanceOnboardingClock(16 * 60 * 1000));
    await page.locator("#bootstrap").click();
    await page.waitForFunction(() => document.querySelector("#bootstrap")?.disabled === true);
    assert.equal(calls.length, 1);
    assert.equal(await page.evaluate(() => { const value = JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation")); return value.entries.find((entry) => entry.handoffId === value.activeHandoffId).operationId; }), firstOperation);

    await page.evaluate(() => {
      const value = JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation"));
      value.entries.find((entry) => entry.handoffId === value.activeHandoffId).createdAt = new Date(Date.now() - 32 * 60 * 1000).toISOString();
      sessionStorage.setItem("meccha-manual:onboarding-operation", JSON.stringify(value));
    });
    await page.goto(`${baseUrl}/onboarding/continue?retry=2#handoff=${handoff}`);
    await page.waitForFunction(() => document.querySelector("#bootstrap")?.disabled === true);
    assert.equal(calls.length, 1);
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("onboarding retains per-handoff history across A-B-A and tombstones expired A", { timeout: 20_000 }, async () => {
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
      calls.push(JSON.parse(body));
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ status: "ready" }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const handoffA = "E".repeat(43);
  const handoffB = "F".repeat(43);
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/onboarding/continue#handoff=${handoffA}`);
    const firstA = await page.evaluate(() => JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation")));
    await page.goto(`${baseUrl}/onboarding/continue?handoff=b#handoff=${handoffB}`);
    const stateB = await page.evaluate(() => JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation")));
    const operationB = stateB.entries.find((entry) => entry.handoffId === stateB.activeHandoffId).operationId;
    assert.equal(stateB.entries.length, 2);
    assert.equal(stateB.activeHandoffId, handoffB);
    assert.notEqual(operationB, firstA.entries[0].operationId);
    await page.goto(`${baseUrl}/onboarding/continue?handoff=a#handoff=${handoffA}`);
    const stateAAgain = await page.evaluate(() => JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation")));
    const secondA = stateAAgain.entries.find((entry) => entry.handoffId === handoffA);
    assert.equal(stateAAgain.activeHandoffId, handoffA);
    assert.equal(secondA.operationId, firstA.entries[0].operationId);
    assert.equal(secondA.createdAt, firstA.entries[0].createdAt);
    await page.reload();
    await page.locator("#bootstrap").click();
    await page.waitForFunction(() => document.querySelector("#status")?.className.includes("success"));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].operationId, secondA.operationId);

    await page.evaluate(() => {
      const value = JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation"));
      value.entries.find((entry) => entry.handoffId === "E".repeat(43)).createdAt = new Date(Date.now() - 16 * 60 * 1000).toISOString();
      sessionStorage.setItem("meccha-manual:onboarding-operation", JSON.stringify(value));
    });
    await page.goto(`${baseUrl}/onboarding/continue?expired=b#handoff=${handoffB}`);
    await page.goto(`${baseUrl}/onboarding/continue?expired=a#handoff=${handoffA}`);
    assert.equal(await page.locator("#bootstrap").isDisabled(), true);
    assert.equal(calls.length, 1);
    const expiredState = await page.evaluate(() => JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation")));
    assert.equal(expiredState.entries.find((entry) => entry.handoffId === "E".repeat(43)).state, "expired");
    assert.equal(expiredState.entries.length, 2);
    await page.reload();
    assert.equal(await page.locator("#bootstrap").isDisabled(), true);
    const beforeQuotaFailure = JSON.stringify(expiredState);
    await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error("quota"); }; });
    await page.goto(`${baseUrl}/onboarding/continue?quota=c#handoff=${"J".repeat(43)}`);
    assert.equal(await page.locator("#bootstrap").isDisabled(), true);
    assert.equal(await page.evaluate(() => sessionStorage.getItem("meccha-manual:onboarding-operation")), beforeQuotaFailure);
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("onboarding migrates a valid legacy record and fails closed on uncertain storage writes", { timeout: 20_000 }, async () => {
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
      calls.push(JSON.parse(body));
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ status: "ready" }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const handoff = "G".repeat(43);
  const legacyOperation = "H".repeat(43);
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/onboarding/continue`);
    await page.evaluate(({ handoff, operationId }) => sessionStorage.setItem("meccha-manual:onboarding-operation", JSON.stringify({ handoffId: handoff, operationId, createdAt: new Date().toISOString() })), { handoff, operationId: legacyOperation });
    await page.goto(`${baseUrl}/onboarding/continue`);
    const migrated = await page.evaluate(() => JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation")));
    assert.equal(migrated.version, 2);
    assert.equal(migrated.activeHandoffId, handoff);
    assert.equal(migrated.entries.length, 1);
    assert.equal(migrated.entries[0].operationId, legacyOperation);

    await page.evaluate(() => sessionStorage.setItem("meccha-manual:onboarding-operation", "{"));
    await page.goto(`${baseUrl}/onboarding/continue?malformed=1#handoff=${handoff}`);
    assert.equal(await page.locator("#bootstrap").isDisabled(), true);
    assert.equal(await page.evaluate(() => sessionStorage.getItem("meccha-manual:onboarding-operation")), "{");
    await page.evaluate(({ handoff }) => sessionStorage.setItem("meccha-manual:onboarding-operation", JSON.stringify({ version: 2, activeHandoffId: handoff, entries: [{ handoffId: handoff, operationId: "K".repeat(43), createdAt: new Date().toISOString(), state: "active" }, { handoffId: handoff, operationId: "L".repeat(43), createdAt: new Date().toISOString(), state: "active" }] })), { handoff });
    await page.goto(`${baseUrl}/onboarding/continue?duplicate=1#handoff=${handoff}`);
    assert.equal(await page.locator("#bootstrap").isDisabled(), true);
    assert.equal(calls.length, 0);

    await page.evaluate(() => sessionStorage.clear());
    const failingPage = await context.newPage();
    await failingPage.addInitScript(() => {
      Storage.prototype.setItem = () => { throw new Error("quota"); };
    });
    await failingPage.goto(`${baseUrl}/onboarding/continue#handoff=${"I".repeat(43)}`);
    assert.equal(await failingPage.locator("#bootstrap").isDisabled(), true);
    assert.equal(await failingPage.evaluate(() => sessionStorage.getItem("meccha-manual:onboarding-operation")), null);
    assert.equal(calls.length, 0);
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
