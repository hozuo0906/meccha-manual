import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { cleanDraft, safeMessage } from "../apps/extension/background/cloud-claim.js";
import { canonicalDraftJson, createHandoffMetadata, fingerprintDraft, pruneExpiredHandoffs } from "../apps/extension/editor/handoff.js";

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
  assert.equal(cleanDraft({ ...draft, steps: [{ ...draft.steps[0], screenshotId: "missing" }] }), null);
  assert.equal(cleanDraft({ ...draft, screenshots: [draft.screenshots[0], draft.screenshots[0]] }), null);
});

test("handoff metadata carries only a draft fingerprint for completion CAS", async () => {
  const draft = { id: "draft-1", title: "手順書", description: "説明", updatedAt: "2026-09-23T00:00:00.000Z", steps: [{ id: "s1", order: 1, instruction: "保存する", screenshotId: "image" }], screenshots: [{ id: "image", dataUrl: "data:image/png;base64,AA==", masks: [] }] };
  const fingerprint = await fingerprintDraft(draft);
  const metadata = createHandoffMetadata(draft.id, "save", Date.now(), "a".repeat(32), draft.updatedAt, fingerprint);
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(metadata.draftFingerprint, fingerprint);
  assert.equal(JSON.stringify(metadata).includes(draft.description), false);
  assert.notEqual(await fingerprintDraft({ ...draft, steps: [{ ...draft.steps[0], instruction: "別の内容" }] }), fingerprint);
  assert.equal(canonicalDraftJson(draft).includes(draft.screenshots[0].dataUrl), true);
});

test("expired completion-pending handoff remains available for cleanup recovery", async () => {
  const removed = [];
  await pruneExpiredHandoffs({
    async get() { return { "meccha-manual:handoff:pending": { status: "completion-pending", expiresAt: "2026-09-20T00:00:00.000Z" }, "meccha-manual:handoff:old": { status: "active", expiresAt: "2026-09-20T00:00:00.000Z" } }; },
    async remove(keys) { removed.push(...keys); }
  }, Date.parse("2026-09-23T00:00:00.000Z"));
  assert.deepEqual(removed, ["meccha-manual:handoff:old"]);
});

test("extension distribution is pinned to staging and version 0.1.2", async () => {
  const manifest = JSON.parse(await readFile("apps/extension/manifest.json", "utf8"));
  assert.equal(manifest.version, "0.1.2");
  assert.deepEqual(manifest.externally_connectable.matches, ["https://meccha-manual-staging.meccha-iiyatsu.com/*"]);
});
