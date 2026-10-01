import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Script } from "node:vm";
import { chromium } from "./support/test-browser.mjs";

// Deliberately separate from the sidepanel UX test. Both revisions receive the
// same real MV3 action, fixture, clicks, native capture API, and pixel assertions.
// No app source, Chrome permissions, clock, capture API, or image store is patched.
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const BASELINE_REVISION = "3c62ca5fdee5f09cce620566b654ab95a882ae0c";
const OUTPUT = resolve(ROOT, ".artifacts/capture-completion");
const TERMINAL = new Set(["ready", "unavailable", "failed", "protected", "none"]);
const MARKERS = [[220, 30, 60], [230, 190, 20], [20, 180, 170], [30, 90, 220]];
const SCENES = { original: [24, 60, 140], changed: [170, 65, 25], next: [25, 115, 65] };
const BUTTONS = {
  controlFirst: "通常一", controlSecond: "通常二", rapidFirst: "連続一", rapidSecond: "連続二",
  hiddenFirst: "非表示一", hiddenSecond: "非表示二", visibleFirst: "変更前一", visibleSecond: "変更前二",
  visibleAfter: "変更後", navigationFirst: "遷移前一", navigationSecond: "遷移前二", navigationAfter: "遷移後"
};
const SUSTAINED_COUNT = 20;
const SUSTAINED_INTERVAL_MS = 750; // Below Chrome's maximum of two native captures per second.
const SUSTAINED_VALUES = ["Synthetic Person Alpha", "sustained-canary@example.test", "1977-04-15"];
const SUSTAINED_LABELS = Array.from({ length: SUSTAINED_COUNT }, (_, index) => `連続確認 ${index + 1}`);
const FRAME_COLORS = [[25, 110, 45], [235, 160, 35]];
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

function nearColor(actual, expected) {
  return Array.isArray(actual) && actual.length === 3 && actual.every((value, index) => Number.isFinite(value) && Math.abs(value - expected[index]) <= 25);
}

function assertRaster(raster, expectedScene) {
  assert.equal(raster.decoded, true, "stored screenshot bytes must decode");
  assert.ok(raster.width >= 500 && raster.height >= 400, "stored screenshot must contain the complete synthetic viewport");
  assert.ok(Math.abs(raster.width - raster.expectedWidth) <= 2 && Math.abs(raster.height - raster.expectedHeight) <= 2,
    "stored screenshot dimensions must match the native target viewport, not a thumbnail or another surface");
  assert.equal(raster.corners.length, 4);
  for (let index = 0; index < 4; index += 1) {
    assert.ok(nearColor(raster.corners[index], MARKERS[index]), `viewport corner ${index} was cropped, blank, or from another surface`);
  }
  assert.ok(nearColor(raster.scene, SCENES[expectedScene]), `stored screenshot must be from scene ${expectedScene}, never a later frame`);
}

function assertComparison(baseline, current) {
  for (const [name, variant] of [["baseline", baseline], ["current", current]]) {
    assert.equal(variant.paced.saved, 2, `${name}: paced native capture control must succeed`);
    assert.equal(variant.visibleChanged.staleSaved, 0, `${name}: changed visible scene must not be attached to an earlier click`);
    assert.equal(variant.navigationChanged.staleSaved, 0, `${name}: navigation must not attach the new document to an earlier click`);
    assert.equal(variant.invalidRasterCount, 0, `${name}: all stored screenshots must decode and preserve all viewport markers`);
    assert.equal(variant.draftVerified, true, `${name}: final draft must preserve the exact verified live screenshot bytes`);
  }
  for (const scenario of ["rapid", "hiddenChurn"]) {
    assert.equal(current[scenario].saved, 2, `${scenario}: both stable-scene operations need actual complete screenshots`);
    assert.ok(current[scenario].saved > baseline[scenario].saved, `${scenario}: completeness must improve over the same baseline fixture`);
    assert.ok(current[scenario].clickIntervalMs < 500 && baseline[scenario].clickIntervalMs < 500,
      `${scenario}: both runs must exercise the real sub-500 ms capture interval`);
  }
}

function assertSustained(report) {
  assert.equal(report.attempted, SUSTAINED_COUNT, "Sustained acceptance must exercise exactly 20 operations");
  assert.equal(report.saved, SUSTAINED_COUNT, "All 20 stable operations need actual useful images");
  assert.equal(report.terminal, SUSTAINED_COUNT, "Every sustained image state must become terminal");
  assert.equal(report.useful, SUSTAINED_COUNT, "Every sustained raster must retain context and readable fictional replacements");
  assert.equal(report.formUnchanged, true, "Capture must not change original form values, selection, focus, or input/change/submit counts");
  assert.equal(report.recordingUninterrupted, true, "The original recording must remain active across all 20 operations");
  assert.equal(new Set(report.eventIds).size, SUSTAINED_COUNT, "Sustained operations must have distinct event identities");
  assert.equal(new Set(report.screenshotIds).size, SUSTAINED_COUNT, "Sustained images must not reuse another event's image identity");
  assert.equal(report.documentIds.length, SUSTAINED_COUNT);
  assert.ok(report.documentIds.every((id) => typeof id === "string" && id === report.documentIds[0]), "All sustained events must stay in their exact native document");
  assert.equal(report.intervalsMs.length, SUSTAINED_COUNT - 1);
  assert.ok(report.intervalsMs.every((ms) => ms >= SUSTAINED_INTERVAL_MS), "Sustained operations must respect the supported native capture cadence");
}

