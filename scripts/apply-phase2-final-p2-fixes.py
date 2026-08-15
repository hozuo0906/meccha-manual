from pathlib import Path

APP = Path('apps/worker/src/app-assets.ts')
ROUTER = Path('apps/worker/src/manual-router.ts')
API_TEST = Path('tests/manual-api.test.mjs')
STATIC_TEST = Path('tests/manual-editor-ui.test.mjs')
E2E = Path('tests/e2e/phase2-manual-editor.spec.mjs')

app = APP.read_text(encoding='utf-8')

old_revocation = '''    if (error.status === 403 || error.status === 404) {
      setManualMutationBusyState(false);
      const safeValue = manualDetailState.value
        ? { ...manualDetailState.value, permissions: { ...(manualDetailState.value.permissions || {}), canEdit: false } }
        : null;
      manualDetailState = { ...manualDetailState, status: "loaded", value: safeValue, message: error.message, messageKind: "error" };
      renderShell(currentSession, "", "notice", "manual-detail-message");
      await loadManualDetail(workspaceId, manualId, { message: error.message, messageKind: "error", focusId: "manual-detail-message" });
      return;
    }'''
new_revocation = '''    if (error.status === 403 || error.status === 404) {
      setManualMutationBusyState(false);
      if (workspaceMembersState?.workspaceId === workspaceId) {
        workspaceMembersState = {
          ...workspaceMembersState,
          status: "loading",
          currentUserRole: null,
          members: [],
          message: error.message,
          messageKind: "error"
        };
      }
      const safeValue = manualDetailState.value
        ? { ...manualDetailState.value, permissions: { ...(manualDetailState.value.permissions || {}), canEdit: false } }
        : null;
      manualDetailState = { ...manualDetailState, status: "loaded", value: safeValue, message: error.message, messageKind: "error" };
      renderShell(currentSession, "", "notice", "manual-detail-message");
      await loadWorkspaceMembers(workspaceId, {
        message: error.message,
        messageKind: "error",
        focusId: "manual-detail-message",
        alreadyRendered: true
      });
      await loadManualDetail(workspaceId, manualId, { message: error.message, messageKind: "error", focusId: "manual-detail-message" });
      return;
    }'''
if old_revocation not in app:
    raise SystemExit('detail revocation snippet not found')
app = app.replace(old_revocation, new_revocation, 1)

old_payload = '''function stepPayloadFromForm(form, isNew) {
  const payload = {
    type: form.elements.type.value,
    title: String(form.elements.title.value || "").trim(),
    actionType: form.elements.actionType.value || null,
    targetText: String(form.elements.targetText.value || "").trim() || null,
    url: String(form.elements.url.value || "").trim() || null
  };'''
new_payload = '''function stepPayloadFromForm(form, isNew) {
  const type = form.elements.type.value;
  const isAction = type === "action";
  const payload = {
    type,
    title: String(form.elements.title.value || "").trim(),
    actionType: isAction ? form.elements.actionType.value || null : null,
    targetText: isAction ? String(form.elements.targetText.value || "").trim() || null : null,
    url: String(form.elements.url.value || "").trim() || null
  };'''
if old_payload not in app:
    raise SystemExit('step payload snippet not found')
app = app.replace(old_payload, new_payload, 1)
APP.write_text(app, encoding='utf-8')

router = ROUTER.read_text(encoding='utf-8')
old_router = '''    if (message.includes("folder not found in workspace")) {
      throw new ManualError(400, "MANUAL_FOLDER_INVALID", "フォルダーを確認してください。");
    }
    throw new ManualError(502, "MANUAL_CREATE_SERVICE_UNAVAILABLE", "手順書作成サービスを利用できません。入力を変えず、時間をおいて確認してください。");'''
new_router = '''    if (message.includes("folder not found in workspace")) {
      throw new ManualError(400, "MANUAL_FOLDER_INVALID", "フォルダーを確認してください。");
    }
    if (message.includes("workspace editor role required")) {
      throw new ManualError(403, "MANUAL_CREATE_FORBIDDEN", "現在の権限では手順書を作成できません。");
    }
    throw new ManualError(502, "MANUAL_CREATE_SERVICE_UNAVAILABLE", "手順書作成サービスを利用できません。入力を変えず、時間をおいて確認してください。");'''
if old_router not in router:
    raise SystemExit('manual create error mapping snippet not found')
router = router.replace(old_router, new_router, 1)
ROUTER.write_text(router, encoding='utf-8')

api = API_TEST.read_text(encoding='utf-8')
marker = '''test("create upstream 5xx is result-unknown and does not invite immediate retry", async () => {'''
addition = '''test("create RPC role revocation is a determinate 403", async () => {
  const mock = installFetch([
    authOk(), memberOk(), editorOk(), json({ message: "workspace editor role required" }, 400)
  ]);
  try {
    const response = await handleManualRoute(
      request("POST", JSON.stringify({ title: "保存手順" })),
      ENV
    );
    assert.equal(response?.status, 403);
    assert.equal((await response.json()).code, "MANUAL_CREATE_FORBIDDEN");
    assert.equal(mock.calls.length, 4);
  } finally {
    mock.restore();
  }
});

'''
if marker not in api:
    raise SystemExit('API test marker not found')
