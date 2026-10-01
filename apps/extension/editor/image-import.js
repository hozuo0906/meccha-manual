// Bounded, metadata-stripping local image import shared by editor surfaces.
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_COUNT = 100;
const MAX_IMAGE_TOTAL_BYTES = 100 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_IMAGE_DIMENSION = 12_000;
export const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("IMAGE_ENCODE_FAILED")), type, quality));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("IMAGE_READ_FAILED"));
    reader.readAsDataURL(blob);
  });
}

export function dataUrlBytes(dataUrl) {
  if (typeof dataUrl !== "string") return 0;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  const encoded = dataUrl.slice(comma + 1).replace(/\s/g, "");
  return Math.floor(encoded.length * 3 / 4) - (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
}

export function assertImageCapacity(candidate, nextDataUrl, replacedId = null) {
  const current = Array.isArray(candidate?.screenshots) ? candidate.screenshots : [];
  const count = current.filter((item) => item?.id !== replacedId).length + 1;
  if (count > MAX_IMAGE_COUNT) throw new RangeError("IMAGE_COUNT_LIMIT");
  const total = current.reduce((sum, item) => sum + (item?.id === replacedId ? 0 : dataUrlBytes(item?.dataUrl)), 0) + dataUrlBytes(nextDataUrl);
  if (total > MAX_IMAGE_TOTAL_BYTES) throw new RangeError("IMAGE_TOTAL_TOO_LARGE");
}

async function readImageHeaderDimensions(file) {
  // JPEG metadata may legally place SOF after a large APP segment. The input
  // is already capped at 10 MiB, so scan the bounded file instead of rejecting
  // a valid image merely because its header exceeds the old 64 KiB probe.
  const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, MAX_IMAGE_BYTES)).arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index])) {
    return { format: "image/png", width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 30 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === "VP8X" && bytes.length >= 30) return { format: "image/webp", width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) };
    if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
      const width = 1 + ((bytes[21] | (bytes[22] << 8)) & 0x3fff);
      const height = 1 + (((bytes[22] >> 6) | (bytes[23] << 2) | (bytes[24] << 10)) & 0x3fff);
      return { format: "image/webp", width, height };
    }
    if (chunk === "VP8 " && bytes.length >= 30) {
      for (let offset = 20; offset + 9 < bytes.length; offset += 1) if (bytes[offset] === 0x9d && bytes[offset + 1] === 0x01 && bytes[offset + 2] === 0x2a) return { format: "image/webp", width: view.getUint16(offset + 3, true) & 0x3fff, height: view.getUint16(offset + 5, true) & 0x3fff };
    }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      if (offset >= bytes.length) break;
      const marker = bytes[offset]; offset += 1;
      if (marker === 0x00) break;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (marker === 0xd9 || marker === 0xda) break;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        if (length < 11 || offset + 7 >= bytes.length) break;
        const components = bytes[offset + 7];
        if (!components || length !== 8 + components * 3 || offset + length > bytes.length) break;
        return { format: "image/jpeg", width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
      }
      offset += length;
    }
  }
  return null;
}

export function assertImageDimensions(width, height) {
  if (!width || !height || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS) throw new RangeError("IMAGE_PIXELS_TOO_LARGE");
}

export async function normalizeUploadedImage(file) {
  if (!(file instanceof File) || !ACCEPTED_IMAGE_TYPES.has(file.type)) throw new TypeError("IMAGE_TYPE_UNSUPPORTED");
  if (file.size > MAX_IMAGE_BYTES) throw new RangeError("IMAGE_INPUT_TOO_LARGE");
  if (typeof createImageBitmap !== "function") throw new Error("IMAGE_DECODE_UNAVAILABLE");
  const headerDimensions = await readImageHeaderDimensions(file);
  // The decoder must never be the first place we learn the dimensions. A malformed
  // or unsupported header is rejected before a potentially huge bitmap is allocated.
  if (!headerDimensions) throw new TypeError("IMAGE_DIMENSIONS_INVALID");
  if (headerDimensions.format !== file.type) throw new TypeError("IMAGE_TYPE_UNSUPPORTED");
  assertImageDimensions(headerDimensions.width, headerDimensions.height);
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height) throw new TypeError("IMAGE_DIMENSIONS_INVALID");
    assertImageDimensions(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("IMAGE_CANVAS_UNAVAILABLE");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let hasTransparency = false;
    for (let offset = 3; offset < pixels.length; offset += 4) {
      if (pixels[offset] < 255) { hasTransparency = true; break; }
    }
    // Re-encode to remove the original file metadata before it enters the draft.
    let blob = await canvasToBlob(canvas, "image/png");
    if (blob.size > MAX_IMAGE_BYTES) {
      // JPEG has no alpha channel. Keep transparent input lossless and report
      // the size limit instead of silently turning hidden areas opaque.
      if (hasTransparency) throw new RangeError("IMAGE_OUTPUT_TOO_LARGE");
      const flattened = document.createElement("canvas");
      flattened.width = bitmap.width;
      flattened.height = bitmap.height;
      const flattenedContext = flattened.getContext("2d");
      if (!flattenedContext) throw new Error("IMAGE_CANVAS_UNAVAILABLE");
      flattenedContext.fillStyle = "#ffffff";
      flattenedContext.fillRect(0, 0, bitmap.width, bitmap.height);
      flattenedContext.drawImage(canvas, 0, 0);
      blob = await canvasToBlob(flattened, "image/jpeg", .88);
    }
    if (blob.size > MAX_IMAGE_BYTES) throw new RangeError("IMAGE_OUTPUT_TOO_LARGE");
    return { dataUrl: await blobToDataUrl(blob), width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close?.();
  }
}