function assertUsefulSustainedRaster(raster, frame) {
  assertRaster(raster, "next");
  assert.equal(raster.frame.length, 5);
  for (let bit = 0; bit < 5; bit += 1) {
    assert.ok(nearColor(raster.frame[bit], FRAME_COLORS[(frame >> bit) & 1]), "Per-operation pixels must match this exact event, never an earlier or later capture");
  }
  assert.equal(raster.fields.length, SUSTAINED_VALUES.length);
  for (const field of raster.fields) {
    assert.equal(field.original, 0, "Stored pixels must not retain synthetic original-value canary glyphs");
    assert.ok(field.ink > 10, "Fictional replacement text must be visible, not a blank or solid privacy box");
    assert.ok(field.light > field.total / 2, "The form must remain useful rather than being covered by a solid dark mask");
  }
}

async function until(read, predicate, description, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  let value;
  do {
    value = await read();
    if (predicate(value)) return value;
    await delay(10);
  } while (Date.now() < deadline);
  throw new Error(`${description}; last observed state: ${JSON.stringify(value)}`);
}

function fixtureHtml(next = false) {
  // Only original input glyphs use the magenta text-fill canary. The declared
  // text color is dark, which the real privacy overlay retains for its aliases.
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>合成記録試験</title>
<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}body{background:rgb(${SCENES[next ? "next" : "original"].join(",")});font:16px system-ui}main{position:absolute;inset:90px 80px auto;padding:20px;background:white}h1{margin:0 0 12px;font-size:20px}.buttons{display:flex;flex-wrap:wrap;gap:8px}button{font:16px system-ui;padding:8px}.marker{position:fixed;width:64px;height:64px}.tl{left:0;top:0;background:rgb(${MARKERS[0]})}.tr{right:0;top:0;background:rgb(${MARKERS[1]})}.bl{left:0;bottom:0;background:rgb(${MARKERS[2]})}.br{right:0;bottom:0;background:rgb(${MARKERS[3]})}#hidden{display:none}</style></head>
<body><div class="marker tl"></div><div class="marker tr"></div><div class="marker bl"></div><div class="marker br"></div><main><h1>合成データのみの操作画面</h1><div class="buttons">${Object.entries(BUTTONS).map(([id, label]) => `<button id="${id}">${label}</button>`).join("")}</div></main><div id="hidden"><span>非表示の更新</span></div>
<script>window.fixture={scene:${JSON.stringify(next ? "next" : "original")},hiddenMutations:0,timer:null};window.setFixtureScene=(scene)=>{window.fixture.scene=scene;document.body.style.backgroundColor='rgb('+${JSON.stringify(SCENES)}[scene].join(',')+')'};window.startHiddenChurn=()=>{window.fixture.timer=setInterval(()=>{document.querySelector('#hidden span').firstChild.nodeValue='非表示の更新 '+(++window.fixture.hiddenMutations);if(window.fixture.hiddenMutations===80)clearInterval(window.fixture.timer)},8)};window.stopHiddenChurn=()=>clearInterval(window.fixture.timer);
window.mountSustainedFixture=()=>{
  document.querySelector('main').innerHTML='<h1>合成データの連続確認</h1><form id="sustainedForm">'+${JSON.stringify(SUSTAINED_VALUES)}.map((value,index)=>'<label style="display:block;margin:12px 0">'+['氏名','メール','生年月日'][index]+'<input id="sustainedField'+index+'" aria-label="'+['氏名','メール','生年月日'][index]+'" value="'+value+'" style="display:block;width:400px;max-width:100%;height:40px;padding:6px;background:white;color:#172b4d;-webkit-text-fill-color:rgb(208,0,127);border:1px solid #777;font:18px Arial"></label>').join('')+'<button type="button" id="sustainedButton">連続確認</button></form>';
  const strip=document.createElement('div');strip.id='frameIdentity';strip.style.cssText='position:fixed;left:calc(50% - 90px);top:70%;display:flex;gap:8px';strip.innerHTML=Array.from({length:5},()=>'<i style="display:block;width:28px;height:28px"></i>').join('');document.body.append(strip);
  window.sustainedFormEvents={input:0,change:0,submit:0};for(const name of Object.keys(window.sustainedFormEvents))document.querySelector('#sustainedForm').addEventListener(name,()=>window.sustainedFormEvents[name]++);
  const field=document.querySelector('#sustainedField0');field.focus();field.setSelectionRange(3,7);
};
window.setSustainedFrame=(index)=>{document.querySelector('#sustainedButton').textContent=${JSON.stringify(SUSTAINED_LABELS)}[index];[...document.querySelector('#frameIdentity').children].forEach((cell,bit)=>cell.style.backgroundColor='rgb('+${JSON.stringify(FRAME_COLORS)}[((index+1)>>bit)&1].join(',')+')')};
</script></body></html>`;
}

function nativeEvaluator(cdp, sessionId) {
  let nextId = 0;
  return (expression) => new Promise((accept, reject) => {
    const id = ++nextId;
    const cleanup = () => { clearTimeout(timer); cdp.off("Target.receivedMessageFromTarget", receive); };
    const receive = (event) => {
      if (event.sessionId !== sessionId) return;
      const response = JSON.parse(event.message);
      if (response.id !== id) return;
      cleanup();
      if (response.error || response.result?.exceptionDetails) reject(new Error("Native sidepanel evaluation failed"));
      else accept(response.result?.result?.value);
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error("Native sidepanel evaluation timed out")); }, 5_000);
    cdp.on("Target.receivedMessageFromTarget", receive);
    cdp.send("Target.sendMessageToTarget", { sessionId, message: JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }) })
      .catch((error) => { cleanup(); reject(error); });
  });
}

async function treeDigest(path) {
  const hash = createHash("sha256");
  async function visit(directory, prefix = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const name = `${prefix}${entry.name}`;
      if (entry.isDirectory()) await visit(join(directory, entry.name), `${name}/`);
      else if (entry.isFile()) hash.update(name).update("\0").update(await readFile(join(directory, entry.name))).update("\0");
      else throw new Error("Extension source snapshot must contain only ordinary files and directories");
    }
  }
  await visit(path);
  return hash.digest("hex");
}

async function readLive(worker) {
  return worker.evaluate(async () => {
    const session = (await chrome.storage.session.get("activeCaptureSession")).activeCaptureSession;
    return session ? { id: session.id, phase: session.phase, tabId: session.tabId, events: session.events, refs: session.stepImageRefs || [] } : null;
  });
}

async function readStore(worker, database, store, key) {
  // Read the actual persisted store without importing into MV3's worker (dynamic
  // import is not supported there) or creating a DB when persistence is broken.
  return worker.evaluate(({ databaseName, storeName, recordKey }) => new Promise((accept, reject) => {
    const open = indexedDB.open(databaseName, 1);
    open.onupgradeneeded = () => { open.transaction.abort(); reject(new Error("Expected persisted capture database is missing")); };
    open.onerror = () => reject(new Error("Cannot open persisted capture database"));
    open.onsuccess = () => {
      const db = open.result;
      let transaction;
      try { transaction = db.transaction(storeName, "readonly"); }
      catch (error) { db.close(); reject(error); return; }
      const request = recordKey ? transaction.objectStore(storeName).get(recordKey) : transaction.objectStore(storeName).getAll();
      transaction.oncomplete = () => { db.close(); accept(request.result); };
      transaction.onabort = transaction.onerror = () => { db.close(); reject(new Error("Cannot read persisted capture records")); };
    };
  }), { databaseName: database, storeName: store, recordKey: key });
}

async function rasterEvidence(worker, image, geometry) {
  return worker.evaluate(async ({ dataUrl, viewport }) => {
    try {
      const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);
      const sample = (x, y) => {
        const pixels = ctx.getImageData(Math.round(x) - 2, Math.round(y) - 2, 5, 5).data;
        const total = [0, 0, 0];
        for (let index = 0; index < pixels.length; index += 4) for (let channel = 0; channel < 3; channel += 1) total[channel] += pixels[index + channel];
        return total.map((value) => Math.round(value / 25));
      };
      const dx = 20 * viewport.dpr, dy = 20 * viewport.dpr;
      const result = { decoded: true, width: bitmap.width, height: bitmap.height, expectedWidth: Math.round(viewport.width * viewport.dpr), expectedHeight: Math.round(viewport.height * viewport.dpr),
        corners: [sample(dx, dy), sample(bitmap.width - dx, dy), sample(dx, bitmap.height - dy), sample(bitmap.width - dx, bitmap.height - dy)],
        scene: sample(bitmap.width / 2, bitmap.height * 0.85) };
      if (viewport.frame) result.frame = viewport.frame.map((box) => sample((box.x + box.width / 2) * viewport.dpr, (box.y + box.height / 2) * viewport.dpr));
      if (viewport.fields) result.fields = viewport.fields.map((box) => {
        const x = Math.ceil((box.x + 3) * viewport.dpr), y = Math.ceil((box.y + 3) * viewport.dpr);
        const width = Math.floor((box.width - 6) * viewport.dpr), height = Math.floor((box.height - 6) * viewport.dpr);
        const pixels = ctx.getImageData(x, y, width, height).data;
        let original = 0, ink = 0, light = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          const [r, g, b] = pixels.subarray(index, index + 3);
          if (r > 130 && g < 90 && b > 75 && b < 185) original += 1;
          if (r < 90 && g < 100 && b < 140) ink += 1;
          if (r > 190 && g > 190 && b > 190) light += 1;
        }
        return { original, ink, light, total: width * height };
      });
      bitmap.close();
      return result;
    } catch { return { decoded: false }; }
  }, { dataUrl: image.dataUrl, viewport: geometry });
}

async function runVariant(name, extensionRoot, baseUrl, scratch, report) {
  const artifactDirectory = join(OUTPUT, name);
  await mkdir(artifactDirectory, { recursive: true });
  const profile = join(scratch, `profile-${name}`);
  const expected = new Map();
  const groups = {};
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: "chromium", headless: true, viewport: null,
      args: ["--window-size=1366,1000", "--enable-unsafe-extension-debugging", `--disable-extensions-except=${extensionRoot}`, `--load-extension=${extensionRoot}`]
    });
    report.browserVersion = context.browser().version();
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 15_000 });
    const extensionId = new URL(worker.url()).hostname;
    const target = await context.newPage();
    await target.goto(baseUrl);
    await target.bringToFront();
    const cdp = await context.browser().newBrowserCDPSession();
    const tab = await until(async () => (await cdp.send("Target.getTargets", { filter: [{ type: "tab", exclude: false }] })).targetInfos.find((entry) => entry.url === baseUrl), Boolean, "Synthetic tab target missing");
    await until(() => worker.evaluate(() => chrome.action.onClicked.hasListeners()), Boolean, "MV3 action listener missing");
    await cdp.send("Extensions.triggerAction", { id: extensionId, targetId: tab.targetId });
    await until(() => worker.evaluate(() => chrome.runtime.getContexts({ contextTypes: ["SIDE_PANEL"] })), (value) => value.length === 1, "Native SIDE_PANEL context missing");
    const panel = await until(async () => (await cdp.send("Target.getTargets", { filter: [{}] })).targetInfos.find((entry) => entry.type === "page" && entry.url === `chrome-extension://${extensionId}/sidepanel/sidepanel.html`), Boolean, "Native sidepanel target missing");
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: panel.targetId, flatten: false });
    const evaluatePanel = nativeEvaluator(cdp, sessionId);
    await until(() => evaluatePanel("document.readyState === 'complete' && !!document.querySelector('#start:not([hidden]):not([disabled])') && !document.querySelector('#startSection')?.hidden"), Boolean, "Native recording start control missing");
    await evaluatePanel("document.querySelector('#start').click(); true");
    const initial = await until(() => readLive(worker), (value) => value?.phase === "recording", "Recording did not start");
    await delay(500); // Let native sidepanel/window geometry settle; no emulated viewport.
    report.nativeActionGranted = await worker.evaluate(async (tabId) => {
      const [result] = await chrome.scripting.executeScript({ target: { tabId }, func: () => Boolean(globalThis.__mecchaManualRecorder) });
      return result.result;
    }, initial.tabId);
    assert.equal(report.nativeActionGranted, true, "Real extension action must grant activeTab and inject the real recorder");
    const geometry = () => target.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
    const refFor = async (id, terminal = true) => until(async () => {
      const live = await readLive(worker);
      const event = live?.events.find((candidate) => candidate.label === BUTTONS[id]);
      const ref = live?.refs.find((candidate) => candidate.eventId === event?.eventId);
      return event && ref ? { event, ref } : null;
    }, (value) => value && (!terminal || TERMINAL.has(value.ref.status)), `${name}/${id}: image state missing or unfinished`);
    const click = async (id, scene) => {
      const viewport = await geometry();
      await target.evaluate((buttonId) => document.getElementById(buttonId).click(), id);
      expected.set(id, { scene, viewport });
    };
    const settledClick = async (id, scene) => { await click(id, scene); return refFor(id); };
    const reset = async () => {
      await delay(750);
      await target.evaluate(() => window.setFixtureScene("original"));
    };
    const queuedOrTerminal = async (id) => until(async () => {
      const value = await refFor(id, false);
      const [lease] = await worker.evaluate(async (tabId) => chrome.scripting.executeScript({ target: { tabId }, func: () => Boolean(globalThis.__mecchaManualScreenshotScene) }), initial.tabId);
      return { ...value, leaseActive: lease.result === true };
    }, (value) => TERMINAL.has(value.ref.status) || (value.ref.status === "queued" && value.leaseActive), `${id}: queued scene lease or terminal baseline result missing`);
    const pairSummary = (first, second) => ({ clickIntervalMs: second.event.at - first.event.at, ids: [first.event.eventId, second.event.eventId] });
    // A real paced control prevents an unavailable capture API from masquerading
    // as a successful no-stale-image safety result in either revision.
    const controlFirst = await settledClick("controlFirst", "original");
    await delay(750);
    await target.evaluate(() => window.setFixtureScene("changed"));
    const controlSecond = await settledClick("controlSecond", "changed");
    groups.paced = pairSummary(controlFirst, controlSecond);

    await reset();
    const rapidFirst = await settledClick("rapidFirst", "original");
    const rapidSecond = await settledClick("rapidSecond", "original");
    groups.rapid = pairSummary(rapidFirst, rapidSecond);

    await reset();
    const hiddenFirst = await settledClick("hiddenFirst", "original");
    await target.evaluate(() => window.startHiddenChurn());
    await click("hiddenSecond", "original");
    const hiddenBarrier = await queuedOrTerminal("hiddenSecond");
    const hiddenSecond = await refFor("hiddenSecond");
    // Both runs perform exactly the same bounded hidden workload, even when the
    // baseline drops its image immediately instead of waiting for a capture slot.
    const hiddenMutations = await until(() => target.evaluate(() => window.fixture.hiddenMutations), (value) => value === 80, "Hidden churn fixture did not complete its 80 invisible text mutations");
    groups.hiddenChurn = { ...pairSummary(hiddenFirst, hiddenSecond), hiddenMutations, barrier: { status: hiddenBarrier.ref.status, leaseActive: hiddenBarrier.leaseActive } };

    await reset();
    const visibleFirst = await settledClick("visibleFirst", "original");
    await click("visibleSecond", "original");
    const visibleBarrier = await queuedOrTerminal("visibleSecond");
    await target.evaluate(() => window.setFixtureScene("changed"));
    const visibleSecond = await refFor("visibleSecond");
    await delay(750);
    await settledClick("visibleAfter", "changed");
    groups.visibleChanged = { ...pairSummary(visibleFirst, visibleSecond), staleId: visibleSecond.event.eventId, barrier: { status: visibleBarrier.ref.status, leaseActive: visibleBarrier.leaseActive } };

    await reset();
    const navigationFirst = await settledClick("navigationFirst", "original");
    await click("navigationSecond", "original");
    const navigationBarrier = await queuedOrTerminal("navigationSecond");
    await target.goto(`${baseUrl}next`);
    await until(() => worker.evaluate(async (tabId) => {
      const [result] = await chrome.scripting.executeScript({ target: { tabId }, func: () => Boolean(globalThis.__mecchaManualRecorder) });
      return result.result;
    }, initial.tabId), Boolean, "Navigation must reinject the native recorder");
    const navigationSecond = await refFor("navigationSecond");
    await until(() => readLive(worker), (value) => value?.events.some((event) => event.kind === "navigation") && value.refs.every((ref) => TERMINAL.has(ref.status)), "Navigation image processing did not settle");
    await delay(750);
    await settledClick("navigationAfter", "next");
    groups.navigationChanged = { ...pairSummary(navigationFirst, navigationSecond), staleId: navigationSecond.event.eventId, barrier: { status: navigationBarrier.ref.status, leaseActive: navigationBarrier.leaseActive } };

    // This is a separate current-only acceptance workload. It does not enter
    // the baseline pair denominators or claim a 20-operation baseline gain.
    if (name === "current") {
      const sustained = report.sustained = { attempted: 0, saved: 0, terminal: 0, useful: 0, cadenceMs: SUSTAINED_INTERVAL_MS,
        eventIds: [], screenshotIds: [], documentIds: [], intervalsMs: [], formUnchanged: true, recordingUninterrupted: true,
        source: "20 paced synthetic button operations in one native document; existing comparison separately covers navigation and invalidation" };
      await target.evaluate(() => window.mountSustainedFixture());
      const formState = () => target.evaluate(() => ({
        fields: Array.from(document.querySelectorAll('#sustainedForm input'), (field) => ({ value: field.value, selectionStart: field.selectionStart, selectionEnd: field.selectionEnd })),
        focus: document.activeElement?.id, events: window.sustainedFormEvents
      }));
      const beforeForm = await formState();
      assert.equal(beforeForm.fields.every((field, index) => field.value === SUSTAINED_VALUES[index]), true, "The full synthetic source form must exist before the workload");
      assert.deepEqual(beforeForm.events, { input: 0, change: 0, submit: 0 });
      const documentId = async () => (await worker.evaluate(async (tabId) => chrome.scripting.executeScript({ target: { tabId }, func: () => true }), initial.tabId))[0].documentId;
      const originalDocumentId = await documentId();
      const sustainedGeometry = () => target.evaluate(() => {
        const boxes = (selector) => Array.from(document.querySelectorAll(selector), (element) => {
          const { x, y, width, height } = element.getBoundingClientRect(); return { x, y, width, height };
        });
        return { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, fields: boxes('#sustainedForm input'), frame: boxes('#frameIdentity i') };
      });
      const beforeRaster = await rasterEvidence(worker, { dataUrl: `data:image/png;base64,${(await target.screenshot()).toString("base64")}` }, await sustainedGeometry());
      assert.ok(beforeRaster.fields.every((field) => field.original > 15), "Unmasked control must prove all synthetic PII canaries are visible before native capture");
      sustained.unmaskedControlVerified = true; // Never persist the unmasked control bytes.
      let previousAt;
      for (let index = 0; index < SUSTAINED_COUNT; index += 1) {
        // Wait after the preceding terminal result, not just after its click.
        // No native API, clock, masking code, or recording state is patched.
        await delay(SUSTAINED_INTERVAL_MS);
        await target.evaluate(async (frame) => { window.setSustainedFrame(frame); await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))); }, index);
        const viewport = await sustainedGeometry();
        const nativeDocumentId = await documentId();
        assert.equal(nativeDocumentId, originalDocumentId, "Sustained fixture must not silently switch native documents");
        await target.evaluate(() => document.querySelector('#sustainedButton').click());
        sustained.attempted += 1;
        const captured = await until(async () => {
          const session = await readLive(worker);
          const event = session?.events.find((entry) => entry.label === SUSTAINED_LABELS[index]);
          const ref = session?.refs.find((entry) => entry.eventId === event?.eventId);
          return { sessionId: session?.id, phase: session?.phase, event, ref };
        }, (value) => value.event && TERMINAL.has(value.ref?.status), `Sustained operation ${index + 1} did not reach a terminal image state`);
        sustained.terminal += 1;
        sustained.eventIds.push(captured.event.eventId);
        sustained.documentIds.push(nativeDocumentId);
        if (previousAt !== undefined) sustained.intervalsMs.push(captured.event.at - previousAt);
        previousAt = captured.event.at;
        sustained.recordingUninterrupted &&= captured.sessionId === initial.id && captured.phase === "recording";
        const unchanged = JSON.stringify(await formState()) === JSON.stringify(beforeForm);
        sustained.formUnchanged &&= unchanged;
        assert.equal(unchanged, true, "Native privacy capture must not alter the source form or emit form events");
        expected.set(`sustained-${index + 1}`, { scene: "next", viewport, frame: index + 1, documentId: nativeDocumentId });
      }
    }

    const live = await readLive(worker);
    const images = (await readStore(worker, "meccha-manual-capture-live", "step-images")).filter((entry) => entry.sessionId === initial.id);
    const saved = images.filter((entry) => typeof entry.dataUrl === "string" && entry.dataUrl.startsWith("data:image/"));
    assert.equal(new Set(saved.map((entry) => entry.id)).size, saved.length, "Each stored capture must have its own screenshot identity");
    assert.equal(new Set(saved.map((entry) => entry.eventId)).size, saved.length, "A saved image must belong to one exact recorded event");
    const imageByEvent = new Map(saved.map((entry) => [entry.eventId, entry]));
    const stateByEvent = new Map(live.refs.map((entry) => [entry.eventId, entry]));
    report.invalidRasterCount = 0;
    report.events = [];
    const errors = [];
    for (const [index, event] of live.events.entries()) {
      const sustainedIndex = SUSTAINED_LABELS.indexOf(event.label);
      const id = sustainedIndex >= 0 ? `sustained-${sustainedIndex + 1}` : Object.keys(BUTTONS).find((key) => BUTTONS[key] === event.label);
      const expectation = id ? expected.get(id) : event.kind === "navigation" ? { scene: "next", viewport: await geometry() } : null;
      assert.ok(expectation, "Every recorded fixture operation must have a known expected scene");
      const image = imageByEvent.get(event.eventId);
      const evidence = { order: index + 1, eventId: event.eventId, fixtureAction: id || "navigation", kind: event.kind, status: stateByEvent.get(event.eventId)?.status, reason: stateByEvent.get(event.eventId)?.reason || null, hasImage: Boolean(image), expectedScene: expectation.scene,
        ...(sustainedIndex >= 0 ? { expectedFrame: expectation.frame, nativeDocumentId: expectation.documentId } : {}) };
      assert.ok(TERMINAL.has(evidence.status), "Every persisted operation must have an explicit terminal image state");
      if (evidence.status === "ready") assert.ok(image, "Ready status alone is not a saved screenshot");
      if (image) {
        assert.ok(["ready", "protected"].includes(evidence.status), "Unavailable and failed events must not carry image bytes");
        evidence.raster = await rasterEvidence(worker, image, expectation.viewport);
        try {
          assertRaster(evidence.raster, expectation.scene);
          if (sustainedIndex >= 0) {
            assertUsefulSustainedRaster(evidence.raster, expectation.frame);
            const replacements = image.privacyReview?.replacements || [];
            for (const kind of ["name", "email", "birthday"]) assert.ok(replacements.some((item) => item.kind === kind && item.text), `Sustained image must retain a useful fictional ${kind} replacement`);
            report.sustained.useful += 1;
          }
        }
        catch (error) { report.invalidRasterCount += 1; errors.push(error.message); }
        if (sustainedIndex >= 0) { report.sustained.saved += 1; report.sustained.screenshotIds.push(image.id); evidence.screenshotId = image.id; }
        const match = image.dataUrl.match(/^data:image\/(jpeg|png);base64,(.+)$/s);
        assert.ok(match, "Native capture must return actual PNG/JPEG image bytes");
        const bytes = Buffer.from(match[2], "base64");
        evidence.imageSha256 = createHash("sha256").update(bytes).digest("hex");
        evidence.artifact = `${name}/step-${String(index + 1).padStart(2, "0")}.${match[1] === "jpeg" ? "jpg" : "png"}`;
        await writeFile(join(OUTPUT, evidence.artifact), bytes);
      }
      report.events.push(evidence);
    }
    for (const [key, group] of Object.entries(groups)) {
      report[key] = { ...group, saved: group.ids.filter((id) => imageByEvent.has(id)).length,
        ...(group.staleId ? { staleSaved: Number(imageByEvent.has(group.staleId)) } : {}) };
    }
    // Record the full comparison evidence before assertions, including failures.
    report.errors = errors;
    await evaluatePanel("document.querySelector('#finish').click(); true");
    const editor = await until(() => context.pages().find((page) => page.url().startsWith(`chrome-extension://${extensionId}/editor/editor.html#`)), Boolean, "Finish must open the persisted draft editor");
    await editor.waitForSelector("#title");
    const draft = await readStore(worker, "meccha-manual-guest", "drafts", initial.id);
    assert.equal(draft.steps.length, live.events.length, "Finish must preserve every actual captured event");
    assert.equal(draft.screenshots.length, saved.length, "Finish must not manufacture or lose stored images");
    for (const event of live.events) {
      const step = draft.steps.find((candidate) => candidate.eventId === event.eventId);
      const image = imageByEvent.get(event.eventId);
      assert.ok(step, "Recorded event must survive finish");
      assert.equal(Boolean(step.screenshotId), Boolean(image), "Draft image association must match the original operation");
      if (image) {
        assert.equal(step.screenshotId, image.id, "Finish must preserve this event's exact screenshot identity");
        assert.equal(draft.screenshots.find((entry) => entry.id === step.screenshotId)?.dataUrl, image.dataUrl, "Final draft must keep the exact verified capture, not the last screen");
      }
    }
    if (report.sustained) {
      const exported = JSON.stringify({ draft, live, local: await worker.evaluate(() => chrome.storage.local.get(null)) });
      for (const value of SUSTAINED_VALUES) assert.equal(exported.includes(value), false, "Draft, live events, and local storage must not retain original synthetic form values");
      report.sustained.originalValuesExcluded = true;
      assertSustained(report.sustained);
    }
    report.draftVerified = true;
    await editor.screenshot({ path: join(artifactDirectory, "saved-editor.png"), fullPage: true });
    for (const key of ["hiddenChurn", "visibleChanged", "navigationChanged"]) {
      assert.ok(report[key].clickIntervalMs < 500, `${name}/${key}: must exercise the capture quota interval`);
      if (name === "current") {
        assert.equal(report[key].barrier.status, "queued", `${key}: fixture must exercise the real queued-capture window`);
        assert.equal(report[key].barrier.leaseActive, true, `${key}: scene protection must be active before fixture changes`);
      }
    }
    for (const id of ["controlFirst", "controlSecond", "rapidFirst", "hiddenFirst", "visibleFirst", "visibleAfter", "navigationFirst", "navigationAfter"]) {
      assert.ok(report.events.find((event) => event.fixtureAction === id)?.hasImage, `${name}/${id}: subsequent valid screen must remain capturable`);
    }
    assert.equal(errors.length, 0, errors.join("\n"));
    report.status = "completed";
  } catch (error) {
    report.status = "failed";
    report.error = error.message;
    throw error;
  } finally {
    await writeFile(join(artifactDirectory, "result.json"), `${JSON.stringify(report, null, 2)}\n`);
    await context?.close();
  }
}

