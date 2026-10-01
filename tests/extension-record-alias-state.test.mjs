import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import test from "node:test";
import vm from "node:vm";

const workerSource = (await readFile(new URL("../apps/extension/background/service-worker.js", import.meta.url), "utf8")).replace(/^import .*;\r?$/gm, "");
const screenshotSource = await readFile(new URL("../apps/extension/capture/screenshot.js", import.meta.url), "utf8");
const STATE_KEY = "capturePrivacyAliases";
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function workerHarness(values = new Map()) {
  const writes = [];
  const removals = [];
  const localWrites = [];
  let appliedResult;
  let installResult;
  let rejectWrite = false;
  const storage = (map, log) => ({
    async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter((key) => map.has(key)).map((key) => [key, clone(map.get(key))])); },
    async set(next) { if (rejectWrite) throw new Error("synthetic session write failure"); log.push(clone(next)); for (const [key, value] of Object.entries(next)) map.set(key, clone(value)); },
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) { removals.push(key); map.delete(key); } }
  });
  const events = { addListener() {} };
  const context = {
    crypto: webcrypto, Uint8Array, Promise, Date, Map, Set, URL, setTimeout, clearTimeout,
    importedCaptureLiveStore: {},
    chrome: {
      storage: { session: storage(values, writes), local: storage(new Map(), localWrites) },
      runtime: { onMessage: events }, tabs: { onUpdated: events, onRemoved: events },
      scripting: { async executeScript(options) {
        if (options.func.name === "installSensitiveMasks") {
          assert.equal(options.world, "ISOLATED");
          const state = options.args[0].privateAliasState;
          return [{ result: installResult || { applied: true, count: 0, privacyMaskedCount: 1, token: "lease", privacyReview: { replacements: [{ id: `${state.namespace}:name:000001`, kind: "name", text: "山田 花子1" }] },
            privateAliasAllocations: { namespace: state.namespace, allocations: [["a".repeat(64), 1]], next: 1 } } }];
        }
        return [{ result: true }];
      } }
    },
    installSensitiveMasks: function installSensitiveMasks() {}, removeSensitiveMasks: function removeSensitiveMasks() {}, verifySensitiveMasks() {},
    async captureWithMaskBoundary(options) { appliedResult = await options.applyMasks(); return { dataUrl: "data:image/png;base64,AA", privacyReview: appliedResult.privacyReview }; }
  };
  vm.runInNewContext(workerSource + "\nglobalThis.aliasTest = { readCapturePrivacyAliases, persistCapturePrivacyAliases, clearCapturePrivacy, setSession, takeMaskedScreenshot };", context);
  return { ...context.aliasTest, values, writes, removals, localWrites, applied: () => clone(appliedResult), installResult: (value) => { installResult = value; }, rejectWrite: () => { rejectWrite = true; } };
}

const session = { id: "synthetic-record-a", tabId: 1 };

test("record alias secret and allocations survive service-worker recreation without entering durable storage", async () => {
  const first = workerHarness();
  const state = await first.readCapturePrivacyAliases(session);
  assert.match(state.secret, /^[a-f0-9]{64}$/);
  assert.match(state.namespace, /^[a-f0-9-]{36}$/);
  await first.persistCapturePrivacyAliases(state, { privateAliasAllocations: { namespace: state.namespace, allocations: [["a".repeat(64), 1]], next: 1 } });
  const second = workerHarness(first.values);
  assert.deepEqual(clone(await second.readCapturePrivacyAliases(session)), { ...clone(state), allocations: [["a".repeat(64), 1]], next: 1 });
  assert.deepEqual(first.localWrites, []);
  assert.deepEqual(second.localWrites, []);
  assert.deepEqual([...first.values.keys()], [STATE_KEY]);
});

test("end, cancel and a new record discard the correlation namespace and secret", async () => {
  const worker = workerHarness();
  const before = await worker.readCapturePrivacyAliases(session);
  await worker.clearCapturePrivacy(session);
  assert.equal(worker.values.has(STATE_KEY), false);
  const after = await worker.readCapturePrivacyAliases({ id: "synthetic-record-b", tabId: 1 });
  assert.notEqual(before.secret, after.secret);
  assert.notEqual(before.namespace, after.namespace);
  await worker.setSession(null);
  assert.equal(worker.values.has(STATE_KEY), false);
  assert.ok(worker.removals.includes(STATE_KEY));
});

