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

test("onboarding revalidates hash-only handoff navigation before bootstrap", { timeout: 20_000 }, async () => {
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
  const handoffA = "J".repeat(43);
  const handoffB = "K".repeat(43);
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/onboarding/continue#handoff=${handoffA}`);
    const operationA = await page.evaluate(() => {
      const value = JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation"));
      return value.entries.find((entry) => entry.handoffId === value.activeHandoffId).operationId;
    });

    await page.evaluate((handoff) => { setTimeout(() => { location.hash = `handoff=${handoff}`; }, 0); }, handoffB);
    await page.waitForFunction((handoff) => {
      const value = JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation"));
      return location.hash === "" && value.activeHandoffId === handoff;
    }, handoffB);
    const stateB = await page.evaluate(() => JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation")));
    const operationB = stateB.entries.find((entry) => entry.handoffId === stateB.activeHandoffId).operationId;
    assert.equal(stateB.activeHandoffId, handoffB);
    assert.equal(stateB.entries.length, 2);
    assert.notEqual(operationB, operationA);

    await page.locator("#bootstrap").click();
    await page.waitForFunction(() => document.querySelector("#status")?.className.includes("success"));
    assert.deepEqual(calls, [{ operationId: operationB }]);

    const beforeInvalidHash = await page.evaluate(() => sessionStorage.getItem("meccha-manual:onboarding-operation"));
    await page.evaluate(() => { setTimeout(() => { location.hash = "handoff=invalid"; }, 0); });
    await page.waitForFunction(() => location.hash === "" && document.querySelector("#bootstrap")?.disabled === true);
    assert.equal(calls.length, 1);
    assert.equal(await page.evaluate(() => sessionStorage.getItem("meccha-manual:onboarding-operation")), beforeInvalidHash);
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
      globalThis.resetOnboardingClock = () => { offset = 0; };
    });
    const noFragmentHandoff = "E".repeat(43);
    await page.goto(`${baseUrl}/onboarding/continue?case=e#handoff=${noFragmentHandoff}`);
    const noFragmentOperation = await page.evaluate(() => JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation")).entries.find((entry) => entry.handoffId === "E".repeat(43)).operationId);
    await page.goto(`${baseUrl}/onboarding/continue?without-fragment=1`);
    await page.evaluate(() => globalThis.advanceOnboardingClock(16 * 60 * 1000));
    await page.locator("#bootstrap").click();
    await page.waitForFunction(() => document.querySelector("#bootstrap")?.disabled === true);
    assert.equal(calls.length, 0);
    assert.deepEqual(await page.evaluate(() => { const value = JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation")); const entry = value.entries.find((entry) => entry.handoffId === "E".repeat(43)); return { operationId: entry.operationId, state: entry.state }; }), { operationId: noFragmentOperation, state: "expired" });
    await page.evaluate(() => globalThis.advanceOnboardingClock(-16 * 60 * 1000));
    assert.equal(await page.locator("#bootstrap").isDisabled(), true);
    await page.reload();
    assert.equal(await page.locator("#bootstrap").isDisabled(), true);
    await page.goto(`${baseUrl}/onboarding/continue?case=e-revisit#handoff=${noFragmentHandoff}`);
    assert.equal(await page.locator("#bootstrap").isDisabled(), true);

    await page.evaluate(() => globalThis.resetOnboardingClock());
    const initialHandoff = "D".repeat(43);
    await page.goto(`${baseUrl}/onboarding/continue?case=d#handoff=${initialHandoff}`);
    const initialOperation = await page.evaluate(() => { const value = JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation")); return value.entries.find((entry) => entry.handoffId === value.activeHandoffId).operationId; });
    await page.evaluate(() => globalThis.advanceOnboardingClock(16 * 60 * 1000));
    await page.locator("#bootstrap").click();
    await page.waitForFunction(() => document.querySelector("#bootstrap")?.disabled === true);
    assert.equal(calls.length, 0);
    assert.deepEqual(await page.evaluate(() => { const value = JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation")); const entry = value.entries.find((entry) => entry.handoffId === value.activeHandoffId); return { operationId: entry.operationId, state: entry.state }; }), { operationId: initialOperation, state: "expired" });
    await page.evaluate(() => globalThis.advanceOnboardingClock(-16 * 60 * 1000));
    assert.equal(await page.locator("#bootstrap").isDisabled(), true);
    assert.equal(calls.length, 0);
    assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation")).entries.find((entry) => entry.handoffId === "D".repeat(43)).state), "expired");
    await page.reload();
    assert.equal(await page.locator("#bootstrap").isDisabled(), true);
    await page.goto(`${baseUrl}/onboarding/continue?case=d-revisit#handoff=${initialHandoff}`);
    assert.equal(await page.locator("#bootstrap").isDisabled(), true);

    await page.evaluate(() => globalThis.resetOnboardingClock());
    const storageFailureHandoff = "F".repeat(43);
    await page.goto(`${baseUrl}/onboarding/continue?case=f#handoff=${storageFailureHandoff}`);
    await page.goto(`${baseUrl}/onboarding/continue?case=f-storage-failure`);
    await page.evaluate(() => {
      globalThis.originalOnboardingSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = () => { throw new Error("quota"); };
      globalThis.advanceOnboardingClock(16 * 60 * 1000);
    });
    await page.locator("#bootstrap").click();
    await page.waitForFunction(() => document.querySelector("#bootstrap")?.disabled === true);
    assert.equal(calls.length, 0);
    assert.deepEqual(await page.evaluate(() => { const value = JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation")); return { history: value.entries.map((entry) => [entry.handoffId, entry.state]), active: value.activeHandoffId }; }), { history: [["E".repeat(43), "expired"], ["D".repeat(43), "expired"], ["F".repeat(43), "active"]], active: storageFailureHandoff });
    await page.evaluate(() => { Storage.prototype.setItem = globalThis.originalOnboardingSetItem; });

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

test("onboarding reconciles a completed finalize after the response is lost", { timeout: 20_000 }, async () => {
  let intentCalls = 0;
  const bootstrapOperations = [];
  const intentOperations = [];
  let finalizeCalls = 0;
  let statusCalls = 0;
  let completed = false;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    response.setHeader("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    if (url.pathname === "/onboarding/continue") { response.setHeader("content-type", "text/html; charset=utf-8"); response.end(renderOnboardingContinuePage({ bootstrapEnabled: true })); return; }
    if (url.pathname === "/assets/onboarding.css") { response.setHeader("content-type", "text/css; charset=utf-8"); response.end(ONBOARDING_CSS); return; }
    if (url.pathname === "/assets/onboarding.js") { response.setHeader("content-type", "application/javascript; charset=utf-8"); response.end(ONBOARDING_JS); return; }
    if (url.pathname === "/api/onboarding/bootstrap" && request.method === "POST") { let body = ""; for await (const chunk of request) body += chunk; bootstrapOperations.push(JSON.parse(body).operationId); response.setHeader("content-type", "application/json; charset=utf-8"); response.end(JSON.stringify({ status: "ready", workspaceId: "workspace-1" })); return; }
    if (url.pathname === "/api/onboarding/claim-intents" && request.method === "POST") { let body = ""; for await (const chunk of request) body += chunk; intentOperations.push(JSON.parse(body).operationId); intentCalls += 1; response.setHeader("content-type", "application/json; charset=utf-8"); response.end(JSON.stringify({ claimIntentId: "intent-1" })); return; }
    if (url.pathname === "/api/onboarding/claims/intent-1" && request.method === "GET") { statusCalls += 1; response.setHeader("content-type", "application/json; charset=utf-8"); response.end(JSON.stringify(completed ? { status: "completed", manualId: "manual-1" } : { status: "pending" })); return; }
    if (url.pathname === "/api/onboarding/claims/intent-1" && request.method === "POST") { finalizeCalls += 1; completed = true; response.writeHead(200, { "content-type": "application/json; charset=utf-8" }); response.end(); return; }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const handoff = "S".repeat(43);
  const extensionId = "b".repeat(32);
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    await page.addInitScript((extensionId) => {
      let recovery;
      globalThis.chrome = { runtime: { sendMessage: async (_id, message) => {
        if (message.type === "handoff.begin") return { ok: true, status: "active", operationId: "B".repeat(43), expiresAt: new Date(Date.now() + 60_000).toISOString() };
        if (message.type === "handoff.recovery") return recovery || { ok: false, error: "RECOVERY_NOT_FOUND" };
        if (message.type === "handoff.prepare") return { ok: true, draft: { title: "手順書", description: "", steps: [] }, assets: [], draftFingerprint: "b".repeat(64) };
        if (message.type === "handoff.finalize-pending") { recovery = { ok: true, status: "finalize-pending", operationId: message.operationId, claimIntentId: message.claimIntentId, draftFingerprint: message.draftFingerprint, expiresAt: new Date(Date.now() + 60_000).toISOString() }; return recovery; }
        return { ok: true, status: "completed" };
      } } };
    }, extensionId);
    await page.goto(`${baseUrl}/onboarding/continue#handoff=${handoff}&extensionId=${extensionId}`);
    await page.getByRole("button", { name: "保存先を準備する" }).click();
    await page.getByRole("button", { name: "同じ操作で再試行" }).waitFor();
    assert.deepEqual(await page.evaluate(() => JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation")).entries[0].claimStatus), "finalize-pending");
    await page.reload();
    await page.locator("#bootstrap").click();
    await page.getByText("手順書を保存しました。保存した手順書を開きます。").waitFor();
    assert.equal(intentCalls, 1);
    assert.deepEqual(bootstrapOperations, ["B".repeat(43)]);
    assert.deepEqual(intentOperations, ["B".repeat(43)]);
    assert.equal(finalizeCalls, 1);
    assert.equal(statusCalls, 1);
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("onboarding retries a pending finalize without re-uploading or creating a new intent", { timeout: 20_000 }, async () => {
  let intentCalls = 0;
  let finalizeCalls = 0;
  let statusCalls = 0;
  let finalizeSeen = false;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    response.setHeader("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    if (url.pathname === "/onboarding/continue") { response.setHeader("content-type", "text/html; charset=utf-8"); response.end(renderOnboardingContinuePage({ bootstrapEnabled: true })); return; }
    if (url.pathname === "/assets/onboarding.css") { response.setHeader("content-type", "text/css; charset=utf-8"); response.end(ONBOARDING_CSS); return; }
    if (url.pathname === "/assets/onboarding.js") { response.setHeader("content-type", "application/javascript; charset=utf-8"); response.end(ONBOARDING_JS); return; }
    if (url.pathname === "/api/onboarding/bootstrap" && request.method === "POST") { response.setHeader("content-type", "application/json; charset=utf-8"); response.end(JSON.stringify({ status: "ready", workspaceId: "workspace-1" })); return; }
    if (url.pathname === "/api/onboarding/claim-intents" && request.method === "POST") { intentCalls += 1; response.setHeader("content-type", "application/json; charset=utf-8"); response.end(JSON.stringify({ claimIntentId: "intent-1" })); return; }
    if (url.pathname === "/api/onboarding/claims/intent-1" && request.method === "GET") { statusCalls += 1; response.setHeader("content-type", "application/json; charset=utf-8"); response.end(JSON.stringify(statusCalls === 1 ? { status: "pending" } : { status: "claimed", manualId: "manual-1" })); return; }
    if (url.pathname === "/api/onboarding/claims/intent-1" && request.method === "POST") { finalizeCalls += 1; finalizeSeen = true; if (finalizeCalls === 1) { response.writeHead(503, { "content-type": "application/json; charset=utf-8" }); response.end(JSON.stringify({ status: "pending" })); return; } response.setHeader("content-type", "application/json; charset=utf-8"); response.end(JSON.stringify({ status: "claimed", manualId: "manual-1" })); return; }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const handoff = "R".repeat(43);
  const extensionId = "a".repeat(32);
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    await page.addInitScript((extensionId) => {
      let recovery;
      globalThis.chrome = { runtime: { sendMessage: async (_id, message) => {
        if (message.type === "handoff.begin") return { ok: true, status: "active", operationId: "A".repeat(43), expiresAt: new Date(Date.now() + 60_000).toISOString() };
        if (message.type === "handoff.recovery") return recovery || { ok: false, error: "RECOVERY_NOT_FOUND" };
        if (message.type === "handoff.prepare") return { ok: true, draft: { title: "手順書", description: "", steps: [] }, assets: [], draftFingerprint: "a".repeat(64) };
        if (message.type === "handoff.finalize-pending") { recovery = { ok: true, status: "finalize-pending", operationId: message.operationId, claimIntentId: message.claimIntentId, draftFingerprint: message.draftFingerprint, expiresAt: new Date(Date.now() + 60_000).toISOString() }; return recovery; }
        return { ok: true, status: "completed" };
      } } };
    }, extensionId);
    await page.goto(`${baseUrl}/onboarding/continue#handoff=${handoff}&extensionId=${extensionId}`);
    await page.getByRole("button", { name: "保存先を準備する" }).click();
    await page.getByRole("button", { name: "同じ操作で再試行" }).waitFor();
    assert.deepEqual(await page.evaluate(() => JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation")).entries[0].claimStatus), "finalize-pending");
    await page.reload();
    await page.locator("#bootstrap").click();
    await page.getByText("手順書を保存しました。保存した手順書を開きます。").waitFor();
    assert.equal(intentCalls, 1, `intent=${intentCalls} finalize=${finalizeCalls} status=${statusCalls}`);
    assert.ok(finalizeCalls >= 1, `intent=${intentCalls} finalize=${finalizeCalls} status=${statusCalls}`);
    assert.equal(statusCalls, 1, `intent=${intentCalls} finalize=${finalizeCalls} status=${statusCalls}`);
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("onboarding recovers a completed handoff from extension durable identity without bootstrap", { timeout: 20_000 }, async () => {
  let bootstrapCalls = 0;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    response.setHeader("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    if (url.pathname === "/onboarding/continue") { response.setHeader("content-type", "text/html; charset=utf-8"); response.end(renderOnboardingContinuePage({ bootstrapEnabled: true })); return; }
    if (url.pathname === "/assets/onboarding.css") { response.setHeader("content-type", "text/css; charset=utf-8"); response.end(ONBOARDING_CSS); return; }
    if (url.pathname === "/assets/onboarding.js") { response.setHeader("content-type", "application/javascript; charset=utf-8"); response.end(ONBOARDING_JS); return; }
    if (url.pathname === "/api/onboarding/bootstrap" && request.method === "POST") { bootstrapCalls += 1; response.writeHead(500).end(); return; }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const handoff = "R".repeat(43);
  const extensionId = "c".repeat(32);
  const operationId = "O".repeat(43);
  const claimIntentId = "00000000-0000-4000-8000-000000000000";
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    await page.addInitScript(({ extensionId: id, operation, intent }) => {
      globalThis.chrome = { runtime: { sendMessage: async (_id, message) => message.type === "handoff.recovery"
        ? { ok: true, status: "completed", operationId: operation, claimIntentId: intent, draftFingerprint: "a".repeat(64), expiresAt: new Date(Date.now() + 60_000).toISOString(), manualId: "manual-recovered" }
        : { ok: false, error: "UNEXPECTED_MESSAGE" } } };
      globalThis.recoveryExtensionId = id;
    }, { extensionId, operation: operationId, intent: claimIntentId });
    await page.goto(`${baseUrl}/onboarding/continue#handoff=${handoff}&extensionId=${extensionId}`);
    await page.getByRole("button", { name: "保存先を準備する" }).click();
    await page.getByText("手順書を保存しました。保存した手順書を開きます。").waitFor();
    assert.equal(bootstrapCalls, 0);
    assert.deepEqual(await page.evaluate(() => JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation")).entries[0].claimStatus), "completed");
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("onboarding stops when recovery identity cannot be persisted", { timeout: 20_000 }, async () => {
  let bootstrapCalls = 0;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    response.setHeader("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    if (url.pathname === "/onboarding/continue") { response.setHeader("content-type", "text/html; charset=utf-8"); response.end(renderOnboardingContinuePage({ bootstrapEnabled: true })); return; }
    if (url.pathname === "/assets/onboarding.css") { response.setHeader("content-type", "text/css; charset=utf-8"); response.end(ONBOARDING_CSS); return; }
    if (url.pathname === "/assets/onboarding.js") { response.setHeader("content-type", "application/javascript; charset=utf-8"); response.end(ONBOARDING_JS); return; }
    if (url.pathname === "/api/onboarding/bootstrap" && request.method === "POST") { bootstrapCalls += 1; response.writeHead(500).end(); return; }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const handoff = "U".repeat(43);
  const extensionId = "e".repeat(32);
  const operationId = "Q".repeat(43);
  const claimIntentId = "00000000-0000-4000-8000-000000000000";
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    await page.addInitScript(({ operation, intent }) => {
      globalThis.chrome = { runtime: { sendMessage: async (_id, message) => message.type === "handoff.recovery"
        ? { ok: true, status: "finalize-pending", operationId: operation, claimIntentId: intent, draftFingerprint: "a".repeat(64), expiresAt: new Date(Date.now() + 60_000).toISOString() }
        : { ok: false, error: "UNEXPECTED_MESSAGE" } } };
    }, { operation: operationId, intent: claimIntentId });
    await page.goto(`${baseUrl}/onboarding/continue#handoff=${handoff}&extensionId=${extensionId}`);
    const before = await page.evaluate(() => {
      const value = JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation"));
      return value.entries.find((entry) => entry.handoffId === value.activeHandoffId).operationId;
    });
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error("quota"); }; });
    await page.getByRole("button", { name: "保存先を準備する" }).click();
    await page.getByRole("button", { name: "結果をもう一度確認" }).waitFor();
    assert.equal(bootstrapCalls, 0);
    assert.deepEqual(await page.evaluate(() => {
      const value = JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation"));
      const entry = value.entries.find((item) => item.handoffId === value.activeHandoffId);
      return { operationId: entry.operationId, state: entry.state };
    }), { operationId: before, state: "active" });
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("onboarding keeps an expired pending finalize read-only without prepare or claim writes", { timeout: 20_000 }, async () => {
  let bootstrapCalls = 0;
  let statusCalls = 0;
  let prepareCalls = 0;
  let intentCalls = 0;
  let finalizeCalls = 0;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    response.setHeader("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    if (url.pathname === "/onboarding/continue") { response.setHeader("content-type", "text/html; charset=utf-8"); response.end(renderOnboardingContinuePage({ bootstrapEnabled: true })); return; }
    if (url.pathname === "/assets/onboarding.css") { response.setHeader("content-type", "text/css; charset=utf-8"); response.end(ONBOARDING_CSS); return; }
    if (url.pathname === "/assets/onboarding.js") { response.setHeader("content-type", "application/javascript; charset=utf-8"); response.end(ONBOARDING_JS); return; }
    if (url.pathname === "/api/onboarding/bootstrap" && request.method === "POST") { bootstrapCalls += 1; response.writeHead(500).end(); return; }
    if (url.pathname.startsWith("/api/onboarding/claims/") && request.method === "GET") { statusCalls += 1; response.setHeader("content-type", "application/json; charset=utf-8"); response.end(JSON.stringify({ status: "pending" })); return; }
    if (url.pathname.includes("/claim-intents") && request.method === "POST") { intentCalls += 1; response.writeHead(500).end(); return; }
    if (url.pathname.includes("/claim-intents") && request.method === "PUT") { response.writeHead(500).end(); return; }
    if (url.pathname.includes("/claims/") && request.method === "POST") { finalizeCalls += 1; response.writeHead(500).end(); return; }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const handoff = "T".repeat(43);
  const extensionId = "d".repeat(32);
  const operationId = "P".repeat(43);
  const claimIntentId = "00000000-0000-4000-8000-000000000000";
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    await page.addInitScript(({ operation, intent }) => {
      globalThis.chrome = { runtime: { sendMessage: async (_id, message) => {
        if (message.type === "handoff.recovery") return { ok: true, status: "finalize-pending", operationId: operation, claimIntentId: intent, draftFingerprint: "a".repeat(64), expiresAt: new Date(Date.now() - 60_000).toISOString() };
        if (message.type === "handoff.prepare") { globalThis.prepareCalls = (globalThis.prepareCalls || 0) + 1; return { ok: false, error: "UNEXPECTED_PREPARE" }; }
        return { ok: false, error: "UNEXPECTED_MESSAGE" };
      } } };
    }, { operation: operationId, intent: claimIntentId });
    await page.goto(`${baseUrl}/onboarding/continue#handoff=${handoff}&extensionId=${extensionId}`);
    await page.evaluate(() => {
      const state = JSON.parse(sessionStorage.getItem("meccha-manual:onboarding-operation"));
      state.entries[0].createdAt = new Date(Date.now() - 16 * 60 * 1000).toISOString();
      sessionStorage.setItem("meccha-manual:onboarding-operation", JSON.stringify(state));
    });
    await page.reload();
    await page.getByRole("button", { name: "保存先を準備する" }).click();
    await page.getByText(/結果を確認中です/).waitFor();
    assert.equal(bootstrapCalls, 0);
    assert.equal(statusCalls, 1);
    assert.equal(intentCalls, 0);
    assert.equal(finalizeCalls, 0);
    assert.equal(await page.evaluate(() => globalThis.prepareCalls || 0), 0);
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
