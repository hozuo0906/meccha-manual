from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)


app_path = Path("apps/worker/src/app-assets.ts")
app = app_path.read_text(encoding="utf-8")

app = replace_once(
    app,
    '  if (messageId && message) setBox(messageId, message, "notice", false);',
    '''  if (!isBusy) {
    for (const control of document.querySelectorAll('[data-manual-busy-rendered="true"]')) {
      control.disabled = false;
      control.removeAttribute("data-manual-busy-rendered");
    }
  }
  if (messageId && message) setBox(messageId, message, "notice", false);''',
    "busy-rendered reconciliation",
)

busy_only = "(manualMutationInFlight ? ' disabled' : '')"
busy_count = app.count(busy_only)
if busy_count != 4:
    raise SystemExit(f"busy-only controls: expected 4 occurrences, found {busy_count}")
app = app.replace(
    busy_only,
    "(manualMutationInFlight ? ' disabled data-manual-busy-rendered=\"true\"' : '')",
)

app = replace_once(
    app,
    "(index === 0 || manualMutationInFlight ? ' disabled' : '')",
    "(index === 0 ? ' disabled' : manualMutationInFlight ? ' disabled data-manual-busy-rendered=\"true\"' : '')",
    "step up busy state",
)
app = replace_once(
    app,
    "(index === count - 1 || manualMutationInFlight ? ' disabled' : '')",
    "(index === count - 1 ? ' disabled' : manualMutationInFlight ? ' disabled data-manual-busy-rendered=\"true\"' : '')",
    "step down busy state",
)
app = replace_once(
    app,
    "(manualMutationInFlight || steps.length >= 200 ? ' disabled' : '')",
    "(steps.length >= 200 ? ' disabled' : manualMutationInFlight ? ' disabled data-manual-busy-rendered=\"true\"' : '')",
    "step add busy state",
)

app = replace_once(
    app,
    "async function runDetailMutation(operation, successMessage, options = {}) {",
    '''function isManualPermissionRevocation(error) {
  return error?.code === "MANUAL_EDIT_FORBIDDEN" || error?.code === "MANUALS_NOT_FOUND";
}

async function runDetailMutation(operation, successMessage, options = {}) {''',
    "permission revocation helper",
)

app = replace_once(
    app,
    '''    if (error.status === 403 || error.status === 404) {
      setManualMutationBusyState(false);''',
    '''    if (isManualPermissionRevocation(error)) {
      setManualMutationBusyState(false);''',
    "permission revocation branch",
)

app = replace_once(
    app,
    '''      return;
    }
    const resultUnknown = manualMutationUnknown(error);''',
    '''      return;
    }
    if (error.status === 404) {
      if (!isCurrentManualDetailContext(workspaceId, manualId)) {
        setManualMutationBusyState(false);
        return;
      }
      await loadManualDetail(workspaceId, manualId, {
        message: error.message,
        messageKind: "error",
        focusId: "manual-detail-message",
        preserveDomUntilLoaded: true,
        preserveDomOnError: true,
        finishMutation: true,
        restoreDrafts: retainedDrafts
      });
      return;
    }
    const resultUnknown = manualMutationUnknown(error);''',
    "resource-level 404 handling",
)

app_path.write_text(app, encoding="utf-8")


e2e_path = Path("tests/e2e/phase2-manual-editor.spec.mjs")
e2e = e2e_path.read_text(encoding="utf-8")
old_role_check = 'if (failure.status === 403 || failure.status === 404) {'
role_check_count = e2e.count(old_role_check)
if role_check_count != 2:
    raise SystemExit(f"fixture role checks: expected 2 occurrences, found {role_check_count}")
e2e = e2e.replace(
    old_role_check,
    'if (failure.status === 403 || failure.code === "MANUALS_NOT_FOUND") {',
)

e2e = replace_once(
    e2e,
    '''      if (state.failNextStepPatch) {
        const failure = state.failNextStepPatch;
        state.failNextStepPatch = null;
        if (failure.status === 403 || failure.code === "MANUALS_NOT_FOUND") {
          state.currentRole = "viewer";
          state.canEdit = false;
        }
        return json(failure.status, { code: failure.code, message: failure.message });
      }''',
    '''      if (state.failNextStepPatch) {
        const failure = state.failNextStepPatch;
        state.failNextStepPatch = null;
        if (failure.status === 403 || failure.code === "MANUALS_NOT_FOUND") {
          state.currentRole = "viewer";
          state.canEdit = false;
        }
        if (failure.code === "MANUAL_STEP_NOT_FOUND") state.steps = [];
        return json(failure.status, { code: failure.code, message: failure.message });
      }''',
    "step failure fixture",
)