test("allocation updates reject collisions, rewrites, mismatched namespaces and excess capacity", async () => {
  const worker = workerHarness();
  let state = await worker.readCapturePrivacyAliases(session);
  const allocations = [["a".repeat(64), 1]];
  await worker.persistCapturePrivacyAliases(state, { privateAliasAllocations: { namespace: state.namespace, next: 1, allocations } });
  state = await worker.readCapturePrivacyAliases(session);
  for (const invalid of [
    { namespace: "unrelated", next: 1, allocations },
    { namespace: state.namespace, next: 1, allocations: [["b".repeat(64), 1]] },
    { namespace: state.namespace, next: 2, allocations: [...allocations, ["a".repeat(64), 2]] },
    { namespace: state.namespace, next: 2, allocations: [...allocations, ["b".repeat(64), 1]] },
    { namespace: state.namespace, next: 513, allocations: Array.from({ length: 513 }, (_, index) => [index.toString(16).padStart(64, "0"), index + 1]) }
  ]) await assert.rejects(worker.persistCapturePrivacyAliases(state, { privateAliasAllocations: invalid }), /SCREENSHOT_MASK_FAILED/);
  await assert.rejects(worker.readCapturePrivacyAliases({ id: "other" }), /SCREENSHOT_MASK_FAILED/);
  assert.deepEqual(worker.values.get(STATE_KEY), clone(state));
});

test("capture returns only public metadata after private allocations are durably held in session memory", async () => {
  const worker = workerHarness();
  const image = await worker.takeMaskedScreenshot(session);
  assert.ok(image.dataUrl.startsWith("data:image/"));
  const exported = JSON.stringify({ image, mask: worker.applied() });
  assert.doesNotMatch(exported, /privateAlias|allocations|secret|aaaaaaaaaaaaaaaa/);
  assert.equal(worker.values.get(STATE_KEY).allocations.length, 1);
  assert.deepEqual(worker.localWrites, []);
  worker.rejectWrite();
  await assert.rejects(worker.takeMaskedScreenshot(session), /SCREENSHOT_MASK_FAILED/);
});

test("source contract uses isolated keyed HMAC and does not export source-value fingerprints", () => {
  assert.match(screenshotSource, /crypto\.subtle\.importKey\("raw"[\s\S]*?name: "HMAC", hash: "SHA-256"/);
  assert.match(screenshotSource, /crypto\.subtle\.sign\("HMAC", key, new TextEncoder\(\)\.encode\(JSON\.stringify\(\[candidate\.kind, value\]\)\)\)/);
  assert.doesNotMatch(screenshotSource, /record\.targets|record\.salt/);
  assert.match(screenshotSource, /value\.length > 4096/);
  assert.match(screenshotSource, /record\.allocations\.size >= 512/);
  assert.doesNotMatch(workerSource, /setAccessLevel/);
});


test("navigation and scene failures retain their reason after asynchronous alias preparation", async () => {
  for (const reason of ["SCREENSHOT_NAVIGATION_CHANGED", "SCREENSHOT_SCENE_CHANGED"]) {
    const worker = workerHarness();
    let checks = 0;
    await assert.rejects(worker.takeMaskedScreenshot(session, () => { if (++checks === 2) throw new Error(reason); }), { message: reason });
    assert.equal(worker.values.get(STATE_KEY).next, 0, "invalidated capture must not publish its allocation update");
    assert.equal(worker.applied(), undefined);
  }
});

test('async HMAC preparation tolerates only initially and currently hidden content churn', async()=>{
 const source=screenshotSource.slice(screenshotSource.indexOf('    const prepareAliases = async'),screenshotSource.indexOf('    const replacementFor ='));
 async function run(kind){
  const hidden={tagName:'DIV',nodeType:1,isConnected:true,display:'none',closest:()=>null,matches:()=>false,querySelector:()=>null,contains(node){return node===child;}};
  const child={nodeType:3,parentElement:hidden};const visible={tagName:'DIV',nodeType:1,isConnected:true,display:'block',textContent:'Synthetic value',closest:()=>null,matches:()=>false,querySelector:()=>null,contains:()=>false};
  const root={querySelectorAll:()=>[hidden,visible]};let callback;const candidate={target:visible,kind:'name'};const ctx={TextEncoder,Uint8Array,Map,Error,Number,Array,String,JSON,getComputedStyle:e=>({display:e.display}),candidateValue:c=>c.target.textContent,isConnected:e=>e.isConnected,isOwnedPrivacyOverlayNode:()=>false,collectPrivacyRootSnapshot:()=>[root],observers:[],record:{secret:'a'.repeat(64),allocations:new Map(),next:0},addEventListener(){},removeEventListener(){},MutationObserver:class{constructor(fn){callback=fn;}observe(){}takeRecords(){return [];}disconnect(){}},crypto:{subtle:{async importKey(){if(kind==='reveal')hidden.display='block';const style={nodeType:1,closest:()=>null,matches:()=>true};callback([{type:kind==='attribute'?'attributes':'characterData',target:kind==='visible'?visible:child,addedNodes:kind==='style'?[style]:[],removedNodes:[]}]);return {};},async sign(){return new Uint8Array(32).buffer;}}}};
  vm.runInNewContext(source+';globalThis.prepare=prepareAliases',ctx);await ctx.prepare([candidate]);return candidate.aliasOrdinal;
 }
 assert.equal(await run('hidden'),1);
 for(const kind of ['reveal','attribute','visible','style'])await assert.rejects(run(kind),/SCREENSHOT_MASK_INVALIDATED/,kind);
});
