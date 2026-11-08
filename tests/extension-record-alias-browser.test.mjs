import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workerSource = await readFile(new URL("../apps/extension/background/service-worker.js", import.meta.url), "utf8");

test("native recording browser contract does not require automatic value replacement", () => {
  assert.doesNotMatch(workerSource, /takeMaskedScreenshot|captureWithMaskBoundary|capturePrivacyAliases|privateAliasAllocations/);
  assert.match(workerSource, /captureVisibleTab/);
  assert.match(workerSource, /TARGET_TAB_NOT_VISIBLE/);
});
