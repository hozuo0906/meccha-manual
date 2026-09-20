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
  const initialScrollContainer = new Element();
  initialScrollContainer.scrollTop = 1000;
  const secondScrollContainer = new Element();
  secondScrollContainer.scrollTop = 500;
  const context = {
    Element, crypto, Date, Promise, Map, WeakMap, Set,
    document: { documentElement: new Element(), querySelector: () => null, querySelectorAll: () => [initialScrollContainer, secondScrollContainer] },
    chrome: { runtime: { sendMessage } },
    scrollX: 0, scrollY: 0,
    setTimeout: () => 1, clearTimeout() {},
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type)
  };
  vm.runInNewContext(source, context);
  return { input: () => new Element(), existing: () => initialScrollContainer, existingAll: () => [initialScrollContainer, secondScrollContainer], emit: (type, target) => listeners.get(type)({ target }), emitEvent: (type, event) => listeners.get(type)(event), stop: () => context.__mecchaManualRecorder() };
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
  const earlierAck = ack;
  capture.emit("input", a);
  earlierAck({ ok: true, value: { accepted: true } });
  await new Promise((resolve) => setImmediate(resolve));
  const drained = capture.stop();
  assert.equal(drained.length, 1);
  assert.match(drained[0].eventId, /:2$/);
});

test("switching scroll containers retains both operations before debounce or acknowledgement", () => {
  const capture = recorder(() => new Promise(() => {}));
  const [a, b] = capture.existingAll();
  a.scrollTop = 1100;
  capture.emit("scroll", a);
  b.scrollTop = 600;
  capture.emit("scroll", b);
  const drained = capture.stop();
  assert.equal(drained.length, 2);
  assert.ok(drained.every((event) => event.kind === "scroll" && event.direction === "down"));
  assert.equal(new Set(drained.map((event) => event.eventId)).size, 2);
});

test("scroll direction uses the existing container offset instead of zero", () => {
  const capture = recorder(() => new Promise(() => {}));
  const target = capture.existing();
  target.scrollTop = 900;
  capture.emit("scroll", target);
  assert.equal(capture.stop()[0].direction, "up");
});

test("dynamic scroll containers seed their first position before recording deltas", () => {
  const capture = recorder(() => new Promise(() => {}));
  const target = capture.input();
  target.scrollTop = 1000;
  capture.emit("scroll", target);
  assert.equal(capture.stop().length, 0);

  const resumed = recorder(() => new Promise(() => {}));
  const resumedTarget = resumed.input();
  resumedTarget.scrollTop = 1000;
  resumed.emit("scroll", resumedTarget);
  resumedTarget.scrollTop = 900;
  resumed.emit("scroll", resumedTarget);
  assert.equal(resumed.stop()[0].direction, "up");
});

test("input and scroll start durable delivery before pagehide; pending delivery requests an unload warning", async () => {
  const sent = [];
  const capture = recorder((message) => { sent.push(message); return new Promise(() => {}); });
  const target = capture.existing();
  capture.emit("input", target);
  target.scrollTop = 1120;
  capture.emit("scroll", target);
  assert.deepEqual(sent.map((message) => message.event.kind), ["input", "scroll"]);
  let warned = false;
  const event = { preventDefault() { warned = true; } };
  capture.emitEvent("beforeunload", event);
  assert.equal(warned, true);
  assert.equal(event.returnValue, "");
  assert.equal(capture.stop().length, 2);
});

test("acknowledged edits do not require an unload warning", async () => {
  const capture = recorder(async () => ({ ok: true, value: { accepted: true } }));
  capture.emit("input", capture.input());
  await new Promise((resolve) => setImmediate(resolve));
  let warned = false;
  capture.emitEvent("beforeunload", { preventDefault() { warned = true; } });
  assert.equal(warned, false);
  capture.stop();
});
