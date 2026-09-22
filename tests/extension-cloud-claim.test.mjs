import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { cleanDraft, safeMessage } from "../apps/extension/background/cloud-claim.js";

const validMessage = { schema: "meccha-manual/cloud-claim-v1", type: "handoff.prepare", handoffId: "A".repeat(43), action: "save" };

test("external claim message schema rejects unknown fields and credential shaped values", () => {
  assert.equal(safeMessage(validMessage, "handoff.prepare"), true);
  assert.equal(safeMessage({ ...validMessage, extra: true }, "handoff.prepare"), false);
  assert.equal(safeMessage({ ...validMessage, accessToken: "secret" }, "handoff.prepare"), false);
  assert.equal(safeMessage({ ...validMessage, type: "handoff.unknown" }, "handoff.unknown"), false);
});

test("draft validation fails closed instead of dropping invalid content", () => {
  const draft = { title: "手順書", description: "説明", steps: [{ id: "s1", order: 1, instruction: "保存する" }], screenshots: [{ id: "image", dataUrl: "data:image/png;base64,AA==", masks: [] }] };
  assert.deepEqual(cleanDraft(draft).steps, draft.steps);
  assert.equal(cleanDraft({ ...draft, steps: [...draft.steps, { id: "bad", order: 2, instruction: "x".repeat(501) }] }), null);
  assert.equal(cleanDraft({ ...draft, screenshots: [{ ...draft.screenshots[0], masks: [{ x: 0.9, y: 0, width: 0.2, height: 0.2 }] }] }), null);
});

test("extension distribution is pinned to staging and version 0.1.2", async () => {
  const manifest = JSON.parse(await readFile("apps/extension/manifest.json", "utf8"));
  assert.equal(manifest.version, "0.1.2");
  assert.deepEqual(manifest.externally_connectable.matches, ["https://meccha-manual-staging.meccha-iiyatsu.com/*"]);
});
