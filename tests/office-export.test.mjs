import test from "node:test";
import assert from "node:assert/strict";

import { buildDocx, buildPptx, normalizeOfficeManual, OFFICE_EXPORT_MIME_TYPES } from "../apps/extension/export/office-export.js";

const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));

function zipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = new Map();
  let cursor = 0;
  while (cursor + 4 <= bytes.length) {
    const signature = view.getUint32(cursor, true);
    if (signature === 0x04034b50) {
      const nameLength = view.getUint16(cursor + 26, true);
      const extraLength = view.getUint16(cursor + 28, true);
      const compressedLength = view.getUint32(cursor + 18, true);
      const nameStart = cursor + 30;
      const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength));
      const bodyStart = nameStart + nameLength + extraLength;
      entries.set(name, bytes.slice(bodyStart, bodyStart + compressedLength));
      cursor = bodyStart + compressedLength;
      continue;
    }
    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    throw new Error(`unexpected ZIP signature 0x${signature.toString(16)}`);
  }
  return entries;
}

function entryText(entries, name) {
  return new TextDecoder().decode(entries.get(name));
}

function manual() {
  return {
    title: "売上確認の手順",
    description: "毎朝の確認方法です。",
    steps: [
      { number: 1, title: "一覧を開く", instruction: "一覧を開きます。", image: { kind: "edited", bytes: PNG, mimeType: "image/png" } },
      { number: 2, title: "件数を確認", instruction: "表示された件数を確認します。" }
    ]
  };
}

test("normalizeOfficeManual accepts edited pixels and preserves ordering", () => {
  const normalized = normalizeOfficeManual(manual());
  assert.equal(normalized.title, "売上確認の手順");
  assert.equal(normalized.steps.length, 2);
  assert.equal(normalized.steps[0].image.kind, "edited");
  assert.deepEqual(Array.from(normalized.steps[0].image.bytes), Array.from(PNG));
});

test("office exports reject original pixels and unmarked images", () => {
  assert.throws(() => buildDocx({ ...manual(), steps: [{ ...manual().steps[0], image: { kind: "original", bytes: PNG, mimeType: "image/png" } }] }), /edited render/);
  assert.throws(() => buildPptx({ ...manual(), steps: [{ ...manual().steps[0], image: { bytes: PNG, mimeType: "image/png" } }] }), /edited render/);
  assert.throws(() => buildDocx({ ...manual(), steps: [{ ...manual().steps[0], image: { kind: "edited", bytes: new Uint8Array(), mimeType: "image/png", width: 1, height: 1 } }] }), /empty/);
});

test("DOCX is a real OOXML package with text, page breaks, and edited image relationship", () => {
  const packageEntries = zipEntries(buildDocx(manual()));
  assert.equal(OFFICE_EXPORT_MIME_TYPES.docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  for (const name of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/_rels/document.xml.rels", "word/media/image1.png"]) {
    assert.ok(packageEntries.has(name), `missing ${name}`);
  }
  const document = entryText(packageEntries, "word/document.xml");
  assert.match(document, /売上確認の手順/);
  assert.match(document, /毎朝の確認方法です/);
  assert.match(document, /手順 1：一覧を開く/);
  assert.match(document, /手順 2：件数を確認/);
  assert.match(document, /w:pageBreakBefore/);
  assert.match(document, /r:embed="rIdImage1"/);
  assert.match(entryText(packageEntries, "word/_rels/document.xml.rels"), /relationships\/image/);
  assert.deepEqual(Array.from(packageEntries.get("word/media/image1.png")), Array.from(PNG));
});

test("PPTX is a real OOXML package with one slide per step and edited image", () => {
  const packageEntries = zipEntries(buildPptx(manual()));
  assert.equal(OFFICE_EXPORT_MIME_TYPES.pptx, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  for (const name of ["[Content_Types].xml", "_rels/.rels", "ppt/presentation.xml", "ppt/_rels/presentation.xml.rels", "ppt/slides/slide1.xml", "ppt/slides/slide2.xml", "ppt/slides/_rels/slide1.xml.rels", "ppt/media/image1.png"]) {
    assert.ok(packageEntries.has(name), `missing ${name}`);
  }
  const presentation = entryText(packageEntries, "ppt/presentation.xml");
  assert.equal((presentation.match(/<p:sldId /g) || []).length, 2);
  const slide = entryText(packageEntries, "ppt/slides/slide1.xml");
  assert.match(slide, /売上確認の手順/);
  assert.match(slide, /手順 1/);
  assert.match(slide, /一覧を開きます/);
  assert.match(slide, /r:embed="rId2"/);
});

test("data URL rendered image can be exported without cloud login", () => {
  const dataUrl = `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`;
  const packageEntries = zipEntries(buildDocx({ title: "ローカル出力", steps: [{ instruction: "保存します。", image: { kind: "edited", dataUrl } }] }));
  assert.ok(packageEntries.has("word/media/image1.png"));
});
