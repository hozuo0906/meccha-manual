from pathlib import Path

APP = Path('apps/worker/src/app-assets.ts')
TEST = Path('tests/manual-editor-ui.test.mjs')
E2E = Path('tests/e2e/phase2-manual-editor.spec.mjs')

app = APP.read_text(encoding='utf-8')

old_capture = '''    if (Object.keys(changed).length > 0) drafts[key] = changed;'''
new_capture = '''    if (Object.keys(changed).length > 0) {
      drafts[key] = {
        values: changed,
        stepUpdatedAt: key.startsWith("step:") ? String(form.dataset.stepUpdatedAt || "") : ""
      };
    }'''
if old_capture not in app:
    raise SystemExit('capture snippet not found')
app = app.replace(old_capture, new_capture, 1)

old_restore = '''  for (const [key, values] of Object.entries(drafts)) {
    const form = findManualDetailForm(key);
    if (!form) continue;
    for (const [name, value] of Object.entries(values || {})) {
      const field = form.elements.namedItem(name);
      if (field && typeof field.value !== "undefined") field.value = value;
    }
  }'''
new_restore = '''  for (const [key, draft] of Object.entries(drafts)) {
    const form = findManualDetailForm(key);
    if (!form) continue;
    const values = draft && typeof draft === "object" && "values" in draft ? draft.values : draft;
    const stepUpdatedAt = draft && typeof draft === "object" && "stepUpdatedAt" in draft
      ? String(draft.stepUpdatedAt || "")
      : "";
    if (key.startsWith("step:") && stepUpdatedAt) form.dataset.stepUpdatedAt = stepUpdatedAt;
    for (const [name, value] of Object.entries(values || {})) {
      const field = form.elements.namedItem(name);
      if (field && typeof field.value !== "undefined") field.value = value;
    }
  }'''
if old_restore not in app:
    raise SystemExit('restore snippet not found')
app = app.replace(old_restore, new_restore, 1)

old_revocation = '''    if (error.status === 403) {'''
new_revocation = '''    if (error.status === 403 || error.status === 404) {'''
if old_revocation not in app:
    raise SystemExit('revocation snippet not found')
app = app.replace(old_revocation, new_revocation, 1)

APP.write_text(app, encoding='utf-8')

static = TEST.read_text(encoding='utf-8')
old_static = '''  assert.match(source, /restoreManualDetailDrafts\\(options\\.restoreDrafts\\)/);
  assert.match(source, /error\\.status === 403[\\s\\S]*canEdit: false[\\s\\S]*loadManualDetail\\(workspaceId, manualId/);'''
new_static = '''  assert.match(source, /restoreManualDetailDrafts\\(options\\.restoreDrafts\\)/);
  assert.match(source, /stepUpdatedAt: key\\.startsWith\\("step:"\\)/);
  assert.match(source, /form\\.dataset\\.stepUpdatedAt = stepUpdatedAt/);
  assert.match(source, /error\\.status === 403 \\|\\| error\\.status === 404[\\s\\S]*canEdit: false[\\s\\S]*loadManualDetail\\(workspaceId, manualId/);'''
if old_static not in static:
    raise SystemExit('static test snippet not found')
static = static.replace(old_static, new_static, 1)
TEST.write_text(static, encoding='utf-8')

e2e = E2E.read_text(encoding='utf-8')
fixture_old = '''        if (failure.status === 403) {
          state.currentRole = "viewer";
          state.canEdit = false;
        }'''
fixture_new = '''        if (failure.status === 403 || failure.status === 404) {
          state.currentRole = "viewer";
          state.canEdit = false;
        }'''
if fixture_old not in e2e:
    raise SystemExit('permission fixture snippet not found')
e2e = e2e.replace(fixture_old, fixture_new, 1)

marker = '''test("閲覧者は手順書と手順を閲覧できるが編集フォームは表示されない", async ({ page }) => {'''
addition = '''test("所属削除の404でも編集UIを閉じる", async ({ page }) => {
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
  state.failNextStepPatch = { status: 404, code: "MANUALS_NOT_FOUND", message: "所属を確認できません。" };
  await page.getByRole("button", { name: "手順を保存" }).click();
  await expect(page.locator("#manual-draft-form")).toHaveCount(0);
  await expect(page.locator(".manual-step-form")).toHaveCount(0);
});

'''
if marker not in e2e:
    raise SystemExit('e2e insertion marker not found')
e2e = e2e.replace(marker, addition + marker, 1)
E2E.write_text(e2e, encoding='utf-8')

print('Phase 2 retained draft version and membership-loss fixes applied.')
