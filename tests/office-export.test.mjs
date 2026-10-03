import test from "node:test";
import assert from "node:assert/strict";
import { posix } from "node:path";

import { assertOfficeArchiveBudget, assertOfficeImageBudget, assertOfficeZip32, assertOfficeZipEntryCount, buildDocx, buildPptx, normalizeOfficeManual, OFFICE_ARCHIVE_BYTES_LIMIT, OFFICE_IMAGE_BYTES_LIMIT, OFFICE_EXPORT_MIME_TYPES } from "../apps/extension/export/office-export.js";

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
      const checksum = view.getUint32(cursor + 14, true);
      const nameStart = cursor + 30;
      const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength));
      const bodyStart = nameStart + nameLength + extraLength;
      const body = bytes.slice(bodyStart, bodyStart + compressedLength);
      assert.equal(crc32(body), checksum, `CRC mismatch for ${name}`);
      entries.set(name, body);
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

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function assertRelationshipTargets(entries) {
  for (const name of entries.keys()) {
    if (!name.endsWith(".rels")) continue;
    const ownerDirectory = name.includes("/_rels/") ? name.slice(0, name.indexOf("/_rels/")) : "";
    const relationships = entryText(entries, name);
    for (const match of relationships.matchAll(/Target="([^"]+)"/gu)) {
      if (/^[a-z][a-z0-9+.-]*:/iu.test(match[1])) continue;
      const target = posix.normalize(posix.join(ownerDirectory, match[1]));
      assert.ok(entries.has(target), `${name} points to missing ${target}`);
    }
  }
}

function imageWithDimensions(width, height, mimeType = "image/png") {
  const bytes = Uint8Array.from(PNG);
  if (mimeType === "image/png") {
    const view = new DataView(bytes.buffer);
    view.setUint32(16, width);
    view.setUint32(20, height);
  }
  return { kind: "edited", bytes, mimeType, width, height };
}