test("capture completion fixture unit: corrupt, cropped, stale pixels and reason-only improvement fail", () => {
  for (const next of [false, true]) {
    const html = fixtureHtml(next);
    assert.equal((html.match(/<button id=/g) || []).length, Object.keys(BUTTONS).length);
    assert.doesNotThrow(() => new Script(html.match(/<script>([\s\S]*)<\/script>/)[1]));
  }
  const raster = { decoded: true, width: 960, height: 720, expectedWidth: 960, expectedHeight: 720, corners: MARKERS, scene: SCENES.original };
  assert.doesNotThrow(() => assertRaster(raster, "original"));
  assert.throws(() => assertRaster({ ...raster, decoded: false }, "original"));
  assert.throws(() => assertRaster({ ...raster, width: 600 }, "original"));
  assert.throws(() => assertRaster({ ...raster, corners: MARKERS.map(() => [0, 0, 0]) }, "original"));
  assert.throws(() => assertRaster({ ...raster, scene: SCENES.next }, "original"));
  const baseline = { paced: { saved: 2 }, rapid: { saved: 1, clickIntervalMs: 100 }, hiddenChurn: { saved: 1, clickIntervalMs: 100 }, visibleChanged: { staleSaved: 0 }, navigationChanged: { staleSaved: 0 }, invalidRasterCount: 0, draftVerified: true };
  const current = { ...baseline, rapid: { saved: 2, clickIntervalMs: 100 }, hiddenChurn: { saved: 2, clickIntervalMs: 100 } };
  assert.doesNotThrow(() => assertComparison(baseline, current));
  assert.throws(() => assertComparison(baseline, { ...baseline, reason: "screen_changed" }));
  assert.throws(() => assertComparison(baseline, { ...current, visibleChanged: { staleSaved: 1 } }));
  assert.throws(() => assertComparison(baseline, { ...current, navigationChanged: { staleSaved: 1 } }));
  assert.throws(() => assertComparison(baseline, { ...current, rapid: { saved: 2, clickIntervalMs: 600 } }));
  assert.throws(() => assertComparison(baseline, { ...current, draftVerified: false }));
});

