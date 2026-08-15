from pathlib import Path

APP = Path("apps/worker/src/app-assets.ts")
STATIC_TEST = Path("tests/manual-editor-ui.test.mjs")
E2E = Path("tests/e2e/phase2-manual-editor.spec.mjs")
DOC = Path("docs/02-ux/phase2-manual-editor-ui.md")

app = APP.read_text(encoding="utf-8")

replacements = [
    ('name="title" maxlength="64"', 'name="title" data-code-point-max="64"', 2),
    ('name="description" maxlength="10000"', 'name="description" data-code-point-max="10000"', 2),
    ('name="title" maxlength="128"', 'name="title" data-code-point-max="128"', 2),
    ('name="targetText" maxlength="256"', 'name="targetText" data-code-point-max="256"', 2),
    ('name="instruction" maxlength="4000"', 'name="instruction" data-code-point-max="4000"', 2),
    ('name="url" maxlength="2048"', 'name="url" data-code-point-max="2048"', 2),
]
for old, new, expected_count in replacements:
    actual_count = app.count(old)
    if actual_count != expected_count:
        raise SystemExit(f"manual field attribute count mismatch for {old!r}: {actual_count}")
    app = app.replace(old, new)

helper_marker = '''function manualMessageHtml(state, id) {'''
helper = '''function limitManualFieldCodePoints(field, maxLength) {
  const currentValue = String(field?.value || "");
  const codePoints = Array.from(currentValue);
  if (codePoints.length <= maxLength) return false;
  const selectionStart = typeof field.selectionStart === "number" ? field.selectionStart : currentValue.length;
  const caretCodePoints = Array.from(currentValue.slice(0, selectionStart)).length;
  const limitedCodePoints = codePoints.slice(0, maxLength);
  field.value = limitedCodePoints.join("");
  if (typeof field.setSelectionRange === "function") {
    const caret = limitedCodePoints.slice(0, Math.min(caretCodePoints, maxLength)).join("").length;
    field.setSelectionRange(caret, caret);
  }
  return true;
}

function wireManualCodePointLimit(field) {
  const maxLength = Number(field?.dataset?.codePointMax || 0);
  if (!Number.isSafeInteger(maxLength) || maxLength < 1) return;
  let composing = false;
  const enforce = () => limitManualFieldCodePoints(field, maxLength);
  field.addEventListener("compositionstart", () => { composing = true; });
  field.addEventListener("compositionend", () => {
    composing = false;
    enforce();
  });
  field.addEventListener("input", () => {
    if (!composing) enforce();
  });
  enforce();
}

function manualMessageHtml(state, id) {'''
if helper_marker not in app:
    raise SystemExit("manual message helper marker not found")
app = app.replace(helper_marker, helper, 1)

wire_old = '''  for (const button of document.querySelectorAll(".manual-step-up, .manual-step-down")) button.addEventListener("click", reorderManualStepFromUi);
  if (focusId) document.getElementById(focusId)?.focus();'''
wire_new = '''  for (const button of document.querySelectorAll(".manual-step-up, .manual-step-down")) button.addEventListener("click", reorderManualStepFromUi);
  for (const field of document.querySelectorAll("[data-code-point-max]")) wireManualCodePointLimit(field);
  if (focusId) document.getElementById(focusId)?.focus();'''
if wire_old not in app:
    raise SystemExit("manual field wiring marker not found")
app = app.replace(wire_old, wire_new, 1)

update_old = '''function updateManualDraftFromUi(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const title = String(form.elements.title.value || "").trim();
  const description = String(form.elements.description.value || "");
  return runDetailMutation((workspaceId, manualId) => requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals/" + encodeURIComponent(manualId) + "/draft", { method: "PATCH", body: JSON.stringify({ title, description }) }), "基本情報を保存しました。", { excludeDraftKeys: ["draft"] });
}'''
update_new = '''function updateManualDraftFromUi(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const title = String(form.elements.title.value || "").trim();
  const description = String(form.elements.description.value || "");
  if (!title || Array.from(title).length > 64 || Array.from(description).length > 10000) {
    const message = "タイトルは1〜64文字、説明は10,000文字以内で入力してください。";
    manualDetailState = { ...manualDetailState, status: "loaded", message, messageKind: "error" };
    setBox("manual-detail-message", message, "error");
    const invalidField = !title || Array.from(title).length > 64 ? form.elements.title : form.elements.description;
    invalidField.setAttribute("aria-invalid", "true");
    invalidField.focus();
    return;
  }
  form.elements.title.removeAttribute("aria-invalid");
  form.elements.description.removeAttribute("aria-invalid");
  return runDetailMutation((workspaceId, manualId) => requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals/" + encodeURIComponent(manualId) + "/draft", { method: "PATCH", body: JSON.stringify({ title, description }) }), "基本情報を保存しました。", { excludeDraftKeys: ["draft"] });
}'''
if update_old not in app:
    raise SystemExit("manual draft update snippet not found")
app = app.replace(update_old, update_new, 1)
APP.write_text(app, encoding="utf-8")

static = STATIC_TEST.read_text(encoding="utf-8")
static_old = '''  assert.match(source, /maxlength="64"/);
  assert.match(source, /maxlength="10000"/);
  assert.match(source, /maxlength="4000"/);'''