class DeclaredSizeBytes extends Uint8Array {
  constructor(bytes, declaredSize) {
    super(bytes);
    Object.defineProperty(this, "byteLength", { value: declaredSize });
  }
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

test("office exports reject XML 1.0 control characters and unpaired surrogates", () => {
  assert.throws(() => buildDocx({ ...manual(), title: "不正\u0000文字" }), /unsupported XML characters/);
  assert.throws(() => buildPptx({ ...manual(), steps: [{ ...manual().steps[0], instruction: "不正\ud800文字" }] }), /unsupported XML characters/);
});

test("office exports reject XML 1.0 noncharacters U+FFFE and U+FFFF", () => {
  assert.throws(() => buildDocx({ ...manual(), title: `invalid\u{fffe}title` }), /unsupported XML characters/);
  assert.throws(() => buildPptx({ ...manual(), steps: [{ ...manual().steps[0], instruction: `invalid\u{ffff}instruction` }] }), /unsupported XML characters/);
});

test("Office image, archive, and ZIP32 guards reject overflow without allocating giant fixtures", () => {
  assert.equal(assertOfficeImageBudget(OFFICE_IMAGE_BYTES_LIMIT), OFFICE_IMAGE_BYTES_LIMIT);
  assert.throws(() => assertOfficeImageBudget(1, OFFICE_IMAGE_BYTES_LIMIT), /画像容量が大きいため/u);
  assert.equal(assertOfficeArchiveBudget(OFFICE_ARCHIVE_BYTES_LIMIT), OFFICE_ARCHIVE_BYTES_LIMIT);
  assert.throws(() => assertOfficeArchiveBudget(OFFICE_ARCHIVE_BYTES_LIMIT + 1), /画像容量が大きいため/u);
  assert.equal(assertOfficeZip32(0xffffffff), 0xffffffff);
  assert.throws(() => assertOfficeZip32(0x100000000), /画像容量が大きいため/u);
  assert.equal(assertOfficeZipEntryCount(0xffff), 0xffff);
  assert.throws(() => assertOfficeZipEntryCount(0x10000), /画像容量が大きいため/u);
});

test("real DOCX/PPTX builds reject cumulative image overflow before copying the next image", () => {
  const oversizedManual = {
    title: "容量超過の実build",
    steps: [1, 2].map((number) => ({
      number,
      instruction: `手順${number}`,
      image: { ...imageWithDimensions(320, 180), bytes: new DeclaredSizeBytes(PNG, Math.floor(OFFICE_IMAGE_BYTES_LIMIT / 2) + 1) }
    }))
  };
  assert.throws(() => buildDocx(oversizedManual), /画像容量が大きいため/u);
  assert.throws(() => buildPptx(oversizedManual), /画像容量が大きいため/u);
});

test("DOCX is a real OOXML package with text, page breaks, and edited image relationship", () => {
  const packageEntries = zipEntries(buildDocx(manual()));
  assertRelationshipTargets(packageEntries);
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
  assertRelationshipTargets(packageEntries);
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

test("PPTX theme has the required three style entries and long Japanese body uses autofit", () => {
  const longInstruction = "\u64cd\u4f5c\u3092\u8a18\u9332\u3057\u305f\u624b\u9806\u306e\u8a73\u7d30\u3092\u78ba\u8a8d\u3057\u3001\u5fc5\u8981\u306a\u9805\u76ee\u3092\u5165\u529b\u3057\u3066\u304b\u3089\u4fdd\u5b58\u3092\u30af\u30ea\u30c3\u30af\u3057\u307e\u3059\u3002".repeat(24);
  const packageEntries = zipEntries(buildPptx({ title: "\u9577\u6587\u5b57\u30ec\u30a4\u30a2\u30a6\u30c8", steps: [{ instruction: longInstruction, image: { kind: "edited", bytes: PNG, mimeType: "image/png", width: 1600, height: 900 } }] }));
  const theme = entryText(packageEntries, "ppt/theme/theme1.xml");
  assert.equal((theme.match(/<a:fillStyleLst>/g) || []).length, 1);
  assert.equal((theme.match(/<a:solidFill>/g) || []).length, 9);
  assert.equal((theme.match(/<a:ln /g) || []).length, 3);
  assert.equal((theme.match(/<a:effectStyle>/g) || []).length, 3);
  assert.equal((theme.match(/<a:bgFillStyleLst>/g) || []).length, 1);
  const slide = entryText(packageEntries, "ppt/slides/slide1.xml");
  assert.match(slide, /<a:normAutofit\/>/);
  assert.match(slide, /cy="3200000"/);
  assert.match(slide, /\u64cd\u4f5c\u3092\u8a18\u9332/);
});

test("DOCX and PPTX fit every image orientation in EMU bounds and keep multiple images", () => {
  const dimensions = [[1600, 900], [900, 1600], [320, 180], [4000, 1000]];
  const value = {
    title: "画像寸法の確認",
    description: "長い本文でも画像と手順を保持します。".repeat(8),
    steps: dimensions.map(([width, height], index) => ({
      number: index + 1,
      title: `画像 ${index + 1}`,
      instruction: `日本語の手順本文 ${index + 1}。`,
      image: imageWithDimensions(width, height)
    }))
  };
  const docxEntries = zipEntries(buildDocx(value));
  assertRelationshipTargets(docxEntries);
  const docx = entryText(docxEntries, "word/document.xml");
  const docxExtents = [...docx.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/gu)].map((match) => [Number(match[1]), Number(match[2])]);
  assert.equal(docxExtents.length, dimensions.length);
  assert.deepEqual(docxExtents[0], [5760720, 3240405], "1600x900 is fitted to the DOCX width");
  assert.deepEqual(docxExtents[2], [3048000, 1714500], "normal 320x180 keeps 96dpi pixel proportions without upscaling");
  for (const [width, height] of docxExtents) {
    assert.ok(width > 0 && height > 0);
    assert.ok(width <= 6.3 * 914400 && height <= 7.6 * 914400);
  }
  for (let index = 1; index <= dimensions.length; index += 1) {
    assert.ok(docxEntries.has(`word/media/image${index}.png`));
  }

  const pptxEntries = zipEntries(buildPptx(value));
  assertRelationshipTargets(pptxEntries);
  for (let index = 1; index <= dimensions.length; index += 1) {
    const slide = entryText(pptxEntries, `ppt/slides/slide${index}.xml`);
    const picture = slide.match(/<p:pic>[\s\S]*?<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>[\s\S]*?<\/p:pic>/u);
    assert.ok(picture, `missing picture transform on slide ${index}`);
    const [, x, y, width, height] = picture.map(Number);
    assert.ok(x >= 0 && y >= 0);
    assert.ok(width > 0 && height > 0);
    assert.ok(x + width <= 12192000 && y + height <= 6858000);
    assert.ok(width <= 6.55 * 914400 && height <= 5.3 * 914400);
    if (index === 1) assert.deepEqual([x, y, width, height], [5602680, 2215504, 5989320, 3368993]);
    if (index === 3) assert.deepEqual([width, height], [3048000, 1714500]);
    assert.ok(pptxEntries.has(`ppt/media/image${index}.png`));
  }
});

test("OOXML keeps styles relationships and converts source newlines to Office breaks", () => {
  const value = {
    title: "タイトル\n次の行",
    description: "説明の一行目\n説明の二行目",
    steps: [{ title: "手順\n補足", instruction: "本文の一行目\n本文の二行目" }]
  };
  const docxEntries = zipEntries(buildDocx(value));
  const docx = entryText(docxEntries, "word/document.xml");
  const docxRels = entryText(docxEntries, "word/_rels/document.xml.rels");
  const styles = entryText(docxEntries, "word/styles.xml");
  assert.match(docxRels, /Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/styles" Target="styles\.xml"/);
  assert.match(styles, /<w:style[^>]+w:styleId="Heading1"[\s\S]*?<w:pPr><w:keepNext\/><\/w:pPr>[\s\S]*?<\/w:style>/u);
  assert.doesNotMatch(styles, /<w:style[^>]+w:styleId="Heading1"[^>]*>[^<]*<w:name[^>]*\/><w:basedOn[^>]*\/><w:keepNext\/>/u);
  assert.match(docx, /<w:t xml:space="preserve">タイトル<\/w:t><w:br\/><w:t xml:space="preserve">次の行<\/w:t>/);
  assert.ok(!docx.includes("タイトル\n次の行"));

  const pptxEntries = zipEntries(buildPptx(value));
  const slide = entryText(pptxEntries, "ppt/slides/slide1.xml");
  assert.match(slide, /<a:t>タイトル<\/a:t><\/a:r><a:br\/><a:r>[\s\S]*?<a:t>次の行/);
  assert.ok(!slide.includes("タイトル\n次の行"));
});

test("data URL rendered image can be exported without cloud login", () => {
  const dataUrl = `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`;
  const packageEntries = zipEntries(buildDocx({ title: "ローカル出力", steps: [{ instruction: "保存します。", image: { kind: "edited", dataUrl } }] }));
  assert.ok(packageEntries.has("word/media/image1.png"));
});
