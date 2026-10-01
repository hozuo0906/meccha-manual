import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "./support/test-browser.mjs";
import { installSensitiveMasks, removeSensitiveMasks } from "../apps/extension/capture/screenshot.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(read, accept, message, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  do { const value = await read(); if (accept(value)) return value; await delay(20); } while (Date.now() < deadline);
  assert.fail(message);
}
const fixtureValues = ["合成氏名カナリア甲", "合成氏名カナリア甲", "合成氏名カナリア乙", "fixture-alias@example.test", "1977-04-15", "1988-05-16"];
function fixture(reverse) {
  const fields = fixtureValues.map((value, index) => `<label>${index < 3 ? "氏名" : index === 3 ? "メール" : "生年月日"}<input id="field${index}" aria-label="${index < 3 ? "氏名" : index === 3 ? "メール" : "生年月日"}" value="${value}"></label>`);
  return `<!doctype html><meta charset="utf-8"><style>body{font:18px sans-serif;background:#e8f5fa}label{display:block;margin:16px}input{margin-left:24px;width:320px;padding:6px}</style><h1>合成値の記録試験</h1>${(reverse ? fields.reverse() : fields).join("")}<button id="confirm">${reverse ? "確認二" : "確認一"}</button><span id="hidden-heartbeat" style="display:none">0</span><script>setInterval(()=>{document.querySelector("#hidden-heartbeat").firstChild.nodeValue=String(Date.now());},8);window.formChanges=0;addEventListener('input',()=>formChanges++);addEventListener('change',()=>formChanges++);</script>`;
}
async function stored(worker, database, store, key) {
  return worker.evaluate(({ database, store, key }) => new Promise((resolve, reject) => {
    const open = indexedDB.open(database, 1);
    open.onupgradeneeded = () => { open.transaction.abort(); reject(new Error("Expected recording store absent")); };
    open.onerror = () => reject(new Error("Recording store read failed"));
    open.onsuccess = () => { const db = open.result; const transaction = db.transaction(store, "readonly"); const request = key ? transaction.objectStore(store).get(key) : transaction.objectStore(store).getAll(); transaction.oncomplete = () => { db.close(); resolve(request.result); }; transaction.onerror = () => { db.close(); reject(new Error("Recording store transaction failed")); }; };
  }), { database, store, key });
}