test("capture completion fixture unit: sustained acceptance rejects missing, blank, leaked, swapped, or interrupted results", () => {
  const report = { attempted: 20, saved: 20, terminal: 20, useful: 20, formUnchanged: true, recordingUninterrupted: true,
    eventIds: Array.from({ length: 20 }, (_, index) => `event-${index}`), screenshotIds: Array.from({ length: 20 }, (_, index) => `image-${index}`),
    documentIds: Array(20).fill("native-document"), intervalsMs: Array(19).fill(750) };
  assert.doesNotThrow(() => assertSustained(report));
  for (const field of ["attempted", "saved", "terminal", "useful"]) assert.throws(() => assertSustained({ ...report, [field]: 19 }));
  for (const field of ["formUnchanged", "recordingUninterrupted"]) assert.throws(() => assertSustained({ ...report, [field]: false }));
  assert.throws(() => assertSustained({ ...report, eventIds: Array(20).fill("same-event") }));
  assert.throws(() => assertSustained({ ...report, screenshotIds: Array(20).fill("same-image") }));
  assert.throws(() => assertSustained({ ...report, documentIds: [...report.documentIds.slice(1), "later-document"] }));
  assert.throws(() => assertSustained({ ...report, documentIds: Array(20).fill(undefined) }));
  assert.throws(() => assertSustained({ ...report, intervalsMs: Array(19).fill(499) }));
  const raster = { decoded: true, width: 960, height: 720, expectedWidth: 960, expectedHeight: 720, corners: MARKERS, scene: SCENES.next,
    frame: Array.from({ length: 5 }, (_, bit) => FRAME_COLORS[(1 >> bit) & 1]), fields: Array.from({ length: 3 }, () => ({ original: 0, ink: 30, light: 900, total: 1000 })) };
  assert.doesNotThrow(() => assertUsefulSustainedRaster(raster, 1));
  for (let frame = 2; frame <= SUSTAINED_COUNT; frame += 1) assert.throws(() => assertUsefulSustainedRaster(raster, frame), "Every other event's marker must fail association");
  assert.throws(() => assertUsefulSustainedRaster({ ...raster, fields: raster.fields.map((field) => ({ ...field, original: 1 })) }, 1));
  assert.throws(() => assertUsefulSustainedRaster({ ...raster, fields: raster.fields.map((field) => ({ ...field, ink: 0 })) }, 1));
  assert.throws(() => assertUsefulSustainedRaster({ ...raster, fields: raster.fields.map((field) => ({ ...field, light: 0 })) }, 1));
});

