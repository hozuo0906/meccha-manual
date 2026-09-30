import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_ANNOTATIONS,
  MAX_ANNOTATION_TEXT,
  annotationBounds,
  cloneAnnotations,
  moveAnnotation,
  normalizeAnnotation,
  normalizeAnnotations,
  resizeAnnotation
} from "../apps/extension/editor/image-annotations.js";
import { drawAnnotations, drawMasks, drawScreenshot } from "../apps/extension/editor/image-renderer.js";

const rectangle = (overrides = {}) => ({ id: "r1", type: "rectangle", x: 0.1, y: 0.2, width: 0.3, height: 0.2, color: "#dc2626", strokeWidth: 3, ...overrides });

test("annotation validator accepts the schema and rejects coercion, bounds, type, and size violations", () => {
  assert.deepEqual(normalizeAnnotation(rectangle()), rectangle());
  assert.equal(normalizeAnnotation(rectangle({ x: "0.1" })), null);
  assert.equal(normalizeAnnotation(rectangle({ width: true })), null);
  assert.equal(normalizeAnnotation(rectangle({ x: NaN })), null);
  assert.equal(normalizeAnnotation(rectangle({ color: "red" })), null);
  assert.equal(normalizeAnnotation(rectangle({ strokeWidth: 17 })), null);
  assert.equal(normalizeAnnotation(rectangle({ x: 0.9, width: 0.2 })), null);
  assert.ok(normalizeAnnotation(rectangle({ x: 0.8, y: 0.8, width: 0.2, height: 0.2 })));
  assert.ok(normalizeAnnotation({ id: "e1", type: "ellipse", x: 0.8, y: 0.8, width: 0.2, height: 0.2 }));
  assert.ok(normalizeAnnotation({ id: "t-edge", type: "text", x: 0.8, y: 0.8, width: 0.2, height: 0.2, text: "端" }));
  assert.equal(normalizeAnnotation({ id: "t1", type: "text", x: 0, y: 0, width: 1, height: 1, text: "x" } ).fontSize, 24);
  assert.equal(normalizeAnnotation({ id: "t1", type: "text", x: 0, y: 0, width: 1, height: 1, text: "x".repeat(MAX_ANNOTATION_TEXT + 1) }), null);
  assert.equal(normalizeAnnotation({ id: "a1", type: "arrow", x1: 0.2, y1: 0.2, x2: 0.2, y2: 0.2, color: "#087f7a", strokeWidth: 3 }), null);
  assert.equal(normalizeAnnotation({ id: "a1", type: "arrow", x1: "0.2", y1: 0.2, x2: 0.3, y2: 0.3, color: "#087f7a", strokeWidth: 3 }), null);
});

test("annotation arrays reject invalid, duplicate, and over-limit entries without converting them", () => {
  assert.deepEqual(normalizeAnnotations(undefined), []);
  assert.equal(normalizeAnnotations({}), null);
  assert.equal(normalizeAnnotations([rectangle({ id: undefined })]), null);
  assert.equal(normalizeAnnotations([rectangle(), rectangle({ id: "r1" })]), null);
  assert.equal(normalizeAnnotations(Array.from({ length: MAX_ANNOTATIONS + 1 }, (_, index) => rectangle({ id: `r${index}` }))), null);
  assert.equal(cloneAnnotations("bad"), null);
  assert.equal(cloneAnnotations([rectangle({ x: "bad" })]), null);
});

test("move clamps an annotation as one shape and resize preserves arrow direction", () => {
  const arrow = { id: "a1", type: "arrow", x1: 0.2, y1: 0.2, x2: 0.8, y2: 0.6, color: "#2563eb", strokeWidth: 3 };
  const moved = moveAnnotation(arrow, 0.5, 0.5);
  assert.ok(Math.abs(moved.x1 - 0.4) < Number.EPSILON * 4);
  assert.equal(moved.x2, 1);
  assert.ok(Math.abs(moved.y1 - 0.6) < Number.EPSILON * 4);
  assert.equal(moved.y2, 1);
  const resized = resizeAnnotation(arrow, 0.3, 0.2);
  assert.ok(resized.x2 > resized.x1);
  assert.ok(resized.y2 > resized.y1);
  const resizedBounds = annotationBounds(resized);
  assert.ok(Math.abs(resizedBounds.x - 0.2) < Number.EPSILON * 4);
  assert.ok(Math.abs(resizedBounds.y - 0.2) < Number.EPSILON * 4);
  assert.ok(Math.abs(resizedBounds.width - 0.3) < Number.EPSILON * 4);
  assert.ok(Math.abs(resizedBounds.height - 0.2) < Number.EPSILON * 4);
  const rectangleMoved = moveAnnotation(rectangle(), -1, 1);
  assert.deepEqual({ x: rectangleMoved.x, y: rectangleMoved.y }, { x: 0, y: 0.8 });
  assert.ok(normalizeAnnotation(moveAnnotation({ ...rectangle(), x: 0.8, y: 0.8, width: 0.2, height: 0.2 }, 0.5, 0.5)));
});

function contextSpy() {
  const calls = [];
  const context = {
    canvas: { width: 0, height: 0 },
    save() { calls.push("save"); }, restore() { calls.push("restore"); }, clearRect() { calls.push("clear"); }, drawImage() { calls.push("image"); },
    fillText() { calls.push("text"); }, measureText(value) { return { width: Array.from(value).length * 8 }; }, strokeRect() { calls.push("rectangle"); },
    beginPath() { calls.push("path"); }, ellipse() { calls.push("ellipse"); }, moveTo() {}, lineTo() {}, stroke() { calls.push("stroke"); }, fillRect() { calls.push("mask"); }
  };
  return { context, calls };
}

test("renderer validates all layers before drawing and composites annotations before masks", () => {
  const { context, calls } = contextSpy();
  assert.throws(() => drawScreenshot(context, { width: 10, height: 10 }, { annotations: [rectangle({ x: "bad" })], masks: [] }), /invalid annotations/);
  assert.deepEqual(calls, []);
  assert.throws(() => drawMasks(context, [{ x: 0, y: 0, width: 0.5, height: 0.5 }, { x: 0.8, y: 0, width: 0.5, height: 0.5 }], 10, 10), /invalid mask/);
  assert.deepEqual(calls, []);
  drawScreenshot(context, { width: 10, height: 10 }, {
    annotations: [rectangle(), { id: "t1", type: "text", x: 0.1, y: 0.1, width: 0.5, height: 0.5, text: "承認", color: "#087f7a", strokeWidth: 2, fontSize: 12 }],
    masks: [{ x: 0.5, y: 0.5, width: 0.2, height: 0.2 }]
  });
  assert.deepEqual(calls.filter((call) => ["image", "rectangle", "text", "mask"].includes(call)), ["image", "rectangle", "text", "mask"]);
});
