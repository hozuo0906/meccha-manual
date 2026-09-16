import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../apps/extension/content/recorder.js", import.meta.url), "utf8");

function recorder(sendMessage) {
  const listeners = new Map();
  class Element {
    constructor() { this.tagName = "INPUT"; this.scrollTop = 0; this.scrollLeft = 0; }
    getAttribute() { return null; }
  }
  const context = {
    Element, crypto, Date, Promise, Map, WeakMap, Set,
    document: { documentElement: new Element(), querySelector: () => null },
    chrome: { runtime: { sendMessage } },
    scrollX: 0, scrollY: 0,
    setTimeout: () => 1, clearTimeout() {},
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type)
  };
  vm.runInNewContext(source, context);
  return { input: () => new Element(), emit: (type, target) => listeners.get(type)({ target }), stop: () => context.__mecchaManualRecorder() };
}

for (const acknowledgement of ["delayed", "rejected"]) {
  test(`field switch retains every unacknowledged edit (${acknowledgement})`, async () => {
    const capture = recorder(() => acknowledgement === "delayed" ? new Promise(() => {}) : Promise.reject(new Error("offline")));
    const a = capture.input();
    const b = capture.input();
    capture.emit("input", a);
    capture.emit("input", a);
    capture.emit("input", b);
    await new Promise((resolve) => setImmediate(resolve));
    const drained = capture.stop();
    assert.equal(drained.length, 2);
    assert.ok(drained.every((event) => event.kind === "input"));
    assert.equal(new Set(drained.map((event) => event.eventId)).size, 2);
  });
}

test("acknowledging an earlier edit does not clear a later edit of the same field", async () => {
  let ack;
  const capture = recorder(() => new Promise((resolve) => { ack = resolve; }));
  const a = capture.input();
  capture.emit("input", a);
  capture.emit("change", a);
  await new Promise((resolve) => setImmediate(resolve));
  capture.emit("input", a);
  ack({ ok: true, value: { accepted: true } });
  await new Promise((resolve) => setImmediate(resolve));
  const drained = capture.stop();
  assert.equal(drained.length, 1);
  assert.match(drained[0].eventId, /:2$/);
});

test("switching scroll containers retains both operations before debounce or acknowledgement", () => {
  const capture = recorder(() => new Promise(() => {}));
  const a = capture.input();
  const b = capture.input();
  a.scrollTop = 100;
  capture.emit("scroll", a);
  b.scrollTop = 120;
  capture.emit("scroll", b);
  const drained = capture.stop();
  assert.equal(drained.length, 2);
  assert.ok(drained.every((event) => event.kind === "scroll" && event.direction === "down"));
  assert.equal(new Set(drained.map((event) => event.eventId)).size, 2);
});