test("real MV3 capture completion improves over baseline without wrong-frame recovery", { timeout: 180_000 }, async () => {
  await mkdir(OUTPUT, { recursive: true });
  const scratch = await mkdtemp(join(tmpdir(), "meccha-capture-comparison-"));
  const report = { schema: "meccha-native-capture-completion/v1", startedAt: new Date().toISOString(), baselineRevision: BASELINE_REVISION,
    currentHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(), source: "synthetic-local-fixture-only", status: "running", variants: {} };
  const server = createServer((request, response) => { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(fixtureHtml(request.url === "/next")); });
  try {
    const baselineRoot = join(scratch, "baseline");
    await mkdir(baselineRoot);
    const archive = execFileSync("git", ["archive", "--format=tar", BASELINE_REVISION, "apps/extension"], { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 });
    execFileSync("tar", ["-xf", "-", "-C", baselineRoot], { input: archive });
    const baselineExtension = join(baselineRoot, "apps/extension");
    const currentExtension = join(scratch, "current-extension");
    await cp(join(ROOT, "apps/extension"), currentExtension, { recursive: true });
    await new Promise((accept, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", accept); });
    const baseUrl = `http://127.0.0.1:${server.address().port}/`;
    const errors = [];
    for (const [name, path] of [["baseline", baselineExtension], ["current", currentExtension]]) {
      const variant = { sourceSha256: await treeDigest(path), status: "starting" };
      report.variants[name] = variant;
      try { await runVariant(name, path, baseUrl, scratch, variant); }
      catch (error) { errors.push(new Error(`${name}: ${error.message}`)); }
      await writeFile(join(OUTPUT, "comparison.json"), `${JSON.stringify(report, null, 2)}\n`);
    }
    if (errors.length) throw new AggregateError(errors, errors.map((error) => error.message).join("\n"));
    assertComparison(report.variants.baseline, report.variants.current);
    report.completenessGain = Object.fromEntries(["rapid", "hiddenChurn"].map((key) => [key, report.variants.current[key].saved - report.variants.baseline[key].saved]));
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.error = error.message;
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    await writeFile(join(OUTPUT, "comparison.json"), `${JSON.stringify(report, null, 2)}\n`);
    if (server.listening) await new Promise((done) => server.close(done));
    await rm(scratch, { recursive: true, force: true });
  }
});
