/** Safe editable overlay contract. Base-image privacy masks are never reversible metadata. */
export interface ManualAnnotation {
  id: string; type: "text" | "rectangle" | "ellipse" | "arrow"; color: string; strokeWidth: number;
  x?: number; y?: number; width?: number; height?: number; x1?: number; y1?: number; x2?: number; y2?: number;
  text?: string; fontSize?: number;
}
const colorPattern = /^#[0-9a-f]{6}$/iu;
const types = new Set(["text", "rectangle", "ellipse", "arrow"]);
const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const bounded = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const invalid = (): never => { throw new TypeError("ANNOTATIONS_INVALID"); };
export function normalizeManualAnnotations(value: unknown): ManualAnnotation[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100) return invalid();
  const ids = new Set<string>();
  const result = value.map((item): ManualAnnotation => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return invalid();
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || !row.id || Array.from(row.id).length > 128 || controls.test(row.id) || ids.has(row.id) || typeof row.type !== "string" || !types.has(row.type)) return invalid();
    ids.add(row.id);
    const keys = ["id", "type", "color", "strokeWidth", ...(row.type === "arrow" ? ["x1", "y1", "x2", "y2"] : ["x", "y", "width", "height"]), ...(row.type === "text" ? ["text", "fontSize"] : [])];
    if (Object.keys(row).some((key) => !keys.includes(key))) return invalid();
    const color = row.color === undefined ? "#087f7a" : row.color;
    const strokeWidth = row.strokeWidth === undefined ? 3 : row.strokeWidth;
    if (typeof color !== "string" || !colorPattern.test(color) || !bounded(strokeWidth, 1, 16)) return invalid();
    if (row.type === "arrow") {
      const { x1, y1, x2, y2 } = row;
      if (!bounded(x1, 0, 1) || !bounded(y1, 0, 1) || !bounded(x2, 0, 1) || !bounded(y2, 0, 1) || (x1 === x2 && y1 === y2)) return invalid();
      return { id: row.id, type: "arrow", x1, y1, x2, y2, color: color.toLowerCase(), strokeWidth };
    }
    const { x, y, width, height } = row;
    if (!bounded(x, 0, 1) || !bounded(y, 0, 1) || !bounded(width, Number.MIN_VALUE, 1) || !bounded(height, Number.MIN_VALUE, 1) || x + width > 1 + Number.EPSILON * 4 || y + height > 1 + Number.EPSILON * 4) return invalid();
    const base: ManualAnnotation = { id: row.id, type: row.type as "text" | "rectangle" | "ellipse", x, y, width, height, color: color.toLowerCase(), strokeWidth };
    if (row.type === "text") {
      const fontSize = row.fontSize === undefined ? 24 : row.fontSize;
      if (typeof row.text !== "string" || Array.from(row.text).length < 1 || Array.from(row.text).length > 500 || controls.test(row.text) || !bounded(fontSize, 10, 96)) return invalid();
      return { ...base, text: row.text, fontSize };
    }
    return base;
  });
  if (new TextEncoder().encode(JSON.stringify(result)).length > 65536) return invalid();
  return result;
}
export function readStoredManualAnnotations(value: unknown): ManualAnnotation[] {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  // Legacy images have already flattened overlays and the previous '{}' default.
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.keys(parsed).length === 0) return [];
  return normalizeManualAnnotations(parsed);
}