static_new = '''  assert.match(source, /id="manual-create-title" name="title" data-code-point-max="64"/);
  assert.match(source, /id="manual-create-description" name="description" data-code-point-max="10000"/);
  assert.match(source, /id="manual-draft-description" name="description" data-code-point-max="10000"/);
  assert.match(source, /name="instruction" data-code-point-max="4000"/);
  assert.match(source, /function wireManualCodePointLimit/);
  assert.match(source, /Array\.from\(description\)\.length > 10000/);
  assert.doesNotMatch(source, /id="manual-(?:create|draft)-description"[^>]*maxlength=/);'''
if static_old not in static:
    raise SystemExit("manual UI maxlength assertions not found")
static = static.replace(static_old, static_new, 1)
phase2_old = '''  assert.match(spec, /編集者は手順書作成から手順追加・手修正文保持まで完了できる/);'''
phase2_new = '''  assert.match(spec, /手順書入力はUnicode code point単位の上限を守る/);
  assert.match(spec, /編集者は手順書作成から手順追加・手修正文保持まで完了できる/);'''
if phase2_old not in static:
    raise SystemExit("Phase 2 E2E assertion marker not found")
static = static.replace(phase2_old, phase2_new, 1)
STATIC_TEST.write_text(static, encoding="utf-8")

e2e = E2E.read_text(encoding="utf-8")
state_old = '''    failNextManualCreate: null,
    failNextStepPatch: null,
    lastStepCreateBody: null,'''
state_new = '''    failNextManualCreate: null,
    failNextStepPatch: null,
    lastManualCreateBody: null,
    lastDraftPatchBody: null,
    lastStepCreateBody: null,'''
if state_old not in e2e:
    raise SystemExit("fixture state marker not found")
e2e = e2e.replace(state_old, state_new, 1)

create_old = '''      const body = request.postDataJSON();
      state.manuals = [{'''
create_new = '''      const body = request.postDataJSON();
      state.lastManualCreateBody = body;
      state.manuals = [{'''
if create_old not in e2e:
    raise SystemExit("manual create fixture marker not found")
e2e = e2e.replace(create_old, create_new, 1)

draft_old = '''    if (pathname === `/api/workspaces/${workspaceId}/manuals/${manualId}/draft` && method === "PATCH") {
      const body = request.postDataJSON();
      state.manuals[0].title = body.title;'''
draft_new = '''    if (pathname === `/api/workspaces/${workspaceId}/manuals/${manualId}/draft` && method === "PATCH") {
      const body = request.postDataJSON();
      state.lastDraftPatchBody = body;
      state.manuals[0].title = body.title;'''
if draft_old not in e2e:
    raise SystemExit("manual draft fixture marker not found")
e2e = e2e.replace(draft_old, draft_new, 1)

test_marker = '''test("編集者は手順書作成から手順追加・手修正文保持まで完了できる", async ({ page }) => {'''
test_addition = '''test("手順書入力はUnicode code point単位の上限を守る", async ({ page }) => {
  const state = await installManualFixture(page, "editor", { empty: true });
  await openManualScreen(page);

  const title = "𠮷".repeat(64);
  const description = "𠮷".repeat(10000);
  const createTitle = page.locator("#manual-create-title");
  const createDescription = page.locator("#manual-create-description");
  await createTitle.fill(title);
  await createDescription.fill(description);
  expect(await createTitle.evaluate((element) => ({
    codePoints: Array.from(element.value).length,
    codeUnits: element.value.length
  }))).toEqual({ codePoints: 64, codeUnits: 128 });
  expect(await createDescription.evaluate((element) => ({
    codePoints: Array.from(element.value).length,
    codeUnits: element.value.length
  }))).toEqual({ codePoints: 10000, codeUnits: 20000 });

  await createDescription.evaluate((element) => {
    element.value += "𠮷";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(await createDescription.evaluate((element) => Array.from(element.value).length)).toBe(10000);

  await page.getByRole("button", { name: "手順書を作成" }).click();
  await expect(page.locator("#manual-detail-heading")).toHaveText(title);
  expect(Array.from(state.lastManualCreateBody.title)).toHaveLength(64);
  expect(Array.from(state.lastManualCreateBody.description)).toHaveLength(10000);

  const draftDescription = page.locator("#manual-draft-description");
  await draftDescription.fill(description);
  expect(await draftDescription.evaluate((element) => ({
    codePoints: Array.from(element.value).length,
    codeUnits: element.value.length
  }))).toEqual({ codePoints: 10000, codeUnits: 20000 });
  await page.getByRole("button", { name: "基本情報を保存" }).click();
  await expect(page.locator("#manual-detail-message")).toContainText("基本情報を保存しました。");
  expect(Array.from(state.lastDraftPatchBody.description)).toHaveLength(10000);
});

'''
if test_marker not in e2e:
    raise SystemExit("Phase 2 test insertion marker not found")
e2e = e2e.replace(test_marker, test_addition + test_marker, 1)
E2E.write_text(e2e, encoding="utf-8")

doc = DOC.read_text(encoding="utf-8")
doc_old = '''- title 64、description 10,000、step title 128、instruction 4,000、targetText 256、URL 2,048文字をHTML属性とAPI/DBで一致させる。'''
doc_new = '''- title 64、description 10,000、step title 128、instruction 4,000、targetText 256、URL 2,048文字をUIとAPI/DBで一致させる。
- 手順書入力の文字数上限は、UTF-16 code unit基準のnative `maxlength`に依存せず、Unicode code point単位のJavaScript入力制御とsubmit/API/DB検証で強制する。'''
if doc_old not in doc:
    raise SystemExit("manual UI limit documentation marker not found")
doc = doc.replace(doc_old, doc_new, 1)
DOC.write_text(doc, encoding="utf-8")

print("Phase 2 Unicode code point UI limits applied.")
