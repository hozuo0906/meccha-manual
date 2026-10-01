import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "parse5";

const source = await readFile(new URL("../apps/extension/content/recorder.js", import.meta.url), "utf8");
const start = source.indexOf("  const semanticKind = ");
const end = source.indexOf("\n  const describe = ", start);
const make = new Function(`${source.slice(start, end)}; return { semanticKind, semanticTableKinds, privateValueContext };`);
const { semanticKind, semanticTableKinds, privateValueContext } = make();

function dom(html) {
  const ids = new Map();
  const convert = (node, parentElement = null) => {
    const attrs = Object.fromEntries((node.attrs || []).map(({ name, value }) => [name, value]));
    const element = { tagName: node.tagName?.toUpperCase(), parentElement, id: attrs.id || "", getAttribute: (name) => attrs[name] ?? null };
    element.children = (node.childNodes || []).filter((child) => child.tagName).map((child) => convert(child, element));
    const text = (current) => current.value || (current.childNodes || []).map(text).join("");
    element.textContent = text(node);
    element.closest = (tag) => { let current = element; while (current && current.tagName !== tag.toUpperCase()) current = current.parentElement; return current; };
    element.children.forEach((child, index) => { child.previousElementSibling = element.children[index - 1] || null; });
    if (["TH", "TD"].includes(element.tagName)) { element.colSpan = Number(attrs.colspan ?? 1); element.rowSpan = Number(attrs.rowspan ?? 1); }
    if (element.tagName === "TR") element.cells = element.children.filter((child) => ["TH", "TD"].includes(child.tagName));
    if (element.tagName === "TABLE") element.rows = element.children.flatMap((child) => child.tagName === "TR" ? [child] : ["THEAD", "TBODY", "TFOOT"].includes(child.tagName) ? child.children : []);
    if (element.id) ids.set(element.id, element);
    return element;
  };
  convert(parse(html));
  return ids;
}
const kinds = (ids) => semanticTableKinds(ids.get("table"), semanticKind);

test("semantic labels inspect beyond the old prefix and protect every exhausted label", () => {
  assert.equal(semanticKind(`${"X".repeat(201)} 氏名`), "name");
  assert.equal(semanticKind(`${"X".repeat(4093)} 氏名`), "name");
  assert.equal(semanticKind("X".repeat(4097)), "unknown");
  assert.equal(semanticKind(`${"X".repeat(4097)} 氏名`), "unknown");
  const ids = dom(`<dl><dt>${"X".repeat(201)} 氏名</dt><dd><button id="name">Synthetic Person</button></dd><dt>${"X".repeat(4097)}</dt><dd><button id="budget">Synthetic Budget Person</button></dd></dl>`);
  assert.equal(privateValueContext(ids.get("name")), true);
  assert.equal(privateValueContext(ids.get("budget")), true);
});

test("headers resolve multiple rows, colspan, rowspan and separate row groups", () => {
  const ids = dom(`<table id="table"><thead><tr><th rowspan="2">区分</th><th colspan="2">基本情報</th></tr><tr><th>氏名</th><th>会社</th></tr></thead><tbody>
  <tr><td rowspan="2">受付</td><td id="name"><button id="private">Synthetic Person</button></td><td id="company">Synthetic Company</td></tr>
  <tr><td colspan="2" id="ambiguous">Synthetic Combo</td></tr></tbody>
  <tbody><tr><td id="safe"><button id="action">確認</button></td><td id="second-name">Synthetic Person</td><td>企業</td></tr></tbody></table>`);
  const result = kinds(ids);
  assert.equal(result.get(ids.get("name")), "name");
  assert.equal(result.get(ids.get("company")), "company");
  assert.equal(result.get(ids.get("ambiguous")), "unknown");
  assert.equal(result.get(ids.get("second-name")), "name");
  assert.equal(result.has(ids.get("safe")), false);
  assert.equal(privateValueContext(ids.get("private")), true);
  assert.equal(privateValueContext(ids.get("action")), false);
});

test("rowspan zero, explicit headers and unresolved associations remain protected", () => {
  const ids = dom(`<table id="table"><tbody><tr><th id="label" scope="row" rowspan="0">氏名</th><td id="first">One</td></tr><tr><td id="second">Two</td></tr></tbody><tbody><tr><td id="explicit" headers="label">Three</td><td id="missing" headers="absent">Four</td></tr></tbody></table>`);
  const result = kinds(ids);
  for (const id of ["first", "second", "explicit"]) assert.equal(result.get(ids.get(id)), "name");
  assert.equal(result.get(ids.get("missing")), "unknown");
  const duplicate = dom('<table id="table"><thead><tr><th id="label">氏名</th><th id="label">区分</th></tr></thead><tbody><tr><td>One</td><td headers="label" id="duplicate">Two</td></tr></tbody></table>');
  assert.equal(kinds(duplicate).get(duplicate.get("duplicate")), "unknown");
});

test("over-budget and overlapping span models fail closed for both image and caption paths", () => {
  for (const html of [
    '<table id="table"><thead><tr><th colspan="1000">氏名</th></tr></thead><tbody><tr><td colspan="1000" rowspan="5"><button id="value">Synthetic Person</button></td></tr><tr></tr><tr></tr><tr></tr><tr></tr></tbody></table>',
    '<table id="table"><tbody><tr><td>Left</td><th rowspan="2">氏名</th></tr><tr><td colspan="2"><button id="value">Synthetic Person</button></td></tr></tbody></table>'
  ]) {
    const ids = dom(html);
    assert.throws(() => kinds(ids), /SCREENSHOT_BUDGET_EXCEEDED/);
    assert.equal(privateValueContext(ids.get("value")), true);
  }
});
