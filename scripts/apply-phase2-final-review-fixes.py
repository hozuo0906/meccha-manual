from pathlib import Path

APP = Path("apps/worker/src/app-assets.ts")
ROUTER = Path("apps/worker/src/manual-edit-router.ts")
MIGRATION = Path("supabase/migrations/202608140012_phase2_manual_edit_http_contract.sql")
API_TEST = Path("tests/manual-edit-api.test.mjs")
STATIC_TEST = Path("tests/manual-editor-ui.test.mjs")
E2E = Path("tests/e2e/phase2-manual-editor.spec.mjs")
SQL_FIXTURE = Path("tests/sql/phase2-manual-edit-http-fixture.sql")
SQL_TEST = Path("tests/sql/phase2-manual-edit-http-test.sql")
LOCK_TEST = Path("scripts/test-phase2-manual-draft-locks.sh")
API_CHECK = Path("scripts/check-phase2-manual-edit-api.mjs")
UI_CHECK = Path("scripts/check-phase2-manual-editor-ui.mjs")
API_WORKFLOW = Path(".github/workflows/manual-edit-api.yml")
API_DOC = Path("docs/05-api/phase2-manual-edit-api.md")
UX_DOC = Path("docs/02-ux/phase2-manual-editor-ui.md")
DECISION_LOG = Path("docs/09-delivery/decision-log.md")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label} snippet not found")
    return text.replace(old, new, 1)


app = APP.read_text(encoding="utf-8")
app = replace_once(
    app,
    '''      drafts[key] = {
        values: changed,
        stepUpdatedAt: key.startsWith("step:") ? String(form.dataset.stepUpdatedAt || "") : ""
      };''',
    '''      drafts[key] = {
        values: changed,
        stepUpdatedAt: key.startsWith("step:") ? String(form.dataset.stepUpdatedAt || "") : "",
        draftUpdatedAt: key === "draft" ? String(form.dataset.draftUpdatedAt || "") : ""
      };''',
    "draft capture version"
)
app = replace_once(
    app,
    '''    const stepUpdatedAt = draft && typeof draft === "object" && "stepUpdatedAt" in draft
      ? String(draft.stepUpdatedAt || "")
      : "";
    if (key.startsWith("step:") && stepUpdatedAt) form.dataset.stepUpdatedAt = stepUpdatedAt;''',
    '''    const stepUpdatedAt = draft && typeof draft === "object" && "stepUpdatedAt" in draft
      ? String(draft.stepUpdatedAt || "")
      : "";
    const draftUpdatedAt = draft && typeof draft === "object" && "draftUpdatedAt" in draft
      ? String(draft.draftUpdatedAt || "")
      : "";
    if (key.startsWith("step:") && stepUpdatedAt) form.dataset.stepUpdatedAt = stepUpdatedAt;
    if (key === "draft" && draftUpdatedAt) form.dataset.draftUpdatedAt = draftUpdatedAt;''',
    "draft restore version"
)
app = replace_once(
    app,
    '''      ? '<form id="manual-draft-form" class="manual-detail-form" novalidate>' +''',
    '''      ? '<form id="manual-draft-form" class="manual-detail-form" data-draft-updated-at="' + escapeHtml(draft.updatedAt) + '" novalidate>' +''',
    "draft form version"
)

old_limiter = '''function limitManualFieldCodePoints(field, maxLength) {
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
}'''
new_limiter = '''function wireManualCodePointLimit(field) {
  const maxLength = Number(field?.dataset?.codePointMax || 0);
  if (!Number.isSafeInteger(maxLength) || maxLength < 1) return;
  let composing = false;
  let acceptedValue = String(field.value || "");
  let acceptedSelectionStart = typeof field.selectionStart === "number" ? field.selectionStart : acceptedValue.length;
  let acceptedSelectionEnd = typeof field.selectionEnd === "number" ? field.selectionEnd : acceptedSelectionStart;

  const rememberAccepted = () => {
    const value = String(field.value || "");
    if (Array.from(value).length > maxLength) return false;
    acceptedValue = value;
    acceptedSelectionStart = typeof field.selectionStart === "number" ? field.selectionStart : value.length;
    acceptedSelectionEnd = typeof field.selectionEnd === "number" ? field.selectionEnd : acceptedSelectionStart;
    return true;
  };
  const rejectOverflow = () => {
    if (rememberAccepted()) return false;
    field.value = acceptedValue;
    if (typeof field.setSelectionRange === "function") {
      field.setSelectionRange(acceptedSelectionStart, acceptedSelectionEnd);
    }
    return true;
  };

  field.addEventListener("beforeinput", () => {
    if (!composing) rememberAccepted();
  });
  field.addEventListener("compositionstart", () => {
    rememberAccepted();
    composing = true;
  });
  field.addEventListener("compositionend", () => {
    composing = false;
    rejectOverflow();
  });
  field.addEventListener("input", () => {
    if (!composing) rejectOverflow();
  });
  rejectOverflow();
}'''
app = replace_once(app, old_limiter, new_limiter, "code point overflow preservation")

old_create = '''async function createManualFromUi(event) {
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
    if (error.status === 403 || error.status === 404) {'''
