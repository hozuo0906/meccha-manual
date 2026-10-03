import { normalizeAnnotations } from "./image-annotations.js";

function normalizedMasks(masks) {
  if (masks === undefined) return [];
  if (!Array.isArray(masks)) throw new TypeError("invalid masks");
  const result = masks.map((mask) => {
    if (!mask || typeof mask !== "object" || Array.isArray(mask)) throw new TypeError("invalid mask");
    const values = [mask.x, mask.y, mask.width, mask.height];
    if (values.some((value) => typeof value !== "number" || !Number.isFinite(value)) || values.some((value) => value < 0 || value > 1) || values[2] <= 0 || values[3] <= 0 || values[0] + values[2] > 1 || values[1] + values[3] > 1) throw new TypeError("invalid mask");
    return { x: values[0], y: values[1], width: values[2], height: values[3] };
  });
  return result;
}

function drawText(context, annotation, width, height) {
  const maxWidth = annotation.width * width;
  const lineHeight = annotation.fontSize * 1.2;
  const maxLines = Math.max(1, Math.floor((annotation.height * height) / lineHeight));
  const maxCharacters = Math.max(1, Math.floor(maxWidth / annotation.fontSize));
  const lines = [];
  for (const paragraph of annotation.text.split("\n")) {
    let line = "";
    for (const character of Array.from(paragraph)) {
      const candidate = line + character;
      if (line && Array.from(candidate).length > maxCharacters) {
        lines.push(line);
        line = character;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  context.textBaseline = "top";
  lines.slice(0, maxLines).forEach((line, index) => context.fillText(line, annotation.x * width, annotation.y * height + index * lineHeight, maxWidth));
}

function drawReplacement(context, annotation, width, height) {
  const left = Math.floor(annotation.x * width);
  const top = Math.floor(annotation.y * height);
  const right = Math.ceil((annotation.x + annotation.width) * width);
  const bottom = Math.ceil((annotation.y + annotation.height) * height);
  const boxWidth = Math.max(1, right - left);
  const boxHeight = Math.max(1, bottom - top);
  context.save();
  context.fillStyle = "#ffffff";
  context.fillRect(left, top, boxWidth, boxHeight);
  context.fillStyle = "#111827";
  const padding = Math.min(4, Math.floor(boxWidth / 8));
  const text = String(annotation.text || "");
  let fontSize = Math.max(8, Math.min(Number(annotation.fontSize) || 24, boxHeight - padding * 2));
  while (fontSize > 8) {
    context.font = `${fontSize}px sans-serif`;
    if (context.measureText(text).width <= Math.max(1, boxWidth - padding * 2)) break;
    fontSize -= 1;
  }
  context.font = `${fontSize}px sans-serif`;
  context.textBaseline = "top";
  context.fillText(text, left + padding, top + Math.max(0, Math.floor((boxHeight - fontSize) / 2)), Math.max(1, boxWidth - padding * 2));
  context.restore();
}

export function drawAnnotations(context, annotations, width, height) {
  const valid = normalizeAnnotations(annotations);
  if (valid === null) throw new TypeError("invalid annotations");
  context.save();
  context.lineJoin = "round";
  context.lineCap = "round";
  for (const annotation of valid) {
    const color = annotation.color;
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = annotation.strokeWidth;
    if (annotation.type === "replacement") {
      drawReplacement(context, annotation, width, height);
    } else if (annotation.type === "text") {
      context.font = `${annotation.fontSize}px sans-serif`;
      drawText(context, annotation, width, height);
    } else if (annotation.type === "rectangle") {
      context.strokeRect(annotation.x * width, annotation.y * height, annotation.width * width, annotation.height * height);
    } else if (annotation.type === "ellipse") {
      context.beginPath();
      context.ellipse((annotation.x + annotation.width / 2) * width, (annotation.y + annotation.height / 2) * height, annotation.width * width / 2, annotation.height * height / 2, 0, 0, Math.PI * 2);
      context.stroke();
    } else {
      const x1 = annotation.x1 * width, y1 = annotation.y1 * height, x2 = annotation.x2 * width, y2 = annotation.y2 * height;
      context.beginPath(); context.moveTo(x1, y1); context.lineTo(x2, y2); context.stroke();
      const angle = Math.atan2(y2 - y1, x2 - x1); const length = Math.max(8, annotation.strokeWidth * 4);
      context.beginPath(); context.moveTo(x2, y2); context.lineTo(x2 - Math.cos(angle - Math.PI / 6) * length, y2 - Math.sin(angle - Math.PI / 6) * length); context.moveTo(x2, y2); context.lineTo(x2 - Math.cos(angle + Math.PI / 6) * length, y2 - Math.sin(angle + Math.PI / 6) * length); context.stroke();
    }
  }
  context.restore();
}

export function drawMasks(context, masks, width, height) {
  const valid = normalizedMasks(masks);
  context.save(); context.fillStyle = "#111827";
  for (const mask of valid) {
    const left = Math.floor(mask.x * width), top = Math.floor(mask.y * height), right = Math.ceil((mask.x + mask.width) * width), bottom = Math.ceil((mask.y + mask.height) * height);
    context.fillRect(left, top, right - left, bottom - top);
  }
  context.restore();
}

// Irreversible redaction must preserve the local painter order. When a mask
// exists, flatten every annotation below it, including partially hidden text.
// Only the unmasked case may retain editable annotation metadata in exports.
export function cloudImageLayers(screenshot) {
  const annotations = normalizeAnnotations(screenshot?.annotations);
  const masks = normalizedMasks(screenshot?.masks);
  if (annotations === null) throw new TypeError("invalid annotations");
  const hasReplacement = annotations.some((annotation) => annotation.type === "replacement");
  return masks.length || hasReplacement ? { baseAnnotations: annotations, annotations: [], masks } : { baseAnnotations: [], annotations, masks };
}

export function drawScreenshot(context, image, screenshot) {
  const width = image?.naturalWidth || image?.width;
  const height = image?.naturalHeight || image?.height;
  if (!image || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new TypeError("invalid image");
  const validAnnotations = normalizeAnnotations(screenshot?.annotations);
  const validMasks = normalizedMasks(screenshot?.masks);
  if (validAnnotations === null) throw new TypeError("invalid annotations");
  context.canvas.width = width; context.canvas.height = height;
  context.clearRect(0, 0, width, height); context.drawImage(image, 0, 0, width, height);
  drawAnnotations(context, validAnnotations, width, height);
  drawMasks(context, validMasks, width, height);
}
