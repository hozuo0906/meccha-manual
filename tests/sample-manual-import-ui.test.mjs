import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { CLOUD_MANUAL_JS } from "../apps/worker/src/cloud-manual-assets.ts";

function importController({ canWrite = true, request = async () => ({ status: "seeded", manualId: "synthetic-manual" }), loaded = true } = {}) {
  const source = CLOUD_MANUAL_JS.slice(CLOUD_MANUAL_JS.indexOf("  async function importSample()"), CLOUD_MANUAL_JS.indexOf("  function imageUrlFor(step)"));
  const messages = [], requests = [], loads = [], states = [];
  const controller = runInNewContext(`
    let sampleImportState = "idle", dirty = false, saveInFlight = false, activeCloudImageEditor = null,
      cloudImageBusy = false, shareBusy = false, requestSerial = 1, editVersion = 0;
    const pendingImageJobs = new Map();
    ${source}
    ({ importSample, setDirty(value) { dirty = value; }, navigate() { requestSerial++; }, state() { return sampleImportState; } });`, {
    mode: Object.freeze({ canWrite }),
    workspacePath: () => "/api/workspaces/synthetic-workspace",
    setMessage: (text, kind) => messages.push({ text, kind }),
    syncSampleImportButtons: () => states.push("synced"),
    json: async (path, init) => { requests.push({ path, init }); return request(); },
    loadManuals: async (id, options) => { loads.push({ id, options }); return loaded; }
  });
  return { controller, messages, requests, loads, states };
}

test("sample mode direct import and unsaved cloud edits are refused before any request", async () => {
  const sample = importController({ canWrite: false });
  await sample.controller.importSample();
  assert.equal(sample.requests.length, 0);
  const cloud = importController();
  cloud.controller.setDirty(true);
  await cloud.controller.importSample();
  assert.equal(cloud.requests.length, 0);
  assert.match(cloud.messages.at(-1).text, /編集中の変更/);
});

test("explicit cloud import sends one bodyless POST, disables duplicates and opens the returned manual", async () => {
  const pending = Promise.withResolvers();
  const view = importController({ request: () => pending.promise });
  const first = view.controller.importSample();
  assert.equal(view.controller.state(), "importing");
  await view.controller.importSample();
  assert.equal(view.requests.length, 1);
  assert.equal(view.requests[0].path, "/api/workspaces/synthetic-workspace/sample-manual");
  assert.equal(view.requests[0].init.method, "POST");
  assert.equal(Object.hasOwn(view.requests[0].init, "body"), false);
  pending.resolve({ status: "seeded", manualId: "synthetic-manual" });
  await first;
  assert.equal(view.loads[0].id, "synthetic-manual");
  assert.equal(view.controller.state(), "idle");
  assert.equal(view.states.length, 2);
  assert.match(view.messages.at(-1).text, /ワークスペースに入れました/);
});

test("edits or navigation during import retain the current detail while refreshing the list", async () => {
  for (const duringWait of [view => view.controller.setDirty(true), view => view.controller.navigate()]) {
    const pending = Promise.withResolvers();
    const view = importController({ request: () => pending.promise });
    const first = view.controller.importSample();
    duringWait(view);
    pending.resolve({ status: "alreadySeeded", manualId: "synthetic-manual" });
    await first;
    assert.equal(view.loads[0].id, "");
    assert.equal(view.loads[0].options.preserveDetail, true);
    assert.match(view.messages.at(-1).text, /既に入っています.*編集中の内容を保持/);
  }
});

test("unknown and authorization failures release controls for retry; reload failure does not claim success", async () => {
  for (const status of [undefined, 401, 403, 503]) {
    const view = importController({ request: async () => { const error = new Error("synthetic"); error.status = status; throw error; } });
    await view.controller.importSample();
    assert.equal(view.controller.state(), "idle");
    assert.equal(view.loads.length, 0);
    assert.equal(view.messages.at(-1).kind, "error");
    assert.match(view.messages.at(-1).text, status === 401 || status === 403 ? /保存先の権限/ : /再試行/);
    await view.controller.importSample();
    assert.equal(view.requests.length, 2);
  }
  const failedReload = importController({ loaded: false });
  await failedReload.controller.importSample();
  assert.equal(failedReload.messages.some(message => message.kind === "success"), false);
});
