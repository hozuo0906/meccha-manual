export const CLOUD_MANUAL_CSS = `:root{color-scheme:light;font-family:system-ui,-apple-system,sans-serif;color:#17202a;background:#f7f8fa}body{margin:0}.cloud-shell{width:min(1120px,calc(100% - 32px));margin:0 auto;padding:28px 0 56px}.cloud-header{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:24px}.cloud-header h1{margin:0;font-size:1.7rem}.cloud-note{line-height:1.7;color:#475467}.cloud-message{padding:12px 14px;border:1px solid #d0d5dd;border-radius:10px;background:#fff;min-height:1.4em}.cloud-message.error{color:#b42318;border-color:#fecdca;background:#fef3f2}.cloud-message.success{color:#067647;border-color:#abefc6;background:#ecfdf3}.cloud-message.warning{color:#b54708;border-color:#fedf89;background:#fffaeb}.cloud-grid{display:grid;grid-template-columns:minmax(250px,34%) 1fr;gap:20px}.cloud-panel{background:#fff;border:1px solid #eaecf0;border-radius:14px;padding:20px;box-shadow:0 8px 24px #1018280d}.cloud-list{list-style:none;padding:0;margin:0;display:grid;gap:8px}.cloud-list button{display:block;width:100%;text-align:left;border:1px solid #d0d5dd;border-radius:9px;padding:12px;background:#fff;color:#17202a;cursor:pointer}.cloud-list button[aria-current=true]{border-color:#175cd3;box-shadow:0 0 0 2px #dbeafe}.cloud-field{display:grid;gap:6px;margin:14px 0}.cloud-field label{font-weight:700}.cloud-field input,.cloud-field textarea{font:inherit;border:1px solid #98a2b3;border-radius:8px;padding:9px;box-sizing:border-box;width:100%}.cloud-field textarea{min-height:90px;resize:vertical}.cloud-step{border-top:1px solid #eaecf0;padding:14px 0}.cloud-step h3{margin:0 0 8px;font-size:1rem}.cloud-step p{margin:0;line-height:1.7;white-space:pre-wrap}.cloud-step-image{display:block;max-width:100%;max-height:280px;margin:12px 0;border-radius:8px;border:1px solid #d0d5dd}.cloud-step-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:10px}.cloud-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:20px}button.primary,button.secondary{min-height:44px;padding:9px 16px;border:0;border-radius:8px;font-weight:700;cursor:pointer}.primary{background:#175cd3;color:#fff}.secondary{background:#eef2f6;color:#17202a}.danger{color:#b42318}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}.share-panel{margin-top:20px;border-top:1px solid #eaecf0;padding-top:18px}.share-panel h3{margin:0 0 8px}.share-link{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.share-link input{flex:1;min-width:180px}@media(max-width:760px){.cloud-grid{grid-template-columns:1fr}.cloud-header{display:block}.cloud-header .cloud-actions{justify-content:flex-start}}`;

