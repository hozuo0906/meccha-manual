import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "@playwright/test";

const extensionRoot = resolve(fileURLToPath(new URL("../apps/extension/", import.meta.url)));

test("real MV3 action opens sidepanel and records separate step images", { timeout: 60_000 }, async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    const fixture = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>&#30003;&#35531;&#31649;&#29702;</title><style>:root{font-family:system-ui,sans-serif;color:#17324d;background:#eef4f7}body{margin:0;padding:32px}.app{max-width:920px;margin:auto;background:#fff;border-radius:18px;padding:28px;box-shadow:0 12px 36px #17324d22}.top{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #d9e5eb;padding-bottom:18px}.eyebrow{font-size:12px;color:#39758d;letter-spacing:.12em}.state{background:#e4f4ec;color:#21714d;border-radius:999px;padding:8px 14px;font-weight:700}.cards{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin:22px 0}.card{border:1px solid #d9e5eb;border-radius:14px;padding:18px;background:#fbfdfe}.card h2{font-size:18px;margin:0 0 10px}.meta{color:#617685;font-size:13px}.action{background:#216b84;color:#fff;border:0;border-radius:10px;padding:12px 18px;font-size:16px;cursor:pointer}.notice{background:#fff4d6;border-left:4px solid #e3a62f;padding:12px 16px;margin-top:12px}</style></head><body><main class="app"><div class="top"><div><div class="eyebrow">&#26989;&#21209;&#12509;&#12540;&#12479;&#12523; / &#30003;&#35531;&#31649;&#29702;</div><h1>&#20170;&#36913;&#12398;&#30003;&#35531;&#19968;&#35239;</h1></div><span class="state" id="state">&#21463;&#20184;&#20013;</span></div><div class="cards"><article class="card"><h2>&#20132;&#36890;&#36027;&#31934;&#31639;</h2><p class="meta">&#21942;&#26997;&#37096; &#12539; &#23665;&#30000; &#22826;&#37070;　2026/09/26</p><p>&#26481;&#20140;&#39365;&#12363;&#12425;&#35386;&#21839;&#20808;&#12414;&#12391;&#12398;&#20132;&#36890;&#36027;&#12434;&#30003;&#35531;&#12375;&#12390;&#12356;&#12414;&#12377;&#12290;</p></article><article class="card"><h2>&#20633;&#21697;&#36092;&#20837;</h2><p class="meta">&#31649;&#29702;&#37096; &#12539; &#20304;&#34276; &#33457;&#23376;　2026/09/25</p><p>&#20250;&#35696;&#23460;&#29992;&#12514;&#12491;&#12479;&#12540;&#12398;&#36092;&#20837;&#30003;&#35531;&#12391;&#12377;&#12290;</p></article></div><div class="notice" id="notice">&#30906;&#35469;&#12364;&#24517;&#35201;&#12394;&#30003;&#35531;&#12364;&#12354;&#12426;&#12414;&#12377;&#12290;</div><button id="do" class="action">&#30003;&#35531;&#12434;&#30906;&#35469;&#12377;&#12427;</button></main><script>const state=document.querySelector("#state");const notice=document.querySelector("#notice");const button=document.querySelector("#do");button.addEventListener("pointerdown",()=>{if(state.textContent==="\u53d7\u4ed8\u4e2d"){state.textContent="\u627f\u8a8d\u5f85\u3061";state.style.background="#e8eafd";state.style.color="#4250a0";notice.textContent="2\u4ef6\u306e\u7533\u8acb\u304c\u627f\u8a8d\u5f85\u3061\u3067\u3059\u3002\u5185\u5bb9\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002";button.textContent="\u627f\u8a8d\u5f85\u3061\u3092\u8868\u793a";}else{state.textContent="\u78ba\u8a8d\u6e08\u307f";state.style.background="#e4f4ec";state.style.color="#21714d";notice.textContent="\u627f\u8a8d\u5f85\u3061\u306e\u7533\u8acb\u3092\u8868\u793a\u3057\u3066\u3044\u307e\u3059\u3002";button.textContent="\u78ba\u8a8d\u6e08\u307f";}});</script></body></html>`;

    response.end(fixture);
  });
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const baseUrl = `http://127.0.0.1:${server.address().port}/`;
  const userDataDir = await mkdtemp(join(tmpdir(), "meccha-manual-sidepanel-runtime-"));
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
    const browserCdp = await context.browser().newBrowserCDPSession();
    const targets = await browserCdp.send("Target.getTargets", { filter: [{ type: "tab", exclude: false }] });
    const targetInfo = targets.targetInfos.find((info) => info.url === baseUrl);
    assert.ok(targetInfo, "synthetic tab target should be discoverable");
    await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      await browserCdp.send("Extensions.triggerAction", { id: extensionId, targetId: targetInfo.targetId });
    } catch (error) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const sidePanelContexts = await worker.evaluate(async () => chrome.runtime.getContexts
      ? chrome.runtime.getContexts({ contextTypes: ["SIDE_PANEL"] })
      : []);
    assert.ok(sidePanelContexts.length > 0, "action should create a SIDE_PANEL extension context");
    const panelTarget = (await browserCdp.send("Target.getTargets", { filter: [{}] })).targetInfos
      .find((info) => info.type === "page" && info.url === `chrome-extension://${extensionId}/sidepanel/sidepanel.html`);
    assert.ok(panelTarget, "native sidepanel page target should be discoverable");
    const { sessionId } = await browserCdp.send("Target.attachToTarget", { targetId: panelTarget.targetId, flatten: false });
    let evaluationId = 0;
    const evaluateNative = (expression, awaitPromise = false) => new Promise((resolve, reject) => {
      const id = ++evaluationId;
      const timer = setTimeout(() => { browserCdp.off("Target.receivedMessageFromTarget", receive); reject(new Error("native sidepanel evaluation timed out")); }, 5_000);
      const receive = (event) => {
        if (event.sessionId !== sessionId) return;
        const result = JSON.parse(event.message);
        if (result.id !== id) return;
        clearTimeout(timer);
        browserCdp.off("Target.receivedMessageFromTarget", receive);
        if (result.error) reject(new Error(`${result.error.message}: ${JSON.stringify(result.error.data || null)}`));
        else resolve(result.result?.result?.value);
      };
      browserCdp.on("Target.receivedMessageFromTarget", receive);
      browserCdp.send("Target.sendMessageToTarget", {
        sessionId,
        message: JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, awaitPromise, returnByValue: true } })
      }).catch(reject);
    });
    const waitForNativeValue = async (expression, predicate, awaitPromise = false) => {
      const deadline = Date.now() + 15_000;
      let value;
      do {
        value = await evaluateNative(expression, awaitPromise);
        if (predicate(value)) return value;
        await new Promise((resolve) => setTimeout(resolve, 100));
      } while (Date.now() < deadline);
      return value;
    };
    const expectNativeImages = async () => {
      const imageState = await waitForNativeValue(
        "[...document.querySelectorAll('.step-card img')].map((image) => ({ complete: image.complete, width: image.naturalWidth, src: image.src }))",
        (value) => Array.isArray(value) && value.length === 2 && value.every((image) => image.complete && image.width > 0)
      );
      assert.equal(imageState.length, 2, "two captured events should have two image cards");
      assert.notEqual(imageState[0].src, imageState[1].src, "each operation should retain its own screenshot");
    };
    const clickNative = async (selector) => {
      const clicked = await evaluateNative(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element || element.hidden) return false; element.click(); return true; })()`);
      assert.equal(clicked, true, `native sidepanel control ${selector} should be clickable`);
    };
    const sendNativeCommand = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++evaluationId;
      const timer = setTimeout(() => { browserCdp.off("Target.receivedMessageFromTarget", receive); reject(new Error(`native sidepanel ${method} timed out`)); }, 5_000);
      const receive = (event) => {
        if (event.sessionId !== sessionId) return;
        const result = JSON.parse(event.message);
        if (result.id !== id) return;
        clearTimeout(timer);
        browserCdp.off("Target.receivedMessageFromTarget", receive);
        if (result.error) reject(new Error(result.error.message));
        else resolve(result.result);
      };
      browserCdp.on("Target.receivedMessageFromTarget", receive);
      browserCdp.send("Target.sendMessageToTarget", { sessionId, message: JSON.stringify({ id, method, params }) }).catch(reject);
    });
    await evaluateNative("document.readyState === 'complete'");
    await target.bringToFront();
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id);
    assert.ok(tabId, "synthetic target tab should be discoverable");
    const activeTabProbe = await worker.evaluate(async (id) => {
      try {
        await chrome.scripting.executeScript({ target: { tabId: id }, func: () => document.title });
        return true;
      } catch {
        return false;
      }
    }, tabId);
    assert.equal(activeTabProbe, true, "action should grant activeTab scripting access to the synthetic tab");
    await clickNative("#start");
    await waitForNativeValue("document.querySelector('#finish')?.hidden === false", (value) => value === true);
    assert.equal(await target.url(), baseUrl, "synthetic target should remain open while recording");
    assert.match(await target.content(), /id=["']do["']/, "synthetic target should retain its action button");
    await target.locator("#do").click();
    const stateAfterFirstClick = await target.locator("#state").textContent();
    await waitForNativeValue(
      "[...document.querySelectorAll('.step-card img')].map((image) => ({ complete: image.complete, width: image.naturalWidth }))",
      (value) => Array.isArray(value) && value.length === 1 && value[0].complete && value[0].width > 0
    );
    await new Promise((resolve) => setTimeout(resolve, 700));
    await target.locator("#do").click();
    const stateAfterSecondClick = await target.locator("#state").textContent();
    assert.notEqual(stateAfterFirstClick, stateAfterSecondClick, "synthetic workflow should visibly change between events");
    await expectNativeImages();
    const recordingScreenshotPath = process.env.MECCHA_SIDEPANEL_RECORDING_SCREENSHOT || join(process.cwd(), ".artifacts", "experience-repair", "sidepanel-recording.png");
    await mkdir(resolve(recordingScreenshotPath, ".."), { recursive: true });
    const recordingLayout = await sendNativeCommand("Page.getLayoutMetrics");
    const recordingContentSize = recordingLayout?.cssContentSize || recordingLayout?.contentSize;
    const recordingScreenshot = await sendNativeCommand("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      ...(recordingContentSize?.width && recordingContentSize?.height ? {
        clip: { x: 0, y: 0, width: recordingContentSize.width, height: recordingContentSize.height, scale: 1 }
      } : {})
    });
    assert.ok(recordingScreenshot, "native recording sidepanel screenshot should be captured");
    const recordingScreenshotData = recordingScreenshot?.data?.value || recordingScreenshot?.data || recordingScreenshot?.result?.data || recordingScreenshot?.result?.result?.data;
    assert.equal(typeof recordingScreenshotData, "string", "native recording screenshot should contain base64 data");
    await writeFile(recordingScreenshotPath, Buffer.from(recordingScreenshotData, "base64"));
    await target.bringToFront();
    await clickNative("#finish");
    const draftImageCount = await waitForNativeValue("document.querySelectorAll('.draft-card img').length", (value) => value > 0);
    assert.ok(draftImageCount > 0, "saved draft should retain its step image");
    const editorUrlPrefix = `chrome-extension://${extensionId}/editor/editor.html#`;
    let editorPage;
    const editorDeadline = Date.now() + 10_000;
    while (!editorPage && Date.now() < editorDeadline) {
      editorPage = context.pages().find((candidate) => candidate.url().startsWith(editorUrlPrefix));
      if (!editorPage) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(editorPage, "successful finish should open the saved draft editor");
    await editorPage.waitForSelector("#title");
    await editorPage.waitForFunction(() => document.querySelector("#title")?.value === "新しい手順書");
    assert.equal(await editorPage.locator("#title").inputValue(), "新しい手順書");
    assert.equal(await editorPage.locator("#steps li").count(), 2, "editor should show both recorded steps");
    const stepButtons = editorPage.locator("#steps li button");
    const imageSources = [];
    for (const index of [0, 1]) {
      const stepButton = stepButtons.nth(index);
      const instruction = await stepButton.textContent();
      await stepButton.click();
      const detailInstruction = editorPage.locator("#detail textarea");
      await detailInstruction.waitFor();
      assert.equal(await detailInstruction.inputValue(), instruction, "editor detail should match the selected step text");
      const image = editorPage.locator(".screenshot-preview img");
      await image.waitFor();
      await image.evaluate((element) => element.decode());
      assert.ok(await image.evaluate((element) => element.naturalWidth > 0), "selected step image should be decoded");
      imageSources.push(await image.getAttribute("src"));
    }
    assert.notEqual(imageSources[0], imageSources[1], "each selected step should retain its own screenshot");
    if (process.env.MECCHA_SIDEPANEL_DRAFT) {
      const draftSnapshot = await waitForNativeValue(`new Promise((resolve) => {
        const request = indexedDB.open("meccha-manual-guest", 1);
        request.onerror = () => resolve(null);
        request.onsuccess = () => {
          const transaction = request.result.transaction("drafts", "readonly");
          const getAll = transaction.objectStore("drafts").getAll();
          getAll.onsuccess = () => resolve(JSON.stringify(getAll.result.find((draft) => draft.steps?.length >= 2) || null));
          getAll.onerror = () => resolve(null);
        };
      })`, (value) => typeof value === "string" && value !== "null", true);
      assert.ok(draftSnapshot, "actual draftStore record should be exported");
      const draftPath = resolve(process.env.MECCHA_SIDEPANEL_DRAFT);
      await mkdir(resolve(draftPath, ".."), { recursive: true });
      await writeFile(draftPath, draftSnapshot, "utf8");
    }
    const screenshotPath = process.env.MECCHA_SIDEPANEL_SCREENSHOT || join(process.cwd(), "test-results", "issue260-sidepanel.png");
    await mkdir(resolve(screenshotPath, ".."), { recursive: true });
    const screenshot = await sendNativeCommand("Page.captureScreenshot", { format: "png" });
    assert.ok(screenshot, "native sidepanel screenshot should be captured");
    const screenshotData = screenshot?.data?.value || screenshot?.data || screenshot?.result?.data || screenshot?.result?.result?.data;
    assert.equal(typeof screenshotData, "string", "native finished screenshot should contain base64 data");
    await writeFile(screenshotPath, Buffer.from(screenshotData, "base64"));
  } finally {
    await context?.close();
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => undefined);
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});

