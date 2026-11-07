import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeCaptureEvent } from "../apps/extension/capture/privacy.js";

const workerSource = await readFile(new URL("../apps/extension/background/service-worker.js", import.meta.url), "utf8");

test("recording normalization keeps event identity while excluding input values", () => {
  const event = normalizeCaptureEvent({
    kind: "input",
    at: 10,
    eventId: "input:1",
    value: "Synthetic Input Value",
    target: { tagName: "input", type: "text", ariaLabel: "Email" }
  });
  assert.deepEqual(event, { kind: "input", at: 10, eventId: "input:1", label: "入力欄" });
  assert.doesNotMatch(JSON.stringify(event), /Synthetic Input Value/);
});

test("native capture source has no automatic mask or alias screenshot path", () => {
  assert.doesNotMatch(workerSource, /takeMaskedScreenshot|captureWithMaskBoundary|installSensitiveMasks/);
  assert.doesNotMatch(workerSource, /capturePrivacyAliases|privateAliasAllocations/);
});

test("capture normalization rejects values from click metadata as well", () => {
  const event = normalizeCaptureEvent({
    kind: "click",
    at: 12,
    eventId: "click:1",
    value: "Synthetic Input Value",
    target: { tagName: "button", visibleText: "保存" }
  });
  assert.equal(event.eventId, "click:1");
  assert.doesNotMatch(JSON.stringify(event), /Synthetic Input Value/);
});
