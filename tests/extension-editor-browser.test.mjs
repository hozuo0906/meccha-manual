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
      globalThis.chrome = { storage: { local: { set: async () => { globalThis.__handoffStorageWrites += 1; }, get: async () => ({}), remove: async () => undefined } } };
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
      globalThis.__createdTabUrl = null;
      globalThis.__handoffStorageWrites = 0;
      globalThis.chrome = {
        storage: { local: {
          set: async () => { globalThis.__handoffStorageWrites += 1; },
          get: async () => ({}),
          remove: async () => undefined
        } },
        tabs: { create: async ({ url }) => { globalThis.__tabsCreateCalls += 1; globalThis.__createdTabUrl = url; } }
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
    await page.locator("#startRegistration").click();
    await page.waitForFunction(() => globalThis.__tabsCreateCalls === 1);
    assert.equal(await page.evaluate(() => globalThis.__tabsCreateCalls), 1);
    assert.match(await page.evaluate(() => globalThis.__createdTabUrl), /^https:\/\/meccha-manual-staging\.meccha-iiyatsu\.com\/onboarding\/continue#handoff=[A-Za-z0-9_-]{43}$/);
    assert.equal(await page.locator("#title").inputValue(), "編集を保持するタイトル");
    assert.equal(await page.evaluate(() => globalThis.__handoffStorageWrites), 1);
  } finally {
    await context?.close();
    server.closeAllConnections?.();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});
