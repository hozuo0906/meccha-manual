export const ONBOARDING_CSS = `:root{color-scheme:light;font-family:system-ui,-apple-system,sans-serif;color:#17202a;background:#f7f8fa}body{margin:0;min-height:100vh;display:grid;place-items:center}main{width:min(620px,calc(100% - 32px));padding:28px;background:#fff;border:1px solid #d0d5dd;border-radius:16px;box-shadow:0 16px 38px #1018281a}h1{margin:0 0 12px;font-size:1.65rem}p{line-height:1.7}.notice{padding:14px 16px;border-radius:10px;background:#fffaeb;border:1px solid #fedf89}.success{background:#ecfdf3;border-color:#abefc6}.error{background:#fef3f2;border-color:#fecdca}button{min-height:44px;padding:10px 18px;border:0;border-radius:8px;background:#175cd3;color:#fff;font-weight:700;cursor:pointer}button:disabled{opacity:.55;cursor:not-allowed}:focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 5px #1d4ed8}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}`;

export const ONBOARDING_JS = `(() => {
  const root = document.querySelector("#onboarding");
  const status = document.querySelector("#status");
  const button = document.querySelector("#bootstrap");
  const operationKey = "meccha-manual:onboarding-operation";
  const STORAGE_VERSION = 2;
  const configured = root?.dataset.bootstrapEnabled === "true";
  const fragmentParams = new URLSearchParams(location.hash.slice(1));
  const fragmentValues = fragmentParams.getAll("handoff");
  const extensionValues = fragmentParams.getAll("extensionId");
  const hasFragment = location.hash.length > 0;
  const fragmentHandoff = !hasFragment ? undefined : fragmentValues.length === 1 ? fragmentValues[0] : null;
  const fragmentExtensionId = !hasFragment ? undefined : extensionValues.length === 1 ? extensionValues[0] : null;
  history.replaceState(null, "", location.pathname + location.search);
  let hashNavigationPending = false;
  function message(text, kind = "") { status.textContent = text; status.className = ("notice " + kind).trim(); }
  function randomId() { const bytes = new Uint8Array(32); crypto.getRandomValues(bytes); let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
  function validHandoff(value) { return /^[A-Za-z0-9_-]{43}$/.test(value || ""); }
  function validExtensionId(value) { return /^[a-p]{32}$/.test(value || ""); }
  const HANDOFF_TTL_MS = 15 * 60 * 1000;
  function isFresh(value, now = Date.now()) { const createdAt = Date.parse(value?.createdAt || ""); return Number.isFinite(createdAt) && now - createdAt >= 0 && now - createdAt <= HANDOFF_TTL_MS; }
  function validOperationId(value) { return /^[A-Za-z0-9_-]{43}$/.test(value || ""); }
  function validCreatedAt(value) { return Number.isFinite(Date.parse(value || "")); }
  function isLegacyRecord(value) { return value && typeof value === "object" && !Array.isArray(value) && value.version === undefined && validHandoff(value.handoffId) && validOperationId(value.operationId) && validCreatedAt(value.createdAt); }
  function metadataFor(state) { return state.entries.find((entry) => entry.handoffId === state.activeHandoffId) || null; }
  function readSaved(now = Date.now()) {
    let raw;
    try { raw = sessionStorage.getItem(operationKey); } catch { return { ok: false, state: null, needsWrite: false }; }
    if (raw === null) return { ok: true, state: null, needsWrite: false };
    let value;
    try { value = JSON.parse(raw); } catch { return { ok: false, state: null, needsWrite: false }; }
    if (isLegacyRecord(value)) {
      const expired = !isFresh(value, now);
      const state = { version: STORAGE_VERSION, activeHandoffId: expired ? null : value.handoffId, entries: [{ handoffId: value.handoffId, operationId: value.operationId, createdAt: value.createdAt, state: expired ? "expired" : "active" }] };
      return { ok: true, state, needsWrite: true };
    }
    if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== STORAGE_VERSION || !Array.isArray(value.entries) || value.entries.length === 0 || !(value.activeHandoffId === null || validHandoff(value.activeHandoffId))) return { ok: false, state: null, needsWrite: false };
    const handoffs = new Set();
    const operations = new Set();
    for (const entry of value.entries) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry) || !validHandoff(entry.handoffId) || !validOperationId(entry.operationId) || !validCreatedAt(entry.createdAt) || (entry.state !== "active" && entry.state !== "expired") || handoffs.has(entry.handoffId) || operations.has(entry.operationId)) return { ok: false, state: null, needsWrite: false };
      if (entry.extensionId !== undefined && !validExtensionId(entry.extensionId)) return { ok: false, state: null, needsWrite: false };
      handoffs.add(entry.handoffId);
      operations.add(entry.operationId);
    }
    if (value.activeHandoffId === null && value.entries.some((entry) => entry.state === "active")) return { ok: false, state: null, needsWrite: false };
    const state = { version: STORAGE_VERSION, activeHandoffId: value.activeHandoffId, entries: value.entries.map((entry) => ({ ...entry })) };
    const mirror = metadataFor(state);
    if (value.activeHandoffId !== null && !mirror) return { ok: false, state: null, needsWrite: false };
    let needsWrite = false;
    for (const entry of state.entries) {
      if (entry.state === "active" && !isFresh(entry, now)) { entry.state = "expired"; needsWrite = true; }
    }
    return { ok: true, state, needsWrite };
  }
  function persistState(state) { try { sessionStorage.setItem(operationKey, JSON.stringify(state)); return true; } catch { return false; } }
  let capturedContext;
  let capturedContextInitialized = false;
  function handleHashChange() {
    hashNavigationPending = true;
    button.disabled = true;
    location.reload();
  }
  window.addEventListener("hashchange", handleHashChange);
  function initializeCapturedContext() {
    if (capturedContextInitialized) return capturedContext;
    capturedContextInitialized = true;
    if (!hasFragment || !validHandoff(fragmentHandoff) || (extensionValues.length > 0 && !validExtensionId(fragmentExtensionId))) return null;
    const saved = readSaved();
    if (!saved.ok) return null;
    let state = saved.state;
    if (saved.needsWrite && (!state || !persistState(state))) return null;
    if (!state) {
      try {
        const now = Date.now();
        const entry = { handoffId: fragmentHandoff, operationId: randomId(), createdAt: new Date(now).toISOString(), state: "active", ...(validExtensionId(fragmentExtensionId) ? { extensionId: fragmentExtensionId } : {}) };
        state = { version: STORAGE_VERSION, activeHandoffId: fragmentHandoff, entries: [entry] };
        if (!persistState(state)) return null;
        capturedContext = entry;
      } catch { capturedContext = null; }
      return capturedContext;
    }
    const existing = state.entries.find((entry) => entry.handoffId === fragmentHandoff);
    if (existing) {
      if (existing.state !== "active" || !isFresh(existing)) {
        if (state.activeHandoffId !== fragmentHandoff) {
          state.activeHandoffId = fragmentHandoff;
          if (!persistState(state)) return null;
        }
        return null;
      }
      if (state.activeHandoffId !== fragmentHandoff) {
        state.activeHandoffId = fragmentHandoff;
        if (!persistState(state)) return null;
      }
      capturedContext = existing;
      return capturedContext;
    }
    try {
      const now = Date.now();
      const entry = { handoffId: fragmentHandoff, operationId: randomId(), createdAt: new Date(now).toISOString(), state: "active", ...(validExtensionId(fragmentExtensionId) ? { extensionId: fragmentExtensionId } : {}) };
      state.entries.push(entry);
      state.activeHandoffId = fragmentHandoff;
      if (!persistState(state)) return null;
      capturedContext = entry;
    } catch { capturedContext = null; }
    return capturedContext;
  }
  function initializeActiveContext() {
    if (capturedContextInitialized) return capturedContext;
    capturedContextInitialized = true;
    const saved = readSaved();
    if (!saved.ok || !saved.state) return null;
    if (saved.needsWrite && !persistState(saved.state)) return null;
    const active = metadataFor(saved.state);
    if (!active || active.state !== "active" || !isFresh(active)) return null;
    capturedContext = active;
    return capturedContext;
  }
  function expireCapturedContext(context) {
    context.state = "expired";
    const saved = readSaved();
    if (!saved.ok || !saved.state) return false;
    const matching = saved.state.entries.find((entry) => entry.handoffId === context.handoffId && entry.operationId === context.operationId);
    if (!matching) return false;
    if (matching.state !== "expired" || saved.needsWrite) {
      matching.state = "expired";
      if (!persistState(saved.state)) return false;
    }
    return true;
  }
  function currentOperation() {
    if (hashNavigationPending || location.hash.length > 0) return null;
    const context = hasFragment ? initializeCapturedContext() : initializeActiveContext();
    if (!context || context.state !== "active") return null;
    if (!isFresh(context)) {
      expireCapturedContext(context);
      return null;
    }
    return context;
  }
  function getHandoff() {
    if (hasFragment) return validHandoff(fragmentHandoff) && currentOperation() ? fragmentHandoff : null;
    const active = currentOperation();
    return active ? active.handoffId : null;
  }
  function operationId() {
    return currentOperation()?.operationId || null;
  }
  if (configured && hasFragment && validHandoff(fragmentHandoff)) initializeCapturedContext();
  function setButton(label, disabled = false) { button.textContent = label; button.disabled = disabled; }
  function saveCloudMetadata(values) {
    try {
      const saved = readSaved();
      if (!saved.ok || !saved.state) return false;
      const active = saved.state.entries.find((entry) => entry.handoffId === values.handoffId && entry.operationId === values.operationId);
      if (!active) return false;
      Object.assign(active, values);
      return persistState(saved.state);
    } catch { return false; }
  }
  function extensionIdFor(context) { return context?.extensionId || null; }
  async function extensionMessage(extensionId, type, context, extra = {}) {
    if (!validExtensionId(extensionId) || !context?.handoffId || !context?.operationId) throw new Error("EXTENSION_HANDOFF_REQUIRED");
    if (!globalThis.chrome?.runtime?.sendMessage) throw new Error("EXTENSION_MESSAGE_UNAVAILABLE");
    const reply = await chrome.runtime.sendMessage(extensionId, { schema: "meccha-manual/cloud-claim-v1", type, handoffId: context.handoffId, action: "save", ...extra });
    if (!reply?.ok) throw new Error(reply?.error || "HANDOFF_FAILED");
    return reply;
  }
  function decodeChunk(value) {
    const binary = atob(value || "");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  function metadataForContext(context) {
    const saved = readSaved();
    if (!saved.ok || !saved.state) return null;
    return saved.state.entries.find((entry) => entry.handoffId === context.handoffId && entry.operationId === context.operationId) || null;
  }
  function claimManualForWeb(prepared) {
    if (!prepared?.draft || !Array.isArray(prepared.draft.steps) || !Array.isArray(prepared.assets)) throw new Error("DRAFT_INVALID");
    const slots = new Map(prepared.assets.map((asset) => [asset.screenshotId, asset.assetSlot]));
    const steps = prepared.draft.steps.map((step, index) => {
      const assetSlot = step.screenshotId === undefined ? null : slots.get(step.screenshotId);
      if (step.screenshotId !== undefined && !Number.isInteger(assetSlot)) throw new Error("DRAFT_INVALID");
      return {
        type: typeof step.type === "string" ? step.type : "action",
        title: typeof step.title === "string" ? step.title : "手順 " + (index + 1),
        instruction: String(step.instruction || ""),
        actionType: step.actionType ?? null,
        targetText: step.targetText ?? null,
        url: step.url ?? null,
        assetSlot
      };
    });
    return { title: String(prepared.draft.title || ""), description: String(prepared.draft.description || ""), steps };
  }
  function showClaimSuccess(manualId) {
    message("手順書を保存しました。保存した手順書を開きます。", "success");
    button.removeEventListener("click", bootstrap);
    setButton("保存した手順書を開く");
    button.onclick = () => { location.href = "/manuals"; };
    return Boolean(manualId);
  }
  async function completePending(context, extensionId, manualId) {
    if (typeof manualId !== "string" || !manualId) throw new Error("CLAIM_RESULT_INVALID");
    const pendingSaved = saveCloudMetadata({ handoffId: context.handoffId, operationId: context.operationId, claimStatus: "completion-pending", manualId });
    if (!pendingSaved) throw new Error("CLOUD_STATE_UNAVAILABLE");
    const completed = await extensionMessage(extensionId, "handoff.completed", context, { manualId });
    if (!completed?.ok) throw new Error("保存完了を拡張機能へ通知できませんでした。元の下書きは保持されています。");
    const completedSaved = saveCloudMetadata({ handoffId: context.handoffId, operationId: context.operationId, claimStatus: "completed", manualId });
    if (!completedSaved) throw new Error("CLOUD_STATE_UNAVAILABLE");
    return showClaimSuccess(manualId);
  }
  async function reconcileFinalize(context, extensionId, metadata) {
    if (metadata?.claimStatus !== "finalize-pending" || typeof metadata.claimIntentId !== "string") return false;
    const statusUrl = "/api/onboarding/claims/" + encodeURIComponent(metadata.claimIntentId) + "?operationId=" + encodeURIComponent(context.operationId);
    const response = await fetch(statusUrl, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" }
    });
    let result = null;
    try { result = await response.json(); } catch {}
    if (response.ok && (result?.status === "claimed" || result?.status === "completed") && typeof result.manualId === "string") {
      await completePending(context, extensionId, result.manualId);
      return true;
    }
    if (response.ok && result?.status === "pending") return { status: "pending", claimIntentId: metadata.claimIntentId };
    if (response.ok && result?.status === "expired") throw new Error("保存準備の期限が切れました。元の下書きを保持したまま、拡張機能からやり直してください。");
    throw new Error("保存結果を確認できませんでした。元の下書きを保持しています。");
  }
  async function claimDraft(context, bootstrapPayload) {
    const extensionId = extensionIdFor(context);
    if (!extensionId) {
      message("この登録画面は古い拡張機能から開かれました。保存するには拡張機能を0.1.2へ更新して、編集画面からもう一度進んでください。", "error");
      setButton("拡張機能からやり直す", true);
      return false;
    }
    const existing = metadataForContext(context);
    if (existing?.claimStatus === "completed" && existing.manualId) return showClaimSuccess(existing.manualId);
    if (existing?.claimStatus === "completion-pending" && existing.manualId) return completePending(context, extensionId, existing.manualId);
    const reconciliation = await reconcileFinalize(context, extensionId, existing);
    if (reconciliation === true) return true;
    const resumeIntentId = reconciliation?.status === "pending" ? reconciliation.claimIntentId : null;
    message("拡張機能から手順書を受け取り、保存の準備をしています。");
    const prepared = await extensionMessage(extensionId, "handoff.prepare", context);
    const manual = claimManualForWeb(prepared);
    if (existing?.draftFingerprint && prepared.draftFingerprint !== existing.draftFingerprint) throw new Error("下書きが変更されたため保存を停止しました。拡張機能からもう一度進めてください。");
    const operationId = context.operationId;
    const intentResponse = resumeIntentId ? null : await fetch("/api/onboarding/claim-intents", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ operationId, assetCount: prepared.assets.length })
    });
    let intent = resumeIntentId ? { claimIntentId: resumeIntentId } : null;
    if (intentResponse) { try { intent = await intentResponse.json(); } catch {} }
    if (!intent || (intentResponse && (!intentResponse.ok || typeof intent.claimIntentId !== "string"))) throw new Error(intentResponse?.status === 410 ? "保存準備の期限が切れました。拡張機能からもう一度進めてください。" : "保存準備に失敗しました。元の下書きは拡張機能に残っています。");
    if (!resumeIntentId && !saveCloudMetadata({ handoffId: context.handoffId, operationId, claimIntentId: intent.claimIntentId, workspaceId: bootstrapPayload.workspaceId || "", claimStatus: "uploading", draftFingerprint: prepared.draftFingerprint })) throw new Error("保存状態を端末に記録できませんでした。元の下書きは保持されています。");
    const staged = [];
    for (const asset of prepared.assets) {
      message("画像を安全に加工しています（" + (asset.assetSlot + 1) + "/" + prepared.assets.length + ")。");
      const start = await extensionMessage(extensionId, "handoff.asset.start", context, { assetSlot: asset.assetSlot });
      const chunks = [];
      for (let sequence = 0; sequence < start.totalChunks; sequence += 1) {
        const chunk = await extensionMessage(extensionId, "handoff.asset.chunk", context, { assetSlot: asset.assetSlot, sequence });
        if (chunk.sequence !== sequence || typeof chunk.chunk !== "string") throw new Error("CHUNK_SEQUENCE_INVALID");
        chunks.push(decodeChunk(chunk.chunk));
      }
      const body = new Blob(chunks, { type: start.contentType });
      const uploadUrl = "/api/onboarding/claim-intents/" + encodeURIComponent(intent.claimIntentId) + "/assets/" + encodeURIComponent(String(asset.assetSlot));
      const upload = await fetch(uploadUrl, {
        method: "PUT",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": start.contentType,
          "X-Requested-With": "XMLHttpRequest",
          "X-Claim-Operation-Id": operationId,
          "X-Asset-SHA256": start.sha256,
          "X-Asset-Byte-Length": String(start.byteLength)
        },
        body
      });
      let uploadResult = null; try { uploadResult = await upload.json(); } catch {}
      if (!upload.ok || uploadResult?.status !== "staged") throw new Error(upload.status === 409 ? "同じ保存操作に異なる画像が指定されました。下書きを保持したまま停止しました。" : "画像の保存に失敗しました。下書きは拡張機能に残っています。");
      staged.push({ assetSlot: asset.assetSlot, sha256: start.sha256 });
    }
    message("手順書を保存しています。");
    if (!saveCloudMetadata({ handoffId: context.handoffId, operationId, claimStatus: "finalize-pending" })) throw new Error("保存状態を端末に記録できませんでした。元の下書きは保持されています。");
    const claimUrl = "/api/onboarding/claims/" + encodeURIComponent(intent.claimIntentId);
    const claimResponse = await fetch(claimUrl, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ operationId, manual, assets: staged })
    });
    let claim = null; try { claim = await claimResponse.json(); } catch {}
    if (!claimResponse.ok || (claim?.status !== "claimed" && claim?.status !== "completed") || typeof claim.manualId !== "string") {
      throw new Error(claimResponse.status === 409 ? "同じ保存操作の内容が変わったため保存を止めました。元の下書きは拡張機能に残っています。" : "手順書の保存結果を確認できませんでした。同じ操作で再試行してください。");
    }
    return completePending(context, extensionId, claim.manualId);
  }
  async function bootstrap() {
    const id = operationId();
    if (!id) { message("登録を続けるための識別情報が確認できません。拡張機能の編集画面からもう一度進んでください。", "error"); setButton("登録を続ける", true); return; }
    setButton("準備中…", true); message("認証済みのWebアプリから保存先を準備しています。手順書本文はまだ送信していません。");
    try {
      const response = await fetch("/api/onboarding/bootstrap", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", Accept: "application/json", "X-Requested-With": "XMLHttpRequest" }, body: JSON.stringify({ operationId: id }) });
      let payload = null; try { payload = await response.json(); } catch {}
      if (response.ok && payload?.status === "ready") {
        message("保存先を準備しました。手順書を安全に保存しています。");
        const context = currentOperation();
        if (!extensionIdFor(context)) { message("保存先の準備が完了しました。手順書本文はまだ保存されていません。元の下書きは拡張機能に残っています。", "success"); setButton("同じ操作を確認する"); return; }
        try { await claimDraft(context, payload); } catch (error) { message(error?.message || "手順書の保存に失敗しました。元の下書きは拡張機能に残っています。", "error"); setButton("同じ操作で再試行"); }
        return;
      }
      if (response.status === 401) message("認証が確認できません。メールで認証してから、もう一度お試しください。", "error");
      else if (response.status === 403) message("このアカウントでは保存先を準備できません。", "error");
      else if (response.status === 429) message("試行回数の上限に達しました。少し時間をおいて、同じ操作でお試しください。", "error");
      else message("保存先の準備に失敗しました。元の下書きは拡張機能に残っています。同じ操作で再試行できます。", "error");
    } catch { message("応答を確認できませんでした。元の下書きは拡張機能に残っています。同じ操作で再試行してください。", "error"); }
    setButton("同じ操作で再試行");
  }
  if (!configured) { message("登録画面は現在準備中です。元の手順書は拡張機能のこの端末に残っています。"); setButton("登録画面は準備中", true); }
  else if (!getHandoff()) { message("登録を続けるための識別情報が確認できません。拡張機能の編集画面から進んでください。", "error"); setButton("登録を続ける", true); }
  else { message("メールで認証済みの場合は、保存先の準備を開始できます。手順書本文は送信されません。"); button.addEventListener("click", bootstrap); }
})();`;

export function renderOnboardingContinuePage({ bootstrapEnabled = false, assetVersion = "" } = {}) {
  const version = assetVersion ? `?v=${encodeURIComponent(assetVersion)}` : "";
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>登録を続ける | めっちゃマニュアル</title><link rel="stylesheet" href="/assets/onboarding.css${version}"></head><body><main id="onboarding" data-bootstrap-enabled="${bootstrapEnabled ? "true" : "false"}"><p aria-hidden="true">MECCHA MANUAL</p><h1>登録を続ける</h1><p>メールで認証したあと、手順書の保存先を準備します。</p><p class="notice" id="status" role="status" aria-live="polite"></p><button id="bootstrap" type="button">保存先を準備する</button><p class="sr-only" aria-live="polite"></p></main><script src="/assets/onboarding.js${version}" defer></script></body></html>`;
}