api = api.replace(marker, addition + marker, 1)
API_TEST.write_text(api, encoding='utf-8')

static = STATIC_TEST.read_text(encoding='utf-8')
old_static = '''  assert.match(source, /error\\.status === 403 \\|\\| error\\.status === 404[\\s\\S]*canEdit: false[\\s\\S]*loadManualDetail\\(workspaceId, manualId/);'''
new_static = '''  assert.match(source, /error\\.status === 403 \\|\\| error\\.status === 404[\\s\\S]*currentUserRole: null[\\s\\S]*canEdit: false[\\s\\S]*loadWorkspaceMembers\\(workspaceId[\\s\\S]*loadManualDetail\\(workspaceId, manualId/);
  assert.match(source, /const isAction = type === "action"[\\s\\S]*actionType: isAction[\\s\\S]*targetText: isAction/);'''
if old_static not in static:
    raise SystemExit('static test snippet not found')
static = static.replace(old_static, new_static, 1)
STATIC_TEST.write_text(static, encoding='utf-8')

e2e = E2E.read_text(encoding='utf-8')
old_state = '''    failNextManualCreate: null,
    failNextStepPatch: null,
    currentRole: role,'''
new_state = '''    failNextManualCreate: null,
    failNextStepPatch: null,
    lastStepCreateBody: null,
    lastStepPatchBody: null,
    currentRole: role,'''
if old_state not in e2e:
    raise SystemExit('fixture state snippet not found')
e2e = e2e.replace(old_state, new_state, 1)

old_create = '''    if (pathname === `/api/workspaces/${workspaceId}/manuals/${manualId}/steps` && method === "POST") {
      const body = request.postDataJSON();
      const instruction = body.instruction || `［${body.targetText}］をクリックします。`;'''
new_create = '''    if (pathname === `/api/workspaces/${workspaceId}/manuals/${manualId}/steps` && method === "POST") {
      const body = request.postDataJSON();
      state.lastStepCreateBody = body;
      const instruction = body.instruction || (body.type === "action" ? `［${body.targetText}］をクリックします。` : "");'''
if old_create not in e2e:
    raise SystemExit('fixture create snippet not found')
e2e = e2e.replace(old_create, new_create, 1)

old_patch = '''      const { expectedUpdatedAt, ...stepPatch } = body;
      state.instructionSeenOnPatch = stepPatch.instruction;'''
new_patch = '''      const { expectedUpdatedAt, ...stepPatch } = body;
      state.lastStepPatchBody = body;
      state.instructionSeenOnPatch = stepPatch.instruction;'''
if old_patch not in e2e:
    raise SystemExit('fixture patch snippet not found')
e2e = e2e.replace(old_patch, new_patch, 1)

marker2 = '''test("手順書画面は狭い表示でも横スクロールせずキーボードで移動できる", async ({ page }) => {'''
addition2 = '''test("非action手順はaction専用項目を送信しない", async ({ page }) => {
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

  await page.locator(`#step-type-${firstStepId}`).selectOption("warning");
  await page.getByRole("button", { name: "手順を保存" }).first().click();
  expect(state.lastStepPatchBody.actionType).toBeNull();
  expect(state.lastStepPatchBody.targetText).toBeNull();

  await page.locator("#new-step-type").selectOption("note");
  await page.locator("#new-step-title").fill("補足事項");
  await page.getByRole("button", { name: "手順を追加" }).click();
  expect(state.lastStepCreateBody.actionType).toBeNull();
  expect(state.lastStepCreateBody.targetText).toBeNull();
});

'''
if marker2 not in e2e:
    raise SystemExit('E2E insertion marker not found')
e2e = e2e.replace(marker2, addition2 + marker2, 1)

old_membership = '''  state.failNextStepPatch = { status: 404, code: "MANUALS_NOT_FOUND", message: "所属を確認できません。" };
  await page.getByRole("button", { name: "手順を保存" }).click();
  await expect(page.locator("#manual-draft-form")).toHaveCount(0);
  await expect(page.locator(".manual-step-form")).toHaveCount(0);
});'''
new_membership = '''  state.failNextStepPatch = { status: 404, code: "MANUALS_NOT_FOUND", message: "所属を確認できません。" };
  await page.getByRole("button", { name: "手順を保存" }).click();
  await expect(page.locator("#manual-draft-form")).toHaveCount(0);
  await expect(page.locator(".manual-step-form")).toHaveCount(0);
  await page.getByRole("button", { name: "手順書一覧へ戻る" }).click();
  await expect(page.locator("#manual-create-form")).toHaveCount(0);
});'''
if old_membership not in e2e:
    raise SystemExit('membership E2E snippet not found')
e2e = e2e.replace(old_membership, new_membership, 1)
E2E.write_text(e2e, encoding='utf-8')

print('Final Phase 2 P2 fixes applied.')
