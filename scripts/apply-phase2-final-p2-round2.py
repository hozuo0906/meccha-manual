from pathlib import Path


def replace_once(path_str: str, old: str, new: str) -> None:
    path = Path(path_str)
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path_str}: expected one match, found {count}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "apps/worker/src/app-assets.ts",
    '''async function runDetailMutation(operation, successMessage, options = {}) {''',
    '''function isCurrentManualDetailContext(workspaceId, manualId) {
  return currentScreen === "manual-detail" &&
    currentWorkspaceSelection?.workspaceId === workspaceId &&
    manualDetailState.workspaceId === workspaceId &&
    manualDetailState.manualId === manualId;
}

async function runDetailMutation(operation, successMessage, options = {}) {'''
)

replace_once(
    "apps/worker/src/app-assets.ts",
    '''    await loadManualDetail(workspaceId, manualId, {
      message: successMessage,''',
    '''    if (options.invalidateManuals && manualsState.workspaceId === workspaceId) {
      manualsState = { ...manualsState, status: "idle" };
    }
    if (!isCurrentManualDetailContext(workspaceId, manualId)) {
      setManualMutationBusyState(false);
      return;
    }
    await loadManualDetail(workspaceId, manualId, {
      message: successMessage,'''
)

replace_once(
    "apps/worker/src/app-assets.ts",
    '''    if (error.status === 403 || error.status === 404) {
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
    }
    if (manualMutationUnknown(error)) {''',
    '''    if (error.status === 403 || error.status === 404) {
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
      const activeManualId =
        currentScreen === "manual-detail" &&
        currentWorkspaceSelection?.workspaceId === workspaceId &&
        manualDetailState.workspaceId === workspaceId
          ? manualDetailState.manualId
          : "";
      if (activeManualId && manualDetailState.value) {
        const safeValue = {
          ...manualDetailState.value,
          permissions: { ...(manualDetailState.value.permissions || {}), canEdit: false }
        };
        manualDetailState = { ...manualDetailState, status: "loaded", value: safeValue, message: error.message, messageKind: "error" };
      } else if (currentScreen === "manuals" && currentWorkspaceSelection?.workspaceId === workspaceId) {
        manualsState = { ...manualsState, message: error.message, messageKind: "error" };
      }
      const focusId = activeManualId
        ? "manual-detail-message"
        : currentScreen === "manuals"
          ? "manuals-message"
          : null;
      renderShell(currentSession, "", "notice", focusId);
      await loadWorkspaceMembers(workspaceId, {
        message: error.message,
        messageKind: "error",
        focusId,
        alreadyRendered: true
      });
      if (activeManualId && isCurrentManualDetailContext(workspaceId, activeManualId)) {
        await loadManualDetail(workspaceId, activeManualId, { message: error.message, messageKind: "error", focusId: "manual-detail-message" });
      }
      return;
    }
    const resultUnknown = manualMutationUnknown(error);
    if (resultUnknown && options.invalidateManuals && manualsState.workspaceId === workspaceId) {
      manualsState = { ...manualsState, status: "idle" };
    }
    if (!isCurrentManualDetailContext(workspaceId, manualId)) {
      setManualMutationBusyState(false);
      return;
    }
    if (resultUnknown) {'''
)

replace_once(
    "apps/worker/src/app-assets.ts",
    '''{ excludeDraftKeys: ["draft"] });''',
    '''{ excludeDraftKeys: ["draft"], invalidateManuals: true });'''
)

replace_once(
    "docs/04-data/phase2-manual-core-setup.md",
    '''- `update_manual_draft(manual_id, title, description)`''',
    '''- `update_manual_draft(manual_id, expected_draft_id, expected_draft_updated_at, title, description)`（表示中draftのIDと更新日時をlock内で照合し、古い保存を拒否）'''
)

replace_once(
    "tests/e2e/phase2-manual-editor.spec.mjs",
    '''const manualId = "33333333-3333-4333-8333-333333333333";
const draftId = "44444444-4444-4444-8444-444444444444";
const firstStepId = "55555555-5555-4555-8555-555555555555";''',
    '''const manualId = "33333333-3333-4333-8333-333333333333";
const draftId = "44444444-4444-4444-8444-444444444444";
const firstStepId = "55555555-5555-4555-8555-555555555555";
const secondManualId = "66666666-6666-4666-8666-666666666666";
const secondDraftId = "77777777-7777-4777-8777-777777777777";'''
)