e2e = replace_once(
    e2e,
    '''  await page.getByRole("button", { name: /別の保存手順/ }).click();
  await expect(page.locator("#manual-detail-heading")).toHaveText("別の保存手順");
  state.releaseDraftPatch();
  await expect.poll(() => state.draftPatchResolved).toBe(true);
  await expect(page.locator("#manual-detail-heading")).toHaveText("別の保存手順");''',
    '''  await page.getByRole("button", { name: /別の保存手順/ }).click();
  await expect(page.locator("#manual-detail-heading")).toHaveText("別の保存手順");
  await expect(page.getByRole("button", { name: "基本情報を保存" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "手順を追加" })).toBeDisabled();
  state.releaseDraftPatch();
  await expect.poll(() => state.draftPatchResolved).toBe(true);
  await expect(page.locator("#manual-detail-heading")).toHaveText("別の保存手順");
  await expect(page.getByRole("button", { name: "基本情報を保存" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "手順を追加" })).toBeEnabled();''',
    "delayed mutation control recovery test",
)

new_test = '''

test("step不存在404は権限喪失と誤判定せず未保存の基本情報を保持する", async ({ page }) => {
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
  await page.locator("#manual-draft-description").fill("別フォームに残す未保存説明");
  state.failNextStepPatch = {
    status: 404,
    code: "MANUAL_STEP_NOT_FOUND",
    message: "手順は既に削除されています。"
  };
  await page.getByRole("button", { name: "手順を保存" }).click();
  await expect(page.locator("#manual-detail-message")).toContainText("手順は既に削除されています。");
  await expect(page.locator("#manual-draft-form")).toHaveCount(1);
  await expect(page.locator("#manual-draft-description")).toHaveValue("別フォームに残す未保存説明");
  await expect(page.locator(".manual-step-form")).toHaveCount(0);
  await expect(page.locator("#manual-step-add-form")).toHaveCount(1);
  expect(state.currentRole).toBe("editor");
  expect(state.canEdit).toBe(true);
});
'''

e2e = replace_once(
    e2e,
    '\n\ntest("権限失効時は編集UIを閉じて最新権限を再取得する", async ({ page }) => {',
    new_test + '\n\ntest("権限失効時は編集UIを閉じて最新権限を再取得する", async ({ page }) => {',
    "resource 404 E2E insertion",
)

e2e_path.write_text(e2e, encoding="utf-8")


unit_path = Path("tests/manual-editor-ui.test.mjs")
unit = unit_path.read_text(encoding="utf-8")
unit = replace_once(
    unit,
    '''  assert.match(source, /error\\.status === 403 \\|\\| error\\.status === 404[\\s\\S]*currentUserRole: null[\\s\\S]*canEdit: false[\\s\\S]*loadWorkspaceMembers\\(workspaceId[\\s\\S]*loadManualDetail\\(workspaceId, manualId/);''',
    '''  assert.match(source, /function isManualPermissionRevocation[\\s\\S]*MANUAL_EDIT_FORBIDDEN[\\s\\S]*MANUALS_NOT_FOUND/);
  assert.match(source, /if \\(isManualPermissionRevocation\\(error\\)\\)[\\s\\S]*currentUserRole: null[\\s\\S]*canEdit: false[\\s\\S]*loadWorkspaceMembers\\(workspaceId/);
  assert.match(source, /if \\(error\\.status === 404\\)[\\s\\S]*restoreDrafts: retainedDrafts/);
  assert.match(source, /data-manual-busy-rendered=\\"true\\"/);
  assert.match(source, /querySelectorAll\\('\\[data-manual-busy-rendered=\\"true\\"\\]'\\)[\\s\\S]*control\\.disabled = false/);''',
    "static permission and busy contracts",
)
unit = replace_once(
    unit,
    '''  assert.match(spec, /作成応答の前に画面を移動した場合は遅延成功で詳細を開かない/);''',
    '''  assert.match(spec, /作成応答の前に画面を移動した場合は遅延成功で詳細を開かない/);
  assert.match(spec, /step不存在404は権限喪失と誤判定せず未保存の基本情報を保持する/);
  assert.match(spec, /基本情報保存中に別の手順書へ移動した場合は遅延完了で元へ戻らない/);''',
    "static E2E coverage",
)
unit_path.write_text(unit, encoding="utf-8")
