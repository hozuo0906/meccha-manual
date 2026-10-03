import assert from "node:assert/strict";
import test from "node:test";

import {
  createPersonalInfoValue,
  createSyntheticPerson,
  syntheticPersonForReplacementAnnotations,
  SYNTHETIC_PEOPLE
} from "../apps/extension/editor/personal-info-replacement.js";
import { createImageEditor } from "../apps/extension/editor/image-editor.js";

class Element {
  constructor(tag = "div") { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.listeners = new Map(); this.attrs = new Map(); this.hidden = false; this.disabled = false; this.value = ""; this.style = { setProperty() {} }; this.className = ""; }
  append(...children) { for (const child of children) { if (!child || typeof child !== "object") continue; child.parentElement = this; this.children.push(child); } }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((child) => child !== this); }
  setAttribute(key, value) { this.attrs.set(key, String(value)); }
  getAttribute(key) { return this.attrs.get(key) || null; }
  removeAttribute(key) { this.attrs.delete(key); }
  addEventListener(type, listener, options = {}) { const rows = this.listeners.get(type) || []; rows.push({ listener, signal: options.signal }); this.listeners.set(type, rows); }
  async fire(type, event = {}) { for (const row of this.listeners.get(type) || []) if (!row.signal?.aborted) await row.listener({ target: this, preventDefault() {}, stopPropagation() {}, ...event }); }
  focus() { globalThis.document.activeElement = this; }
  contains(node) { return node === this || this.children.some((child) => child.contains?.(node)); }
  closest() { return null; }
  show() { this.open = true; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  getContext() { return new Proxy({ canvas: this }, { get(target, key) { return key in target ? target[key] : () => {}; } }); }
  matches(selector) {
    if (selector === "*") return true;
    if (selector === "button") return this.tagName === "BUTTON";
    if (selector === "form") return this.tagName === "FORM";
    if (selector.startsWith(".")) return this.className.split(/\s+/u).includes(selector.slice(1));
    const data = selector.match(/^\[data-([\w-]+)(?:="([^"]*)")?\]$/u);
    if (!data) return false;
    const key = data[1].replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    return Object.prototype.hasOwnProperty.call(this.dataset, key) && (data[2] === undefined || this.dataset[key] === data[2]);
  }
  querySelectorAll(selector) { return this.children.flatMap((child) => [child, ...child.querySelectorAll(selector)]).filter((child) => child.matches(selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function harness(t, annotations) {
  const previousDocument = globalThis.document;
  const previousImage = globalThis.Image;
  const dialog = new Element("dialog");
  const canvas = new Element("canvas");
  const host = new Element(); host.append(canvas);
  const form = new Element("form");
  const status = new Element(); status.dataset.editorStatus = "";
  const property = new Element(); property.className = "property-group";
  const selection = new Element(); selection.dataset.editorSelection = "";
  const save = new Element("button"); save.dataset.editorSave = "";
  const cancel = new Element("button"); cancel.dataset.editorCancel = "";
  const tool = new Element("button"); tool.dataset.editorTool = "select";
  const toolGroup = new Element(); toolGroup.className = "tool-group";
  dialog.append(form, status, property, selection, save, cancel, toolGroup, host);
  globalThis.document = { activeElement: null, body: new Element("body"), createElement: (tag) => new Element(tag) };
  globalThis.Image = class { width = 100; height = 100; async decode() {} };
  t.after(() => { globalThis.document = previousDocument; globalThis.Image = previousImage; });
  let output;
  const screenshot = { dataUrl: "data:image/png;base64,AA==", annotations, masks: [] };
  const editor = createImageEditor({ dialog, canvas, screenshot, inline: true, initialTool: "replacement", onSave: async (value) => { output = value; return true; } });
  t.after(() => editor.dispose());
  return { dialog, screenshot, editor, get output() { return output; } };
}

test("既存の氏名置換から同じ合成人物をreload後に復元する", () => {
  const annotations = [{ id: "name", type: "replacement", category: "name", text: "高橋一郎", x: .1, y: .1, width: .3, height: .1, color: "#111827", strokeWidth: 3, fontSize: 24 }];
  const person = syntheticPersonForReplacementAnnotations(annotations, SYNTHETIC_PEOPLE[3]);
  assert.deepEqual(person, SYNTHETIC_PEOPLE[0]);
  assert.equal(createPersonalInfoValue("kana", person), "タカハシイチロウ");
  assert.deepEqual(syntheticPersonForReplacementAnnotations([], createSyntheticPerson({ getRandomValues(values) { values[0] = 3; return values; } })), SYNTHETIC_PEOPLE[3]);
});

test("氏名・カナの合成人物選択は既存注釈を揃え、適用前の取消では保存しない", async (t) => {
  const annotations = [
    { id: "name", type: "replacement", category: "name", text: "高橋一郎", x: .1, y: .1, width: .3, height: .1, color: "#111827", strokeWidth: 3, fontSize: 24 },
    { id: "kana", type: "replacement", category: "kana", text: "タカハシイチロウ", x: .1, y: .25, width: .3, height: .1, color: "#111827", strokeWidth: 3, fontSize: 24 }
  ];
  const h = harness(t, annotations);
  await h.editor.open();
  const person = h.dialog.querySelector("[data-editor-replacement-person]");
  assert.equal(person.value, "0");
  person.value = "3";
  await person.fire("change");
  const add = h.dialog.querySelector("[data-replacement-action=\"add\"]");
  assert.ok(add);
  const type = h.dialog.querySelector("[data-editor-replacement-type]");
  type.value = "kana";
  await type.fire("change");
  await add.fire("click");
  await h.dialog.querySelector("[data-editor-save]").fire("click");
  assert.deepEqual(h.output.annotations.filter((item) => ["name", "kana"].includes(item.category)).map((item) => item.text), ["田中美咲", "タナカミサキ", "タナカミサキ"]);

  const cancelHarness = harness(t, annotations);
  await cancelHarness.editor.open();
  const cancelPerson = cancelHarness.dialog.querySelector("[data-editor-replacement-person]");
  cancelPerson.value = "4";
  await cancelPerson.fire("change");
  await cancelHarness.dialog.querySelector("[data-editor-cancel]").fire("click");
  assert.equal(cancelHarness.output, undefined);
  assert.equal(cancelHarness.screenshot.annotations[0].text, "高橋一郎");
});
