export const MAX_ANNOTATIONS = 100;
export const MAX_ANNOTATION_TEXT = 500;
export const ANNOTATION_TYPES = new Set(["text", "rectangle", "ellipse", "arrow"]);

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function coordinate(value) {
  return finite(value) && value >= 0 && value <= 1 ? value : null;
}

function dimension(value, start) {
  return finite(value) && value > 0 && finite(start) && start >= 0 && start + value <= 1 + Number.EPSILON * 4 ? value : null;
}

function idFor(value) {
  return typeof value === "string" && value ? value : crypto.randomUUID();
}

function normalizedStrokeWidth(value) {
  const strokeWidth = value === undefined ? 3 : value;
  return finite(strokeWidth) && strokeWidth >= 1 && strokeWidth <= 16 ? strokeWidth : null;
}

function normalizedColor(value) {
  const color = value === undefined ? "#087f7a" : value;
  return typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : null;
}

function normalizedFontSize(value) {
  const fontSize = value === undefined ? 24 : value;
  return finite(fontSize) && fontSize >= 10 && fontSize <= 96 ? fontSize : null;
}

export function normalizeAnnotation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !ANNOTATION_TYPES.has(value.type)) return null;
  const color = normalizedColor(value.color);
  const strokeWidth = normalizedStrokeWidth(value.strokeWidth);
  if (color === null || strokeWidth === null) return null;
  if (value.type === "arrow") {
    const x1 = coordinate(value.x1);
    const y1 = coordinate(value.y1);
    const x2 = coordinate(value.x2);
    const y2 = coordinate(value.y2);
    if ([x1, y1, x2, y2].some((item) => item === null) || (x1 === x2 && y1 === y2)) return null;
    return { id: idFor(value.id), type: value.type, x1, y1, x2, y2, color, strokeWidth };
  }
  const x = coordinate(value.x);
  const y = coordinate(value.y);
  const width = dimension(value.width, x ?? 1);
  const height = dimension(value.height, y ?? 1);
  if (x === null || y === null || width === null || height === null) return null;
  const result = { id: idFor(value.id), type: value.type, x, y, width, height, color, strokeWidth };
  if (value.type === "text") {
    if (typeof value.text !== "string" || value.text.length === 0 || Array.from(value.text).length > MAX_ANNOTATION_TEXT) return null;
    const fontSize = normalizedFontSize(value.fontSize);
    if (fontSize === null) return null;
    result.text = value.text;
    result.fontSize = fontSize;
  }
  return result;
}

export function normalizeAnnotations(values) {
  if (values === undefined) return [];
  if (!Array.isArray(values) || values.length > MAX_ANNOTATIONS) return null;
  if (values.some((value) => !value || typeof value !== "object" || Array.isArray(value) || typeof value.id !== "string" || !value.id)) return null;
  const result = values.map(normalizeAnnotation);
  const ids = new Set();
  for (const value of result) {
    if (!value || typeof value.id !== "string" || !value.id || ids.has(value.id)) return null;
    ids.add(value.id);
  }
  return result;
}

export function cloneAnnotations(values) {
  if (values === undefined) return [];
  if (!Array.isArray(values)) return null;
  return normalizeAnnotations(values.map((value) => value && typeof value === "object" ? { ...value } : value));
}

export function annotationBounds(annotation) {
  if (annotation?.type === "arrow") {
    return { x: Math.min(annotation.x1, annotation.x2), y: Math.min(annotation.y1, annotation.y2), width: Math.abs(annotation.x2 - annotation.x1), height: Math.abs(annotation.y2 - annotation.y1) };
  }
  return { x: annotation.x, y: annotation.y, width: annotation.width, height: annotation.height };
}

export function annotationAtPoint(annotation, x, y, tolerance = 0.025) {
  const bounds = annotationBounds(annotation);
  return x >= bounds.x - tolerance && x <= bounds.x + bounds.width + tolerance && y >= bounds.y - tolerance && y <= bounds.y + bounds.height + tolerance;
}

function clampedDelta(min, max, value) {
  if (!finite(value)) return 0;
  return Math.max(min, Math.min(max, value));
}

export function moveAnnotation(annotation, dx, dy) {
  const copy = { ...annotation };
  if (copy.type === "arrow") {
    const minX = -Math.min(copy.x1, copy.x2);
    const maxX = 1 - Math.max(copy.x1, copy.x2);
    const minY = -Math.min(copy.y1, copy.y2);
    const maxY = 1 - Math.max(copy.y1, copy.y2);
    const shiftX = clampedDelta(minX, maxX, dx);
    const shiftY = clampedDelta(minY, maxY, dy);
    copy.x1 += shiftX; copy.y1 += shiftY; copy.x2 += shiftX; copy.y2 += shiftY;
    return copy;
  }
  copy.x += clampedDelta(-copy.x, 1 - copy.width - copy.x, dx);
  copy.y += clampedDelta(-copy.y, 1 - copy.height - copy.y, dy);
  return copy;
}

export function resizeAnnotation(annotation, width, height) {
  if (annotation.type !== "arrow") {
    const nextWidth = finite(width) ? Math.max(0.001, Math.min(1 - annotation.x, width)) : annotation.width;
    const nextHeight = finite(height) ? Math.max(0.001, Math.min(1 - annotation.y, height)) : annotation.height;
    return { ...annotation, width: nextWidth, height: nextHeight };
  }
  const bounds = annotationBounds(annotation);
  const nextWidth = finite(width) ? Math.max(0.001, Math.min(1 - bounds.x, width)) : bounds.width;
  const nextHeight = finite(height) ? Math.max(0.001, Math.min(1 - bounds.y, height)) : bounds.height;
  const scaleX = bounds.width > 0 ? nextWidth / bounds.width : 1;
  const scaleY = bounds.height > 0 ? nextHeight / bounds.height : 1;
  return {
    ...annotation,
    x1: bounds.x + (annotation.x1 - bounds.x) * scaleX,
    y1: bounds.y + (annotation.y1 - bounds.y) * scaleY,
    x2: bounds.x + (annotation.x2 - bounds.x) * scaleX,
    y2: bounds.y + (annotation.y2 - bounds.y) * scaleY
  };
}
