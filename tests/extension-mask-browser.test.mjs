import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "./support/test-browser.mjs";
import { installSensitiveMasks, verifySensitiveMasks, removeSensitiveMasks } from "../apps/extension/capture/screenshot.js";

test("real extension API masks standard/custom closed-shadow top-layer controls and canvas", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end("<!doctype html><div id='host'></div><private-editor></private-editor><canvas width='200' height='40'></canvas>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(() => {
      document.body.style.background = "rgb(0,0,255)";
      globalThis.testDialogs = [];
      globalThis.testRoots = [];
      for (const host of [document.querySelector("#host"), document.querySelector("private-editor")]) {
        host.style.display = "block";
        const root = host.attachShadow({ mode: "closed" });
        testRoots.push(root);
        const backdropStyle = document.createElement("style");
        backdropStyle.textContent = "dialog::backdrop{background:rgb(0,255,0)}";
        root.append(backdropStyle);
        const dialog = document.createElement("dialog");
        dialog.style.cssText = "visibility:visible;background:rgb(255,0,0);width:160px;height:80px;padding:0";
        dialog.innerHTML = '<input value="SYNTHETIC-SECRET" style="visibility:visible">';
        root.append(dialog);
        dialog.showModal();
        testDialogs.push(dialog);
      }
      document.querySelector("canvas").getContext("2d").fillText("SYNTHETIC-CANVAS-SECRET", 2, 20);
    });
    const tabId = await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    assert.ok(await page.evaluate(() => testDialogs.every((dialog) => dialog.getClientRects().length > 0)));
    const dialogCenter = await page.evaluate(() => {
      const rect = testDialogs[0].getBoundingClientRect();
      return { x: Math.floor(rect.left + rect.width / 2), y: Math.floor(rect.top + rect.height / 2) };
    });
    const backdropPoint = { x: 8, y: 8 };
    const pixelPage = await context.newPage();
    const pngPixel = (png, x, y) => pixelPage.evaluate(async ({ base64, x: pixelX, y: pixelY }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context2d = canvas.getContext("2d", { willReadFrequently: true });
      context2d.drawImage(image, 0, 0);
      return Array.from(context2d.getImageData(pixelX, pixelY, 1, 1).data);
    }, { base64: png.toString("base64"), x, y });
    const beforeMask = await page.screenshot({ type: "png" });
    assert.deepEqual(await pngPixel(beforeMask, dialogCenter.x, dialogCenter.y), [255, 0, 0, 255]);
    assert.deepEqual(await pngPixel(beforeMask, backdropPoint.x, backdropPoint.y), [0, 255, 0, 255]);
    const mask = await inject(installSensitiveMasks);
    assert.equal(mask.applied, true);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const maskedBeforeLate = await pngPixel(await page.screenshot({ type: "png" }), dialogCenter.x, dialogCenter.y);
    assert.notDeepEqual(maskedBeforeLate, [255, 0, 0, 255]);
    assert.deepEqual(await pngPixel(await page.screenshot({ type: "png" }), backdropPoint.x, backdropPoint.y), [0, 0, 255, 255]);
    const lateDialog = await page.evaluate(() => {
      const dialog = document.createElement("dialog");
      dialog.innerHTML = "<span>late synthetic secret</span>";
      testRoots[0].append(dialog);
      dialog.showModal();
      testDialogs.push(dialog);
      return true;
    });
    assert.equal(lateDialog, true);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false, "new protected regions invalidate the returned review metadata");
    assert.ok(await page.evaluate(() => testDialogs.every((dialog) => dialog.getClientRects().length > 0 && getComputedStyle(dialog).opacity === "0")));
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("canvas")).opacity), "0");
    const maskedPixel = await pngPixel(await page.screenshot({ type: "png" }), dialogCenter.x, dialogCenter.y);
    assert.notDeepEqual(maskedPixel, [255, 0, 0, 255]);
    await page.evaluate(() => {
      const style = [...testRoots[0].querySelectorAll("style")].find((candidate) => candidate.textContent.includes("*::backdrop"));
      style?.remove();
    });
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false);
    await inject(removeSensitiveMasks);
    await page.evaluate(() => testDialogs.at(-1)?.close());
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    assert.deepEqual(await pngPixel(await page.screenshot({ type: "png" }), dialogCenter.x, dialogCenter.y), [255, 0, 0, 255]);
    assert.deepEqual(await page.evaluate(() => testRoots.map((root) => [...root.querySelectorAll("style")].map((style) => style.textContent))), [["dialog::backdrop{background:rgb(0,255,0)}"], ["dialog::backdrop{background:rgb(0,255,0)}"]]);
    assert.ok(await page.evaluate(() => testDialogs.slice(0, 2).every((dialog) => dialog.getClientRects().length > 0 && getComputedStyle(dialog).opacity === "1")));
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("canvas")).opacity), "1");
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("masking a focused input does not commit or blur the active editor", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(`<!doctype html><form id="form"><input id="field"><button id="submit" type="submit">確定</button></form><script>
      window.focusTrace = [];
      for (const type of ["focus", "blur", "change", "submit", "keydown", "compositionstart", "compositionend", "input"]) {
        addEventListener(type, (event) => { window.focusTrace.push({ type, key: event.key || "", target: event.target?.id || "" }); }, true);
      }
      document.querySelector("#form").addEventListener("submit", (event) => event.preventDefault());
    </script>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const tabId = await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    await page.locator("#field").focus();
    await page.locator("#field").pressSequentially("synthetic");
    await page.evaluate(() => { window.focusTrace = []; document.querySelector("#field").setSelectionRange(9, 9); });
    assert.deepEqual(await page.evaluate(() => ({ active: document.activeElement?.id, length: document.querySelector("#field").value.length, selection: [document.querySelector("#field").selectionStart, document.querySelector("#field").selectionEnd] })), { active: "field", length: 9, selection: [9, 9] });
    const mask = await inject(installSensitiveMasks);
    assert.equal(mask.applied, true);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const masked = await page.evaluate(() => ({
      active: document.activeElement?.id || "",
      length: document.querySelector("#field").value.length,
      selection: [document.querySelector("#field").selectionStart, document.querySelector("#field").selectionEnd],
      events: window.focusTrace.map(({ type }) => type)
    }));
    assert.equal(masked.active, "field");
    assert.equal(masked.length, 9);
    assert.deepEqual(masked.selection, [9, 9]);
    assert.deepEqual(masked.events, []);
    await page.keyboard.type("b");
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    const during = await page.evaluate(() => ({
      active: document.activeElement?.id || "",
      length: document.querySelector("#field").value.length,
      selection: [document.querySelector("#field").selectionStart, document.querySelector("#field").selectionEnd],
      events: window.focusTrace
    }));
    assert.equal(during.active, "field");
    assert.equal(during.length, 10);
    assert.deepEqual(during.selection, [10, 10]);
    assert.equal(during.events.some(({ type, key }) => type === "blur" || type === "change" || type === "submit" || key === "Enter"), false);
    await inject(removeSensitiveMasks);
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("masking a focused input inside a closed shadow host does not commit or blur it", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(`<!doctype html><private-editor></private-editor><script>
      const host = document.querySelector("private-editor");
      const root = host.attachShadow({ mode: "closed" });
      const field = document.createElement("input");
      field.id = "field";
      root.append(field);
      window.focusTrace = [];
      for (const type of ["focus", "blur", "change", "submit", "keydown", "compositionstart", "compositionend", "input"]) {
        addEventListener(type, (event) => { window.focusTrace.push({ type, target: event.target?.id || "" }); }, true);
      }
      window.focusClosedField = () => { field.focus(); field.value = "synthetic"; };
      window.closedFieldState = () => ({ active: document.activeElement === host, valueLength: field.value.length });
    </script>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const tabId = await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    await page.evaluate(() => { window.focusClosedField(); window.focusTrace = []; });
    assert.deepEqual(await page.evaluate(() => window.closedFieldState()), { active: true, valueLength: 9 });
    const mask = await inject(installSensitiveMasks);
    assert.equal(mask.applied, true);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const during = await page.evaluate(() => ({ ...window.closedFieldState(), events: window.focusTrace.map(({ type }) => type) }));
    assert.equal(during.active, true);
    assert.equal(during.valueLength, 9);
    assert.deepEqual(during.events, []);
    await inject(removeSensitiveMasks);
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("CDP IME composition remains focused through mask paint and commit", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<!doctype html><form id="form"><input id="field"><button id="submit" type="submit">確定</button></form><script>
      window.focusTrace = [];
      for (const type of ["focus", "blur", "change", "submit", "keydown", "compositionstart", "compositionupdate", "compositionend", "input"]) {
        addEventListener(type, (event) => { window.focusTrace.push({ type, key: event.key || "", data: event.data || "", target: event.target?.id || "" }); }, true);
      }
      document.querySelector("#form").addEventListener("submit", (event) => event.preventDefault());
    </script>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const extensionPath = fileURLToPath(new URL("./fixtures/mask-extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const extension = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const tabId = await extension.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
    const inject = async (fn, args = []) => (await extension.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    const cdp = await context.newCDPSession(page);
    await page.locator("#field").focus();
    await cdp.send("Input.imeSetComposition", { text: "か", selectionStart: 1, selectionEnd: 1 });
    await page.evaluate(() => { window.focusTrace = []; });
    const mask = await inject(installSensitiveMasks);
    assert.equal(mask.applied, true);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await cdp.send("Input.imeSetComposition", { text: "かな", selectionStart: 2, selectionEnd: 2 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    const composing = await page.evaluate(() => ({ active: document.activeElement?.id || "", value: document.querySelector("#field").value, events: window.focusTrace }));
    assert.equal(composing.active, "field");
    assert.equal(composing.value, "かな");
    assert.ok(composing.events.some(({ type }) => type === "compositionupdate"));
    assert.equal(composing.events.filter(({ type }) => type === "compositionend").length, 0);
    await cdp.send("Input.insertText", { text: "確定" });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    const committed = await page.evaluate(() => ({
      active: document.activeElement?.id || "",
      value: document.querySelector("#field").value,
      events: window.focusTrace
    }));
    assert.equal(committed.active, "field");
    assert.equal(committed.value, "確定");
    assert.equal(committed.events.filter(({ type }) => type === "compositionend").length, 1);
    assert.equal(committed.events.some(({ type, key }) => type === "blur" || type === "change" || type === "submit" || key === "Enter"), false);
    assert.equal(await inject(verifySensitiveMasks, [mask.token]), false, "a changed value must be recaptured rather than using a stale fictional mapping");
    await inject(removeSensitiveMasks);
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