replace_once(
    "tests/e2e/phase2-manual-editor.spec.mjs",
    '''async function installManualFixture(page, role, options = {}) {
  const state = {
    manuals: options.empty ? [] : [{
      id: manualId,
      folderId: null,
      title: "既存の保存手順",
      status: "draft",
      currentDraftRevisionId: draftId,
      currentPublishedRevisionId: null,
      updatedAt: "2026-08-14T00:00:00.000Z"
    }],''',
    '''async function installManualFixture(page, role, options = {}) {
  const initialManuals = options.empty ? [] : [{
    id: manualId,
    folderId: null,
    title: "既存の保存手順",
    status: "draft",
    currentDraftRevisionId: draftId,
    currentPublishedRevisionId: null,
    updatedAt: "2026-08-14T00:00:00.000Z"
  }];
  if (options.secondManual) {
    initialManuals.push({
      id: secondManualId,
      folderId: null,
      title: "別の保存手順",
      status: "draft",
      currentDraftRevisionId: secondDraftId,
      currentPublishedRevisionId: null,
      updatedAt: "2026-08-14T00:00:00.500Z"
    });
  }
  const state = {
    manuals: initialManuals,'''
)

replace_once(
    "tests/e2e/phase2-manual-editor.spec.mjs",
    '''    manualCreateResolved: false,
    failNextManualCreate: null,''',
    '''    manualCreateResolved: false,
    draftPatchDeferred: null,
    releaseDraftPatch: null,
    draftPatchResolved: false,
    failNextManualCreate: null,'''
)

replace_once(
    "tests/e2e/phase2-manual-editor.spec.mjs",
    '''  if (options.deferManualCreate) {
    state.manualCreateDeferred = new Promise((resolve) => { state.releaseManualCreate = resolve; });
  }
  const session = sessionFor(role);''',
    '''  if (options.deferManualCreate) {
    state.manualCreateDeferred = new Promise((resolve) => { state.releaseManualCreate = resolve; });
  }
  if (options.deferDraftPatch) {
    state.draftPatchDeferred = new Promise((resolve) => { state.releaseDraftPatch = resolve; });
  }
  const session = sessionFor(role);'''
)

replace_once(
    "tests/e2e/phase2-manual-editor.spec.mjs",
    '''    if (pathname === `/api/workspaces/${workspaceId}/manuals/${manualId}` && method === "GET") {
      const title = state.manuals[0]?.title || "新しい手順書";
      return json(200, {
        manual: {
          id: manualId,
          title,
          status: "draft",
          currentDraftRevisionId: draftId,
          currentPublishedRevisionId: null,
          updatedAt: "2026-08-14T00:00:01.000Z"
        },
        draft: {
          id: draftId,
          revisionNo: 1,
          title,
          description: "受付担当者向け",
          updatedAt: state.draftUpdatedAt
        },
        steps: state.steps,
        permissions: { canEdit: state.canEdit }
      });
    }''',
    '''    if (
      (pathname === `/api/workspaces/${workspaceId}/manuals/${manualId}` ||
        pathname === `/api/workspaces/${workspaceId}/manuals/${secondManualId}`) &&
      method === "GET"
    ) {
      const requestedManualId = pathname.split("/").at(-1);
      const manual = state.manuals.find((item) => item.id === requestedManualId);
      if (!manual) return json(404, { code: "MANUALS_NOT_FOUND", message: "手順書がありません。" });
      const isPrimary = requestedManualId === manualId;
      return json(200, {
        manual,
        draft: {
          id: isPrimary ? draftId : secondDraftId,
          revisionNo: 1,
          title: manual.title,
          description: isPrimary ? "受付担当者向け" : "別手順書の説明",
          updatedAt: isPrimary ? state.draftUpdatedAt : "2026-08-14T00:00:01.500Z"
        },
        steps: isPrimary ? state.steps : [],
        permissions: { canEdit: state.canEdit }
      });
    }'''
)