new_create = '''async function createManualFromUi(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const workspaceId = currentWorkspaceSelection?.workspaceId;
  const requestGeneration = sessionGeneration;
  const requestUserId = currentSession?.user?.id;
  const title = String(form.elements.title.value || "").trim();
  const description = String(form.elements.description.value || "");
  if (!workspaceId) {
    const message = "利用中のワークスペースを選択してください。";
    manualsState = { ...manualsState, message, messageKind: "error" };
    setBox("manuals-message", message, "error");
    return;
  }
  if (!title || Array.from(title).length > 64 || Array.from(description).length > 10000) {
    const message = "タイトルは1〜64文字、説明は10,000文字以内で入力してください。";
    manualsState = { ...manualsState, message, messageKind: "error" };
    setBox("manuals-message", message, "error");
    const invalidField = !title || Array.from(title).length > 64 ? form.elements.title : form.elements.description;
    invalidField.setAttribute("aria-invalid", "true");
    invalidField.focus();
    return;
  }
  form.elements.title.removeAttribute("aria-invalid");
  form.elements.description.removeAttribute("aria-invalid");
  setManualMutationBusyState(true, "manuals-message", "手順書を作成しています。");
  try {
    const payload = await requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals", { method: "POST", body: JSON.stringify({ title, description, folderId: null }) });
    if (requestGeneration !== sessionGeneration || requestUserId !== currentSession?.user?.id) {
      setManualMutationBusyState(false);
      await loadSession({ focusId: "workspace-heading" });
      return;
    }
    if (currentWorkspaceSelection?.workspaceId !== workspaceId || currentScreen !== "manuals") {
      setManualMutationBusyState(false);
      return;
    }
    manualsState = { ...manualsState, workspaceId, status: "idle", message: "", messageKind: "notice" };
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
    if (currentWorkspaceSelection?.workspaceId !== workspaceId || currentScreen !== "manuals") {
      setManualMutationBusyState(false);
      return;
    }
    if (error.status === 403 || error.status === 404) {'''
app = replace_once(app, old_create, new_create, "create validation and delayed response")

