import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

function replaceOnce(source, find, replacement, label) {
  const index = source.indexOf(find);
  if (index < 0) throw new Error(`Missing replacement target: ${label}`);
  if (source.indexOf(find, index + find.length) >= 0) throw new Error(`Replacement target is not unique: ${label}`);
  return `${source.slice(0, index)}${replacement}${source.slice(index + find.length)}`;
}

function replaceBetween(source, start, end, replacement, label) {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) throw new Error(`Missing start target: ${label}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (endIndex < 0) throw new Error(`Missing end target: ${label}`);
  return `${source.slice(0, startIndex)}${replacement}${source.slice(endIndex)}`;
}

function replaceAllExact(source, find, replacement, expectedCount, label) {
  const count = source.split(find).length - 1;
  if (count !== expectedCount) throw new Error(`Unexpected replacement count for ${label}: expected ${expectedCount}, got ${count}`);
  return source.split(find).join(replacement);
}

let appAssets = await readFile("apps/worker/src/app-assets.ts", "utf8");

appAssets = replaceOnce(
  appAssets,
  `  sessionReloadSequence += 1;
  workspaceMemberRequestSequence += 1;
  if (pendingWorkspaceMemberMutation) pendingWorkspaceMemberMutation.authReconciled = false;`,
  `  sessionReloadSequence += 1;
  workspaceMemberRequestSequence += 1;
  manualRequestSequence += 1;
  if (pendingWorkspaceMemberMutation) pendingWorkspaceMemberMutation.authReconciled = false;`,
  "invalidate manual requests after cross-tab authentication changes"
);

const manualDraftHelpers = String.raw`
function manualDetailFormKey(form) {
  if (!form) return "";
  if (form.id === "manual-draft-form") return "draft";
  if (form.id === "manual-step-add-form") return "new-step";
  if (form.classList.contains("manual-step-form") && form.dataset.stepId) return "step:" + form.dataset.stepId;
  return "";
}

function manualDetailBaselineValue(key, name) {
  const detail = manualDetailState.value;
  if (!detail) return "";
  if (key === "draft") {
    if (name === "title") return String(detail.draft?.title || "");
    if (name === "description") return String(detail.draft?.description || "");
    return "";
  }
  if (key === "new-step") {
    if (name === "type") return "action";
    if (name === "actionType") return "click";
    return "";
  }
  if (!key.startsWith("step:")) return "";
  const step = (detail.steps || []).find((item) => item.id === key.slice(5));
  if (!step) return "";
  const values = {
    type: step.type,
    title: step.title,
    actionType: step.actionType,
    targetText: step.targetText,
    instruction: step.instruction,
    url: step.url
  };
  return String(values[name] ?? "");
}

function captureManualDetailDrafts(excludedKeys = []) {
  const excluded = new Set(excludedKeys);
  const drafts = {};
  const forms = document.querySelectorAll("#manual-draft-form, #manual-step-add-form, .manual-step-form");
  for (const form of forms) {
    const key = manualDetailFormKey(form);
    if (!key || excluded.has(key)) continue;
    const changed = {};
    for (const field of form.querySelectorAll("input[name], select[name], textarea[name]")) {
      const value = String(field.value ?? "");
      if (value !== manualDetailBaselineValue(key, field.name)) changed[field.name] = value;
    }
    if (Object.keys(changed).length > 0) drafts[key] = changed;
  }
  return drafts;
}

function findManualDetailForm(key) {
  if (key === "draft") return document.getElementById("manual-draft-form");
  if (key === "new-step") return document.getElementById("manual-step-add-form");
  if (!key.startsWith("step:")) return null;
  const stepId = key.slice(5);
  return [...document.querySelectorAll(".manual-step-form")].find((form) => form.dataset.stepId === stepId) || null;
}

function restoreManualDetailDrafts(drafts) {
  if (!drafts || typeof drafts !== "object") return;
  for (const [key, values] of Object.entries(drafts)) {
    const form = findManualDetailForm(key);
    if (!form) continue;
    for (const [name, value] of Object.entries(values || {})) {
      const field = form.elements.namedItem(name);
      if (field && typeof field.value !== "undefined") field.value = value;
    }
  }
}

function setManualMutationBusyState(isBusy, messageId = "", message = "") {
  manualMutationInFlight = isBusy;
  const screen = document.getElementById("screen-content");
  if (isBusy) screen?.setAttribute("aria-busy", "true");
  else screen?.removeAttribute("aria-busy");
  const forms = document.querySelectorAll("#manual-create-form, #manual-draft-form, #manual-step-add-form, .manual-step-form");
  for (const form of forms) {
    for (const control of form.querySelectorAll("button, input, select, textarea")) {
      if (isBusy) {
        if (!control.hasAttribute("data-manual-disabled-before")) {
          control.setAttribute("data-manual-disabled-before", control.disabled ? "true" : "false");
        }
        control.disabled = true;
      } else if (control.hasAttribute("data-manual-disabled-before")) {
        control.disabled = control.getAttribute("data-manual-disabled-before") === "true";
        control.removeAttribute("data-manual-disabled-before");
      }
    }
  }
  if (messageId && message) setBox(messageId, message, "notice", false);
}

`;
appAssets = replaceOnce(
  appAssets,
  "\n\nfunction manualCanEdit(currentWorkspace) {",
  `\n\n${manualDraftHelpers}function manualCanEdit(currentWorkspace) {`,
  "manual editor memory-only draft helpers"
);

appAssets = replaceAllExact(
  appAssets,
  '<h2 id="members-heading">',
  '<h2 id="members-heading" tabindex="-1">',
  4,
  "focusable member headings"
);

const loadManuals = String.raw`async function loadManuals(workspaceId, options = {}) {
  const requestGeneration = sessionGeneration;
  const requestUserId = currentSession?.user?.id;
  const sequence = ++manualRequestSequence;
  manualsState = { workspaceId, status: "loading", items: manualsState.workspaceId === workspaceId ? manualsState.items : [], message: "", messageKind: "notice" };
  renderShell(currentSession, "", "notice", options.focusId || null);
  try {
    const payload = await requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals");
    if (
      requestGeneration !== sessionGeneration || requestUserId !== currentSession?.user?.id ||
      sequence !== manualRequestSequence || currentWorkspaceSelection?.workspaceId !== workspaceId
    ) return;
    if (!Array.isArray(payload.manuals)) throw new AppRequestError("手順書一覧を確認できませんでした。", 502, "MANUALS_RESPONSE_INVALID");
    manualsState = { workspaceId, status: "loaded", items: payload.manuals, message: options.message || "", messageKind: options.messageKind || "notice" };
    renderShell(currentSession, "", "notice", options.focusId || null);
  } catch (error) {
    if (
      requestGeneration !== sessionGeneration || requestUserId !== currentSession?.user?.id ||
      sequence !== manualRequestSequence
    ) return;
    if (isTerminalSessionError(error)) return loadSession();
    manualsState = { workspaceId, status: "error", items: [], message: error.message, messageKind: "error" };
    renderShell(currentSession, "", "notice", "manuals-message");
  }
}

`;
appAssets = replaceBetween(
  appAssets,
  "async function loadManuals(workspaceId, options = {}) {",
  "function openManualDetail(workspaceId, manualId) {",
  loadManuals,
  "manual list request subject guards"
);

const loadManualDetail = String.raw`async function loadManualDetail(workspaceId, manualId, options = {}) {
  const requestGeneration = sessionGeneration;
  const requestUserId = currentSession?.user?.id;
  const sequence = ++manualRequestSequence;
  manualDetailState = { ...manualDetailState, workspaceId, manualId, status: "loading", message: "", messageKind: "notice" };
  if (!options.preserveDomUntilLoaded) renderShell(currentSession, "", "notice", options.focusId || null);
  try {
    const payload = await requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals/" + encodeURIComponent(manualId));
    if (
      requestGeneration !== sessionGeneration || requestUserId !== currentSession?.user?.id ||
      sequence !== manualRequestSequence || currentWorkspaceSelection?.workspaceId !== workspaceId
    ) {
      if (options.finishMutation) {
        setManualMutationBusyState(false);
        loadSession({ focusId: "workspace-heading" });
      }
      return;
    }
    if (options.finishMutation) manualMutationInFlight = false;
    manualDetailState = { workspaceId, manualId, status: "loaded", value: payload, message: options.message || "", messageKind: options.messageKind || "notice" };
    renderShell(currentSession, "", "notice", options.focusId || null);
    restoreManualDetailDrafts(options.restoreDrafts);
  } catch (error) {
    if (
      requestGeneration !== sessionGeneration || requestUserId !== currentSession?.user?.id ||
      sequence !== manualRequestSequence
    ) {
      if (options.finishMutation) {
        setManualMutationBusyState(false);
        loadSession({ focusId: "workspace-heading" });
      }
      return;
    }
    if (isTerminalSessionError(error)) {
      setManualMutationBusyState(false);
      return loadSession();
    }
    if (
      options.preserveDomOnError && currentScreen === "manual-detail" &&
      manualDetailState.workspaceId === workspaceId && manualDetailState.manualId === manualId && manualDetailState.value
    ) {
      manualDetailState = { ...manualDetailState, status: "loaded", message: error.message, messageKind: "error" };
      setManualMutationBusyState(false);
      setBox("manual-detail-message", error.message, "error");
      return;
    }
    if (options.finishMutation) manualMutationInFlight = false;
    manualDetailState = { workspaceId, manualId, status: "error", value: null, message: error.message, messageKind: "error" };
    renderShell(currentSession, "", "notice", "manual-detail-message");
  }
}

`;
appAssets = replaceBetween(
  appAssets,
  "async function loadManualDetail(workspaceId, manualId, options = {}) {",
  "function manualMutationUnknown(error) {",
  loadManualDetail,
  "manual detail request subject guards and draft restoration"
);

const createManualFromUi = String.raw`async function createManualFromUi(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const workspaceId = currentWorkspaceSelection?.workspaceId;
  const requestGeneration = sessionGeneration;
  const requestUserId = currentSession?.user?.id;
  const title = String(form.elements.title.value || "").trim();
  const description = String(form.elements.description.value || "");
  if (!workspaceId || !title || Array.from(title).length > 64 || Array.from(description).length > 10000) {
    manualsState.message = "タイトルは1〜64文字、説明は10,000文字以内で入力してください。";
    manualsState.messageKind = "error";
    renderShell(currentSession, "", "notice", "manuals-message");
    return;
  }
  setManualMutationBusyState(true, "manuals-message", "手順書を作成しています。");
  try {
    const payload = await requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals", { method: "POST", body: JSON.stringify({ title, description, folderId: null }) });
    if (requestGeneration !== sessionGeneration || requestUserId !== currentSession?.user?.id) {
      setManualMutationBusyState(false);
      await loadSession({ focusId: "workspace-heading" });
      return;
    }
    setManualMutationBusyState(false);
    openManualDetail(workspaceId, payload.manualId);
  } catch (error) {
    if (requestGeneration !== sessionGeneration || requestUserId !== currentSession?.user?.id) {
      setManualMutationBusyState(false);
      await loadSession({ focusId: "workspace-heading" });
      return;
    }
    if (isTerminalSessionError(error)) {
      setManualMutationBusyState(false);
      return loadSession();
    }
    if (manualMutationUnknown(error)) {
      setManualMutationBusyState(false);
      await loadManuals(workspaceId, { message: "作成結果を一覧で確認してください。重ねて作成しないでください。", messageKind: "warning", focusId: "manuals-message" });
      return;
    }
    manualsState = { ...manualsState, message: error.message, messageKind: "error" };
    setManualMutationBusyState(false);
    setBox("manuals-message", error.message, "error");
  }
}

`;
appAssets = replaceBetween(
  appAssets,
  "async function createManualFromUi(event) {",
  "async function runDetailMutation(operation, successMessage) {",
  createManualFromUi,
  "manual creation preserves determinate-error inputs"
);

const runDetailMutation = String.raw`async function runDetailMutation(operation, successMessage, options = {}) {
  const workspaceId = manualDetailState.workspaceId;
  const manualId = manualDetailState.manualId;
  const requestGeneration = sessionGeneration;
  const requestUserId = currentSession?.user?.id;
  const retainedDrafts = captureManualDetailDrafts(options.excludeDraftKeys || []);
  setManualMutationBusyState(true, "manual-detail-message", "保存しています。");
  try {
    await operation(workspaceId, manualId);
    if (requestGeneration !== sessionGeneration || requestUserId !== currentSession?.user?.id) {
      setManualMutationBusyState(false);
      await loadSession({ focusId: "workspace-heading" });
      return;
    }
    await loadManualDetail(workspaceId, manualId, {
      message: successMessage,
      messageKind: "notice",
      focusId: "manual-detail-message",
      preserveDomUntilLoaded: true,
      preserveDomOnError: true,
      finishMutation: true,
      restoreDrafts: retainedDrafts
    });
  } catch (error) {
    if (requestGeneration !== sessionGeneration || requestUserId !== currentSession?.user?.id) {
      setManualMutationBusyState(false);
      await loadSession({ focusId: "workspace-heading" });
      return;
    }
    if (isTerminalSessionError(error)) {
      setManualMutationBusyState(false);
      return loadSession();
    }
    if (error.status === 403) {
      setManualMutationBusyState(false);
      const safeValue = manualDetailState.value
        ? { ...manualDetailState.value, permissions: { ...(manualDetailState.value.permissions || {}), canEdit: false } }
        : null;
      manualDetailState = { ...manualDetailState, status: "loaded", value: safeValue, message: error.message, messageKind: "error" };
      renderShell(currentSession, "", "notice", "manual-detail-message");
      await loadManualDetail(workspaceId, manualId, { message: error.message, messageKind: "error", focusId: "manual-detail-message" });
      return;
    }
    if (manualMutationUnknown(error)) {
      await loadManualDetail(workspaceId, manualId, {
        message: "処理結果を詳細で確認してください。重ねて操作しないでください。",
        messageKind: "warning",
        focusId: "manual-detail-message",
        preserveDomUntilLoaded: true,
        preserveDomOnError: true,
        finishMutation: true,
        restoreDrafts: retainedDrafts
      });
      return;
    }
    manualDetailState = { ...manualDetailState, status: "loaded", message: error.message, messageKind: "error" };
    setManualMutationBusyState(false);
    setBox("manual-detail-message", error.message, "error");
  }
}

`;
appAssets = replaceBetween(
  appAssets,
  "async function runDetailMutation(operation, successMessage) {",
  "function updateManualDraftFromUi(event) {",
  runDetailMutation,
  "manual detail mutation draft preservation and permission refresh"
);

appAssets = replaceOnce(
  appAssets,
  `  return runDetailMutation((workspaceId, manualId) => requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals/" + encodeURIComponent(manualId) + "/draft", { method: "PATCH", body: JSON.stringify({ title, description }) }), "基本情報を保存しました。");`,
  `  return runDetailMutation((workspaceId, manualId) => requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals/" + encodeURIComponent(manualId) + "/draft", { method: "PATCH", body: JSON.stringify({ title, description }) }), "基本情報を保存しました。", { excludeDraftKeys: ["draft"] });`,
  "exclude submitted metadata draft"
);
appAssets = replaceOnce(
  appAssets,
  `  return runDetailMutation((workspaceId, manualId) => requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals/" + encodeURIComponent(manualId) + "/steps", { method: "POST", body: JSON.stringify(payload) }), "手順を追加しました。");`,
  `  return runDetailMutation((workspaceId, manualId) => requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals/" + encodeURIComponent(manualId) + "/steps", { method: "POST", body: JSON.stringify(payload) }), "手順を追加しました。", { excludeDraftKeys: ["new-step"] });`,
  "exclude submitted new-step draft"
);
appAssets = replaceOnce(
  appAssets,
  `  return runDetailMutation((workspaceId, manualId) => requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals/" + encodeURIComponent(manualId) + "/steps/" + encodeURIComponent(stepId), { method: "PATCH", body: JSON.stringify(payload) }), "手順を保存しました。");`,
  `  return runDetailMutation((workspaceId, manualId) => requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals/" + encodeURIComponent(manualId) + "/steps/" + encodeURIComponent(stepId), { method: "PATCH", body: JSON.stringify(payload) }), "手順を保存しました。", { excludeDraftKeys: ["step:" + stepId] });`,
  "exclude submitted existing-step draft"
);
appAssets = replaceOnce(
  appAssets,
  `  return runDetailMutation((workspaceId, manualId) => requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals/" + encodeURIComponent(manualId) + "/steps/" + encodeURIComponent(stepId), { method: "DELETE" }), "手順を削除しました。");`,
  `  return runDetailMutation((workspaceId, manualId) => requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals/" + encodeURIComponent(manualId) + "/steps/" + encodeURIComponent(stepId), { method: "DELETE" }), "手順を削除しました。", { excludeDraftKeys: ["step:" + stepId] });`,
  "exclude deleted step draft"
);

const appAssetsModuleUrl = `data:text/javascript;base64,${Buffer.from(appAssets).toString("base64")}`;
const { APP_CSS, APP_JS } = await import(appAssetsModuleUrl);
const assetVersion = `sha256-${createHash("sha256")
  .update(APP_CSS)
  .update("\0")
  .update(APP_JS)
  .digest("hex")
  .slice(0, 16)}`;
appAssets = appAssets.replace(/APP_ASSET_VERSION = "[^"]+"/, `APP_ASSET_VERSION = "${assetVersion}"`);
await writeFile("apps/worker/src/app-assets.ts", appAssets, "utf8");

let uiTest = await readFile("tests/manual-editor-ui.test.mjs", "utf8");
uiTest = replaceOnce(
  uiTest,
  `    '入力した値やパスワードは記録せず',
    '外部AIは使用しません。'`,
  `    '入力した値やパスワードは記録せず',
    '外部AIは使用しません。',
    'function captureManualDetailDrafts',
    'preserveDomUntilLoaded: true',
    'requestGeneration !== sessionGeneration'`,
  "manual editor review hardening snippets"
);
uiTest = replaceOnce(
  uiTest,
  `  assert.match(source, /<div role="listitem"><button class="manual-list-item" type="button" data-manual-id=/);
  assert.doesNotMatch(source, /<button[^>]*role="listitem"/);`,
  `  assert.match(source, /<div role="listitem"><button class="manual-list-item" type="button" data-manual-id=/);
  assert.doesNotMatch(source, /<button[^>]*role="listitem"/);
  assert.match(source, /id="members-heading" tabindex="-1"/);
  assert.doesNotMatch(source, /manualMutationInFlight = true;\\n  renderShell\\(currentSession\\);/);`,
  "static unsaved-edit and member focus assertions"
);
uiTest = replaceOnce(
  uiTest,
  `  assert.match(spec, /閲覧者は手順書と手順を閲覧できるが編集フォームは表示されない/);`,
  `  assert.match(spec, /閲覧者は手順書と手順を閲覧できるが編集フォームは表示されない/);
  assert.match(spec, /権限失効時は編集UIを閉じて最新権限を再取得する/);`,
  "permission-loss browser contract"
);
await writeFile("tests/manual-editor-ui.test.mjs", uiTest, "utf8");

let e2e = await readFile("tests/e2e/phase2-manual-editor.spec.mjs", "utf8");
e2e = replaceOnce(
  e2e,
  `    steps: options.steps ? [...options.steps] : [],
    instructionSeenOnPatch: null
  };
  const session = sessionFor(role);
  const canEdit = role !== "viewer";`,
  `    steps: options.steps ? [...options.steps] : [],
    instructionSeenOnPatch: null,
    failNextStepPatch: null,
    canEdit: role !== "viewer"
  };
  const session = sessionFor(role);`,
  "mutable permission and failure fixture state"
);
e2e = replaceOnce(e2e, "        permissions: { canEdit }", "        permissions: { canEdit: state.canEdit }", "detail permission fixture");
e2e = replaceOnce(
  e2e,
  `    if (pathname === \`/api/workspaces/${workspaceId}/manuals/${manualId}/steps/${firstStepId}\` && method === "PATCH") {
      const body = request.postDataJSON();`,
  `    if (pathname === \`/api/workspaces/${workspaceId}/manuals/${manualId}/steps/${firstStepId}\` && method === "PATCH") {
      if (state.failNextStepPatch) {
        const failure = state.failNextStepPatch;
        state.failNextStepPatch = null;
        if (failure.status === 403) state.canEdit = false;
        return json(failure.status, { code: failure.code, message: failure.message });
      }
      const body = request.postDataJSON();`,
  "step patch determinate failure fixture"
);
e2e = replaceOnce(
  e2e,
  `  await expect(instruction).toHaveValue("［保存ボタン］をクリックします。");

  await instruction.fill("利用者が手修正した文章です。");
  await target.fill("確定ボタン");
  await page.getByRole("button", { name: "手順を保存" }).click();
  await expect(page.locator(\`#step-instruction-${firstStepId}\`)).toHaveValue("利用者が手修正した文章です。");
  expect(state.instructionSeenOnPatch).toBe("利用者が手修正した文章です。");`,
  `  await expect(instruction).toHaveValue("［保存ボタン］をクリックします。");

  await page.locator("#manual-draft-description").fill("別フォームの未保存説明");
  await instruction.fill("利用者が手修正した文章です。");
  await target.fill("確定ボタン");
  state.failNextStepPatch = { status: 409, code: "MANUAL_EDIT_CONFLICT", message: "更新競合を解消してください。" };
  await page.getByRole("button", { name: "手順を保存" }).click();
  await expect(page.locator("#manual-detail-message")).toContainText("更新競合を解消してください。");
  await expect(instruction).toHaveValue("利用者が手修正した文章です。");
  await expect(target).toHaveValue("確定ボタン");
  await expect(page.locator("#manual-draft-description")).toHaveValue("別フォームの未保存説明");
  expect(state.instructionSeenOnPatch).toBeNull();

  await page.getByRole("button", { name: "手順を保存" }).click();
  await expect(page.locator(\`#step-instruction-${firstStepId}\`)).toHaveValue("利用者が手修正した文章です。");
  await expect(page.locator("#manual-draft-description")).toHaveValue("別フォームの未保存説明");
  expect(state.instructionSeenOnPatch).toBe("利用者が手修正した文章です。");`,
  "preserve submitted and sibling drafts across error and success"
);
const permissionTest = String.raw`
test("権限失効時は編集UIを閉じて最新権限を再取得する", async ({ page }) => {
  const state = await installManualFixture(page, "editor", {
    steps: [{
      id: firstStepId,
      position: 0,
      type: "action",
      title: "保存する",
      instruction: "［保存ボタン］をクリックします。",
      actionType: "click",
      targetText: "保存ボタン",
      url: null,
      updatedAt: "2026-08-14T00:00:02.000Z"
    }]
  });
  await openManualScreen(page);
  await page.getByRole("button", { name: /既存の保存手順/ }).click();
  state.failNextStepPatch = { status: 403, code: "MANUAL_EDIT_FORBIDDEN", message: "編集権限がありません。" };
  await page.locator("#step-instruction-" + firstStepId).fill("保存しようとした文章");
  await page.getByRole("button", { name: "手順を保存" }).click();
  await expect(page.locator("#manual-draft-form")).toHaveCount(0);
  await expect(page.locator(".manual-step-form")).toHaveCount(0);
  await expect(page.getByText("現在の権限では閲覧のみ利用できます。" )).toBeVisible();
});

`;
e2e = replaceOnce(
  e2e,
  `test("閲覧者は手順書と手順を閲覧できるが編集フォームは表示されない", async ({ page }) => {`,
  `${permissionTest}test("閲覧者は手順書と手順を閲覧できるが編集フォームは表示されない", async ({ page }) => {`,
  "permission-loss browser test"
);
e2e = replaceOnce(
  e2e,
  `  await expect(page.locator("#manuals-message")).toHaveAttribute("aria-live", "polite");
});`,
  `  await expect(page.locator("#manuals-message")).toHaveAttribute("aria-live", "polite");
  await page.getByRole("button", { name: "メンバー管理", exact: true }).click();
  await expect(page.getByRole("heading", { name: "メンバー管理", exact: true })).toBeFocused();
});`,
  "member heading browser focus"
);
await writeFile("tests/e2e/phase2-manual-editor.spec.mjs", e2e, "utf8");

let docs = await readFile("docs/02-ux/phase2-manual-editor-ui.md", "utf8");
docs = replaceOnce(
  docs,
  `- mutation結果不明時は自動再送せず、詳細を再取得して確認を案内する。`,
  `- mutation結果不明時は自動再送せず、詳細を再取得して確認を案内する。
- 1フォームの保存中も他フォームの未保存変更は現在タブのメモリで保持し、確定エラーでは送信フォームの入力も残す。
- 編集mutationが403になった場合は編集UIを安全側で閉じ、詳細を再取得して最新権限を反映する。`,
  "manual editor determinate error and permission UX"
);
docs = replaceOnce(
  docs,
  `- 画面遷移後は画面見出しへフォーカスする。`,
  `- 画面遷移後は画面見出しへフォーカスする。メンバー管理見出しも\`tabindex="-1"\`でプログラムフォーカス可能にする。`,
  "member heading focus contract"
);
docs = replaceOnce(
  docs,
  `- editor作成・追加・手修正文保持: \`tests/e2e/phase2-manual-editor.spec.mjs\``,
  `- editor作成・追加・手修正文保持、確定エラー時の入力保持、別フォーム未保存変更の保持: \`tests/e2e/phase2-manual-editor.spec.mjs\`
- 403権限失効時の編集UI閉鎖と詳細再取得`,
  "review hardening tests"
);
await writeFile("docs/02-ux/phase2-manual-editor-ui.md", docs, "utf8");

console.log("Phase 2 manual editor review fixes applied.");
