/** Only bounded, metadata-free browser raster exports cross the image boundary. */
export interface RasterDimensions { width: number; height: number }
const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
const ascii = (bytes: Uint8Array, start: number, length: number): string => String.fromCharCode(...bytes.subarray(start, start + length));
function invalid(): never { throw new TypeError("RASTER_INVALID"); }
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(bytes: Uint8Array): RasterDimensions {
  if (!pngSignature.every((value, index) => bytes[index] === value)) invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8; let dimensions: RasterDimensions | null = null; let data = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset); const kind = ascii(bytes, offset + 4, 4);
    if (length > bytes.length - offset - 12 || !["IHDR", "PLTE", "tRNS", "IDAT", "IEND", "sRGB", "gAMA", "cHRM", "pHYs"].includes(kind)) invalid();
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== view.getUint32(offset + 8 + length)) invalid();
    if (!dimensions && kind !== "IHDR") invalid();
    if (kind === "IHDR") {
      if (dimensions || length !== 13 || view.getUint8(offset + 18) !== 0 || view.getUint8(offset + 19) !== 0 || view.getUint8(offset + 20) > 1) invalid();
      const depth = bytes[offset + 16]!; const color = bytes[offset + 17]!;
      if (!(color === 0 ? [1, 2, 4, 8, 16] : color === 3 ? [1, 2, 4, 8] : [2, 4, 6].includes(color) ? [8, 16] : []).includes(depth)) invalid();
      dimensions = { width: view.getUint32(offset + 8), height: view.getUint32(offset + 12) };
    }
    if (kind === "IDAT") { if (!length) invalid(); data = true; }
    offset += length + 12;
    if (kind === "IEND") { if (length !== 0 || offset !== bytes.length || !data || !dimensions) invalid(); return dimensions; }
  }
  return invalid();
}
function jpeg(bytes: Uint8Array): RasterDimensions {
  if (bytes[0] !== 255 || bytes[1] !== 216) invalid();
  let offset = 2; let dimensions: RasterDimensions | null = null; let scanned = false;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 255) invalid();
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 217) { if (!dimensions || !scanned || offset !== bytes.length) invalid(); return dimensions; }
    if (!marker || marker === 216 || marker === 0xfe || (marker >= 0xe1 && marker <= 0xef) || offset + 2 > bytes.length) invalid();
    const length = bytes[offset]! * 256 + bytes[offset + 1]!;
    if (length < 2 || offset + length > bytes.length) invalid();
    if (marker === 0xe0 && (length !== 16 || ascii(bytes, offset + 2, 5) !== "JFIF\0" || bytes[offset + 14] !== 0 || bytes[offset + 15] !== 0)) invalid();
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (dimensions || length < 8 || bytes[offset + 2] !== 8) invalid();
      dimensions = { width: bytes[offset + 5]! * 256 + bytes[offset + 6]!, height: bytes[offset + 3]! * 256 + bytes[offset + 4]! };
    }
    offset += length;
    if (marker === 0xda) {
      if (!dimensions) invalid();
      scanned = true;
      // Scan entropy bytes without permitting appended EXIF/XMP/comment segments.
      while (offset < bytes.length) {
        if (bytes[offset] !== 255) { offset++; continue; }
        if (bytes[offset + 1] === 0 || (bytes[offset + 1]! >= 0xd0 && bytes[offset + 1]! <= 0xd7)) { offset += 2; continue; }
        break;
      }
    }
  }
  return invalid();
}
function webp(bytes: Uint8Array): RasterDimensions {
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) + 8 !== bytes.length) invalid();
  let dimensions: RasterDimensions | null = null; let image = false; let offset = 12;
  while (offset + 8 <= bytes.length) {
    const kind = ascii(bytes, offset, 4); const length = view.getUint32(offset + 4, true); const start = offset + 8;
    if (length > bytes.length - start || !["VP8 ", "VP8L", "VP8X", "ALPH"].includes(kind)) invalid();
    let found: RasterDimensions | null = null;
    if (kind === "VP8X") {
      if (offset !== 12 || length !== 10 || (bytes[start]! & ~0x10) !== 0) invalid();
      dimensions = { width: 1 + bytes[start + 4]! + bytes[start + 5]! * 256 + bytes[start + 6]! * 65536, height: 1 + bytes[start + 7]! + bytes[start + 8]! * 256 + bytes[start + 9]! * 65536 };
    } else if (kind === "VP8 ") {
      if (image || length < 10 || (bytes[start]! & 1) !== 0 || bytes[start + 3] !== 0x9d || bytes[start + 4] !== 1 || bytes[start + 5] !== 0x2a) invalid();
      found = { width: view.getUint16(start + 6, true) & 0x3fff, height: view.getUint16(start + 8, true) & 0x3fff }; image = true;
    } else if (kind === "VP8L") {
      if (image || length < 5 || bytes[start] !== 0x2f || (bytes[start + 4]! >> 5) !== 0) invalid();
      const bits = view.getUint32(start + 1, true);
      found = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }; image = true;
    }
    if (found) { if (dimensions && (found.width !== dimensions.width || found.height !== dimensions.height)) invalid(); dimensions = found; }
    offset = start + length + (length % 2);
  }
  if (offset !== bytes.length || !dimensions || !image) invalid();
  return dimensions;
}
export function inspectManualRaster(bytes: Uint8Array, contentType: string, maxBytes = 10 * 1024 * 1024, maxPixels = 40_000_000): RasterDimensions {
  if (bytes.length === 0 || bytes.length > maxBytes) invalid();
  const result = contentType === "image/png" ? png(bytes) : contentType === "image/jpeg" ? jpeg(bytes) : contentType === "image/webp" ? webp(bytes) : invalid();
  if (!Number.isSafeInteger(result.width) || !Number.isSafeInteger(result.height) || result.width < 1 || result.height < 1 || result.width > 16384 || result.height > 16384 || result.width * result.height > maxPixels) invalid();
  return result;
}
