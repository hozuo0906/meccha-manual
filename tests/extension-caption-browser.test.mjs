import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "./support/test-browser.mjs";
import { normalizeCaptureEvent } from "../apps/extension/capture/privacy.js";

const extensionRoot = resolve(fileURLToPath(new URL("../apps/extension/", import.meta.url)));

test("native recording uses only bounded safe captions for real click controls", { timeout: 60_000 }, async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>caption fixture</title><style>body{font-family:system-ui,sans-serif;padding:24px}button,input,textarea{display:block;margin:12px 0;padding:8px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}</style></head><body>
      <main class="grid">
        <button id="reference">参照</button>
        <button id="nested-save"><span>保存</span></button>
        <button id="opacity-child"><span style="opacity:0">不可視顧客名</span></button>
        <div style="opacity:0"><button id="opacity-ancestor">不可視顧客名</button></div>
        <button id="content-hidden-child"><span style="content-visibility:hidden">非表示個人名カナリア</span><span>参照</span></button>
        <div style="content-visibility:hidden"><button id="content-hidden-ancestor">非表示個人名カナリア</button></div>
        <label for="label-content-hidden"><span style="content-visibility:hidden">非表示個人名カナリア</span><span>確認</span></label>
        <input id="label-content-hidden" type="button">
        <button id="title-only" title="タイトル操作"></button>
        <input id="input-button" type="button" value="入力参照">
        <input id="input-submit" type="submit" value="送信">
        <input id="input-reset" type="reset" value="リセット">
        <input id="input-image" type="image" alt="画像検索" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">
        <button id="editable"><span contenteditable="true">リッチ値</span></button>
        <button id="editable-own" contenteditable="true">直接編集</button>
        <button id="node-budget"></button>
        <button id="long-title" title="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"></button>
        <button id="long-visible">aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</button>
        <label for="label-save" style="opacity:0">不可視保存ラベル</label>
        <input id="label-save" type="button">
        <label for="label-hidden-child"><span hidden>不可視顧客名</span><span>可視ラベル</span></label>
        <input id="label-hidden-child" type="button">
        <label for="label-visible">正常ラベル</label>
        <input id="label-visible" type="button">
        <input id="password" type="password" aria-label="認証コード" value="パスワード秘密">
        <textarea id="richtext">リッチテキスト秘密</textarea>
        <button id="pii" title="PIN 1234"></button>
        <button id="url" title="https://tenant.example.dev/token"></button>
        <button id="unicode" title="０９０－１２３４－５６７８"></button>
        <button id="data-only" data-caption="機密データ"></button>
        <input id="text" type="text" value="利用者秘密">
      </main>
      <script>
        addEventListener("click", (event) => {
          if (event.target.closest("button,input,textarea")) event.preventDefault();
        }, true);
        addEventListener("reset", (event) => event.preventDefault());
        addEventListener("submit", (event) => event.preventDefault());
        const nodeBudget = document.querySelector("#node-budget");
        for (let index = 0; index < 257; index += 1) {
          const hidden = document.createElement("span");
          hidden.hidden = true;
          hidden.textContent = "hidden-" + index;
          nodeBudget.append(hidden);
        }
      </script>
    </body></html>`);
  });
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const baseUrl = `http://127.0.0.1:${server.address().port}/`;
  const userDataDir = await mkdtemp(join(tmpdir(), "meccha-manual-caption-runtime-"));
  const resolvedTempRoot = resolve(tmpdir());
  const resolvedUserDataDir = resolve(userDataDir);
  const canRemoveUserDataDir = resolvedUserDataDir !== resolvedTempRoot
    && resolvedUserDataDir.startsWith(`${resolvedTempRoot}${sep}`);
  assert.equal(canRemoveUserDataDir, true, "persistent context must stay within the OS temp directory");
  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: ["--enable-unsafe-extension-debugging", `--disable-extensions-except=${extensionRoot}`, `--load-extension=${extensionRoot}`]
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 15_000 });
    const extensionId = new URL(worker.url()).hostname;
    const target = await context.newPage();
    await target.goto(baseUrl);
    await target.bringToFront();
    const browserCdp = await context.browser().newBrowserCDPSession();
    const tabInfo = (await browserCdp.send("Target.getTargets", { filter: [{ type: "tab", exclude: false }] })).targetInfos
      .find((info) => info.url === baseUrl);
    assert.ok(tabInfo, "caption fixture tab should be discoverable");
    const waitForExtensionValue = async (read, predicate, message) => {
      const deadline = Date.now() + 15_000;
      let value;
      do {
        value = await read();
        if (predicate(value)) return value;
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
      } while (Date.now() < deadline);
      throw new Error(`${message}: ${JSON.stringify(value)}`);
    };
    await waitForExtensionValue(
      () => worker.evaluate(() => chrome.action?.onClicked?.hasListeners?.() === true),
      (value) => value === true,
      "action listener was not registered"
    );
    await browserCdp.send("Extensions.triggerAction", { id: extensionId, targetId: tabInfo.targetId });

    const sidePanelContexts = await waitForExtensionValue(
      () => worker.evaluate(async () => chrome.runtime.getContexts
        ? chrome.runtime.getContexts({ contextTypes: ["SIDE_PANEL"] })
        : []),
      (value) => Array.isArray(value) && value.length > 0,
      "action did not create a SIDE_PANEL extension context"
    );
    assert.ok(sidePanelContexts.length > 0, "action should create a SIDE_PANEL extension context");
    const panelTarget = await waitForExtensionValue(
      async () => (await browserCdp.send("Target.getTargets", { filter: [{}] })).targetInfos
        .find((info) => info.type === "page" && info.url === `chrome-extension://${extensionId}/sidepanel/sidepanel.html`),
      (value) => Boolean(value),
      "native sidepanel page target was not created"
    );
    assert.ok(panelTarget, "native sidepanel target should be discoverable");
    const { sessionId } = await browserCdp.send("Target.attachToTarget", { targetId: panelTarget.targetId, flatten: false });
    let evaluationId = 0;
    const evaluateNative = (expression, awaitPromise = false) => new Promise((resolveValue, reject) => {
      const id = ++evaluationId;
      const timer = setTimeout(() => {
        browserCdp.off("Target.receivedMessageFromTarget", receive);
        reject(new Error("native caption sidepanel evaluation timed out"));
      }, 5_000);
      const receive = (event) => {
        if (event.sessionId !== sessionId) return;
        const result = JSON.parse(event.message);
        if (result.id !== id) return;
        clearTimeout(timer);
        browserCdp.off("Target.receivedMessageFromTarget", receive);
        if (result.error) reject(new Error(`${result.error.message}: ${JSON.stringify(result.error.data || null)}`));
        else resolveValue(result.result?.result?.value);
      };
      browserCdp.on("Target.receivedMessageFromTarget", receive);
      browserCdp.send("Target.sendMessageToTarget", {
        sessionId,
        message: JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, awaitPromise, returnByValue: true } })
      }).catch(reject);
    });
    const waitForNativeValue = async (expression, predicate) => {
      const deadline = Date.now() + 15_000;
      let value;
      do {
        value = await evaluateNative(expression);
        if (predicate(value)) return value;
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
      } while (Date.now() < deadline);
      throw new Error(`timed out waiting for native caption value: ${JSON.stringify(value)}`);
    };
    const clickNative = async (selector) => {
      const clicked = await evaluateNative(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element || element.hidden) return false; element.click(); return true; })()`);
      assert.equal(clicked, true, `native sidepanel control ${selector} should be clickable`);
    };
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id);
    assert.ok(tabId, "caption fixture tab should be active");
    await waitForNativeValue(
      "document.readyState === 'complete' && (() => { const start = document.querySelector('#start'); return Boolean(start && !start.hidden && !start.disabled && start.getClientRects().length > 0); })()",
      (value) => value === true
    );
    await clickNative("#start");
    await waitForNativeValue("document.querySelector('#finish')?.hidden === false", (value) => value === true);

    const selectors = ["#reference", "#nested-save span", "#opacity-child", "#opacity-ancestor", "#content-hidden-child", "#label-content-hidden", "#title-only", "#input-button", "#input-submit", "#input-reset", "#input-image", "#editable", "#editable-own", "#node-budget", "#long-title", "#long-visible", "#label-save", "#label-hidden-child", "#label-visible", "#password", "#richtext", "#pii", "#url", "#unicode", "#data-only", "#text"];
    for (const [index, selector] of selectors.entries()) {
      await target.locator(selector).click({ force: true });
      await waitForNativeValue("document.querySelectorAll('.step-card').length", (value) => value >= index + 1);
    }
    await clickNative("#finish");

    const editorUrlPrefix = `chrome-extension://${extensionId}/editor/editor.html#`;
    const editorDeadline = Date.now() + 15_000;
    let editorPage;
    while (!editorPage && Date.now() < editorDeadline) {
      editorPage = context.pages().find((candidate) => candidate.url().startsWith(editorUrlPrefix));
      if (!editorPage) await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    assert.ok(editorPage, "successful finish should open the saved draft editor");
    await editorPage.waitForSelector("#steps li");
    const instructions = await editorPage.locator("#steps li button").allTextContents();
    const joined = instructions.join("\n");
    for (const caption of ["参照", "保存", "タイトル操作", "入力参照", "送信", "リセット", "画像検索"]) {
      assert.match(joined, new RegExp(`【${caption}】をクリック`), `safe caption should be retained: ${caption}`);
    }
    for (const caption of ["可視ラベル", "正常ラベル", "確認"]) {
      assert.match(joined, new RegExp(`【${caption}】をクリック`), `visible associated label should be retained: ${caption}`);
    }
    assert.ok((joined.match(/ボタンを操作する/g) || []).length >= 5, "nested/editable and unsafe controls should use the button fallback");
    assert.match(joined, /保護された入力欄を操作する/, "password clicks should use the protected-input semantic label");
    assert.match(joined, /入力欄を操作する/, "value-bearing clicks should use the input semantic label");
    assert.doesNotMatch(joined, /非表示個人名カナリア|不可視保存ラベル|不可視顧客名|パスワード秘密|リッチテキスト秘密|PIN 1234|tenant\.example\.dev|機密データ|利用者秘密/);
  } finally {
    await context?.close();
    if (canRemoveUserDataDir) await rm(resolvedUserDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => undefined);
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});