test("native MV3 preserves exact-value aliases across documents and excludes private keys from exports", { timeout: 90_000 }, async () => {
  const server = createServer((request, response) => { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(fixture(request.url === "/second")); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const extensionPath = fileURLToPath(new URL("../apps/extension", import.meta.url));
  let context;
  try {
    context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true, viewport: null,
      args: ["--window-size=1366,1000", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const extensionId = new URL(worker.url()).hostname;
    const page = await context.newPage();
    await page.goto(`${base}/first`);
    const cdp = await context.browser().newBrowserCDPSession();
    const target = await until(async () => (await cdp.send("Target.getTargets", { filter: [{ type: "tab", exclude: false }] })).targetInfos.find((entry) => entry.url === `${base}/first`), Boolean, "Synthetic target tab unavailable");
    await until(() => worker.evaluate(() => chrome.action.onClicked.hasListeners()), Boolean, "Extension action listener unavailable");
    await cdp.send("Extensions.triggerAction", { id: extensionId, targetId: target.targetId });
    const controls = await context.newPage();
    await controls.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`);
    const command = (message) => controls.evaluate((message) => chrome.runtime.sendMessage(message), message);
    const tabId = await worker.evaluate(async (url) => (await chrome.tabs.query({ url }))[0].id, `${base}/*`);
    await page.bringToFront();
    const started = await command({ type: "capture:start", tabId, mode: "pc" });
    assert.equal(started.ok, true);
    const sessionId = started.value.sessionId;
    const state = () => worker.evaluate(async () => (await chrome.storage.session.get("activeCaptureSession")).activeCaptureSession);
    const capture = async (label) => {
      await page.locator("#confirm").click();
      const result = await until(async () => {
        const session = await state();
        const event = session.events.find((event) => event.label === label);
        return event && session.stepImageRefs.find((entry) => entry.eventId === event.eventId);
      }, (entry) => ["ready", "protected", "failed", "unavailable"].includes(entry?.status), "Native capture failed to settle");
      assert.equal(result.status, "ready", `Native alias fixture must capture pixels, got ${result.reason}`);
      const entries = await stored(worker, "meccha-manual-capture-live", "step-images");
      return entries.find((entry) => entry.sessionId === sessionId && entry.eventId === result.eventId);
    };
    const originalState = () => page.evaluate(() => ({ values: [0, 1, 2, 3, 4, 5].map((index) => document.getElementById(`field${index}`).value), changes: window.formChanges }));
    const first = await capture("確認一");
    assert.deepEqual(await originalState(), { values: fixtureValues, changes: 0 });
    assert.equal(first.privacyReview.replacements.filter((item) => item.kind === "name").length, 3);
    assert.equal(new Set(first.privacyReview.replacements.filter((item) => item.kind === "name").map((item) => item.text)).size, 2);
    assert.equal(new Set(first.privacyReview.replacements.filter((item) => item.kind === "birthday").map((item) => item.text)).size, 2);
    const privateState = await worker.evaluate(async () => (await chrome.storage.session.get("capturePrivacyAliases")).capturePrivacyAliases);
    assert.equal(privateState.allocations.length, 5);
    assert.match(privateState.secret, /^[a-f0-9]{64}$/);
    const untrusted = await worker.evaluate(async (tabId) => (await chrome.scripting.executeScript({ target: { tabId }, func: async () => {
      try { return (await chrome.storage.session.get("capturePrivacyAliases")).capturePrivacyAliases || null; } catch { return null; }
    } }))[0].result, tabId);
    assert.equal(untrusted, null, "Content scripts must not access the trusted session key");
    await page.goto(`${base}/second`);
    await until(() => worker.evaluate(async (tabId) => (await chrome.scripting.executeScript({ target: { tabId }, func: () => Boolean(globalThis.__mecchaManualRecorder) }))[0].result, tabId), Boolean, "Recorder did not survive navigation");
    await until(async () => (await state()).stepImageRefs, (refs) => refs.every((entry) => !["queued", "capturing"].includes(entry.status)), "Navigation image did not settle");
    await delay(650);
    const second = await capture("確認二");
    const aliasSet = (image) => image.privacyReview.replacements.map(({ id, kind, text }) => ({ id, kind, text })).sort((a, b) => a.id.localeCompare(b.id));
    assert.deepEqual(aliasSet(second), aliasSet(first), "New document encounter order must not change a same-value alias");
    assert.deepEqual(await originalState(), { values: fixtureValues, changes: 0 });
    const finished = await command({ type: "capture:finish" });
    assert.equal(finished.ok, true);
    assert.equal(finished.value.draftId, sessionId);
    const draft = await stored(worker, "meccha-manual-guest", "drafts", sessionId);
    assert.ok(draft?.screenshots?.length >= 2);
    const local = await worker.evaluate(() => chrome.storage.local.get(null));
    const publicStatus = await command({ type: "capture:status" });
    const exported = JSON.stringify({ draft, local, publicStatus });
    for (const forbidden of [...fixtureValues, privateState.secret, ...privateState.allocations.map(([key]) => key)]) assert.equal(exported.includes(forbidden), false, "Export must not contain an original value, secret, or HMAC");
    assert.doesNotMatch(exported, /privateAliasAllocations|capturePrivacyAliases/);
    assert.equal(await worker.evaluate(async () => Boolean((await chrome.storage.session.get("capturePrivacyAliases")).capturePrivacyAliases)), false);
    await page.bringToFront();
    assert.equal((await command({ type: "capture:start", tabId, mode: "pc" })).ok, true);
    await page.locator("#confirm").click();
    const newState = await until(() => worker.evaluate(async () => (await chrome.storage.session.get("capturePrivacyAliases")).capturePrivacyAliases), (state) => state?.next > 0, "Second record alias state absent");
    assert.notEqual(newState.namespace, privateState.namespace);
    assert.notEqual(newState.secret, privateState.secret);
    assert.equal((await command({ type: "capture:cancel" })).ok, true);

    // Delay only this synthetic isolated-world crypto operation to prove that
    // a property update without a DOM mutation cannot pass the async boundary.
    const inject = async (fn, args = []) => (await worker.evaluate(`chrome.scripting.executeScript({target:{tabId:${tabId}},func:${fn.toString()},args:${JSON.stringify(args)}})`))[0].result;
    await inject(() => { const sign = crypto.subtle.sign.bind(crypto.subtle); crypto.subtle.sign = async (...args) => { globalThis.__aliasSigning = true; await new Promise((resolve) => setTimeout(resolve, 150)); return sign(...args); }; });
    const pending = inject(installSensitiveMasks, [{ recordId: "race-fixture" }]);
    await until(() => inject(() => globalThis.__aliasSigning === true), Boolean, "Delayed crypto was not reached");
    await page.evaluate(() => { document.getElementById("field0").value = "合成変更カナリア"; });
    assert.equal((await pending).applied, false);
    await inject(removeSensitiveMasks, [{ endRecord: true }]);
  } finally {
    await context?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
