import assert from "node:assert/strict";
import { stat, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve, sep } from "node:path";
import test from "node:test";
import { chromium } from "@playwright/test";

const extensionRoot = resolve(fileURLToPath(new URL("../apps/extension/", import.meta.url)));

function serveExtension({ onboardingConfig = null } = {}) {
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url || "/", "http://127.0.0.1").pathname;
    if (pathname === "/seed.html") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end("<!doctype html><meta charset='utf-8'><title>seed</title>");
      return;
    }
    if (pathname === "/onboarding-config.js" && onboardingConfig) {
      response.setHeader("Content-Type", "text/javascript; charset=utf-8");
      response.end(onboardingConfig);
      return;
    }
    const relativePath = decodeURIComponent(pathname.replace(/^\/+/, ""));
    const filePath = resolve(extensionRoot, relativePath);
    if (filePath !== extensionRoot && !filePath.startsWith(`${extensionRoot}${sep}`)) {
      response.writeHead(404).end();
      return;
    }
    try {
      const info = await stat(filePath);
      if (!info.isFile()) throw new Error("not a file");
      const body = await readFile(filePath);
      const contentType = filePath.endsWith(".html")
        ? "text/html; charset=utf-8"
        : filePath.endsWith(".js")
          ? "text/javascript; charset=utf-8"
          : filePath.endsWith(".css")
            ? "text/css; charset=utf-8"
            : "application/octet-stream";
      response.setHeader("Content-Type", contentType);
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  return server;
}

test("editor creates, reloads, and deletes a mask through a real Chrome mouse gesture", { timeout: 20_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    page.setDefaultTimeout(3_000);
    await page.goto(`${baseUrl}/seed.html`);
    await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      canvas.getContext("2d").fillRect(0, 0, canvas.width, canvas.height);
      const { draftStore } = await import("/storage/draft-store.js");
      await draftStore.put({
        id: "editor-browser-fixture",
        title: "合成テスト",
        description: "ブラウザ回帰テスト",
        steps: [{ id: "one", order: 1, instruction: "最初の手順", screenshotId: "image" }],
        screenshots: [{ id: "image", dataUrl: canvas.toDataURL(), masks: [] }]
      });
    });

    await page.goto(`${baseUrl}/editor/editor.html#editor-browser-fixture`);
    const image = page.locator(".screenshot-preview img");
    await image.evaluate((element) => element.decode());
    const preview = page.locator(".screenshot-preview");
    await preview.scrollIntoViewIfNeeded();
    const box = await preview.boundingBox();
    assert.ok(box, "screenshot preview should be visible");
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.75);
    await page.mouse.up();
    await page.locator(".mask").waitFor({ state: "attached", timeout: 3_000 });
    assert.equal(await page.locator(".mask").count(), 1);

    await page.reload();
    await page.locator(".screenshot-preview img").evaluate((element) => element.decode());
    assert.equal(await page.locator(".mask").count(), 1, "mask should persist after reload");

    await page.getByRole("button", { name: "マスクを削除" }).click();
    await page.locator(".mask").waitFor({ state: "detached" });
    await page.reload();
    await page.locator(".screenshot-preview img").evaluate((element) => element.decode());
    assert.equal(await page.locator(".mask").count(), 0, "deleted mask should stay deleted after reload");
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

test("output gate cancel preserves edits, save failure blocks handoff, and pending config stays local", { timeout: 20_000 }, async () => {
  const server = serveExtension({ onboardingConfig: 'export const STAGING_ONBOARDING_ORIGIN = "https://meccha-manual-staging.meccha-iiyatsu.com"; export function getOnboardingOrigin() { return null; }' });
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    await page.addInitScript(() => {
      globalThis.__handoffStorageWrites = 0;
      globalThis.chrome = { runtime: { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }, storage: { local: { set: async () => { globalThis.__handoffStorageWrites += 1; }, get: async () => ({}), remove: async () => undefined } } };
    });
    await page.goto(`${baseUrl}/seed.html`);
    await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      await draftStore.put({ id: "output-gate-fixture", title: "元のタイトル", description: "説明", steps: [], screenshots: [] });
    });
    await page.goto(`${baseUrl}/editor/editor.html#output-gate-fixture`);
    await page.locator("#title").fill("取消後も残るタイトル");
    await page.locator("#save").click();
    await page.locator("#outputGate").waitFor({ state: "visible" });
    await page.locator("#cancelOutput").click();
    assert.equal(await page.locator("#title").inputValue(), "取消後も残るタイトル");
    await page.reload();
    assert.equal(await page.locator("#title").inputValue(), "取消後も残るタイトル");

    await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      draftStore.put = async () => { throw new Error("storage unavailable"); };
    });
    await page.locator("#save").click();
    assert.equal(await page.locator("#outputGate").evaluate((element) => element.open), false);
    assert.match(await page.locator("#status").textContent(), /保存できませんでした/);

    await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      draftStore.put = async () => undefined;
    });
    await page.locator("#save").click();
    assert.equal(await page.locator("#startRegistration").isDisabled(), true);
    assert.match(await page.locator("#gateStatus").textContent(), /準備中/);
    assert.equal(await page.locator("#outputGate").evaluate((element) => element.open), true);
    assert.equal(await page.evaluate(() => globalThis.__handoffStorageWrites), 0, "pending CTA must not persist unused handoffs");
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

