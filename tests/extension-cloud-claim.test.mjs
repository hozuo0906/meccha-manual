import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { cleanDraft, handleExternalCloudClaimMessage, safeMessage } from "../apps/extension/background/cloud-claim.js";
import { buildContinueUrl, canonicalDraftJson, createHandoffMetadata, findRecoverableHandoff, fingerprintDraft, handoffReadyStorageKey, handoffStorageKey, legacyFingerprintDraft, pruneExpiredHandoffs, withHandoffDraftLock } from "../apps/extension/editor/handoff.js";

const validMessage = { schema: "meccha-manual/cloud-claim-v1", type: "handoff.prepare", handoffId: "A".repeat(43), action: "save" };

test("external claim message schema rejects unknown fields and credential shaped values", () => {
  assert.equal(safeMessage(validMessage, "handoff.prepare"), true);
  assert.equal(safeMessage({ ...validMessage, type: "handoff.begin" }, "handoff.begin"), true);
  assert.equal(safeMessage({ ...validMessage, extra: true }, "handoff.prepare"), false);
  assert.equal(safeMessage({ ...validMessage, accessToken: "secret" }, "handoff.prepare"), false);
  assert.equal(safeMessage({ ...validMessage, type: "handoff.unknown" }, "handoff.unknown"), false);
  assert.equal(safeMessage({ schema: validMessage.schema, type: "handoff.finalize-pending", handoffId: validMessage.handoffId, action: "save", operationId: "O".repeat(43), claimIntentId: "00000000-0000-4000-8000-000000000000", draftFingerprint: "a".repeat(64) }, "handoff.finalize-pending"), true);
  assert.equal(safeMessage({ schema: validMessage.schema, type: "handoff.recovery", handoffId: validMessage.handoffId, action: "save" }, "handoff.recovery"), true);
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

test("draft fingerprint stays canonical across timestamp-only saves", async () => {
  const draft = { id: "draft-same-content", title: "手順書", description: "説明", updatedAt: "2026-09-23T00:00:00.000Z", steps: [{ id: "s1", order: 1, instruction: "保存する" }], screenshots: [] };
  assert.equal(await fingerprintDraft({ ...draft, updatedAt: "2026-09-23T00:01:00.000Z" }), await fingerprintDraft(draft));
});

test("expired completion-pending handoff remains available for cleanup recovery", async () => {
  const removed = [];
  await pruneExpiredHandoffs({
    async get() { return { "meccha-manual:handoff:pending": { status: "completion-pending", expiresAt: "2026-09-20T00:00:00.000Z" }, "meccha-manual:handoff:finalize": { status: "finalize-pending", expiresAt: "2026-09-20T00:00:00.000Z" }, "meccha-manual:handoff:old": { status: "active", expiresAt: "2026-09-20T00:00:00.000Z" } }; },
    async remove(keys) { removed.push(...keys); }
  }, Date.parse("2026-09-23T00:00:00.000Z"));
  assert.deepEqual(removed, ["meccha-manual:handoff:old"]);
});

test("pending handoff recovery is reused for the same draft even after a draft edit", async () => {
  const storage = {
    async get() { return {
      "meccha-manual:handoff:pending": {
        handoffId: "A".repeat(43), draftId: "draft-1", draftFingerprint: "b".repeat(64), outputAction: "save",
        status: "finalize-pending", operationId: "O".repeat(43), claimIntentId: "00000000-0000-4000-8000-000000000000"
      }
    }; }
  };
  const recovered = await findRecoverableHandoff("draft-1", "a".repeat(64), storage);
  assert.equal(recovered.handoffId, "A".repeat(43));
  assert.match(buildContinueUrl("https://meccha-manual-staging.meccha-iiyatsu.com", recovered.handoffId, "b".repeat(32), recovered), /operationId=O{43}&claimIntentId=00000000-0000-4000-8000-000000000000&draftFingerprint=b{64}$/);
});

test("fresh handoff is reused only for the same draft content and does not add recovery params", async () => {
  const fingerprint = "a".repeat(64);
  const storage = {
    async get() { return {
      "meccha-manual:handoff:fresh": {
        handoffId: "A".repeat(43), draftId: "draft-1", draftFingerprint: fingerprint, outputAction: "save",
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      }
    }; }
  };
  const recovered = await findRecoverableHandoff("draft-1", fingerprint, storage);
  assert.equal(recovered.handoffId, "A".repeat(43));
  assert.doesNotMatch(buildContinueUrl("https://meccha-manual-staging.meccha-iiyatsu.com", recovered.handoffId, "b".repeat(32), recovered), /operationId=/);
  assert.equal(await findRecoverableHandoff("draft-1", "b".repeat(64), storage), null);
});

test("annotation canonical shape is compatible for legacy drafts and fails closed for invalid values", async () => {
  const draft = { id: "annotated", title: "手順書", description: "説明", updatedAt: "2026-09-23T00:00:00.000Z", steps: [], screenshots: [{ id: "image", dataUrl: "data:image/png;base64,AA==", masks: [] }] };
  const empty = { ...draft, screenshots: [{ ...draft.screenshots[0], annotations: [] }] };
  assert.equal(canonicalDraftJson(empty), canonicalDraftJson(draft));
  assert.equal(await legacyFingerprintDraft(empty), await legacyFingerprintDraft(draft));
  assert.equal(await legacyFingerprintDraft(empty), "8e4ab419c999c3986fa7b18fb253731cc068ec5d66592e5044c4e1a7c821f59e");
  assert.equal(await fingerprintDraft(empty), "36baaa2d9bee4191d06d656e82fd844840a43a6b12e5549a348fc1905edc45ff");
  assert.notEqual(await fingerprintDraft(empty), await legacyFingerprintDraft(empty));
  const annotated = { ...draft, screenshots: [{ ...draft.screenshots[0], annotations: [{ id: "a1", type: "rectangle", x: .1, y: .1, width: .2, height: .2, color: "#dc2626", strokeWidth: 3 }] }] };
  assert.match(canonicalDraftJson(annotated), /"annotations":/);
  assert.notEqual(await fingerprintDraft(annotated), await fingerprintDraft(draft));
  assert.notEqual(await legacyFingerprintDraft(annotated), await legacyFingerprintDraft(draft));
  assert.equal(cleanDraft({ ...annotated, screenshots: [{ ...annotated.screenshots[0], annotations: [{ id: "bad", type: "rectangle", x: "bad", y: .1, width: .2, height: .2 }] }] }), null);
  assert.throws(() => canonicalDraftJson({ ...draft, screenshots: [{ ...draft.screenshots[0], annotations: "bad" }] }));
});

test("share output keeps an explicit action through handoff recovery", async () => {
  const fingerprint = "a".repeat(64);
  const share = createHandoffMetadata("draft-share", "share", Date.now(), "b".repeat(32), "2026-09-23T00:00:00.000Z", fingerprint);
  assert.equal(share.outputAction, "share");
  assert.match(buildContinueUrl("https://meccha-manual-staging.meccha-iiyatsu.com", share.handoffId, share.extensionId, null, "share"), /#handoff=.*&extensionId=.*&action=share$/);
  assert.equal(safeMessage({ ...validMessage, action: "share" }, "handoff.prepare"), true);
});

test("Office output carries a required format through the auth handoff", async () => {
  const fingerprint = "c".repeat(64);
  const office = createHandoffMetadata("draft-office", "office", Date.now(), "c".repeat(32), "2026-09-23T00:00:00.000Z", fingerprint, "docx");
  assert.equal(office.officeFormat, "docx");
  const url = new URL(buildContinueUrl("https://meccha-manual-staging.meccha-iiyatsu.com", office.handoffId, office.extensionId, null, "office", "d".repeat(43), "docx"));
  assert.equal(url.hash.includes("action=office"), true);
  assert.equal(new URLSearchParams(url.hash.slice(1)).get("officeFormat"), "docx");
  assert.equal(safeMessage({ ...validMessage, type: "handoff.prepare", action: "office", officeFormat: "docx" }, "handoff.prepare"), true);
  assert.throws(() => createHandoffMetadata("draft-office", "office", Date.now(), "c".repeat(32), undefined, fingerprint), /office format/);
  assert.throws(() => buildContinueUrl("https://meccha-manual-staging.meccha-iiyatsu.com", office.handoffId, office.extensionId, null, "office", null, "xlsx"), /INVALID_OFFICE_FORMAT/);
});

test("Office output never adopts a pending save claim", async () => {
  const storage = {
    async get() { return {
      "meccha-manual:handoff:save": {
        handoffId: "E".repeat(43), draftId: "draft-office", draftFingerprint: "d".repeat(64), outputAction: "save",
        status: "finalize-pending", operationId: "P".repeat(43), claimIntentId: "00000000-0000-4000-8000-000000000000"
      },
      "meccha-manual:handoff:office": {
        handoffId: "F".repeat(43), draftId: "draft-office", draftFingerprint: "d".repeat(64), outputAction: "office", officeFormat: "pptx",
        status: "finalize-pending", operationId: "Q".repeat(43), claimIntentId: "11111111-1111-4111-8111-111111111111"
      }
    }; }
  };
  const selected = await findRecoverableHandoff("draft-office", "d".repeat(64), storage, "office", "pptx");
  assert.equal(selected.handoffId, "F".repeat(43));
  assert.equal(await findRecoverableHandoff("draft-office", "d".repeat(64), storage, "office", "docx"), null);
});

test("Office completion requires the authenticated claim identity and matching cloud receipt", async () => {
  const handoffId = "G".repeat(43);
  const manualId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const sender = { url: "https://meccha-manual-staging.meccha-iiyatsu.com/onboarding/continue" };
  const previousChrome = globalThis.chrome;
  globalThis.chrome = { storage: { local: { async get() { return {}; } } } };
  try {
    const message = { schema: "meccha-manual/cloud-claim-v1", type: "handoff.completed", handoffId, action: "office", officeFormat: "docx", manualId,
      cloudRef: { workspaceId: manualId, manualId, revisionId: manualId, updatedAt: "2026-10-03T00:00:00.000Z", contentVersion: "a".repeat(32), savedFingerprint: "a".repeat(64) } };
    assert.deepEqual(await handleExternalCloudClaimMessage(message, sender), { ok: false, error: "RECOVERY_IDENTITY_REQUIRED" });
  } finally {
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
  }
});

test("Office completion rejects an active handoff even with a matching coordinator receipt", async () => {
  const handoffId = "H".repeat(43);
  const launchId = "L".repeat(43);
  const operationId = "O".repeat(43);
  const claimIntentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const manualId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const draftFingerprint = "b".repeat(64);
  const metadata = {
    handoffId, draftId: "draft-office-active", outputAction: "office", officeFormat: "pptx", status: "active",
    expiresAt, draftUpdatedAt: "2026-10-03T00:00:00.000Z", draftFingerprint, operationId, claimIntentId
  };
  const ready = { handoffId, launchId, tabId: 7, activationPolicy: "active", expiresAt };
  const sender = { url: "https://meccha-manual-staging.meccha-iiyatsu.com/onboarding/continue", frameId: 0, tab: { id: 7 } };
  const previousChrome = globalThis.chrome;
  globalThis.chrome = { storage: { local: { async get(key) {
    return key === handoffStorageKey(handoffId) ? { [key]: metadata } : { [key]: ready };
  } } } };
  try {
    const message = { schema: "meccha-manual/cloud-claim-v1", type: "handoff.completed", handoffId, action: "office", officeFormat: "pptx", launchId,
      manualId, operationId, claimIntentId, draftFingerprint,
      cloudRef: { workspaceId: manualId, manualId, revisionId: manualId, updatedAt: "2026-10-03T00:00:00.000Z", contentVersion: "c".repeat(32) } };
    assert.deepEqual(await handleExternalCloudClaimMessage(message, sender), { ok: false, error: "RECOVERY_MISMATCH" });
  } finally {
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
  }
});

test("Office completion accepts the Worker cloudRef shape and adds the local fingerprint receipt", async () => {
  const handoffId = "J".repeat(43);
  const launchId = "K".repeat(43);
  const operationId = "L".repeat(43);
  const claimIntentId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const manualId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const draftFingerprint = "d".repeat(64);
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const metadata = {
    handoffId, draftId: "draft-office-worker-shape", outputAction: "office", officeFormat: "docx", status: "finalize-pending",
    expiresAt, draftUpdatedAt: "2026-10-03T00:00:00.000Z", draftFingerprint, operationId, claimIntentId, sourceCloudRef: null
  };
  const ready = { handoffId, launchId, tabId: 11, activationPolicy: "active", expiresAt };
  const cloudRef = { workspaceId: manualId, manualId, revisionId: manualId, updatedAt: "2026-10-03T00:00:00.000Z", contentVersion: "e".repeat(32) };
  const records = new Map([[handoffStorageKey(handoffId), metadata], [handoffReadyStorageKey(handoffId, launchId), ready]]);
  const previousChrome = globalThis.chrome;
  const previousIndexedDB = globalThis.indexedDB;
  const storedKeys = [];
  globalThis.chrome = { storage: { local: {
    async get(key) {
      if (key === null) return Object.fromEntries(records);
      if (typeof key === "string") return records.has(key) ? { [key]: records.get(key) } : {};
      return {};
    },
    async set(values) { for (const [key, value] of Object.entries(values)) { records.set(key, value); storedKeys.push(key); } }
  } } };
  globalThis.indexedDB = { open() {
    const request = {};
    const transaction = {
      oncomplete: null,
      onerror: null,
      onabort: null,
      objectStore() {
        return {
          get() {
            const read = { result: { id: metadata.draftId } };
            queueMicrotask(() => { read.onsuccess?.(); queueMicrotask(() => transaction.oncomplete?.()); });
            return read;
          },
          put() {}
        };
      }
    };
    request.result = { transaction() { return transaction; }, close() {} };
    queueMicrotask(() => request.onsuccess?.());
    return request;
  } };
  try {
    const sender = { url: "https://meccha-manual-staging.meccha-iiyatsu.com/onboarding/continue", frameId: 0, tab: { id: 11 } };
    const message = { schema: "meccha-manual/cloud-claim-v1", type: "handoff.completed", handoffId, action: "office", officeFormat: "docx", launchId,
      manualId, operationId, claimIntentId, draftFingerprint, cloudRef };
    assert.deepEqual(await handleExternalCloudClaimMessage(message, sender), { ok: true, status: "completed" });
    const saved = records.get("meccha-manual:cloud-ref:" + metadata.draftId);
    assert.equal(saved.savedFingerprint, draftFingerprint);
    assert.equal("savedFingerprint" in cloudRef, false, "the Worker response does not carry the local receipt field");
    assert.ok(storedKeys.includes(handoffStorageKey(handoffId)));
    const mismatch = await handleExternalCloudClaimMessage({ ...message, draftFingerprint: "f".repeat(64) }, sender);
    assert.deepEqual(mismatch, { ok: false, error: "RECOVERY_MISMATCH" });
  } finally {
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
    if (previousIndexedDB === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = previousIndexedDB;
  }
});

test("guest claim rejects mismatched messages but recovers a pending draft across output actions", async () => {
  const handoffId = "A".repeat(43);
  const sender = { url: "https://meccha-manual-staging.meccha-iiyatsu.com/onboarding/continue" };
  const previousChrome = globalThis.chrome;
  globalThis.chrome = {
    storage: {
      local: {
        async get() {
          return { [`meccha-manual:handoff:${handoffId}`]: {
            handoffId, outputAction: "save", draftId: "draft-share", draftFingerprint: "a".repeat(64),
            expiresAt: new Date(Date.now() + 60_000).toISOString()
          } };
        }
      }
    }
  };
  try {
    assert.deepEqual(await handleExternalCloudClaimMessage({ ...validMessage, handoffId, action: "share" }, sender), { ok: false, error: "HANDOFF_EXPIRED_OR_UNKNOWN" });
  } finally {
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
  }
  const fingerprint = "b".repeat(64);
  const storage = {
    async get() { return { [`meccha-manual:handoff:${handoffId}`]: {
      handoffId, draftId: "draft-share", draftFingerprint: fingerprint, outputAction: "share",
      status: "finalize-pending", operationId: "O".repeat(43), claimIntentId: "00000000-0000-4000-8000-000000000000"
    } }; }
  };
  assert.equal((await findRecoverableHandoff("draft-share", fingerprint, storage, "share")).outputAction, "share");
  const saveRecovery = await findRecoverableHandoff("draft-share", fingerprint, storage, "save");
  assert.equal(saveRecovery.outputAction, "share");
  const url = new URL(buildContinueUrl("https://meccha-manual-staging.meccha-iiyatsu.com", handoffId, "a".repeat(32), saveRecovery, "save"));
  const params = new URLSearchParams(url.hash.slice(1));
  assert.equal(params.get("action"), "share");
  assert.equal(params.get("requestedAction"), "save");
  assert.equal(params.get("operationId"), saveRecovery.operationId);
});

test("draft lock requires Web Locks and holds the callback across async work", async () => {
  const calls = [];
  const result = await withHandoffDraftLock("draft-1", async () => { calls.push("callback"); await Promise.resolve(); return "locked"; }, {
    locks: { async request(name, callback) { calls.push(name); return callback({ name }); } }
  });
  assert.equal(result, "locked");
  assert.deepEqual(calls, ["meccha-manual:handoff:draft:draft-1", "callback"]);
  await assert.rejects(() => withHandoffDraftLock("draft-1", async () => {}, {}), /HANDOFF_LOCK_UNAVAILABLE/);
});

test("completed handoff is not selected for a changed draft", async () => {
  const storage = {
    async get() { return {
      "meccha-manual:handoff:completed": {
        handoffId: "A".repeat(43), draftId: "draft-1", draftFingerprint: "b".repeat(64), outputAction: "save",
        status: "completed", operationId: "O".repeat(43), claimIntentId: "00000000-0000-4000-8000-000000000000", completedManualId: "manual-1"
      }
    }; }
  };
  assert.equal(await findRecoverableHandoff("draft-1", "a".repeat(64), storage), null);
});

test("D extension distribution is pinned to staging and version 0.1.9", async () => {
  const manifest = JSON.parse(await readFile("apps/extension/manifest.json", "utf8"));
  assert.equal(manifest.version, "0.1.9");
  assert.deepEqual(manifest.externally_connectable.matches, ["https://meccha-manual-staging.meccha-iiyatsu.com/*"]);
});


test("known pending, failed and unreviewed images block output instead of being dropped", async () => {
  const base = { id: "review", title: "確認", description: "", steps: [{ id: "s1", order: 1, instruction: "保存する" }], screenshots: [] };
  for (const status of ["queued", "capturing", "unavailable", "failed", "protected", "unknown"]) {
    assert.equal(cleanDraft({ ...base, steps: [{ ...base.steps[0], imageState: { status, version: 1 } }] }), null, status);
  }
  assert.ok(cleanDraft({ ...base, steps: [{ ...base.steps[0], imageState: { status: "none", version: 1 } }] }));
  assert.equal(cleanDraft({ ...base, steps: [{ ...base.steps[0], imageState: { status: "ready", version: 1 } }] }), null);
  const ready = { ...base, steps: [{ ...base.steps[0], screenshotId: "image", imageState: { status: "ready", version: 1 } }], screenshots: [{ id: "image", dataUrl: "data:image/png;base64,AA==", masks: [] }] };
  assert.ok(cleanDraft(ready));
  assert.equal(cleanDraft({ ...ready, steps: [{ ...ready.steps[0], imageState: { status: "none", version: 1 } }] }), null);
  assert.notEqual(await fingerprintDraft(ready), await fingerprintDraft({ ...ready, steps: [{ ...ready.steps[0], imageState: { status: "protected", version: 1 } }] }));
  assert.equal(await fingerprintDraft({ ...ready, editorState: { selectedStepId: "s1", zoom: 200 } }), await fingerprintDraft(ready));
});


test("output prunes orphan screenshots but rejects referenced pending privacy review independently of image state", () => {
  const image = { id: "image", dataUrl: "data:image/png;base64,AA==", masks: [] };
  const step = { id: "s1", order: 1, instruction: "確認する", screenshotId: "image", imageState: { status: "ready", version: 1 } };
  const draft = { title: "手順書", description: "", steps: [step], screenshots: [{ ...image, id: "orphan", privacyReview: { reviewRequired: true } }, image] };
  assert.deepEqual(cleanDraft(draft).screenshots.map((item) => item.id), ["image"]);
  assert.equal(cleanDraft({ ...draft, steps: [{ ...step, privacyReview: { reviewRequired: true } }] }), null);
  assert.equal(cleanDraft({ ...draft, screenshots: [{ ...image, privacyReview: { reviewRequired: true } }] }), null);
  assert.deepEqual(cleanDraft({ ...draft, steps: [{ id: "s1", order: 1, instruction: "説明のみ", imageState: { status: "none", version: 2 } }] }).screenshots, []);
});

test("raw capture review blocks cloud output until confirmation while retaining the same image bytes", () => {
  const review = { replacementCount: 0, protectedRegionCount: 0, reviewRequired: true, reasonCodes: ["manual_image_review"], replacements: [] };
  const image = { id: "raw-image", dataUrl: "data:image/jpeg;base64,AA==", masks: [], privacyReview: review };
  const step = { id: "raw-step", order: 1, instruction: "確認する", screenshotId: image.id, imageState: { status: "protected", reason: null, version: 1 }, privacyReview: review };
  const raw = { title: "手順書", description: "", steps: [step], screenshots: [image] };
  assert.equal(cleanDraft(raw), null, "未確認raw画像はcloud claimを拒否する");
  const originalDataUrl = raw.screenshots[0].dataUrl;
  const confirmedReview = { ...review, reviewRequired: false };
  const confirmed = { ...raw, steps: [{ ...step, imageState: { ...step.imageState, status: "ready" }, privacyReview: confirmedReview }], screenshots: [{ ...image, privacyReview: confirmedReview }] };
  const clean = cleanDraft(confirmed);
  assert.ok(clean, "利用者確認後はcloud claimできる");
  assert.equal(confirmed.screenshots[0].dataUrl, originalDataUrl, "確認は画像bytesを加工・差替えしない");
});


test("pending save is recovered before Share even when local content changed", async () => {
  for (const status of ["finalize-pending", "completion-pending"]) {
    const pending = { handoffId: "B".repeat(43), draftId: "draft-1", draftFingerprint: "a".repeat(64), outputAction: "save", status, operationId: "O".repeat(43), claimIntentId: "00000000-0000-4000-8000-000000000000" };
    const freshShare = { handoffId: "C".repeat(43), draftId: "draft-1", draftFingerprint: "b".repeat(64), outputAction: "share", expiresAt: new Date(Date.now() + 60000).toISOString() };
    const storage = { async get() { return { freshShare, pending }; } };
    const recovered = await findRecoverableHandoff("draft-1", "b".repeat(64), storage, "share");
    assert.equal(recovered.handoffId, pending.handoffId);
    assert.equal(recovered.draftFingerprint, pending.draftFingerprint);
    const params = new URLSearchParams(new URL(buildContinueUrl("https://meccha-manual-staging.meccha-iiyatsu.com", recovered.handoffId, "a".repeat(32), recovered, "share")).hash.slice(1));
    assert.equal(params.get("action"), null, "original save action remains canonical");
    assert.equal(params.get("requestedAction"), "share");
    assert.equal(params.get("draftFingerprint"), pending.draftFingerprint);
  }
});

test("local branding participates in the handoff fingerprint and prepares only bounded color/logo metadata", async () => {
  const draft = { id: "brand-local", title: "手順書", description: "", steps: [], screenshots: [], branding: { themeColor: "#A14EBA", logoDataUrl: "data:image/png;base64,AQ==" } };
  assert.deepEqual(cleanDraft(draft).branding, { themeColor: "#a14eba", hasLogo: true });
  assert.equal(JSON.stringify(cleanDraft(draft)).includes("base64"), false);
  assert.notEqual(await fingerprintDraft(draft), await fingerprintDraft({ ...draft, branding: { ...draft.branding, themeColor: "#123456" } }));
  assert.notEqual(await fingerprintDraft(draft), await fingerprintDraft({ ...draft, branding: { ...draft.branding, logoDataUrl: "data:image/png;base64,Ag==" } }));
  assert.notEqual(await fingerprintDraft(draft), await fingerprintDraft({ ...draft, branding: { themeColor: "#a14eba" } }));
  for (const branding of [null, [], { themeColor: "var(--accent)" }, { logoDataUrl: "https://other.invalid/logo.png" }, { logoDataUrl: "data:image/svg+xml;base64,AQ==" }, { themeColor: "#123456", externalUrl: "https://other.invalid" }, { logoDataUrl: "data:image/png;base64," + "A".repeat(14 * 1024 * 1024) }]) assert.equal(cleanDraft({ ...draft, branding }), null);
  assert.equal(safeMessage({ ...validMessage, type: "handoff.logo.start" }, "handoff.logo.start"), true);
  assert.equal(safeMessage({ ...validMessage, type: "handoff.logo.start", assetSlot: 0 }, "handoff.logo.start"), false);
  assert.equal(safeMessage({ ...validMessage, type: "handoff.logo.chunk", sequence: 0 }, "handoff.logo.chunk"), true);
});