test("caption visibility excludes content-visibility hidden children and ancestors", async () => {
  const source = await readFile(new URL("../apps/extension/content/recorder.js", import.meta.url), "utf8");
  const start = source.indexOf("  const boundedVisibleText = ");
  const end = source.indexOf("  const boundedAttribute = ", start);
  assert.ok(start > 0 && end > start);
  const element = (parentElement = null, contentVisibility = "visible") => ({ parentElement, hidden: false, getAttribute: () => null, style: { display: "block", visibility: "visible", opacity: "1", contentVisibility } });
  const root = element(), hidden = element(root, "hidden"), visible = element(root);
  const nodes = [{ parentElement: hidden, nodeValue: "合成非表示個人名カナリア" }, { parentElement: visible, nodeValue: "参照" }];
  const document = { createTreeWalker: () => { let index = -1; return { nextNode() { index += 1; return index < nodes.length; }, get currentNode() { return nodes[index]; } }; } };
  const read = new Function("document", "NodeFilter", "getComputedStyle", "target", `${source.slice(start, end)}; return boundedVisibleText(target);`);
  assert.deepEqual(read(document, { SHOW_TEXT: 4 }, (node) => node.style, root), { text: "参照", truncated: false });
  root.style.contentVisibility = "hidden";
  assert.deepEqual(read(document, { SHOW_TEXT: 4 }, (node) => node.style, root), { text: "", truncated: false });
});