export const CLOUD_MANUAL_JS = `(() => {
  const root = document.querySelector("#cloud-manuals");
  const message = document.querySelector("#cloud-message");
  const list = document.querySelector("#cloud-list");
  const detail = document.querySelector("#cloud-detail");
  const workspaceId = root?.dataset.workspaceId || "";
  let manuals = [];
  let selected = null;
  let detailData = null;
  let editorState = null;
  let dirty = false;
  let editVersion = 0;
  let requestSerial = 0;
  let saveInFlight = false;
  let reloadButton = null;
  let shareState = null;
  let shareToken = null;
  let shareMetaError = null;
  let shareBusy = false;
  let sharePending = null;
  let shareRequest = null;
  function randomBase64Url(bytes = 32) { const value = new Uint8Array(bytes); crypto.getRandomValues(value); let binary = ""; for (const byte of value) binary += String.fromCharCode(byte); return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
  function shareEndpoint(manualId) { return workspacePath() + "/manuals/" + encodeURIComponent(manualId) + "/share-links"; }
  function shareExpiryInputValue(days) { const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000); const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
  function validPasscode(value) { const text = String(value || ""); return Array.from(text).length >= 12 && Array.from(text).length <= 128 && new TextEncoder().encode(text).byteLength <= 512 && !/[\\u0000-\\u001f\\u007f-\\u009f]/.test(text); }
  async function loadShareMetadata(manualId) { try { const result = await json(shareEndpoint(manualId)); return { state: result?.share || null, error: null }; } catch (error) { return { state: null, error }; } }
  function shareIsActive() { return Boolean(shareState && !shareState.revokedAt); }
  async function revokeShare(manualId) { if (!shareState?.shareLinkId || shareBusy) return; const serial = requestSerial; const linkId = shareState.shareLinkId; const request = { serial, manualId }; shareRequest = request; shareBusy = true; try { await json(shareEndpoint(manualId), { method: "DELETE", body: JSON.stringify({ shareLinkId: linkId }) }); if (serial !== requestSerial || detailData?.manual?.id !== manualId) return; shareState = null; shareToken = null; sharePending = null; setMessage("共有を停止しました。必要なら新しいリンクを発行してください。", "success"); shareBusy = false; shareRequest = null; renderDetail(detailData); } catch (error) { if (serial === requestSerial) setMessage(error.message, "error"); } finally { if (shareRequest === request) { shareBusy = false; shareRequest = null; } } }
  function shareUrl() { return location.origin + (shareState?.viewerPath || "/s/") + "#token=" + encodeURIComponent(shareToken || ""); }
  async function issueShare(manualId, form) { if (shareBusy || shareIsActive()) return; if (dirty) { setMessage("未保存の変更があります。先に変更を保存してください。", "warning"); return; } const draftId = detailData?.draft?.id; const contentVersion = detailData?.draft?.contentVersion; const passcode = form.querySelector("[data-share-passcode]")?.value || ""; const expiry = form.querySelector("[data-share-expires]")?.value || ""; const confirmed = form.querySelector("[data-share-confirm]")?.checked === true; if (!validPasscode(passcode)) { setMessage("パスコードは12〜128文字、512バイト以内で入力してください。", "error"); return; } if (!confirmed) { setMessage("共有内容と期限を確認してから発行してください。", "error"); return; } const parsedExpiry = Date.parse(expiry); const expiresAt = Number.isFinite(parsedExpiry) ? new Date(parsedExpiry).toISOString() : ""; const max = Date.now() + 30 * 24 * 60 * 60 * 1000; if (!Number.isFinite(parsedExpiry) || parsedExpiry <= Date.now() || parsedExpiry > max) { setMessage("有効期限は現在から30日以内で指定してください。", "error"); return; } const serial = requestSerial; const request = { serial, manualId }; shareRequest = request; const pending = sharePending && sharePending.manualId === manualId && sharePending.draftId === draftId && sharePending.contentVersion === contentVersion ? sharePending : { manualId, draftId, contentVersion, body: { operationId: randomBase64Url(), token: randomBase64Url(), passcode, expiresAt, expectedDraftRevisionId: draftId, expectedContentVersion: contentVersion, confirmed: true } }; if (sharePending && pending === sharePending && (passcode !== pending.body.passcode || expiresAt !== pending.body.expiresAt || !confirmed)) { setMessage("前回の発行結果が不明です。前回と同じ内容で再試行してください。", "warning"); shareRequest = null; return; } sharePending = pending; let issued = false; shareBusy = true; try { const result = await json(shareEndpoint(manualId), { method: "POST", body: JSON.stringify(pending.body) }); if (serial !== requestSerial || detailData?.manual?.id !== manualId) return; shareToken = pending.body.token; shareState = { shareLinkId: result.shareLinkId, expiresAt: result.expiresAt, revokedAt: null, permission: result.permission, viewerPath: result.viewerPath || "/s/" }; sharePending = null; issued = true; setMessage("共有リンクを発行しました。発行時点の内容が共有されます。", "success"); } catch (error) { if (serial === requestSerial) { shareToken = null; if ([400, 403, 409].includes(error.status)) { sharePending = null; setMessage(error.message, "error"); } else setMessage("共有リンクの発行結果を確認できません。前回と同じ内容で再試行してください。", "warning"); } } finally { if (shareRequest === request) { shareBusy = false; shareRequest = null; if (issued) renderDetail(detailData); } } }
  function setMessage(text, kind = "") { message.textContent = text; message.className = ("cloud-message " + kind).trim(); }
  function make(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function workspacePath() { if (!workspaceId) throw new Error("ワークスペースを確認できません。"); return "/api/workspaces/" + encodeURIComponent(workspaceId); }
  async function json(url, init = {}) { const headers = { Accept: "application/json", "X-Requested-With": "XMLHttpRequest", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) }; const response = await fetch(url, { ...init, credentials: "same-origin", cache: "no-store", headers }); let body = null; try { body = await response.json(); } catch {} if (!response.ok) { const error = new Error(body?.message || "手順書を確認できませんでした。"); error.status = response.status; error.code = body?.code; throw error; } return body; }
  function renderList() { list.replaceChildren(); if (!manuals.length) { list.append(make("p", "保存された手順書はありません。")); return; } for (const manual of manuals) { const button = make("button", manual.title || "名称未設定", "cloud-list-button"); button.type = "button"; button.disabled = saveInFlight; button.setAttribute("aria-current", selected?.id === manual.id ? "true" : "false"); button.addEventListener("click", () => { if (!saveInFlight) openManual(manual.id); }); list.append(button); } }
  function imageUrlFor(step, data) {
    const linkedAsset = Array.isArray(data?.assets) ? data.assets.find((asset) => asset.id === step.assetId) : data?.assets?.[step.assetId] || data?.assetsById?.[step.assetId];
    const candidate = step.assetUrl || step.imageUrl || step.screenshotUrl || step.asset?.url || step.image?.url || linkedAsset?.url || data?.assetUrls?.[step.assetId];
    if (typeof candidate !== "string" || !candidate) return null;
    try {
      const url = new URL(candidate, location.origin);
      if (url.origin !== location.origin || url.username || url.password) return null;
      return url.href;
    } catch {
      return null;
    }
  }
  function markChanged() { dirty = true; editVersion += 1; }
  function codePointLength(value) { return Array.from(String(value || "")).length; }
  function syncManualListTitle(manualId, title) {
    const manual = manuals.find((item) => item.id === manualId);
    if (!manual) return;
    manual.title = title;
    if (selected?.id === manualId) selected.title = title;
    renderList();
  }
  function validateSnapshot(snapshot) {
    const fields = [[String(snapshot.title || "").trim(), 64, "タイトル"], [snapshot.description, 10000, "説明"]];
    for (const step of snapshot.steps) {
      const stepTitle = String(step.title || "").trim();
      if (codePointLength(stepTitle) < 1) return "手順の見出しは1〜128文字で入力してください。";
      fields.push([stepTitle, 128, "手順の見出し"], [step.instruction, 4000, "手順文"]);
    }
    if (codePointLength(String(snapshot.title || "").trim()) < 1) return "タイトルは1〜64文字で入力してください。";
    const invalid = fields.find(([value, max]) => codePointLength(value) > max);
    if (invalid) return invalid[2] + "は" + invalid[1].toLocaleString("ja-JP") + "文字以内で入力してください。";
    if (snapshot.steps.length > 200) return "手順は200件以内で入力してください。";
    return "";
  }
  function clearProtectedEditor() { manuals = []; selected = null; detailData = null; editorState = null; dirty = false; shareState = null; shareToken = null; shareMetaError = null; sharePending = null; renderList(); renderDetail(null); }
  function renderSharePanel(data, canEdit) {
    const panel = make("section", "", "share-panel");
    const busy = shareBusy && shareRequest?.manualId === data.manual.id;
    const heading = make("h3", "共有設定"); heading.id = "share-heading"; panel.append(heading);
    panel.setAttribute("aria-labelledby", "share-heading");
    if (shareMetaError) { panel.append(make("p", "共有設定を読み込めません。時間をおいて再読み込みしてください。", "cloud-note")); return panel; }
    const expired = shareIsActive() && Number.isFinite(Date.parse(shareState.expiresAt)) && Date.parse(shareState.expiresAt) <= Date.now();
    if (shareIsActive() && shareToken) {
      if (expired) { panel.append(make("p", "リンクの期限が切れています。再発行する前に共有を停止してください。", "cloud-note")); const stop = make("button", "共有を停止して再発行", "secondary danger"); stop.type = "button"; stop.disabled = !canEdit || busy; stop.addEventListener("click", () => { if (window.confirm("現在の共有リンクを停止しますか？")) revokeShare(data.manual.id); }); panel.append(stop); return panel; }
      const note = make("p", "共有リンクは発行時点の内容を表示します。リンクはこの画面を再読み込みすると復元できません。", "cloud-note");
      const link = document.createElement("input"); link.className = "share-link-value"; link.value = shareUrl(); link.readOnly = true; link.setAttribute("aria-label", "共有リンク");
      const copy = make("button", "リンクをコピー", "secondary"); copy.type = "button"; copy.addEventListener("click", async () => { try { await navigator.clipboard.writeText(link.value); setMessage("共有リンクをコピーしました。", "success"); } catch { link.select(); setMessage("リンクを選択しました。コピーしてください。", "warning"); } });
      const stop = make("button", "共有を停止", "secondary danger"); stop.type = "button"; stop.disabled = !canEdit || busy; stop.addEventListener("click", () => { if (window.confirm("この共有リンクを停止しますか？")) revokeShare(data.manual.id); });
      const row = make("div", "", "share-link"); row.append(link, copy, stop); panel.append(note, row); return panel;
    }
    if (shareIsActive() && !shareToken) {
      panel.append(make("p", expired ? "リンクの期限が切れています。再発行する前に共有を停止してください。" : "共有リンクは再読み込み後に復元できません。再発行する前に現在の共有を停止してください。", "cloud-note"));
      const stop = make("button", "共有を停止して再発行", "secondary danger"); stop.type = "button"; stop.disabled = !canEdit || busy; stop.addEventListener("click", () => { if (window.confirm("現在の共有リンクを停止しますか？")) revokeShare(data.manual.id); }); panel.append(stop); return panel;
    }
    const form = document.createElement("form"); form.className = "share-form"; form.noValidate = true;
    const passLabel = make("label", "パスコード（12〜128文字）"); const pass = document.createElement("input"); pass.type = "password"; pass.required = true; pass.minLength = 12; pass.autocomplete = "new-password"; pass.dataset.codePointMax = "128"; pass.disabled = !canEdit || busy; pass.dataset.sharePasscode = "true"; passLabel.append(pass);
    const expiryLabel = make("label", "有効期限（最大30日）"); const expiry = document.createElement("input"); expiry.type = "datetime-local"; expiry.required = true; expiry.value = shareExpiryInputValue(7); expiry.min = shareExpiryInputValue(0); expiry.max = shareExpiryInputValue(30); expiry.disabled = !canEdit || busy; expiry.dataset.shareExpires = "true"; expiryLabel.append(expiry);
    const confirmLabel = make("label", ""); const confirm = document.createElement("input"); confirm.type = "checkbox"; confirm.required = true; confirm.disabled = !canEdit || busy; confirm.dataset.shareConfirm = "true"; confirmLabel.append(confirm, document.createTextNode("発行時点の内容と期限を確認しました"));
    const issue = make("button", "共有リンクを発行", "primary"); issue.type = "submit"; issue.disabled = !canEdit || busy; form.append(passLabel, expiryLabel, confirmLabel, issue); form.addEventListener("submit", (event) => { event.preventDefault(); issueShare(data.manual.id, form); }); panel.append(make("p", "共有は明示的に発行したときだけ開始します。未保存の変更は共有しません。", "cloud-note"), form); return panel;
  }
  function renderDetail(data) {
    reloadButton = null;
    detail.replaceChildren(); if (!data || !editorState) { detail.append(make("p", "左の一覧から手順書を選んでください。", "cloud-note")); return; }
    const canEdit = data.permissions?.canEdit !== false;
    const heading = make("h2", editorState.title || "手順書"); detail.append(heading); const form = make("form"); form.noValidate = true;
    const titleLabel = make("label", "タイトル"); const title = document.createElement("input"); title.dataset.codePointMax = "64"; title.value = editorState.title; title.disabled = !canEdit; title.setAttribute("aria-label", "タイトル"); titleLabel.append(title); const descriptionLabel = make("label", "説明"); const description = document.createElement("textarea"); description.dataset.codePointMax = "10000"; description.value = editorState.description; description.disabled = !canEdit; description.setAttribute("aria-label", "説明"); descriptionLabel.append(description); title.addEventListener("input", () => { editorState.title = title.value; heading.textContent = title.value || "手順書"; markChanged(); }); description.addEventListener("input", () => { editorState.description = description.value; markChanged(); }); const fields = make("div", "", "cloud-field"); fields.append(titleLabel); const descFields = make("div", "", "cloud-field"); descFields.append(descriptionLabel);
    const steps = make("div");
    function rerenderSteps() { steps.replaceChildren(); editorState.steps.forEach((step, index) => { const item = make("article", "", "cloud-step"); const label = make("label", "手順 " + (index + 1)); const stepTitle = document.createElement("input"); stepTitle.dataset.codePointMax = "128"; stepTitle.value = step.title || ""; stepTitle.disabled = !canEdit; stepTitle.setAttribute("aria-label", "手順 " + (index + 1) + "のタイトル"); label.append(stepTitle); const instruction = document.createElement("textarea"); instruction.dataset.codePointMax = "4000"; instruction.value = step.instruction || ""; instruction.disabled = !canEdit; instruction.setAttribute("aria-label", "手順 " + (index + 1) + "の説明"); stepTitle.addEventListener("input", () => { step.title = stepTitle.value; markChanged(); }); instruction.addEventListener("input", () => { step.instruction = instruction.value; markChanged(); }); const imageUrl = imageUrlFor(step, data); if (imageUrl) { const image = document.createElement("img"); image.className = "cloud-step-image"; image.src = imageUrl; image.alt = "手順 " + (index + 1) + "の操作を記録"; image.loading = "lazy"; item.append(image); } const actionBar = make("div", "", "cloud-step-actions"); const up = make("button", "上へ", "secondary"); up.type = "button"; up.disabled = !canEdit || index === 0; up.addEventListener("click", () => { [editorState.steps[index - 1], editorState.steps[index]] = [editorState.steps[index], editorState.steps[index - 1]]; markChanged(); rerenderSteps(); }); const down = make("button", "下へ", "secondary"); down.type = "button"; down.disabled = !canEdit || index === editorState.steps.length - 1; down.addEventListener("click", () => { [editorState.steps[index], editorState.steps[index + 1]] = [editorState.steps[index + 1], editorState.steps[index]]; markChanged(); rerenderSteps(); }); const remove = make("button", "この手順を削除", "secondary danger"); remove.type = "button"; remove.disabled = !canEdit; remove.addEventListener("click", () => { editorState.steps.splice(index, 1); markChanged(); rerenderSteps(); const addButton = form.querySelector("[data-step-add]"); if (addButton) { addButton.disabled = !canEdit || editorState.steps.length >= 200; addButton.textContent = editorState.steps.length >= 200 ? "手順は200件まで" : "手順を追加"; } }); actionBar.append(up, down, remove); item.append(label, instruction, actionBar); steps.append(item); }); }
    rerenderSteps(); const add = make("button", "手順を追加", "secondary"); add.dataset.stepAdd = "true"; add.type = "button"; add.disabled = !canEdit || editorState.steps.length >= 200; add.addEventListener("click", () => { if (editorState.steps.length >= 200) return; editorState.steps.push({ type: "action", title: "新しい手順", instruction: "", actionType: null, targetText: null, url: null, clientKey: "local-" + crypto.randomUUID() }); markChanged(); rerenderSteps(); add.disabled = !canEdit || editorState.steps.length >= 200; add.textContent = editorState.steps.length >= 200 ? "手順は200件まで" : "手順を追加"; }); const actions = make("div", "", "cloud-actions"); const save = make("button", "変更を保存", "primary"); save.type = "submit"; save.disabled = !canEdit || saveInFlight; const reload = make("button", "最新の内容を読み込む", "secondary"); reloadButton = reload; reload.type = "button"; reload.disabled = saveInFlight; reload.addEventListener("click", () => { if (!dirty || window.confirm("編集中の変更を破棄して最新の内容を読み込みますか？")) openManual(selected.id, { force: true }); }); actions.append(reload, save); form.append(fields, descFields, steps, add, actions); form.addEventListener("submit", (event) => { event.preventDefault(); saveManual(data.manual.id, save); }); detail.append(form, renderSharePanel(data, canEdit));
  }
  function stepForSave(step) { const output = { ...(step.id ? { id: step.id } : {}), type: step.type || "action", title: String(step.title || "").trim(), instruction: String(step.instruction || ""), actionType: step.actionType ?? null, targetText: step.targetText ?? null, url: step.url ?? null }; if (step.assetId) output.assetId = step.assetId; return output; }
  function mergeServerStepIds(snapshot, latest) {
    if (!Array.isArray(latest?.steps) || !editorState) return;
    const localByKey = new Map(editorState.steps.filter((step) => step.clientKey).map((step) => [step.clientKey, step]));
    snapshot.steps.forEach((step, index) => {
      const local = step.clientKey ? localByKey.get(step.clientKey) : null;
      const server = latest.steps[index];
      if (local && !local.id && server?.id) local.id = server.id;
    });
  }
  function savedSnapshotMatches(snapshot, latest) {
    if (String(snapshot.title || "").trim() !== latest?.draft?.title || snapshot.description !== latest?.draft?.description || !Array.isArray(latest?.steps) || snapshot.steps.length !== latest.steps.length) return false;
    return snapshot.steps.every((step, index) => {
      const server = latest.steps[index];
      return server && (!step.id || step.id === server.id) && (step.type || "action") === server.type && String(step.title || "").trim() === server.title && String(step.instruction || "") === server.instruction && (step.actionType ?? null) === (server.actionType ?? null) && (step.targetText ?? null) === (server.targetText ?? null) && (step.url ?? null) === (server.url ?? null) && (step.assetId ?? null) === (server.assetId ?? null);
    });
  }
  async function reconcileSavedDraft(manualId, snapshot) {
    try {
      const latest = await json(workspacePath() + "/manuals/" + encodeURIComponent(manualId));
      if (latest?.draft?.updatedAt && savedSnapshotMatches(snapshot, latest)) {
        if (detailData?.manual?.id === manualId) detailData = latest;
        mergeServerStepIds(snapshot, latest);
        syncManualListTitle(manualId, latest.draft.title);
        return true;
      }
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        clearProtectedEditor();
        return "auth-lost";
      }
    }
    return false;
  }
  async function saveManual(manualId, saveButton) {
    if (!editorState || saveInFlight) return;
    const snapshot = clone(editorState);
    const validationMessage = validateSnapshot(snapshot);
    if (validationMessage) { setMessage(validationMessage, "error"); return; }
    const version = editVersion;
    saveInFlight = true;
    renderList();
    if (reloadButton) reloadButton.disabled = true;
    if (saveButton) saveButton.disabled = true;
    const expectedUpdatedAt = detailData?.draft?.updatedAt;
    setMessage("変更を保存しています…");
    try {
      const result = await json(workspacePath() + "/manuals/" + encodeURIComponent(manualId) + "/draft", {
        method: "PATCH",
        body: JSON.stringify({
          title: String(snapshot.title || "").trim(),
          description: snapshot.description,
          steps: snapshot.steps.map(stepForSave),
          expectedUpdatedAt
        })
      });
      if (result?.updatedAt && detailData?.manual?.id === manualId && detailData?.draft) detailData.draft.updatedAt = result.updatedAt;
      if (version === editVersion) {
        dirty = false;
        setMessage("変更を保存しました。", "success");
        const refreshed = await openManual(manualId, { force: true, expectedUpdatedAt: result?.updatedAt, expectedSnapshot: snapshot });
        if (refreshed === false) {
          dirty = true;
          setMessage("保存結果と最新内容を確認できませんでした。入力内容を保持しています。", "warning");
        } else if (refreshed === true) {
          syncManualListTitle(manualId, snapshot.title.trim());
        }
      } else {
        const reconciled = await reconcileSavedDraft(manualId, snapshot);
        if (reconciled === "auth-lost") return;
        setMessage("保存中に入力が変更されました。変更は画面に保持されています。", "warning");
      }
    } catch (error) {
      if (!error.status) {
        const reconciled = await reconcileSavedDraft(manualId, snapshot);
        if (reconciled === "auth-lost") return;
        setMessage(reconciled ? "保存結果を確認しました。入力内容を保持しています。" : "保存結果を確認できませんでした。入力内容を保持したまま、一覧で状態を確認してください。", "warning");
      } else if (error.status === 401 || error.status === 403) {
        clearProtectedEditor();
        setMessage("認証または権限を確認できません。画面を更新してください。", "error");
      } else {
        setMessage(error.status === 409 ? "別の編集結果があります。入力内容を保持したまま、最新の内容を確認してください。" : error.message, "error");
      }
    } finally {
      saveInFlight = false;
      renderList();
      if (reloadButton) reloadButton.disabled = false;
      const currentSaveButton = detail.querySelector("button[type=submit]");
      if (currentSaveButton) currentSaveButton.disabled = false;
      if (saveButton) saveButton.disabled = false;
    }
  }
  async function loadManuals(openId = "", options = {}) {
    const serial = ++requestSerial;
    setMessage("保存した手順書を読み込んでいます…");
    try {
      const payload = await json(workspacePath() + "/manuals");
      if (serial !== requestSerial) return;
      manuals = Array.isArray(payload.manuals) ? payload.manuals : [];
      selected = openId ? manuals.find((item) => item.id === openId) || selected : selected && manuals.find((item) => item.id === selected.id) || null;
      renderList();
      if (selected && !options.preserveDetail) await openManual(selected.id, options);
      else if (!selected) { renderDetail(null); setMessage("保存した手順書を選択してください。", "success"); }
    } catch (error) {
      if (serial !== requestSerial) return;
      if (error.status === 401 || error.status === 403) clearProtectedEditor();
      renderList();
      setMessage(error.status === 401 || error.status === 403 ? "認証または権限を確認できません。画面を更新してください。" : error.message, "error");
    }
  }
  async function openManual(id, options = {}) {
    if (saveInFlight && !options.force) return;
    if (dirty && !options.force && !window.confirm("編集中の変更を破棄して別の手順書を開きますか？")) return;
    const serial = ++requestSerial;
    selected = manuals.find((item) => item.id === id) || null;
    shareState = null; shareToken = null; shareMetaError = null;
    renderList();
    if (!selected) { renderDetail(null); return; }
    setMessage("手順書を読み込んでいます…");
    try {
      const data = await json(workspacePath() + "/manuals/" + encodeURIComponent(id));
      if (serial !== requestSerial) return;
      if (options.expectedUpdatedAt && (data?.draft?.updatedAt !== options.expectedUpdatedAt || !savedSnapshotMatches(options.expectedSnapshot, data))) return false;
      detailData = data;
      editorState = {
        title: data.draft?.title || data.manual?.title || "",
        description: data.draft?.description || "",
        steps: Array.isArray(data.steps) ? clone(data.steps).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) : []
      };
      dirty = false;
      editVersion += 1;
      const shareResult = await loadShareMetadata(id);
      if (serial !== requestSerial) return;
      shareState = shareResult.state;
      shareMetaError = shareResult.error;
      renderDetail(data);
      setMessage("手順書を表示しています。", "success");
      return true;
    } catch (error) {
      if (serial !== requestSerial) return;
      if (error.status === 401 || error.status === 403) {
        clearProtectedEditor();
        setMessage("認証または権限を確認できません。画面を更新してください。", "error");
        return "auth-lost";
      }
      setMessage(error.message, "error");
      return false;
    }
  }
  if (!workspaceId) setMessage("ワークスペースを確認できません。", "error"); else loadManuals(new URLSearchParams(location.search).get("shareManualId") || "");
})();`;