test("real MV3 navigation does not warn while recording, preserves events, and keeps site warnings", { timeout: 60_000 }, async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>navigation fixture</title></head><body>
      <main><h1>申請一覧</h1><a id="normal-link" href="/next">次の一覧へ</a>
      <form id="request-form" action="/form-next" method="get"><label>申請番号<input id="request-id" name="requestId"></label><button id="submit-form" type="submit">申請を送信</button></form>
      <a id="site-warning" href="/site-warning">サイトの警告を確認</a></main>
      <script>
        let showSiteWarning = false;
        document.querySelector('#site-warning').addEventListener('click', () => { showSiteWarning = true; });
        addEventListener('beforeunload', (event) => {
          if (!showSiteWarning) return;
          event.preventDefault();
          event.returnValue = '';
        });
      </script>
    </body></html>`);
  });
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const baseUrl = `http://127.0.0.1:${server.address().port}/`;
  const userDataDir = await mkdtemp(join(tmpdir(), "meccha-manual-navigation-runtime-"));
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
    const browserCdp = await context.browser().newBrowserCDPSession();
    const targets = await browserCdp.send("Target.getTargets", { filter: [{ type: "tab", exclude: false }] });
    const targetInfo = targets.targetInfos.find((info) => info.url === baseUrl);
    assert.ok(targetInfo, "navigation fixture tab should be discoverable");
    await new Promise((resolve) => setTimeout(resolve, 300));
    await browserCdp.send("Extensions.triggerAction", { id: extensionId, targetId: targetInfo.targetId });
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    let panelTarget;
    const panelDeadline = Date.now() + 15_000;
    while (!panelTarget && Date.now() < panelDeadline) {
      panelTarget = (await browserCdp.send("Target.getTargets", { filter: [{}] })).targetInfos
        .find((info) => info.type === "page" && info.url === `chrome-extension://${extensionId}/sidepanel/sidepanel.html`);
      if (!panelTarget) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(panelTarget, "native sidepanel page target should be discoverable");
    const { sessionId } = await browserCdp.send("Target.attachToTarget", { targetId: panelTarget.targetId, flatten: false });
    let evaluationId = 0;
    const evaluateNative = (expression) => new Promise((resolve, reject) => {
      const id = ++evaluationId;
      const timer = setTimeout(() => {
        browserCdp.off("Target.receivedMessageFromTarget", receive);
        reject(new Error("native navigation sidepanel evaluation timed out"));
      }, 5_000);
      const receive = (event) => {
        if (event.sessionId !== sessionId) return;
        const result = JSON.parse(event.message);
        if (result.id !== id) return;
        clearTimeout(timer);
        browserCdp.off("Target.receivedMessageFromTarget", receive);
        if (result.error) reject(new Error(`${result.error.message}: ${JSON.stringify(result.error.data || null)}`));
        else resolve(result.result?.result?.value);
      };
      browserCdp.on("Target.receivedMessageFromTarget", receive);
      browserCdp.send("Target.sendMessageToTarget", {
        sessionId,
        message: JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, returnByValue: true } })
      }).catch(reject);
    });
    const clickNative = async (selector) => {
      const clicked = await evaluateNative(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element || element.hidden) return false; element.click(); return true; })()`);
      assert.equal(clicked, true, `native sidepanel control ${selector} should be clickable`);
    };
    const waitForRecorder = async (label) => {
      const deadline = Date.now() + 15_000;
      let state;
      do {
        state = await worker.evaluate(async (id) => {
          const { activeCaptureSession: session } = await chrome.storage.session.get("activeCaptureSession");
          let recorder = false;
          try {
            const [result] = await chrome.scripting.executeScript({
              target: { tabId: id },
              func: () => typeof globalThis.__mecchaManualRecorder === "function"
            });
            recorder = result?.result === true;
          } catch {
            recorder = false;
          }
          return { session, recorder };
        }, tabId);
        if (state?.session?.phase === "recording" && state.session.tabId === tabId && state.recorder) return state;
        await new Promise((resolve) => setTimeout(resolve, 100));
      } while (Date.now() < deadline);
      assert.fail(`${label}: recording session and recorder injection were not both ready`);
    };
    await target.bringToFront();
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id);
    assert.ok(tabId, "navigation fixture tab should be active");
    await clickNative("#start");
    await waitForRecorder("initial page");

    let unexpectedDialog;
    const unexpectedDialogHandler = async (dialog) => {
      unexpectedDialog = dialog.type();
      await dialog.dismiss();
    };
    target.on("dialog", unexpectedDialogHandler);
    await target.locator("#normal-link").click({ noWaitAfter: true });
    assert.equal(unexpectedDialog, undefined, "normal link navigation should not show an unload warning");
    await target.waitForURL(`${baseUrl}next`);
    await waitForRecorder("normal link destination");
    await target.locator("#request-id").fill("申請-001");
    await target.locator("#submit-form").click({ noWaitAfter: true });
    assert.equal(unexpectedDialog, undefined, "form navigation should not show an unload warning");
    await target.waitForURL((url) => url.pathname === "/form-next" && url.searchParams.get("requestId") === "申請-001");
    await waitForRecorder("form destination");
    target.off("dialog", unexpectedDialogHandler);

    let siteWarningType;
    const siteWarning = new Promise((resolve) => {
      target.once("dialog", async (dialog) => {
        siteWarningType = dialog.type();
        await dialog.dismiss();
        resolve();
      });
    });
    await target.locator("#site-warning").click();
    await siteWarning;
    assert.equal(siteWarningType, "beforeunload", "the site's own beforeunload warning should remain visible");
    assert.match(await target.url(), /\/form-next\?requestId=/, "dismissing the site's warning should keep the page open");

    await clickNative("#finish");
    const editorUrlPrefix = `chrome-extension://${extensionId}/editor/editor.html#`;
    let editorPage;
    const editorDeadline = Date.now() + 15_000;
    while (!editorPage && Date.now() < editorDeadline) {
      editorPage = context.pages().find((candidate) => candidate.url().startsWith(editorUrlPrefix));
      if (!editorPage) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(editorPage, "successful finish should open the saved draft editor");
    await editorPage.waitForSelector("#steps li");
    const instructions = await editorPage.locator("#steps li button").allTextContents();
    assert.ok(instructions.some((instruction) => instruction.includes("リンクを操作する")), "click before normal navigation should be retained");
    assert.ok(instructions.some((instruction) => instruction.includes("次のページへ移動する")), "navigation event should be retained");
    assert.ok(instructions.some((instruction) => instruction.includes("入力欄に入力する")), "input event before form navigation should be retained");
    assert.ok(instructions.some((instruction) => instruction.includes("ボタンを操作する")), "form submit click should be retained");
  } finally {
    await context?.close();
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => undefined);
    await new Promise((resolveServer) => server.close(resolveServer));
  }
});