test("click geometry is finite bounded metadata without page values", () => {
  const rect = { x: 5, y: 8, width: 100, height: 30, viewportWidth: 1200, viewportHeight: 800, devicePixelRatio: 2, scrollX: 0, scrollY: 10, topFrame: true };
  const event = { kind: "click", at: 1, target: { tagName: "button", visibleText: "参照" }, clickTarget: { ...rect, value: "SYNTHETIC-CANARY" } };
  const normalized = normalizeCaptureEvent(event);
  assert.equal(normalized.label, "参照");
  assert.deepEqual(normalized.clickTarget, rect);
  assert.doesNotMatch(JSON.stringify(normalized), /SYNTHETIC-CANARY/);
  for (const bad of [{ width: -1 }, { x: NaN }, { width: Infinity }, { viewportWidth: 10 }, { devicePixelRatio: 100 }, { y: "8" }, { topFrame: false }, { scrollY: Infinity }]) {
    assert.equal(normalizeCaptureEvent({ ...event, clickTarget: { ...rect, ...bad } }).clickTarget, undefined);
  }
});

test("click target lease refuses detached, moved, scrolled and older targets", async () => {
  const source = await readFile(new URL("../apps/extension/content/recorder.js", import.meta.url), "utf8");
  const start = source.indexOf("  let latestClick = null;");
  const end = source.indexOf("  const click = ", start);
  const validationStart = source.indexOf('    if (command === "click-target") {');
  const validationEnd = source.indexOf('    if (command === "retain") {', validationStart);
  assert.ok(start > 0 && end > start && validationStart > 0 && validationEnd > validationStart);
  const world = { innerWidth: 1200, innerHeight: 800, devicePixelRatio: 2, scrollX: 0, scrollY: 0 };
  world.top = world;
  const fixture = new Function("globalThis", `${source.slice(start, end)}; return {
    capture(target, eventId) { latestClick = { target, eventId, rect: clickTargetRect(target) }; return latestClick.rect; },
    validate(command, eventId) { ${source.slice(validationStart, validationEnd)} }
  };`)(world);
  let left = 20;
  const target = { isConnected: true, getBoundingClientRect: () => ({ left, top: 10, width: 100, height: 30, right: left + 100, bottom: 40 }) };
  const first = fixture.capture(target, "event-1");
  assert.equal(first.topFrame, true);
  assert.deepEqual(fixture.validate("click-target", "event-1"), first);
  assert.equal(fixture.validate("click-target", "event-0"), null);
  left += 1;
  assert.equal(fixture.validate("click-target", "event-1"), null);
  left -= 1;
  world.scrollY = 1;
  assert.equal(fixture.validate("click-target", "event-1"), null);
  world.scrollY = 0;
  target.isConnected = false;
  assert.equal(fixture.validate("click-target", "event-1"), null);
  world.top = {};
  assert.equal(fixture.capture(target, "event-2"), undefined);
});