export function renderCloudManualsPage({ workspaceId = "", assetVersion = "" } = {}) {
  const version = assetVersion ? `?v=${encodeURIComponent(assetVersion)}` : "";
  const safeWorkspaceId = String(workspaceId).replace(/[&<>"']/g, "");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>手順書 | めっちゃマニュアル</title><link rel="stylesheet" href="/assets/cloud-manual.css${version}"></head><body><main id="cloud-manuals" class="cloud-shell" data-workspace-id="${safeWorkspaceId}"><header class="cloud-header"><div><p aria-hidden="true">MECCHA MANUAL</p><h1>保存した手順書</h1><p class="cloud-note">ワークスペースに保存された手順書を確認・編集できます。</p></div></header><p id="cloud-message" class="cloud-message" role="status" aria-live="polite"></p><div class="cloud-grid"><section class="cloud-panel" aria-labelledby="cloud-list-heading"><h2 id="cloud-list-heading">手順書一覧</h2><div id="cloud-list"></div></section><section class="cloud-panel" aria-labelledby="cloud-detail-heading"><h2 id="cloud-detail-heading" class="sr-only">手順書の内容</h2><div id="cloud-detail"><p class="cloud-note">左の一覧から手順書を選んでください。</p></div></section></div></main><script src="/assets/cloud-manual.js${version}" defer></script></body></html>`;
}
