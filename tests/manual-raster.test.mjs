import { normalizeManualAnnotations } from "../apps/worker/src/manual-annotations.ts";
import { normalizeAnnotations } from "../apps/extension/editor/image-annotations.js";
import test from "node:test";
import assert from "node:assert/strict";
import { inspectManualRaster } from "../apps/worker/src/manual-raster.ts";
import { brandingForeground } from "../apps/worker/src/infra/d1/manual-branding-repository.ts";
const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function dimensions(width, height) { const bytes = png.slice(); const view = new DataView(bytes.buffer); view.setUint32(16, width); view.setUint32(20, height); view.setUint32(29, crc32(bytes.subarray(12, 29))); return bytes; }
test("raster validation rejects SVG, metadata, trailing bytes, corrupt chunks, oversized decoded dimensions and byte budgets", () => {
  assert.deepEqual(inspectManualRaster(png, "image/png"), { width: 1, height: 1 });
  assert.throws(() => inspectManualRaster(png, "image/svg+xml"));
  assert.throws(() => inspectManualRaster(png, "image/png", 67));
  assert.throws(() => inspectManualRaster(dimensions(65536, 1), "image/png"));
  assert.throws(() => inspectManualRaster(dimensions(8000, 8000), "image/png"));
  assert.throws(() => inspectManualRaster(dimensions(3000, 3000), "image/png", 1024 * 1024, 4_000_000));
  assert.throws(() => inspectManualRaster(new Uint8Array([...png, 0]), "image/png"));
  const corrupt = png.slice(); corrupt[30] ^= 1;
  assert.throws(() => inspectManualRaster(corrupt, "image/png"));
  const metadata = new Uint8Array([...png.subarray(0, 33), 0, 0, 0, 0, 116, 69, 88, 116, 0, 0, 0, 0, ...png.subarray(33)]);
  assert.throws(() => inspectManualRaster(metadata, "image/png"));
  assert.throws(() => inspectManualRaster(Uint8Array.from([255,216,255,225,0,8,69,120,105,102,0,0,255,217]), "image/jpeg"));
});
test("strict theme colors always choose a foreground with at least WCAG 4.5 contrast", () => {
  for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) {
    const color = '#' + [r,g,b].map((x) => x.toString(16).padStart(2,'0')).join('');
    const linear = [r,g,b].map((x) => x/255).map((x) => x <= .04045 ? x/12.92 : ((x+.055)/1.055)**2.4);
    const luminance = linear[0]*.2126 + linear[1]*.7152 + linear[2]*.0722;
    const contrast = brandingForeground(color) === '#000000' ? (luminance+.05)/.05 : 1.05/(luminance+.05);
    assert.ok(contrast >= 4.5, color);
  }
});


test("server overlays normalize like the shared editor for all supported shapes and strict custom colors", () => {
  const values = [
    { id: "rect", type: "rectangle", x: .8, y: .8, width: .2, height: .2, color: "#A14EBA" },
    { id: "ellipse", type: "ellipse", x: 0, y: 0, width: 1, height: 1 },
    { id: "arrow", type: "arrow", x1: .1, y1: .2, x2: .8, y2: .9, strokeWidth: 16 },
    { id: "text", type: "text", x: .2, y: .2, width: .5, height: .5, text: "安全な説明😀", color: "#FFFFFF", fontSize: 96 }
  ];
  assert.deepEqual(normalizeManualAnnotations(values), normalizeAnnotations(values));
  assert.throws(() => normalizeManualAnnotations([{ ...values[3], text: "a\u0000b" }]));
  assert.throws(() => normalizeManualAnnotations([{ ...values[0], id: "x".repeat(129) }]));
  assert.throws(() => normalizeManualAnnotations(Array.from({ length: 100 }, (_, i) => ({ ...values[3], id: String(i), text: "あ".repeat(500) }))));
});
