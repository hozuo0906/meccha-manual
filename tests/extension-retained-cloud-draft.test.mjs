import test from "node:test";
import assert from "node:assert/strict";
import { handleExternalCloudClaimMessage } from "../apps/extension/background/cloud-claim.js";
import { createHandoffMetadata, findRecoverableHandoff, fingerprintDraft, handoffStorageKey } from "../apps/extension/editor/handoff.js";

function memoryIndexedDb(drafts) {
  return { open() {
    const request = {};
    queueMicrotask(() => {
      request.result = {
        close() {}, transaction() {
          const transaction = { objectStore() {
            return { get(id) { const r = {}; queueMicrotask(() => { r.result = structuredClone(drafts.get(id)); r.onsuccess?.(); queueMicrotask(() => transaction.oncomplete?.()); }); return r; },
              put(draft) { drafts.set(draft.id, structuredClone(draft)); const r = {}; queueMicrotask(() => { r.result = draft.id; r.onsuccess?.(); queueMicrotask(() => transaction.oncomplete?.()); }); return r; } };
          } };
          return transaction;
        }
      };
      request.onsuccess?.();
    });
    return request;
  } };
}

test("completion keeps local edits and selection, persists cloud receipt, and repeated prepare targets original manual", async () => {
  const saved = { chrome: globalThis.chrome, indexedDB: globalThis.indexedDB, OffscreenCanvas: globalThis.OffscreenCanvas, createImageBitmap: globalThis.createImageBitmap };
  const storage = new Map(); const drafts = new Map();
  globalThis.chrome = { storage: { local: {
    async get(key) { return key === null ? Object.fromEntries(storage) : { [key]: structuredClone(storage.get(key)) }; },
    async set(values) { for (const [key, value] of Object.entries(values)) storage.set(key, structuredClone(value)); }
  } } };
  globalThis.indexedDB = memoryIndexedDb(drafts);
  globalThis.createImageBitmap = async (blob) => ({ width: 1, height: 1, bytes: new Uint8Array(await blob.arrayBuffer()), close() {} });
  globalThis.OffscreenCanvas = class {
    getContext() { const self = this; return { canvas: self, save() {}, restore() {}, clearRect() {}, drawImage(bitmap) { self.bytes = bitmap.bytes; }, getImageData() { return { data: new Uint8Array([0, 0, 0, 255]) }; } }; }
    async convertToBlob() { return new Blob([this.bytes], { type: "image/png" }); }
  };
  const sender = { url: "https://meccha-manual-staging.meccha-iiyatsu.com/onboarding/continue" };
  const base = { schema: "meccha-manual/cloud-claim-v1", action: "save" };
  try {
    const original = { id: "retained", title: "元の手順書", description: "説明", selectedStepId: "step-17", updatedAt: "2026-10-01T00:00:00.000Z",
      steps: [{ id: "step-17", order: 1, instruction: "確認する", screenshotId: "used" }],
      screenshots: [{ id: "orphan", dataUrl: "data:image/png;base64,AQ==", masks: [], privacyReview: { reviewRequired: true } }, { id: "used", dataUrl: "data:image/png;base64,Ag==", masks: [], annotations: [{ id: "rectangle", type: "rectangle", x: 0, y: 0, width: .5, height: .5, color: "#087f7a", strokeWidth: 3 }] }] };
    drafts.set(original.id, original);
    const fingerprint = await fingerprintDraft(original);
    const metadata = createHandoffMetadata(original.id, "save", Date.now(), "a".repeat(32), original.updatedAt, fingerprint);
    storage.set(handoffStorageKey(metadata.handoffId), metadata);
    const begin = await handleExternalCloudClaimMessage({ ...base, type: "handoff.begin", handoffId: metadata.handoffId }, sender);
    const prepare = await handleExternalCloudClaimMessage({ ...base, type: "handoff.prepare", handoffId: metadata.handoffId }, sender);
    assert.deepEqual(prepare.assets, [{ assetSlot: 0, screenshotId: "used" }]);
    assert.deepEqual(prepare.draft.steps[0].annotations, original.screenshots[1].annotations);
    assert.equal("masks" in prepare.draft.steps[0], false);
    const started = await handleExternalCloudClaimMessage({ ...base, type: "handoff.asset.start", handoffId: metadata.handoffId, assetSlot: 0 }, sender);
    assert.equal(started.ok, true);
    const chunk = await handleExternalCloudClaimMessage({ ...base, type: "handoff.asset.chunk", handoffId: metadata.handoffId, assetSlot: 0, sequence: 0 }, sender);
    assert.equal(chunk.chunk, "Ag==", "filtered transfer slot uses the referenced screenshot bytes, never orphan bytes");
    const claimIntentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const identity = { operationId: begin.operationId, claimIntentId, draftFingerprint: fingerprint };
    assert.equal((await handleExternalCloudClaimMessage({ ...base, type: "handoff.finalize-pending", handoffId: metadata.handoffId, ...identity }, sender)).ok, true);
    const edited = { ...original, title: "転送中の新しい編集", selectedStepId: "step-17" };
    drafts.set(original.id, edited);
    const cloudRef = { workspaceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", manualId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", revisionId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", updatedAt: "2026-10-01T00:01:00.000Z", contentVersion: "a".repeat(32) };
    const complete = { ...base, type: "handoff.completed", handoffId: metadata.handoffId, ...identity, manualId: cloudRef.manualId, cloudRef };
    assert.deepEqual(await handleExternalCloudClaimMessage(complete, sender), { ok: true, status: "completed" });
    assert.equal(drafts.get(original.id).title, edited.title);
    assert.equal(drafts.get(original.id).selectedStepId, "step-17");
    assert.deepEqual(drafts.get(original.id).screenshots, original.screenshots);
    assert.equal(drafts.get(original.id).cloudRef.savedFingerprint, fingerprint);
    assert.deepEqual(await handleExternalCloudClaimMessage(complete, sender), { ok: true, status: "completed" });
    // An in-flight editor autosave may contain the older object; the independent receipt survives.
    drafts.set(original.id, edited);
    const nextFingerprint = await fingerprintDraft(edited);
    const next = createHandoffMetadata(original.id, "save", Date.now(), "a".repeat(32), edited.updatedAt, nextFingerprint);
    storage.set(handoffStorageKey(next.handoffId), next);
    const preparedAgain = await handleExternalCloudClaimMessage({ ...base, type: "handoff.prepare", handoffId: next.handoffId }, sender);
    assert.equal(preparedAgain.ok, true);
    assert.equal(preparedAgain.cloudRef.manualId, cloudRef.manualId);
    assert.equal(preparedAgain.cloudRef.updatedAt, cloudRef.updatedAt);
    const completionMessages = [];
    for (const seconds of [3, 2]) {
      const handoff = createHandoffMetadata(original.id, "save", Date.now(), "a".repeat(32), edited.updatedAt, nextFingerprint);
      storage.set(handoffStorageKey(handoff.handoffId), handoff);
      const operation = await handleExternalCloudClaimMessage({ ...base, type: "handoff.begin", handoffId: handoff.handoffId }, sender);
      const recovery = { operationId: operation.operationId, claimIntentId: crypto.randomUUID(), draftFingerprint: nextFingerprint };
      // Seed two previously recorded completions to exercise late-delivery recovery.
      // New concurrent claims are separately rejected by the per-draft gate below.
      storage.set(handoffStorageKey(handoff.handoffId), { ...handoff, ...recovery, status: "finalize-pending" });
      completionMessages.push({ ...base, type: "handoff.completed", handoffId: handoff.handoffId, ...recovery, manualId: cloudRef.manualId, cloudRef: { ...cloudRef, updatedAt: `2026-10-01T00:01:0${seconds}.000Z` } });
    }
    const receipts = await Promise.all(completionMessages.map((message) => handleExternalCloudClaimMessage(message, sender)));
    assert.ok(receipts.every((result) => result.ok));
    assert.equal(drafts.get(original.id).cloudRef.updatedAt, "2026-10-01T00:01:03.000Z", "late older completion never downgrades the durable receipt");
    storage.set(`meccha-manual:cloud-ref:${original.id}`, { manualId: cloudRef.manualId });
    assert.deepEqual(await handleExternalCloudClaimMessage({ ...base, type: "handoff.prepare", handoffId: next.handoffId }, sender), { ok: false, error: "CLOUD_REFERENCE_INCOMPLETE" }, "legacy incomplete receipts stop instead of creating another manual");
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});


test("pending save blocks another action's prepare/finalize and stale tabs cannot finalize a duplicate after completion", async () => {
  const saved = { chrome: globalThis.chrome, indexedDB: globalThis.indexedDB };
  const storage = new Map();
  const draft = { id: "cross-action", title: "手順書", description: "", updatedAt: "2026-10-01T00:00:00.000Z", steps: [], screenshots: [] };
  const drafts = new Map([[draft.id, draft]]);
  globalThis.chrome = { storage: { local: {
    async get(key) { return key === null ? Object.fromEntries(storage) : { [key]: structuredClone(storage.get(key)) }; },
    async set(values) { for (const [key, value] of Object.entries(values)) storage.set(key, structuredClone(value)); }
  } } };
  globalThis.indexedDB = memoryIndexedDb(drafts);
  const sender = { url: "https://meccha-manual-staging.meccha-iiyatsu.com/onboarding/continue" };
  try {
    const fingerprint = await fingerprintDraft(draft);
    const attempts = [];
    for (const action of ["save", "share"]) {
      const metadata = createHandoffMetadata(draft.id, action, Date.now(), "a".repeat(32), draft.updatedAt, fingerprint);
      storage.set(handoffStorageKey(metadata.handoffId), metadata);
      const base = { schema: "meccha-manual/cloud-claim-v1", action, handoffId: metadata.handoffId };
      const begin = await handleExternalCloudClaimMessage({ ...base, type: "handoff.begin" }, sender);
      assert.equal((await handleExternalCloudClaimMessage({ ...base, type: "handoff.prepare" }, sender)).ok, true);
      attempts.push({ ...base, operationId: begin.operationId, claimIntentId: crypto.randomUUID(), draftFingerprint: fingerprint, cloudRef: null });
    }
    const decisions = await Promise.all(attempts.map((attempt) => handleExternalCloudClaimMessage({ ...attempt, type: "handoff.finalize-pending" }, sender)));
    assert.equal(decisions.filter((result) => result.ok).length, 1);
    const winner = attempts[decisions.findIndex((result) => result.ok)];
    const loser = attempts[decisions.findIndex((result) => !result.ok)];
    assert.equal(decisions.find((result) => !result.ok).error, "DRAFT_CLAIM_PENDING");
    const prepareLoser = { schema: loser.schema, action: loser.action, handoffId: loser.handoffId, type: "handoff.prepare" };
    assert.equal(storage.get(handoffStorageKey(loser.handoffId)).status, "superseded");
    assert.deepEqual(await handleExternalCloudClaimMessage(prepareLoser, sender), { ok: false, error: "HANDOFF_EXPIRED_OR_UNKNOWN" });
    const cloudRef = { workspaceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", manualId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", revisionId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", updatedAt: "2026-10-01T00:01:00.000Z", contentVersion: "a".repeat(32) };
    assert.equal((await handleExternalCloudClaimMessage({ ...winner, type: "handoff.completed", manualId: cloudRef.manualId, cloudRef }, sender)).ok, true);
    assert.deepEqual(await handleExternalCloudClaimMessage({ ...loser, type: "handoff.finalize-pending" }, sender), { ok: false, error: "DRAFT_CLOUD_CHANGED" });
    const newMetadata = createHandoffMetadata(draft.id, loser.action, Date.now(), "a".repeat(32), draft.updatedAt, fingerprint);
    storage.set(handoffStorageKey(newMetadata.handoffId), newMetadata);
    const newBase = { schema: loser.schema, action: loser.action, handoffId: newMetadata.handoffId };
    const newOperation = await handleExternalCloudClaimMessage({ ...newBase, type: "handoff.begin" }, sender);
    const rePrepared = await handleExternalCloudClaimMessage({ ...newBase, type: "handoff.prepare" }, sender);
    assert.equal(rePrepared.cloudRef.manualId, cloudRef.manualId);
    const updatedClaimIntent = crypto.randomUUID();
    const updateMessage = { ...newBase, type: "handoff.finalize-pending", operationId: newOperation.operationId, claimIntentId: updatedClaimIntent, draftFingerprint: fingerprint, cloudRef: rePrepared.cloudRef };
    assert.equal((await handleExternalCloudClaimMessage(updateMessage, sender)).ok, true, "fresh update explicitly targets the confirmed cloud revision");
    storage.set(`meccha-manual:cloud-ref:${draft.id}`, { ...rePrepared.cloudRef, updatedAt: "2026-10-01T00:02:00.000Z", contentVersion: "b".repeat(32) });
    assert.deepEqual(await handleExternalCloudClaimMessage(updateMessage, sender), { ok: false, error: "DRAFT_CLOUD_CHANGED" }, "an older pending intent cannot be retargeted after another receipt advances");
    assert.equal(storage.get(handoffStorageKey(newMetadata.handoffId)).status, "finalize-pending", "old unknown outcomes remain available for status reconciliation");
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});

test("terminal expiry requires the bounded trusted-origin server result and exact recovery identity before releasing all output actions", async () => {
  const saved = { chrome: globalThis.chrome, indexedDB: globalThis.indexedDB, fetch: globalThis.fetch };
  const storage = new Map();
  const draft = { id: "expired-retained", title: "新しい編集を保持する", description: "", updatedAt: "2026-10-01T00:00:00.000Z", selectedStepId: "kept", steps: [], screenshots: [] };
  const drafts = new Map([[draft.id, draft]]);
  const local = { async get(key) { return key === null ? Object.fromEntries(storage) : { [key]: structuredClone(storage.get(key)) }; }, async set(entries) { for (const [key, value] of Object.entries(entries)) storage.set(key, structuredClone(value)); } };
  globalThis.chrome = { storage: { local } }; globalThis.indexedDB = memoryIndexedDb(drafts);
  const sender = { url: "https://meccha-manual-staging.meccha-iiyatsu.com/onboarding/continue" };
  const fingerprint = await fingerprintDraft({ ...draft, title: "古い保存内容" });
  const metadata = { ...createHandoffMetadata(draft.id, "save", Date.now() - 60 * 60 * 1000, "a".repeat(32), draft.updatedAt, fingerprint), status: "finalize-pending", operationId: "old-operation-12345678", claimIntentId: crypto.randomUUID() };
  const key = handoffStorageKey(metadata.handoffId);
  storage.set(key, metadata);
  const message = { schema: "meccha-manual/cloud-claim-v1", type: "handoff.expired", action: "save", handoffId: metadata.handoffId, operationId: metadata.operationId, claimIntentId: metadata.claimIntentId, draftFingerprint: fingerprint };
  const result = { status: "expired", claimIntentId: metadata.claimIntentId, operationId: metadata.operationId, workspaceId: crypto.randomUUID(), expiresAt: metadata.expiresAt };
  globalThis.fetch = async () => { throw new Error("extension must never fetch cloud APIs"); };
  try {
    for (const action of ["save", "share"]) assert.equal((await findRecoverableHandoff(draft.id, await fingerprintDraft(draft), local, action)).handoffId, metadata.handoffId, "local expiry and changed content do not abandon unknown outcome");
    for (const patch of [{ handoffId: "B".repeat(43) }, { operationId: "different-operation-123" }, { claimIntentId: crypto.randomUUID() }, { draftFingerprint: "0".repeat(64) }, { action: "share" }]) assert.equal((await handleExternalCloudClaimMessage({ ...message, ...patch }, sender)).ok, false);
    assert.equal((await handleExternalCloudClaimMessage(message, { url: "https://other.example/onboarding/continue" })).ok, false);
    assert.deepEqual(await handleExternalCloudClaimMessage(message, sender), { ok: false, error: "RECOVERY_UNCONFIRMED" }, "a local expiry signal without a server result never releases recovery");
    for (const invalid of [{ ...result, status: "pending" }, { ...result, status: "completed", manualId: crypto.randomUUID() }, { ...result, claimIntentId: crypto.randomUUID() }, { ...result, operationId: "different-operation-123" }, { ...result, workspaceId: "bad" }]) {
      assert.deepEqual(await handleExternalCloudClaimMessage({ ...message, claimResult: invalid }, sender), { ok: false, error: "RECOVERY_UNCONFIRMED" });
      assert.equal(storage.get(key).status, "finalize-pending");
    }
    assert.deepEqual(await handleExternalCloudClaimMessage({ ...message, claimResult: { error: "CLAIM_INTENT_NOT_FOUND" } }, sender), { ok: false, error: "RECOVERY_UNCONFIRMED" }, "revoked actor or workspace cannot release recovery");
    message.claimResult = result;
    storage.set(key, { ...metadata, sourceCloudRef: { workspaceId: crypto.randomUUID(), manualId: crypto.randomUUID(), revisionId: crypto.randomUUID(), updatedAt: draft.updatedAt, contentVersion: "a".repeat(32) } });
    assert.deepEqual(await handleExternalCloudClaimMessage(message, sender), { ok: false, error: "RECOVERY_UNCONFIRMED" }, "a different valid workspace cannot release the target handoff");
    for (const status of ["completion-pending", "completed"]) {
      storage.set(key, { ...metadata, status });
      assert.deepEqual(await handleExternalCloudClaimMessage(message, sender), { ok: false, error: "RECOVERY_NOT_FOUND" }, "a saved outcome can never be discarded as expired");
    }
    storage.set(key, metadata);
    const save = local.set; local.set = async () => { throw new Error("storage unavailable"); };
    assert.equal((await handleExternalCloudClaimMessage(message, sender)).ok, false);
    assert.equal(storage.get(key).status, "finalize-pending"); local.set = save;
    assert.deepEqual(await handleExternalCloudClaimMessage(message, sender), { ok: true, status: "expired" });
    assert.deepEqual(await handleExternalCloudClaimMessage(message, sender), { ok: true, status: "expired" }, "same terminal result is retryable");
    assert.deepEqual(drafts.get(draft.id), draft, "expiry never mutates local content or selection");
    for (const action of ["save", "share"]) assert.equal(await findRecoverableHandoff(draft.id, await fingerprintDraft(draft), local, action), null);
    for (const type of ["handoff.prepare", "handoff.begin"]) assert.equal((await handleExternalCloudClaimMessage({ schema: message.schema, type, action: "save", handoffId: metadata.handoffId }, sender)).ok, false);
    const { claimResult, ...identity } = message;
    assert.equal((await handleExternalCloudClaimMessage({ ...identity, type: "handoff.finalize-pending", cloudRef: null }, sender)).ok, false);
    assert.equal((await handleExternalCloudClaimMessage({ ...identity, type: "handoff.completed", manualId: crypto.randomUUID() }, sender)).ok, false, "late completion cannot resurrect a terminal handoff");
    const freshFingerprint = await fingerprintDraft(draft);
    const fresh = createHandoffMetadata(draft.id, "share", Date.now(), "a".repeat(32), draft.updatedAt, freshFingerprint);
    storage.set(handoffStorageKey(fresh.handoffId), fresh);
    const next = { schema: message.schema, action: "share", handoffId: fresh.handoffId };
    const begun = await handleExternalCloudClaimMessage({ ...next, type: "handoff.begin" }, sender);
    assert.equal((await handleExternalCloudClaimMessage({ ...next, type: "handoff.prepare" }, sender)).ok, true);
    assert.equal((await handleExternalCloudClaimMessage({ ...next, type: "handoff.finalize-pending", operationId: begun.operationId, claimIntentId: crypto.randomUUID(), draftFingerprint: freshFingerprint, cloudRef: null }, sender)).ok, true, "terminal expiry releases the draft-level gate for the next save/share");
  } finally { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } }
});
