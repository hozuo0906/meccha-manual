import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "./test-browser.mjs";

async function readDevToolsEndpoint(profile) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    let contents = "";
    try { contents = await readFile(join(profile, "DevToolsActivePort"), "utf8"); }
    catch (error) {
      if (error.code !== "ENOENT") throw new Error(`Cannot read isolated browser endpoint (${error.code ?? "unknown"})`);
    }
    const [port, browserPath, extra] = contents.trim().split(/\r?\n/);
    if (/^\d+$/.test(port) && Number(port) > 0 && Number(port) <= 65535 && /^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(browserPath) && extra === undefined) {
      return `ws://127.0.0.1:${port}${browserPath}`;
    }
    await delay(50);
  }
  throw new Error("Isolated browser did not publish a valid DevToolsActivePort within 5 seconds");
}

// Focus emulation holds a Chromium capturer handle on the owning CDP session.
// Sending false on a separate session cannot release Playwright's handle:
// https://chromium.googlesource.com/chromium/src/+/main/content/browser/devtools/protocol/emulation_handler.cc
// Use the public noDefaults option on the default context instead:
// https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp-option-no-defaults
export async function launchNativeVisibilityPage(testContext) {
  const channel = process.platform === "win32" ? "chrome" : "chromium";
  // Retain the normal test launcher, binary, arguments and temporary profile.
  // The launch connection has no default context and never creates any pages.
  const owner = await chromium.launch({ channel, headless: true, args: ["--remote-debugging-port=0", "--enable-automation"] });
  let attached;
  testContext.after(async () => {
    try { await attached?.close(); } finally { await owner.close(); }
  }, { timeout: 10_000 });
  const session = await owner.newBrowserCDPSession();
  let endpoint;
  try {
    const { arguments: args } = await session.send("Browser.getBrowserCommandLine");
    const profile = args.find(value => value.startsWith("--user-data-dir="))?.slice("--user-data-dir=".length);
    assert.ok(profile, "isolated test browser must expose its generated profile");
    endpoint = await readDevToolsEndpoint(profile);
  } finally { await session.detach(); }
  attached = await chromium.connectOverCDP(endpoint, { noDefaults: true, isLocal: true, timeout: 10_000 });
  const context = attached.contexts()[0];
  assert.ok(context, "native visibility requires the existing default context");
  await context.addInitScript(() => {
    // Observe only; never override visibilityState or dispatch lifecycle events.
    window.__nativeVisibilityEvents = [];
    document.addEventListener("visibilitychange", event => {
      window.__nativeVisibilityEvents.push({ state: document.visibilityState, trusted: event.isTrusted });
      if (window.__nativeVisibilityEvents.length > 8) window.__nativeVisibilityEvents.shift();
    });
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.bringToFront();
  return { context, page };
}

export async function waitForNativeVisibility(page, expected, testContext) {
  try {
    await page.waitForFunction(expected => document.visibilityState === expected, expected, { polling: 50, timeout: 5_000 });
    assert.ok(await page.evaluate(expected => window.__nativeVisibilityEvents.some(event => event.state === expected && event.trusted), expected), `Chrome must emit a trusted ${expected} visibilitychange`);
  } catch (error) {
    // Bounded, synthetic-only diagnostics. Never include URLs, command lines,
    // profile paths, tokens, grants, passcodes, response bodies or screenshots.
    const pages = await Promise.all(page.context().pages().slice(0, 3).map(async candidate => {
      let session;
      try {
        session = await candidate.context().newCDPSession(candidate);
        const { windowId, bounds } = await session.send("Browser.getWindowForTarget");
        return { windowId, windowState: bounds.windowState, ...await candidate.evaluate(() => ({
          visibility: document.visibilityState,
          focused: document.hasFocus(),
          accessState: document.querySelector("#share-content")?.dataset.accessState ?? null,
          events: window.__nativeVisibilityEvents ?? []
        })) };
      } catch { return { available: false }; }
      finally { await session?.detach().catch(() => {}); }
    }));
    testContext.diagnostic(JSON.stringify({ nativeVisibility: { expected, browserVersion: page.context().browser().version(), pages } }));
    throw error;
  }
}