test("sidepanel keeps restore-pending finish guidance when refresh succeeds or fails", { timeout: 15_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    await page.addInitScript(() => {
      globalThis.__refreshMode = "ok";
      globalThis.__statusPhase = "recording";
      globalThis.__restorePending = false;
      globalThis.__finishResult = { draftId: "restore-pending-sidepanel-fixture", restorePending: true, imageCount: 2, missingImageCount: 0 };
      globalThis.__tabsCreateCalls = [];
      globalThis.chrome = {
        runtime: {
          getURL: (path) => `chrome-extension://test/${path}`,
          sendMessage: async (message) => {
            if (message?.type === "capture:status") {
              if (globalThis.__refreshMode === "fail") throw new Error("STATUS_UNAVAILABLE");
              return { ok: true, value: { phase: globalThis.__statusPhase, restorePending: globalThis.__restorePending, events: [], stepImageRefs: [] } };
            }
            if (message?.type === "capture:finish") {
              const result = globalThis.__finishResult;
              globalThis.__statusPhase = result.restorePending ? "finish_failed" : "idle";
              globalThis.__restorePending = Boolean(result.restorePending);
              return { ok: true, value: result };
            }
            return { ok: true, value: null };
          }
        },
        tabs: {
          create: async (details) => { globalThis.__tabsCreateCalls.push(details); return { id: globalThis.__tabsCreateCalls.length }; }
        }
      };
    });
    await page.goto(`${baseUrl}/sidepanel/sidepanel.html`);
    await page.locator("#finish").waitFor({ state: "visible" });

    await page.locator("#finish").click();
    await page.waitForFunction(() => /保存済み/.test(document.querySelector("#status")?.textContent || ""));
    assert.equal(await page.locator("#restore").evaluate((element) => element.hidden), false);
    assert.equal(await page.evaluate(() => globalThis.__tabsCreateCalls.length), 1, "finish success should open the editor once");

    await page.evaluate(() => { globalThis.__refreshMode = "fail"; });
    await page.locator("#finish").click();
    await page.waitForFunction(() => /保存済み/.test(document.querySelector("#status")?.textContent || ""));
    assert.equal(await page.locator("#restore").evaluate((element) => element.hidden), false, "restore remains available when status refresh fails");
    assert.equal(await page.evaluate(() => globalThis.__tabsCreateCalls.length), 2, "refresh failure must not turn a successful finish into a finish failure");

    await page.evaluate(() => {
      globalThis.__refreshMode = "ok";
      globalThis.__finishResult = { draftId: "normal-sidepanel-fixture", restorePending: false, imageCount: 2, missingImageCount: 0 };
    });
    await page.locator("#finish").click();
    await page.waitForFunction(() => /画像付きの手順を保存しました/.test(document.querySelector("#status")?.textContent || ""));
    assert.equal(await page.locator("#restore").evaluate((element) => element.hidden), true, "normal finish should not show restore guidance");
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

test("sidepanel exposes a retryable cancel failure and returns to the empty state", { timeout: 15_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    await page.addInitScript(() => {
      globalThis.__phase = "cancel_failed";
      globalThis.__cancelCalls = 0;
      globalThis.chrome = {
        runtime: {
          getURL: (path) => `chrome-extension://test/${path}`,
          sendMessage: async (message) => {
            if (message?.type === "capture:status") {
              return {
                ok: true,
                value: {
                  phase: globalThis.__phase,
                  events: [],
                  stepImageRefs: [],
                  sessionId: null,
                  hasDrafts: false,
                  restorePending: false
                }
              };
            }
            if (message?.type === "capture:cancel") {
              globalThis.__cancelCalls += 1;
              globalThis.__phase = null;
              return { ok: true, value: { cancelled: true, restorePending: false } };
            }
            return { ok: true, value: null };
          }
        },
        tabs: {
          query: async () => [],
          create: async () => ({ id: 1 })
        }
      };
    });
    await page.goto(`${baseUrl}/sidepanel/sidepanel.html`);
    await page.waitForFunction(() => /キャンセルが完了していません/.test(document.querySelector("#status")?.textContent || ""));
    assert.equal(await page.locator("#start").isDisabled(), true, "start must be unavailable while cancellation is retryable");
    assert.equal(await page.locator("#finish").evaluate((element) => element.hidden), true, "finish must be unavailable after cancel failure");
    assert.equal(await page.locator("#resume").evaluate((element) => element.hidden), true, "resume must be unavailable after cancel failure");
    assert.equal(await page.locator("#cancel").evaluate((element) => element.hidden), false, "cancel retry must remain available");
    assert.equal(await page.locator("#emptyState").evaluate((element) => element.hidden), true, "empty state must stay hidden while retry is pending");

    await page.locator("#cancel").click();
    await page.waitForFunction(() => globalThis.__phase === null
      && document.querySelector("#emptyState")?.hidden === false
      && document.querySelector("#cancel")?.hidden === true);
    assert.equal(await page.evaluate(() => globalThis.__cancelCalls), 1, "cancel retry should be sent once");
    assert.equal(await page.locator("#start").isDisabled(), false, "start must be available after cancellation succeeds");
    assert.equal(await page.locator("#finish").evaluate((element) => element.hidden), true);
    assert.equal(await page.locator("#resume").evaluate((element) => element.hidden), true);
    assert.equal(await page.locator("#cancel").evaluate((element) => element.hidden), true);
    assert.equal(await page.locator("#emptyState").evaluate((element) => element.hidden), false);
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

test("sidepanel refreshes drafts independently from unchanged capture state", { timeout: 20_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const sourcePage = await context.newPage();
    await sourcePage.goto(`${baseUrl}/seed.html`);
    await sourcePage.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      await draftStore.put({
        id: "sidepanel-draft-refresh-fixture",
        title: "最初のタイトル",
        description: "説明",
        updatedAt: "2026-09-27T00:00:00.000Z",
        steps: [{ id: "step", order: 1, instruction: "手順" }],
        screenshots: []
      });
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      globalThis.__statusCalls = 0;
      globalThis.chrome = {
        runtime: {
          getURL: (path) => `chrome-extension://test/${path}`,
          sendMessage: async (message) => {
            if (message?.type === "capture:status") {
              globalThis.__statusCalls += 1;
              return { ok: true, value: { phase: "idle", events: [], stepImageRefs: [], sessionId: null } };
            }
            return { ok: true, value: null };
          }
        },
        tabs: { create: async () => ({ id: 1 }) }
      };
    });
    await page.goto(`${baseUrl}/sidepanel/sidepanel.html`);
    await page.locator(".draft-card h3").waitFor();
    assert.equal(await page.locator(".draft-card h3").textContent(), "最初のタイトル");
    const openButton = page.locator(".draft-card button");
    await openButton.focus();
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.draftId), "sidepanel-draft-refresh-fixture");

    await sourcePage.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      await draftStore.put({
        id: "sidepanel-draft-refresh-fixture",
        title: "別ページから更新したタイトル",
        description: "説明",
        updatedAt: "2026-09-27T00:01:00.000Z",
        steps: [{ id: "step", order: 1, instruction: "手順" }],
        screenshots: []
      });
    });
    await page.waitForFunction(() => document.querySelector(".draft-card h3")?.textContent === "別ページから更新したタイトル", null, { timeout: 5_000 });
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.draftId), "sidepanel-draft-refresh-fixture", "draft refresh should preserve button focus");
    assert.ok(await page.evaluate(() => globalThis.__statusCalls > 1), "draft refresh should poll while capture status is unchanged");

    await sourcePage.evaluate(async () => {
      await new Promise((resolve, reject) => {
        const request = indexedDB.open("meccha-manual-guest", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const transaction = request.result.transaction("drafts", "readwrite");
          transaction.objectStore("drafts").delete("sidepanel-draft-refresh-fixture");
          transaction.oncomplete = () => { request.result.close(); resolve(); };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    });
    await page.waitForFunction(() => document.querySelectorAll(".draft-card").length === 0
      && document.querySelector("#draftSection")?.hidden === true
      && document.querySelector("#emptyState")?.hidden === false, null, { timeout: 5_000 });
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

test("ready config opens the registration tab once and keeps local edits", { timeout: 20_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    await page.addInitScript(() => {
      globalThis.__tabsCreateCalls = 0;
      globalThis.__tabsUpdateCalls = [];
      globalThis.__createdTabUrl = null;
      globalThis.__handoffStorageWrites = 0;
      globalThis.__handoffStorage = {};
      globalThis.chrome = {
        runtime: { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        storage: { local: {
          set: async (values) => { globalThis.__handoffStorageWrites += 1; Object.assign(globalThis.__handoffStorage, values); },
          get: async (key) => key ? { [key]: globalThis.__handoffStorage[key] } : globalThis.__handoffStorage,
          remove: async () => undefined
        } },
        tabs: {
          create: async ({ url, active }) => { globalThis.__tabsCreateCalls += 1; globalThis.__createdTabUrl = url; return { id: 17, active }; },
          update: async (tabId, details) => {
            globalThis.__tabsUpdateCalls.push({ tabId, ...details });
            if (details.url) {
              const readyKey = Object.keys(globalThis.__handoffStorage).find((key) => key.includes(":handoff-ready:"));
              globalThis.__handoffStorage[readyKey] = { ...globalThis.__handoffStorage[readyKey], pageReadyAt: new Date().toISOString(), activatedAt: new Date().toISOString() };
            }
            return { id: tabId, ...details };
          }
        }
      };
    });
    await page.goto(`${baseUrl}/seed.html`);
    await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      await draftStore.put({ id: "ready-output-gate-fixture", title: "元のタイトル", description: "説明", steps: [], screenshots: [] });
    });
    await page.goto(`${baseUrl}/editor/editor.html#ready-output-gate-fixture`);
    await page.locator("#title").fill("編集を保持するタイトル");
    await page.locator("#save").click();
    assert.equal(await page.locator("#startRegistration").isDisabled(), false);
    await page.evaluate(() => {
      chrome.storage.local.set = async () => { throw new Error("HANDOFF_STORAGE_UNAVAILABLE"); };
    });
    await page.locator("#startRegistration").click();
    await page.waitForFunction(() => /保存できませんでした/.test(document.querySelector("#gateStatus")?.textContent || ""));
    assert.equal(await page.evaluate(() => globalThis.__tabsUpdateCalls.length), 0, "handoff storage failure must not navigate to a registration URL");
    await page.evaluate(() => {
      chrome.storage.local.set = async (values) => { globalThis.__handoffStorageWrites += 1; Object.assign(globalThis.__handoffStorage, values); };
    });
    await page.locator("#startRegistration").click();
    await page.waitForFunction(() => globalThis.__tabsUpdateCalls.length === 1);
    assert.equal(await page.evaluate(() => globalThis.__tabsUpdateCalls.length), 1);
    assert.equal(await page.evaluate(() => globalThis.__createdTabUrl), "about:blank");
    assert.equal(await page.evaluate(() => globalThis.__tabsUpdateCalls.length), 1);
    assert.equal(await page.evaluate(() => globalThis.__tabsUpdateCalls[0]?.tabId), 17);
    assert.equal(await page.evaluate(() => globalThis.__tabsUpdateCalls[0]?.active), false);
    assert.match(await page.evaluate(() => globalThis.__tabsUpdateCalls.find(({ url }) => url)?.url || ""), /^https:\/\/meccha-manual-staging\.meccha-iiyatsu\.com\/onboarding\/continue#handoff=[A-Za-z0-9_-]{43}&extensionId=a{32}&launchId=[A-Za-z0-9_-]{43}$/);
    assert.equal(await page.locator("#title").inputValue(), "編集を保持するタイトル");
    assert.equal(await page.evaluate(() => globalThis.__handoffStorageWrites), 2);
    assert.equal(await page.locator("#handoffProgress").evaluate((element) => element.hidden), true);
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

test("handoff timeout keeps the editor visible and activation is explicit and idempotent", { timeout: 25_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    page.setDefaultTimeout(3_000);
    await page.addInitScript(() => {
      globalThis.__tabsCreateCalls = 0;
      globalThis.__tabsUpdateCalls = [];
      globalThis.__failActivationUpdate = false;
      globalThis.__handoffStorage = {};
      globalThis.chrome = {
        runtime: { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        storage: { local: {
          set: async (values) => Object.assign(globalThis.__handoffStorage, values),
          get: async (key) => key ? { [key]: globalThis.__handoffStorage[key] } : globalThis.__handoffStorage,
          remove: async () => undefined
        } },
        tabs: {
          create: async ({ url, active }) => { globalThis.__tabsCreateCalls += 1; return { id: 21 + globalThis.__tabsCreateCalls, url, active }; },
          update: async (tabId, details) => {
            globalThis.__tabsUpdateCalls.push({ tabId, ...details });
            if (details.active && globalThis.__failActivationUpdate) throw new Error("TAB_CLOSED");
            return { id: tabId, ...details };
          }
        }
      };
    });
    await page.goto(`${baseUrl}/seed.html`);
    await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      await draftStore.put({ id: "timeout-output-gate-fixture", title: "元のタイトル", description: "説明", steps: [], screenshots: [] });
    });
    await page.goto(`${baseUrl}/editor/editor.html#timeout-output-gate-fixture`);
    await page.locator("#save").click();
    await page.locator("#startRegistration").click();
    await page.waitForFunction(() => document.querySelector("#activateHandoff")?.hidden === false, null, { timeout: 12_000 });
    assert.equal(await page.locator("#outputGate").evaluate((element) => element.open), true);
    assert.equal(await page.locator("#handoffProgress").evaluate((element) => element.hidden), true);
    assert.match(await page.locator("#gateStatus").textContent(), /ログインや接続が必要な場合があります/);
    await page.evaluate(() => {
      const button = document.querySelector("#activateHandoff");
      button.click();
      button.click();
    });
    await page.waitForFunction(() => globalThis.__tabsUpdateCalls.some(({ active }) => active === true));
    assert.equal(await page.locator("#outputGate").evaluate((element) => element.open), false);
    assert.equal(await page.evaluate(() => globalThis.__tabsUpdateCalls.filter(({ active }) => active === true).length), 1);

    await page.locator("#save").click();
    await page.locator("#startRegistration").click();
    await page.waitForFunction(() => globalThis.__tabsUpdateCalls.filter(({ url }) => url).length === 2, null, { timeout: 5_000 });
    const launchIds = await page.evaluate(() => globalThis.__tabsUpdateCalls.filter(({ url }) => url).map(({ url }) => new URL(url).hash.match(/[&?]launchId=([A-Za-z0-9_-]{43})$/)?.[1]));
    assert.equal(launchIds.length, 2);
    assert.notEqual(launchIds[0], launchIds[1], "retry must use a new launch id");
    await page.waitForFunction(() => document.querySelector("#activateHandoff")?.hidden === false, null, { timeout: 12_000 });
    await page.evaluate(() => { globalThis.__failActivationUpdate = true; });
    await page.locator("#activateHandoff").click();
    await page.waitForFunction(() => /登録画面へ進む/.test(document.querySelector("#gateStatus")?.textContent || ""));
    assert.equal(await page.locator("#activateHandoff").evaluate((element) => element.hidden), true, "closed activation tab should require a fresh handoff");
    assert.equal(await page.locator("#startRegistration").isDisabled(), false, "fresh handoff should remain available after activation failure");
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

test("cancel during delayed handoff preparation cannot activate a late tab", { timeout: 15_000 }, async () => {
  const server = serveExtension();
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel, headless: true });
    const page = await context.newPage();
    page.setDefaultTimeout(3_000);
    await page.addInitScript(() => {
      globalThis.__tabsUpdateCalls = [];
      globalThis.__tabsRemoveCalls = [];
      globalThis.__handoffStorage = {};
      globalThis.__delayFirstStorageSet = true;
      globalThis.__delayNextStorageSet = false;
      globalThis.__storageSetStarted = false;
      globalThis.__releaseStorageSet = null;
      globalThis.__delayTabsCreate = false;
      globalThis.__tabsCreateStarted = false;
      globalThis.__releaseTabsCreate = null;
      globalThis.__nextTabId = 31;
      globalThis.__tabUrlState = { url: "", pendingUrl: "about:blank" };
      globalThis.chrome = {
        runtime: { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        storage: { local: {
          set: async (values) => {
            if (globalThis.__delayFirstStorageSet || globalThis.__delayNextStorageSet) {
              globalThis.__delayFirstStorageSet = false;
              globalThis.__delayNextStorageSet = false;
              globalThis.__storageSetStarted = true;
              await new Promise((resolve) => { globalThis.__releaseStorageSet = resolve; });
            }
            Object.assign(globalThis.__handoffStorage, values);
          },
          get: async (key) => key ? { [key]: globalThis.__handoffStorage[key] } : globalThis.__handoffStorage,
          remove: async () => undefined
        } },
        tabs: {
          create: async ({ url, active }) => {
            if (globalThis.__delayTabsCreate) {
              globalThis.__delayTabsCreate = false;
              globalThis.__tabsCreateStarted = true;
              await new Promise((resolve) => { globalThis.__releaseTabsCreate = resolve; });
            }
            return { id: globalThis.__nextTabId++, url, active };
          },
          get: async (tabId) => ({ id: tabId, ...globalThis.__tabUrlState }),
          remove: async (tabId) => { globalThis.__tabsRemoveCalls.push(tabId); },
          update: async (tabId, details) => { globalThis.__tabsUpdateCalls.push({ tabId, ...details }); return { id: tabId, ...details }; }
        }
      };
    });
    await page.goto(`${baseUrl}/seed.html`);
    await page.evaluate(async () => {
      const { draftStore } = await import("/storage/draft-store.js");
      await draftStore.put({ id: "cancel-during-handoff-fixture", title: "元のタイトル", description: "説明", steps: [], screenshots: [] });
    });
    await page.goto(`${baseUrl}/editor/editor.html#cancel-during-handoff-fixture`);
    await page.locator("#save").click();
    await page.locator("#startRegistration").click();
    await page.waitForFunction(() => globalThis.__storageSetStarted === true);
    await page.locator("#cancelOutput").click();
    await page.waitForFunction(() => document.querySelector("#outputGate")?.open === false);
    await page.evaluate(() => globalThis.__releaseStorageSet?.());
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => globalThis.__tabsUpdateCalls.some(({ active }) => active === true)), false);
    assert.equal(await page.evaluate(() => globalThis.__tabsUpdateCalls.some(({ url }) => Boolean(url))), false);
    assert.deepEqual(await page.evaluate(() => globalThis.__tabsRemoveCalls), [31], "cancel must remove its own provisional tab");
    assert.ok(await page.evaluate(async () => Boolean(await (await import("/storage/draft-store.js")).draftStore.get("cancel-during-handoff-fixture"))), "cancel must keep the local draft");

    await page.locator("#save").click();
    await page.waitForFunction(() => document.querySelector("#outputGate")?.open === true);
    assert.equal(await page.locator("#outputGate").evaluate((element) => element.open), true, "cancelled preparation must leave the editor resumable");

    await page.evaluate(() => { globalThis.__delayTabsCreate = true; });
    await page.locator("#startRegistration").click();
    await page.waitForFunction(() => globalThis.__tabsCreateStarted === true);
    await page.locator("#cancelOutput").click();
    await page.waitForFunction(() => document.querySelector("#outputGate")?.open === false);
    await page.evaluate(() => globalThis.__releaseTabsCreate?.());
    await page.waitForTimeout(150);
    assert.deepEqual(await page.evaluate(() => globalThis.__tabsRemoveCalls), [31, 32], "cancel after delayed tab creation must remove the returned provisional tab");

    await page.locator("#save").click();
    await page.waitForFunction(() => document.querySelector("#outputGate")?.open === true);
    await page.evaluate(() => {
      globalThis.__delayNextStorageSet = true;
      globalThis.__storageSetStarted = false;
      globalThis.__tabUrlState = { url: "", pendingUrl: "about:blank" };
    });
    await page.locator("#startRegistration").click();
    await page.waitForFunction(() => globalThis.__storageSetStarted === true);
    await page.evaluate(() => { globalThis.__tabUrlState = { url: "https://user.example.test/page" }; });
    await page.locator("#cancelOutput").click();
    await page.waitForFunction(() => document.querySelector("#outputGate")?.open === false);
    await page.evaluate(() => globalThis.__releaseStorageSet?.());
    await page.waitForTimeout(150);
    assert.deepEqual(await page.evaluate(() => globalThis.__tabsRemoveCalls), [31, 32], "cancel must keep a provisional tab after the user navigates it away");
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});