old_update_draft = '''function updateManualDraftFromUi(event) {
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
new_update_draft = '''function updateManualDraftFromUi(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const title = String(form.elements.title.value || "").trim();
  const description = String(form.elements.description.value || "");
  const expectedUpdatedAt = String(form.dataset.draftUpdatedAt || "");
  if (!title || Array.from(title).length > 64 || Array.from(description).length > 10000) {
    const message = "タイトルは1〜64文字、説明は10,000文字以内で入力してください。";
    manualDetailState = { ...manualDetailState, status: "loaded", message, messageKind: "error" };
    setBox("manual-detail-message", message, "error");
    const invalidField = !title || Array.from(title).length > 64 ? form.elements.title : form.elements.description;
    invalidField.setAttribute("aria-invalid", "true");
    invalidField.focus();
    return;
  }
  if (!expectedUpdatedAt) {
    const message = "基本情報を再読み込みしてから保存してください。";
    manualDetailState = { ...manualDetailState, status: "loaded", message, messageKind: "error" };
    setBox("manual-detail-message", message, "error");
    return;
  }
  form.elements.title.removeAttribute("aria-invalid");
  form.elements.description.removeAttribute("aria-invalid");
  return runDetailMutation((workspaceId, manualId) => requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals/" + encodeURIComponent(manualId) + "/draft", { method: "PATCH", body: JSON.stringify({ title, description, expectedUpdatedAt }) }), "基本情報を保存しました。", { excludeDraftKeys: ["draft"] });
}'''
app = replace_once(app, old_update_draft, new_update_draft, "draft optimistic version payload")
APP.write_text(app, encoding="utf-8")

router = ROUTER.read_text(encoding="utf-8")
router = replace_once(
    router,
    '''function requiredExpectedStepUpdatedAt(body: Record<string, unknown>): string {
  const expectedUpdatedAt = requireTimestamp(body.expectedUpdatedAt);
  if (!expectedUpdatedAt) {
    throw new ManualError(400, "MANUAL_STEP_VERSION_INVALID", "手順を再読み込みしてから保存してください。");
  }
  return expectedUpdatedAt;
}''',
    '''function requiredExpectedDraftUpdatedAt(body: Record<string, unknown>): string {
  const expectedUpdatedAt = requireTimestamp(body.expectedUpdatedAt);
  if (!expectedUpdatedAt) {
    throw new ManualError(400, "MANUAL_DRAFT_VERSION_INVALID", "基本情報を再読み込みしてから保存してください。");
  }
  return expectedUpdatedAt;
}

function requiredExpectedStepUpdatedAt(body: Record<string, unknown>): string {
  const expectedUpdatedAt = requireTimestamp(body.expectedUpdatedAt);
  if (!expectedUpdatedAt) {
    throw new ManualError(400, "MANUAL_STEP_VERSION_INVALID", "手順を再読み込みしてから保存してください。");
  }
  return expectedUpdatedAt;
}''',
    "draft expected timestamp helper"
)
router = replace_once(
    router,
    '''  if (message.includes("manual step changed concurrently")) {
    return new ManualError(409, "MANUAL_STEP_EDIT_CONFLICT", "別の更新が先に保存されました。詳細を再読み込みして、変更内容を確認してください。");
  }''',
    '''  if (message.includes("manual draft changed concurrently")) {
    return new ManualError(409, "MANUAL_DRAFT_EDIT_CONFLICT", "別の更新が先に保存されました。基本情報を再読み込みして、変更内容を確認してください。");
  }
  if (message.includes("manual step changed concurrently")) {
    return new ManualError(409, "MANUAL_STEP_EDIT_CONFLICT", "別の更新が先に保存されました。詳細を再読み込みして、変更内容を確認してください。");
  }''',
    "draft conflict mapping"
)
old_router_update = '''  const body = await readRequestJson(request);
  assertAllowedKeys(body, ["title", "description"]);
  if (!hasOwn(body, "title") || !hasOwn(body, "description")) {
    throw new ManualError(400, "MANUAL_DRAFT_INPUT_REQUIRED", "タイトルと説明を送信してください。");
  }
  const title = requiredLabel(body.title, "手順書タイトル", MAX_MANUAL_TITLE_LENGTH, "MANUAL_TITLE_INVALID");
  const description = optionalDescription(body.description);
  const draftId = await callMutationRpc(
    env,
    session.accessToken,
    "update_manual_draft",
    { target_manual_id: manualId, draft_title: title, draft_description: description },'''
new_router_update = '''  const body = await readRequestJson(request);
  assertAllowedKeys(body, ["title", "description", "expectedUpdatedAt"]);
  if (!hasOwn(body, "title") || !hasOwn(body, "description") || !hasOwn(body, "expectedUpdatedAt")) {
    throw new ManualError(400, "MANUAL_DRAFT_INPUT_REQUIRED", "タイトル、説明、表示中の更新日時を送信してください。");
  }
  const title = requiredLabel(body.title, "手順書タイトル", MAX_MANUAL_TITLE_LENGTH, "MANUAL_TITLE_INVALID");
  const description = optionalDescription(body.description);
  const expectedUpdatedAt = requiredExpectedDraftUpdatedAt(body);
  const draftId = await callMutationRpc(
    env,
    session.accessToken,
    "update_manual_draft",
    {
      target_manual_id: manualId,
      expected_draft_revision_id: expectedDraftId,
      expected_draft_updated_at: expectedUpdatedAt,
      draft_title: title,
      draft_description: description
    },'''
router = replace_once(router, old_router_update, new_router_update, "draft RPC version arguments")
ROUTER.write_text(router, encoding="utf-8")

migration = MIGRATION.read_text(encoding="utf-8")
marker = "create or replace function public.update_manual_draft(\n"
if marker not in migration:
    raise SystemExit("update_manual_draft migration marker not found")
prefix = migration.split(marker, 1)[0]
new_function = '''drop function if exists public.update_manual_draft(uuid, text, text);
drop function if exists public.update_manual_draft(uuid, timestamptz, text, text);
drop function if exists public.update_manual_draft(uuid, uuid, timestamptz, text, text);

create function public.update_manual_draft(
  target_manual_id uuid,
  expected_draft_revision_id uuid,
  expected_draft_updated_at timestamptz,
  draft_title text,
  draft_description text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_workspace_id uuid;
  target_draft_revision_id uuid;
  current_draft_updated_at timestamptz;
begin
  if actor_id is null then
    raise exception 'authentication required';
  end if;

  if expected_draft_revision_id is null or expected_draft_updated_at is null then
    raise exception 'expected draft version is required';
  end if;

  select m.workspace_id, m.current_draft_revision_id
  into target_workspace_id, target_draft_revision_id
  from public.manuals m
  where m.id = target_manual_id
    and m.archived_at is null
  for update;

  if target_workspace_id is null then
    raise exception 'manual not found';
  end if;

  if not public.has_workspace_role(
    target_workspace_id,
    actor_id,
    array['owner', 'admin', 'editor']::public.workspace_role[]
  ) then
    raise exception 'workspace editor role required';
  end if;

  if target_draft_revision_id is null then
    raise exception 'draft revision not found';
  end if;

  if target_draft_revision_id is distinct from expected_draft_revision_id then
    raise exception 'current draft revision changed';
  end if;

  select mr.updated_at
  into current_draft_updated_at
  from public.manual_revisions mr
  where mr.id = target_draft_revision_id
    and mr.manual_id = target_manual_id
    and mr.workspace_id = target_workspace_id
    and mr.state = 'draft'
  for update;

  if not found then
    raise exception 'draft revision not found';
  end if;

  if current_draft_updated_at is distinct from expected_draft_updated_at then
    raise exception 'manual draft changed concurrently';
  end if;

  update public.manual_revisions mr
  set title = draft_title,
      description = coalesce(draft_description, ''),
      updated_at = clock_timestamp()
  where mr.id = target_draft_revision_id
    and mr.manual_id = target_manual_id
    and mr.workspace_id = target_workspace_id
    and mr.state = 'draft';

  if not found then
    raise exception 'draft revision not found';
  end if;

  update public.manuals
  set title = draft_title
  where id = target_manual_id
    and workspace_id = target_workspace_id
    and current_draft_revision_id = target_draft_revision_id;

  if not found then
    raise exception 'current draft revision changed';
  end if;

  return target_draft_revision_id;
end;
$$;

-- All API-supported manual and revision writes use SECURITY DEFINER RPCs.
revoke insert, update, delete on table public.manuals from authenticated;
revoke insert, update, delete on table public.manual_revisions from authenticated;

revoke all on function public.update_manual_draft(uuid, uuid, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.update_manual_draft(uuid, uuid, timestamptz, text, text) to authenticated;
'''
MIGRATION.write_text(prefix + new_function, encoding="utf-8")

api_test = API_TEST.read_text(encoding="utf-8")
api_test = api_test.replace(
    'JSON.stringify({ title: "変更", description: "説明" })',
    'JSON.stringify({ title: "変更", description: "説明", expectedUpdatedAt: draftRow().updated_at })'
)
api_test = replace_once(
    api_test,
    '''request(detailPath("/draft"), "PATCH", JSON.stringify({ title: " 更新後 ", description: "新しい説明" }))''',
    '''request(detailPath("/draft"), "PATCH", JSON.stringify({ title: " 更新後 ", description: "新しい説明", expectedUpdatedAt: draftRow().updated_at }))''',
    "metadata API success request"
)
api_test = replace_once(
    api_test,
    '''      target_manual_id: MANUAL_ID,
      draft_title: "更新後",
      draft_description: "新しい説明"''',
    '''      target_manual_id: MANUAL_ID,
      expected_draft_revision_id: DRAFT_ID,
      expected_draft_updated_at: draftRow().updated_at,
      draft_title: "更新後",
      draft_description: "新しい説明"''',
    "metadata RPC body"
)
api_test = replace_once(
    api_test,
    '''  const body = JSON.stringify({ title: "最大説明", description });''',
    '''  const body = JSON.stringify({ title: "最大説明", description, expectedUpdatedAt: draftRow().updated_at });''',
    "metadata body size version"
)
api_test = replace_once(
    api_test,
    '''test("request bodies above 64 KiB are rejected before mutation RPC", async () => {
  const body = JSON.stringify({ title: "上限超過", description: "あ".repeat(22_000) });''',
    '''test("request bodies above 64 KiB are rejected before mutation RPC", async () => {
  const body = JSON.stringify({ title: "上限超過", description: "あ".repeat(22_000), expectedUpdatedAt: draftRow().updated_at });''',
    "oversized metadata body version"
)
insert_marker = '''test("10,000 four-byte Japanese characters fit within the bounded request body", async () => {'''
new_api_tests = '''test("draft patch requires the version displayed by the editor", async () => {
  const mock = installFetch([authOk(), memberOk(), editorOk(), json([manualRow()])]);
  try {
    const response = await handleManualEditRoute(
      request(detailPath("/draft"), "PATCH", JSON.stringify({ title: "更新", description: "説明" })),
      ENV
    );
    assert.equal(response?.status, 400);
    assert.equal((await response.json()).code, "MANUAL_DRAFT_INPUT_REQUIRED");
    assert.equal(mock.calls.length, 4);
  } finally {
    mock.restore();
  }
});

test("stale draft metadata maps to a determinate 409 conflict", async () => {
  const mock = installFetch([
    authOk(), memberOk(), editorOk(), json([manualRow()]), json({ message: "manual draft changed concurrently" }, 400)
  ]);
  try {
    const response = await handleManualEditRoute(
      request(detailPath("/draft"), "PATCH", JSON.stringify({
        title: "古い画面の更新",
        description: "古い説明",
        expectedUpdatedAt: draftRow().updated_at
      })),
      ENV
    );
    assert.equal(response?.status, 409);
    assert.equal((await response.json()).code, "MANUAL_DRAFT_EDIT_CONFLICT");
  } finally {
    mock.restore();
  }
});

'''
api_test = replace_once(api_test, insert_marker, new_api_tests + insert_marker, "metadata version API tests")
API_TEST.write_text(api_test, encoding="utf-8")

fixture = SQL_FIXTURE.read_text(encoding="utf-8")
fixture = replace_once(
    fixture,
    '''  title text not null,
  description text not null default ''
);''',
    '''  title text not null,
  description text not null default '',
  updated_at timestamptz not null default clock_timestamp()
);''',
    "fixture draft updated_at"
)
fixture = replace_once(
    fixture,
    '''insert into public.manual_revisions (id, workspace_id, manual_id, state, title, description)
values
  ('44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'draft', '旧タイトル', '旧説明'),
  ('88888888-8888-4888-8888-888888888888', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '55555555-5555-4555-8555-555555555555', 'published', '公開済み手順', ''),
  ('77777777-7777-4777-8777-777777777777', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '66666666-6666-4666-8666-666666666666', 'draft', '別領域', '');''',
    '''insert into public.manual_revisions (id, workspace_id, manual_id, state, title, description, updated_at)
values
  ('44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'draft', '旧タイトル', '旧説明', '2026-08-14T00:00:01Z'),
  ('88888888-8888-4888-8888-888888888888', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '55555555-5555-4555-8555-555555555555', 'published', '公開済み手順', '', '2026-08-14T00:00:02Z'),
  ('77777777-7777-4777-8777-777777777777', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '66666666-6666-4666-8666-666666666666', 'draft', '別領域', '', '2026-08-14T00:00:03Z');''',
    "fixture draft timestamps"
)
SQL_FIXTURE.write_text(fixture, encoding="utf-8")

sql_test = SQL_TEST.read_text(encoding="utf-8")
sql_test = replace_once(
    sql_test,
    '''select public.update_manual_draft(
  '33333333-3333-4333-8333-333333333333',
  '更新タイトル',
  '更新説明'
) = '44444444-4444-4444-8444-444444444444'::uuid as editor_updated_draft;''',
    '''select public.update_manual_draft(
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '2026-08-14T00:00:01Z',
  '更新タイトル',
  '更新説明'
) = '44444444-4444-4444-8444-444444444444'::uuid as editor_updated_draft;''',
    "SQL metadata update signature"
)
stale_test_marker = '''do $$
declare
  rejected boolean := false;
begin
  begin
    update public.manuals'''
stale_test = '''do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.update_manual_draft(
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
      '2026-08-14T00:00:01Z',
      '古い画面のタイトル',
      '古い画面の説明'
    );
  exception
    when others then
      if sqlerrm like '%manual draft changed concurrently%' then
        rejected := true;
      else
        raise;
      end if;
  end;
  if not rejected then
    raise exception 'stale manual draft update was accepted';
  end if;
end;
$$;

'''
sql_test = replace_once(sql_test, stale_test_marker, stale_test + stale_test_marker, "SQL stale metadata test")

sql_test = sql_test.replace(
    '''perform public.update_manual_draft(
      '33333333-3333-4333-8333-333333333333',
      'viewer変更',
      'viewer変更'
    );''',
    '''perform public.update_manual_draft(
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
      '2026-08-14T00:00:01Z',
      'viewer変更',
      'viewer変更'
    );'''
)
sql_test = sql_test.replace(
    '''perform public.update_manual_draft(
      '55555555-5555-4555-8555-555555555555',
      '下書きなし',
      ''
    );''',
    '''perform public.update_manual_draft(
      '55555555-5555-4555-8555-555555555555',
      '88888888-8888-4888-8888-888888888888',
      '2026-08-14T00:00:02Z',
      '下書きなし',
      ''
    );'''
)
sql_test = sql_test.replace(
    '''perform public.update_manual_draft(
      '33333333-3333-4333-8333-333333333333',
      repeat(chr(9), 3),
      ''
    );''',
    '''perform public.update_manual_draft(
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
      (select updated_at from public.manual_revisions where id = '44444444-4444-4444-8444-444444444444'),
      repeat(chr(9), 3),
      ''
    );'''
)
sql_test = sql_test.replace(
    '''perform public.update_manual_draft(
      '33333333-3333-4333-8333-333333333333',
      '説明上限',
      repeat('あ', 10001)
    );''',
    '''perform public.update_manual_draft(
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
      (select updated_at from public.manual_revisions where id = '44444444-4444-4444-8444-444444444444'),
      '説明上限',
      repeat('あ', 10001)
    );'''
)
sql_test = sql_test.replace(
    "'public.update_manual_draft(uuid,text,text)'",
    "'public.update_manual_draft(uuid,uuid,timestamptz,text,text)'"
)
SQL_TEST.write_text(sql_test, encoding="utf-8")

LOCK_TEST.write_text('''#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=postgres}"

EDITOR_ID="11111111-1111-4111-8111-111111111111"
MANUAL_ID="33333333-3333-4333-8333-333333333333"
DRAFT_ID="44444444-4444-4444-8444-444444444444"
psql_base=(psql -X -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE")

expected_updated_at="$("${psql_base[@]}" -At -c "select updated_at from public.manual_revisions where id = '${DRAFT_ID}'::uuid")"
log_a="$(mktemp)"
log_b="$(mktemp)"

"${psql_base[@]}" -c "begin; select id from public.manuals where id = '${MANUAL_ID}'::uuid for update; select pg_sleep(1.0); commit;" >/dev/null &
locker_pid=$!
sleep 0.2

set +e
"${psql_base[@]}" -c "set role authenticated; select set_config('request.jwt.claim.sub', '${EDITOR_ID}', false); select public.update_manual_draft('${MANUAL_ID}'::uuid, '${DRAFT_ID}'::uuid, '${expected_updated_at}'::timestamptz, 'Concurrent A', 'description A');" >"$log_a" 2>&1 &
pid_a=$!
"${psql_base[@]}" -c "set role authenticated; select set_config('request.jwt.claim.sub', '${EDITOR_ID}', false); select public.update_manual_draft('${MANUAL_ID}'::uuid, '${DRAFT_ID}'::uuid, '${expected_updated_at}'::timestamptz, 'Concurrent B', 'description B');" >"$log_b" 2>&1 &
pid_b=$!

wait "$locker_pid"
wait "$pid_a"; status_a=$?
wait "$pid_b"; status_b=$?
set -e

if [[ "$status_a" -eq 0 && "$status_b" -eq 0 ]] || [[ "$status_a" -ne 0 && "$status_b" -ne 0 ]]; then
  echo "concurrent draft update expected exactly one success" >&2
  cat "$log_a" >&2
  cat "$log_b" >&2
  rm -f "$log_a" "$log_b"
  exit 1
fi

loser_log="$log_a"
if [[ "$status_a" -eq 0 ]]; then loser_log="$log_b"; fi
if ! grep -qi "manual draft changed concurrently" "$loser_log"; then
  echo "concurrent draft update loser did not receive the optimistic conflict" >&2
  cat "$loser_log" >&2
  rm -f "$log_a" "$log_b"
  exit 1
fi

final_pair="$("${psql_base[@]}" -At -F '|' -c "select title, description from public.manual_revisions where id = '${DRAFT_ID}'::uuid")"
if [[ "$final_pair" != "Concurrent A|description A" && "$final_pair" != "Concurrent B|description B" ]]; then
  echo "concurrent draft update persisted mixed metadata: $final_pair" >&2
  rm -f "$log_a" "$log_b"
  exit 1
fi

rm -f "$log_a" "$log_b"
echo "update_manual_draft rejects the second same-version writer: OK"
''', encoding="utf-8")

static = STATIC_TEST.read_text(encoding="utf-8")
static = replace_once(
    static,
    '''  assert.match(source, /stepUpdatedAt: key\.startsWith\("step:"\)/);
  assert.match(source, /form\.dataset\.stepUpdatedAt = stepUpdatedAt/);''',
    '''  assert.match(source, /stepUpdatedAt: key\.startsWith\("step:"\)/);
  assert.match(source, /draftUpdatedAt: key === "draft"/);
  assert.match(source, /form\.dataset\.stepUpdatedAt = stepUpdatedAt/);
  assert.match(source, /form\.dataset\.draftUpdatedAt = draftUpdatedAt/);
  assert.match(source, /expectedUpdatedAt = String\(form\.dataset\.draftUpdatedAt \|\| ""\)/);''',
    "static metadata draft version"
)
static = replace_once(
    static,
    '''  assert.match(source, /function wireManualCodePointLimit/);
  assert.match(source, /Array\.from\(description\)\.length > 10000/);''',
    '''  assert.match(source, /function wireManualCodePointLimit/);
  assert.match(source, /acceptedValue = String\(field\.value \|\| ""\)/);
  assert.match(source, /field\.value = acceptedValue/);
  assert.match(source, /Array\.from\(description\)\.length > 10000/);''',
    "static overflow restore"
)
static = replace_once(
    static,
    '''  assert.match(spec, /手順書入力はUnicode code point単位の上限を守る/);
  assert.match(spec, /編集者は手順書作成から手順追加・手修正文保持まで完了できる/);''',
    '''  assert.match(spec, /手順書入力はUnicode code point単位の上限を守る/);
  assert.match(spec, /作成入力の検証エラーでも説明を保持する/);
  assert.match(spec, /作成成功後に一覧を再取得して新しい手順書を表示する/);
  assert.match(spec, /作成応答の前に画面を移動した場合は遅延成功で詳細を開かない/);
  assert.match(spec, /編集者は手順書作成から手順追加・手修正文保持まで完了できる/);''',
    "static new E2E contracts"
)
STATIC_TEST.write_text(static, encoding="utf-8")

e2e = E2E.read_text(encoding="utf-8")
e2e = replace_once(
    e2e,
    '''    expectedUpdatedAtSeen: null,
    failNextManualCreate: null,''',
    '''    expectedUpdatedAtSeen: null,
    expectedDraftUpdatedAtSeen: null,
    draftUpdatedAt: "2026-08-14T00:00:01.000Z",
    manualListGetCount: 0,
    manualCreateDeferred: null,
    releaseManualCreate: null,
    manualCreateResolved: false,
    failNextManualCreate: null,''',
    "E2E fixture state"
)
e2e = replace_once(
    e2e,
    '''  const session = sessionFor(role);

  await page.route("**/api/**", async (route) => {''',
    '''  if (options.deferManualCreate) {
    state.manualCreateDeferred = new Promise((resolve) => { state.releaseManualCreate = resolve; });
  }
  const session = sessionFor(role);

  await page.route("**/api/**", async (route) => {''',
    "E2E deferred create setup"
)
e2e = replace_once(
    e2e,
    '''    if (pathname === `/api/workspaces/${workspaceId}/manuals` && method === "GET") {
      return json(200, { manuals: state.manuals });
    }''',
    '''    if (pathname === `/api/workspaces/${workspaceId}/manuals` && method === "GET") {
      state.manualListGetCount += 1;
      return json(200, { manuals: state.manuals });
    }''',
    "E2E manual list count"
)
e2e = replace_once(
    e2e,
    '''      state.manuals = [{
        id: manualId,
        folderId: null,
        title: body.title,
        status: "draft",
        currentDraftRevisionId: draftId,
        currentPublishedRevisionId: null,
        updatedAt: "2026-08-14T00:00:01.000Z"
      }];
      return json(201, { manualId });''',
    '''      state.manuals = [{
        id: manualId,
        folderId: null,
        title: body.title,
        status: "draft",
        currentDraftRevisionId: draftId,
        currentPublishedRevisionId: null,
        updatedAt: "2026-08-14T00:00:01.000Z"
      }];
      if (state.manualCreateDeferred) await state.manualCreateDeferred;
      state.manualCreateResolved = true;
      return json(201, { manualId });''',
    "E2E delayed create response"
)
e2e = e2e.replace('updatedAt: "2026-08-14T00:00:01.000Z"\n        },\n        steps:', 'updatedAt: state.draftUpdatedAt\n        },\n        steps:', 1)
e2e = replace_once(
    e2e,
    '''      const body = request.postDataJSON();
      state.lastDraftPatchBody = body;
      state.manuals[0].title = body.title;
      return json(200, { draftId });''',
    '''      const body = request.postDataJSON();
      state.lastDraftPatchBody = body;
      state.expectedDraftUpdatedAtSeen = body.expectedUpdatedAt;
      if (body.expectedUpdatedAt !== state.draftUpdatedAt) {
        return json(409, { code: "MANUAL_DRAFT_EDIT_CONFLICT", message: "別の更新が先に保存されました。" });
      }
      state.manuals[0].title = body.title;
      state.draftUpdatedAt = "2026-08-14T00:00:04.000Z";
      return json(200, { draftId });''',
    "E2E draft conflict fixture"
)
old_codepoint_test = '''  const title = "𠮷".repeat(64);
  const description = "𠮷".repeat(10000);'''
new_codepoint_test = '''  const title = "𠮷".repeat(64);
  const description = "先" + "𠮷".repeat(9998) + "末";'''
e2e = replace_once(e2e, old_codepoint_test, new_codepoint_test, "E2E mixed code point value")
e2e = replace_once(
    e2e,
    '''  await createDescription.evaluate((element) => {
    element.value += "𠮷";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(await createDescription.evaluate((element) => Array.from(element.value).length)).toBe(10000);''',
    '''  await createDescription.focus();
  await createDescription.evaluate((element) => element.setSelectionRange(1, 1));
  await page.keyboard.type("追");
  await expect(createDescription).toHaveValue(description);
  expect((await createDescription.inputValue()).endsWith("末")).toBe(true);''',
    "E2E middle overflow preservation"
)
e2e = replace_once(
    e2e,
    '''  expect(Array.from(state.lastDraftPatchBody.description)).toHaveLength(10000);
});

test("編集者は手順書作成から手順追加・手修正文保持まで完了できる",''',
    '''  expect(Array.from(state.lastDraftPatchBody.description)).toHaveLength(10000);
  expect(state.expectedDraftUpdatedAtSeen).toBe("2026-08-14T00:00:01.000Z");
});

test("作成入力の検証エラーでも説明を保持する", async ({ page }) => {
  await installManualFixture(page, "editor", { empty: true });
  await openManualScreen(page);
  const description = page.locator("#manual-create-description");
  await description.fill("破棄してはいけない説明");
  await page.getByRole("button", { name: "手順書を作成" }).click();
  await expect(description).toHaveValue("破棄してはいけない説明");
  await expect(page.locator("#manual-create-title")).toBeFocused();
  await expect(page.locator("#manual-create-title")).toHaveAttribute("aria-invalid", "true");
});

test("作成成功後に一覧を再取得して新しい手順書を表示する", async ({ page }) => {
  const state = await installManualFixture(page, "editor", { empty: true });
  await openManualScreen(page);
  const initialListGets = state.manualListGetCount;
  await page.locator("#manual-create-title").fill("一覧へ追加される手順書");
  await page.getByRole("button", { name: "手順書を作成" }).click();
  await expect(page.locator("#manual-detail-heading")).toHaveText("一覧へ追加される手順書");
  await page.getByRole("button", { name: "手順書一覧へ戻る" }).click();
  await expect(page.getByRole("button", { name: /一覧へ追加される手順書/ })).toBeVisible();
  expect(state.manualListGetCount).toBeGreaterThan(initialListGets);
});

test("作成応答の前に画面を移動した場合は遅延成功で詳細を開かない", async ({ page }) => {
  const state = await installManualFixture(page, "editor", { empty: true, deferManualCreate: true });
  await openManualScreen(page);
  await page.locator("#manual-create-title").fill("遅延する作成");
  await page.getByRole("button", { name: "手順書を作成" }).click();
  await expect.poll(() => state.lastManualCreateBody?.title).toBe("遅延する作成");
  await page.getByRole("button", { name: "メンバー管理", exact: true }).click();
  state.releaseManualCreate();
  await expect.poll(() => state.manualCreateResolved).toBe(true);
  await expect(page.getByRole("heading", { name: "メンバー管理", exact: true })).toBeVisible();
  await expect(page.locator("#manual-detail-heading")).toHaveCount(0);
});

test("編集者は手順書作成から手順追加・手修正文保持まで完了できる",''',
    "E2E new create safety tests"
)
E2E.write_text(e2e, encoding="utf-8")

api_check = API_CHECK.read_text(encoding="utf-8")
api_check = replace_once(
    api_check,
    '''  "MANUAL_DRAFT_UPDATE_RESULT_UNKNOWN",
  "MANUAL_STEP_CREATE_RESULT_UNKNOWN",''',
    '''  "MANUAL_DRAFT_UPDATE_RESULT_UNKNOWN",
  "MANUAL_DRAFT_EDIT_CONFLICT",
  "MANUAL_DRAFT_VERSION_INVALID",
  "requiredExpectedDraftUpdatedAt",
  "expected_draft_revision_id: expectedDraftId",
  "expected_draft_updated_at: expectedUpdatedAt",
  "MANUAL_STEP_CREATE_RESULT_UNKNOWN",''',
    "API checker draft version"
)
api_check = replace_once(
    api_check,
    '''  "create or replace function public.update_manual_draft(",
  "for update;",''',
    '''  "create function public.update_manual_draft(",
  "expected_draft_revision_id uuid",
  "expected_draft_updated_at timestamptz",
  "manual draft changed concurrently",
  "for update;",''',
    "API checker migration version"
)
api_check = api_check.replace(
    '"grant execute on function public.update_manual_draft(uuid, text, text) to authenticated"',
    '"grant execute on function public.update_manual_draft(uuid, uuid, timestamptz, text, text) to authenticated"'
)
api_check = replace_once(
    api_check,
    '''  "MANUAL_STEP_EDIT_CONFLICT",
  "`expectedUpdatedAt`",''',
    '''  "MANUAL_DRAFT_EDIT_CONFLICT",
  "MANUAL_STEP_EDIT_CONFLICT",
  "`expectedUpdatedAt`",''',
    "API checker docs conflict"
)
api_check = replace_once(
    api_check,
    '''  "phase2-manual-edit-http-test.sql",
  "node scripts/check-phase2-manual-edit-api.mjs",''',
    '''  "phase2-manual-edit-http-test.sql",
  "test-phase2-manual-draft-locks.sh",
  "node scripts/check-phase2-manual-edit-api.mjs",''',
    "API checker lock workflow"
)
API_CHECK.write_text(api_check, encoding="utf-8")

ui_check = UI_CHECK.read_text(encoding="utf-8")
ui_check = replace_once(
    ui_check,
    '''  'data-step-updated-at="',
  'payload.expectedUpdatedAt = String(form.dataset.stepUpdatedAt || "")',''',
    '''  'data-step-updated-at="',
  'data-draft-updated-at="',
  'expectedUpdatedAt = String(form.dataset.draftUpdatedAt || "")',
  'payload.expectedUpdatedAt = String(form.dataset.stepUpdatedAt || "")',''',
    "UI checker draft version"
)
ui_check = replace_once(
    ui_check,
    '''if (!e2e.includes("expectedUpdatedAtSeen")) errors.push("Missing displayed-step-version browser assertion");''',
    '''if (!e2e.includes("expectedDraftUpdatedAtSeen")) errors.push("Missing displayed-draft-version browser assertion");
if (!e2e.includes("expectedUpdatedAtSeen")) errors.push("Missing displayed-step-version browser assertion");
if (!e2e.includes("作成入力の検証エラーでも説明を保持する")) errors.push("Missing create validation draft-preservation browser flow");
if (!e2e.includes("作成成功後に一覧を再取得して新しい手順書を表示する")) errors.push("Missing post-create list invalidation browser flow");
if (!e2e.includes("作成応答の前に画面を移動した場合は遅延成功で詳細を開かない")) errors.push("Missing delayed-create navigation browser flow");''',
    "UI checker new E2E"
)
UI_CHECK.write_text(ui_check, encoding="utf-8")

workflow = API_WORKFLOW.read_text(encoding="utf-8")
workflow = replace_once(
    workflow,
    '''      - "scripts/check-phase2-manual-edit-api.mjs"
      - "supabase/migrations/202608140005_phase2_manual_title_length.sql"''',
    '''      - "scripts/check-phase2-manual-edit-api.mjs"
      - "scripts/test-phase2-manual-draft-locks.sh"
      - "supabase/migrations/202608140005_phase2_manual_title_length.sql"''',
    "manual edit workflow lock path"
)
workflow = replace_once(
    workflow,
    '''      - name: Exercise authenticated edit, permission, and bound checks
        run: psql -X -v ON_ERROR_STOP=1 -f tests/sql/phase2-manual-edit-http-test.sql
      - name: Validate migration safety and ordering''',
    '''      - name: Exercise authenticated edit, permission, and bound checks
        run: psql -X -v ON_ERROR_STOP=1 -f tests/sql/phase2-manual-edit-http-test.sql
      - name: Exercise draft metadata lock and optimistic conflict
        run: bash scripts/test-phase2-manual-draft-locks.sh
      - name: Validate migration safety and ordering''',
    "manual edit workflow lock test"
)
API_WORKFLOW.write_text(workflow, encoding="utf-8")

api_doc = API_DOC.read_text(encoding="utf-8")
api_doc = replace_once(
    api_doc,
    '''- titleとdescriptionを両方送信し、`update_manual_draft` RPCで`manuals.title`とcurrent draftのtitle/descriptionを同一transactionで更新する。
- current draftが無い場合は409で、新しいdraft作成フローを案内する。''',
    '''- title、description、詳細取得時に表示したdraftの`updatedAt`を`expectedUpdatedAt`として送信する。
- Workerはcurrent draft IDと表示中の`updatedAt`を`update_manual_draft` RPCへ渡し、manual rowとdraft rowをlockした後に一致する場合だけ`manuals.title`とcurrent draftのtitle/descriptionを同一transactionで更新する。
- 同じversionからの後続保存は`409 MANUAL_DRAFT_EDIT_CONFLICT`とし、先行したタイトル・説明を古いフォームで上書きしない。
- current draftが無い、またはcurrent draft IDが切り替わった場合は409で、新しいdraft作成フローを案内する。''',
    "API doc metadata concurrency"
)
api_doc = replace_once(
    api_doc,
    '''- `update_manual_draft`
- draft descriptionとstep本文フィールドの上限constraint''',
    '''- optimistic version照合付き`update_manual_draft`
- draft descriptionとstep本文フィールドの上限constraint''',
    "API doc migration metadata"
)
api_doc = replace_once(
    api_doc,
    '''- draft title/descriptionの原子的更新
- published/superseded直接変更拒否''',
    '''- draft title/descriptionの原子的更新
- 同じdraft `updatedAt`を持つ2更新のうち1件だけ成功し、もう1件が`MANUAL_DRAFT_EDIT_CONFLICT`になる並行実行試験
- published/superseded直接変更拒否''',
    "API doc metadata tests"
)
API_DOC.write_text(api_doc, encoding="utf-8")

ux_doc = UX_DOC.read_text(encoding="utf-8")
ux_doc = replace_once(
    ux_doc,
    '''- 作成結果不明時は自動再送せず、一覧を再取得して「重ねて作成しない」案内を表示する。
- 作成RPC内で権限が失効した場合も確定的な403として扱い、一覧側の権限キャッシュを破棄して作成フォームを閉じる。''',
    '''- 作成結果不明時は自動再送せず、一覧を再取得して「重ねて作成しない」案内を表示する。
- 作成前のローカル入力エラーでは画面全体を再描画せず、入力済み説明を保持したまま不正欄へフォーカスする。
- 作成成功時は手順書一覧キャッシュをidleへ戻し、詳細から一覧へ戻った時に新しい手順書を再取得する。
- 作成応答前に別画面または別workspaceへ移動した場合、遅延した成功応答で元workspaceの詳細画面を開かない。
- 作成RPC内で権限が失効した場合も確定的な403として扱い、一覧側の権限キャッシュを破棄して作成フォームを閉じる。''',
    "UX create safety"
)
ux_doc = replace_once(
    ux_doc,
    '''- 未保存stepを詳細再取得後へ復元するときは、その入力値が基にしていたstepの`updatedAt`も同じメモリdraftで保持・復元する。再取得後の新しいversionへ付け替えず、競合時は409で停止する。''',
    '''- 未保存stepを詳細再取得後へ復元するときは、その入力値が基にしていたstepの`updatedAt`も同じメモリdraftで保持・復元する。再取得後の新しいversionへ付け替えず、競合時は409で停止する。
- 基本情報の保存も、画面が表示したdraftの`updatedAt`を送信してmanual/draft lock内で照合する。別編集者の先行保存後は`MANUAL_DRAFT_EDIT_CONFLICT`で停止し、古いタイトルや説明を復元しない。''',
    "UX metadata version"
)
ux_doc = replace_once(
    ux_doc,
    '''- 手順書入力の文字数上限は、UTF-16 code unit基準のnative `maxlength`に依存せず、Unicode code point単位のJavaScript入力制御とsubmit/API/DB検証で強制する。''',
    '''- 手順書入力の文字数上限は、UTF-16 code unit基準のnative `maxlength`に依存せず、Unicode code point単位のJavaScript入力制御とsubmit/API/DB検証で強制する。
- 上限到達後に途中へ文字を入力またはIME確定しても、末尾の既存文字を切り捨てず、入力直前の受理済み値と選択位置へ戻す。''',
    "UX overflow restore"
)
UX_DOC.write_text(ux_doc, encoding="utf-8")

log = DECISION_LOG.read_text(encoding="utf-8")
entry = '''

## DEC-058: draft metadataと作成UIを競合・遅延応答から保護する

- Status: Accepted
- Date: 2026-08-15
- Decision:
  - draft基本情報のPATCHは表示時の`updatedAt`を必須とし、manual rowとdraft rowのlock取得後に照合する。同じversionからの後続保存は409で拒否する。
  - 手順書作成の入力エラーではフォームDOMを維持し、説明等の未保存入力を破棄しない。
  - 作成成功後は一覧キャッシュを無効化し、一覧へ戻る時に再取得する。
  - 作成応答前に画面またはworkspaceが変わった場合、遅延応答で元workspaceの詳細へ遷移しない。
  - Unicode code point上限超過時は入力直前の受理済み値へ戻し、途中入力によって既存末尾を削除しない。
- Evidence:
  - Worker/API/SQL/Playwrightの競合・入力保持・遅延応答・一覧再取得テスト。
  - 使い捨てPostgreSQLで同じdraft versionからの2並行更新を実行し、1件だけ成功することを確認する。
- Boundary:
  - staging/production migration適用とproduction deployは行わない。
'''
if "## DEC-058:" not in log:
    log += entry
DECISION_LOG.write_text(log, encoding="utf-8")

print("Final Phase 2 review fixes applied.")