replace_once(
    "tests/e2e/phase2-manual-editor.spec.mjs",
    '''      state.manuals[0].title = body.title;
      state.draftUpdatedAt = "2026-08-14T00:00:04.000Z";
      return json(200, { draftId });''',
    '''      state.manuals[0].title = body.title;
      state.manuals[0].updatedAt = "2026-08-14T00:00:04.000Z";
      state.draftUpdatedAt = "2026-08-14T00:00:04.000Z";
      if (state.draftPatchDeferred) await state.draftPatchDeferred;
      state.draftPatchResolved = true;
      return json(200, { draftId });'''
)

replace_once(
    "tests/e2e/phase2-manual-editor.spec.mjs",
    '''test("作成応答の前に画面を移動した場合は遅延成功で詳細を開かない", async ({ page }) => {''',
    '''test("基本情報保存後に一覧を再取得して更新タイトルを表示する", async ({ page }) => {
  const state = await installManualFixture(page, "editor");
  await openManualScreen(page);
  const initialListGets = state.manualListGetCount;
  await page.getByRole("button", { name: /既存の保存手順/ }).click();
  await page.locator("#manual-draft-title").fill("更新された保存手順");
  await page.getByRole("button", { name: "基本情報を保存" }).click();
  await expect(page.locator("#manual-detail-message")).toContainText("基本情報を保存しました。");
  await page.getByRole("button", { name: "手順書一覧へ戻る" }).click();
  await expect(page.getByRole("button", { name: /更新された保存手順/ })).toBeVisible();
  expect(state.manualListGetCount).toBeGreaterThan(initialListGets);
});

test("基本情報保存中に別の手順書へ移動した場合は遅延完了で元へ戻らない", async ({ page }) => {
  const state = await installManualFixture(page, "editor", { secondManual: true, deferDraftPatch: true });
  await openManualScreen(page);
  await page.getByRole("button", { name: /既存の保存手順/ }).click();
  await page.locator("#manual-draft-title").fill("遅延する基本情報保存");
  await page.getByRole("button", { name: "基本情報を保存" }).click();
  await expect.poll(() => state.lastDraftPatchBody?.title).toBe("遅延する基本情報保存");
  await page.getByRole("button", { name: "手順書一覧へ戻る" }).click();
  await page.getByRole("button", { name: /別の保存手順/ }).click();
  await expect(page.locator("#manual-detail-heading")).toHaveText("別の保存手順");
  state.releaseDraftPatch();
  await expect.poll(() => state.draftPatchResolved).toBe(true);
  await expect(page.locator("#manual-detail-heading")).toHaveText("別の保存手順");
});

test("作成応答の前に画面を移動した場合は遅延成功で詳細を開かない", async ({ page }) => {'''
)

replace_once(
    "tests/manual-editor-ui.test.mjs",
    '''  assert.match(source, /const isAction = type === "action"[\\s\\S]*actionType: isAction[\\s\\S]*targetText: isAction/);''',
    '''  assert.match(source, /const isAction = type === "action"[\\s\\S]*actionType: isAction[\\s\\S]*targetText: isAction/);
  assert.match(source, /function isCurrentManualDetailContext\\(workspaceId, manualId\\)[\\s\\S]*currentScreen === "manual-detail"[\\s\\S]*manualDetailState\\.manualId === manualId/);
  assert.match(source, /options\\.invalidateManuals && manualsState\\.workspaceId === workspaceId[\\s\\S]*status: "idle"/);
  assert.match(source, /!isCurrentManualDetailContext\\(workspaceId, manualId\\)[\\s\\S]*setManualMutationBusyState\\(false\\);[\\s\\S]*return;/);
  assert.match(source, /excludeDraftKeys: \\["draft"\\], invalidateManuals: true/);'''
)

replace_once(
    "tests/manual-editor-ui.test.mjs",
    '''  assert.match(spec, /作成成功後に一覧を再取得して新しい手順書を表示する/);
  assert.match(spec, /作成応答の前に画面を移動した場合は遅延成功で詳細を開かない/);''',
    '''  assert.match(spec, /作成成功後に一覧を再取得して新しい手順書を表示する/);
  assert.match(spec, /基本情報保存後に一覧を再取得して更新タイトルを表示する/);
  assert.match(spec, /基本情報保存中に別の手順書へ移動した場合は遅延完了で元へ戻らない/);
  assert.match(spec, /作成応答の前に画面を移動した場合は遅延成功で詳細を開かない/);'''
)

print("Phase 2 final P2 round 2 fixes applied.")
