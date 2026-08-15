from pathlib import Path


def replace_once(path, old, new, label):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    p.write_text(text.replace(old, new), encoding="utf-8")


# Worker: require the version that the editor actually loaded.
replace_once(
    "apps/worker/src/manual-edit-router.ts",
    '''function requireTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {''',
    '''function requireTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  return value;
}

function requiredExpectedStepUpdatedAt(body: Record<string, unknown>): string {
  const expectedUpdatedAt = requireTimestamp(body.expectedUpdatedAt);
  if (!expectedUpdatedAt) {
    throw new ManualError(400, "MANUAL_STEP_VERSION_INVALID", "手順を再読み込みしてから保存してください。");
  }
  return expectedUpdatedAt;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {''',
    "version validator",
)
replace_once(
    "apps/worker/src/manual-edit-router.ts",
    '''function patchStepInput(body: Record<string, unknown>, existing: ManualStep): ManualStep {
  assertAllowedKeys(body, ["type", "title", "instruction", "actionType", "targetText", "url"]);
  if (Object.keys(body).length === 0) {
    throw new ManualError(400, "MANUAL_STEP_PATCH_REQUIRED", "変更内容を入力してください。");
  }''',
    '''function patchStepInput(body: Record<string, unknown>, existing: ManualStep): ManualStep {
  assertAllowedKeys(body, ["type", "title", "instruction", "actionType", "targetText", "url", "expectedUpdatedAt"]);
  const patchKeys = Object.keys(body).filter((key) => key !== "expectedUpdatedAt");
  if (patchKeys.length === 0) {
    throw new ManualError(400, "MANUAL_STEP_PATCH_REQUIRED", "変更内容を入力してください。");
  }''',
    "patch keys",
)
replace_once(
    "apps/worker/src/manual-edit-router.ts",
    '''  const draftId = requireDraftId(manual);
  const existing = await fetchActiveStep(env, session.accessToken, workspaceId, draftId, stepId);
  const next = patchStepInput(await readRequestJson(request), existing);
  await callMutationRpc(''',
    '''  const draftId = requireDraftId(manual);
  const body = await readRequestJson(request);
  const expectedUpdatedAt = requiredExpectedStepUpdatedAt(body);
  const existing = await fetchActiveStep(env, session.accessToken, workspaceId, draftId, stepId);
  const next = patchStepInput(body, existing);
  await callMutationRpc(''',
    "read client version",
)
replace_once(
    "apps/worker/src/manual-edit-router.ts",
    "      expected_step_updated_at: existing.updatedAt,",
    "      expected_step_updated_at: expectedUpdatedAt,",
    "forward client version",
)

# Browser: embed and send the version; fail closed on create permission loss.
replace_once(
    "apps/worker/src/app-assets.ts",
    '''    '<form class="manual-step-form" data-step-id="' + escapeHtml(step.id) + '">' +''',
    '''    '<form class="manual-step-form" data-step-id="' + escapeHtml(step.id) + '" data-step-updated-at="' + escapeHtml(step.updatedAt) + '">' +''',
    "step form version",
)
replace_once(
    "apps/worker/src/app-assets.ts",
    '''  const instruction = String(form.elements.instruction.value || "");
  if (!isNew || instruction) payload.instruction = instruction;
  return payload;''',
    '''  const instruction = String(form.elements.instruction.value || "");
  if (!isNew || instruction) payload.instruction = instruction;
  if (!isNew) payload.expectedUpdatedAt = String(form.dataset.stepUpdatedAt || "");
  return payload;''',
    "step payload version",
)
replace_once(
    "apps/worker/src/app-assets.ts",
    '''    if (isTerminalSessionError(error)) {
      setManualMutationBusyState(false);
      return loadSession();
    }
    if (manualMutationUnknown(error)) {
      setManualMutationBusyState(false);
      await loadManuals(workspaceId, { message: "作成結果を一覧で確認してください。重ねて作成しないでください。", messageKind: "warning", focusId: "manuals-message" });''',
    '''    if (isTerminalSessionError(error)) {
      setManualMutationBusyState(false);
      return loadSession();
    }
    if (error.status === 403 || error.status === 404) {
      manualsState = { ...manualsState, message: error.message, messageKind: "error" };
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
      setManualMutationBusyState(false);
      renderShell(currentSession, "", "notice", "manuals-message");
      await loadWorkspaceMembers(workspaceId, {
        message: error.message,
        messageKind: "error",
        focusId: "manuals-message",
        alreadyRendered: true
      });
      return;
    }
    if (manualMutationUnknown(error)) {
      setManualMutationBusyState(false);
      await loadManuals(workspaceId, { message: "作成結果を一覧で確認してください。重ねて作成しないでください。", messageKind: "warning", focusId: "manuals-message" });''',
    "create permission refresh",
)

# Manual create: validate description before RPC.
replace_once(
    "apps/worker/src/manual-router.ts",
    '''const MAX_MANUAL_LIST_ITEMS = 1000;
export const MAX_MANUAL_TITLE_LENGTH = 64;
const SUPABASE_TIMEOUT_MS = 5000;''',
    '''const MAX_MANUAL_LIST_ITEMS = 1000;
export const MAX_MANUAL_TITLE_LENGTH = 64;
const MAX_MANUAL_DESCRIPTION_LENGTH = 10_000;
const SUPABASE_TIMEOUT_MS = 5000;''',
    "description constant",
)
replace_once(
    "apps/worker/src/manual-router.ts",
    '''  const description = typeof body.description === "string" ? body.description : "";
  const folderId = body.folderId === undefined || body.folderId === null ? null : String(body.folderId);''',
    '''  const description = typeof body.description === "string" ? body.description : "";
  if (Array.from(description).length > MAX_MANUAL_DESCRIPTION_LENGTH) {
    throw new ManualError(400, "MANUAL_DESCRIPTION_INVALID", "説明は10,000文字以内で入力してください。");
  }
  const folderId = body.folderId === undefined || body.folderId === null ? null : String(body.folderId);''',
    "description validation",
)

# Canonical documentation.
replace_once(
    "docs/05-api/phase2-manual-api.md",
    '''- bodyはストリーム読取中にも16 KiBで打ち切り、`Content-Length`が無いchunked bodyでも上限を迂回させない。
- titleはtrim後1〜64 Unicode code pointとし、WorkerとDB制約で同じ上限を強制する。''',
    '''- bodyはストリーム読取中にも64 KiBで打ち切り、`Content-Length`が無いchunked bodyでも上限を迂回させない。
- titleはtrim後1〜64 Unicode code pointとし、WorkerとDB制約で同じ上限を強制する。
- descriptionは10,000 Unicode code point以内とし、WorkerでRPC呼出前に400へ確定し、DB制約でも同じ上限を強制する。''',
    "create API limits",
)
replace_once(
    "docs/05-api/phase2-manual-api.md",
    "- Content-Lengthなしの16 KiB超bodyを413",
    "- Content-Lengthなしの64 KiB超bodyを413\n- description 10,000文字超をRPC前に400",
    "create API tests",
)
replace_once(
    "docs/05-api/phase2-manual-edit-api.md",
    '''- Workerが取得したstepの`updatedAt`を楽観的更新条件としてRPCへ渡し、revision lock取得後のDB rowと一致するときだけ更新する。同じversionからの後続更新は`409 MANUAL_STEP_EDIT_CONFLICT`とし、先行更新を上書きしない。''',
    '''- クライアントは詳細取得時に表示したstepの`updatedAt`を`expectedUpdatedAt`としてPATCHへ含める。Workerはその値を楽観的更新条件としてRPCへ渡し、revision lock取得後のDB rowと一致するときだけ更新する。同じversionからの後続更新は`409 MANUAL_STEP_EDIT_CONFLICT`とし、先行更新を上書きしない。WorkerがPATCH直前に再取得した新しいversionへ差し替えてはならない。''',
    "edit API version contract",
)

# Unit tests.
replace_once(
    "tests/manual-api.test.mjs",
    '''test("streamed JSON body over 64 KiB fails with 413 before create RPC", async () => {''',
    '''test("manual description over 10,000 code points is rejected before create RPC", async () => {
  const mock = installFetch([authOk(), memberOk(), editorOk()]);
  try {
    const response = await handleManualRoute(
      request("POST", JSON.stringify({ title: "説明上限", description: "あ".repeat(10_001) })),
      ENV
    );
    assert.equal(response?.status, 400);
    assert.equal((await response.json()).code, "MANUAL_DESCRIPTION_INVALID");
    assert.equal(mock.calls.length, 3);
  } finally {
    mock.restore();
  }
});

test("streamed JSON body over 64 KiB fails with 413 before create RPC", async () => {''',
    "description test",
)
replace_once(
    "tests/manual-edit-api.test.mjs",
    '''test("step patch keeps the saved instruction when target fields change", async () => {''',
    '''test("step patch requires the version displayed by the editor", async () => {
  const mock = installFetch([authOk(), memberOk(), editorOk(), json([manualRow()])]);
  try {
    const response = await handleManualEditRoute(
      request(detailPath(`/steps/${STEP_ID}`), "PATCH", JSON.stringify({ title: "更新" })),
      ENV
    );
    assert.equal(response?.status, 400);
    assert.equal((await response.json()).code, "MANUAL_STEP_VERSION_INVALID");
    assert.equal(mock.calls.length, 4);
  } finally {
    mock.restore();
  }
});

test("step patch keeps the saved instruction when target fields change", async () => {''',
    "version required test",
)
replace_once(
    "tests/manual-edit-api.test.mjs",
    '''      request(detailPath(`/steps/${STEP_ID}`), "PATCH", JSON.stringify({
        actionType: "select",
        targetText: "プラン選択"
      })),''',
    '''      request(detailPath(`/steps/${STEP_ID}`), "PATCH", JSON.stringify({
        expectedUpdatedAt: "2026-08-14T00:00:02.000Z",
        actionType: "select",
        targetText: "プラン選択"
      })),''',
    "successful patch version",
)
replace_once(
    "tests/manual-edit-api.test.mjs",
    '''      request(detailPath(`/steps/${STEP_ID}`), "PATCH", JSON.stringify({ title: "競合更新" })),
      ENV
    );
    assert.equal(response?.status, 409);
    const body = await response.json();
    assert.equal(body.code, "MANUAL_STEP_EDIT_CONFLICT");''',
    '''      request(detailPath(`/steps/${STEP_ID}`), "PATCH", JSON.stringify({
        title: "競合更新",
        expectedUpdatedAt: "2026-08-14T00:00:01.000Z"
      })),
      ENV
    );
    assert.equal(response?.status, 409);
    const body = await response.json();
    assert.equal(body.code, "MANUAL_STEP_EDIT_CONFLICT");
    assert.equal(JSON.parse(String(mock.calls[5].init.body)).expected_step_updated_at, "2026-08-14T00:00:01.000Z");''',
    "stale client version test",
)

# Browser fixture and create-permission regression.
replace_once(
    "tests/e2e/phase2-manual-editor.spec.mjs",
    '''    steps: options.steps ? [...options.steps] : [],
    instructionSeenOnPatch: null,
    failNextStepPatch: null,
    canEdit: role !== "viewer"''',
    '''    steps: options.steps ? [...options.steps] : [],
    instructionSeenOnPatch: null,
    expectedUpdatedAtSeen: null,
    failNextManualCreate: null,
    failNextStepPatch: null,
    currentRole: role,
    canEdit: role !== "viewer"''',
    "fixture state",
)
replace_once(
    "tests/e2e/phase2-manual-editor.spec.mjs",
    '''        currentUserRole: role,
        members: [{ userId, displayName: `${role}ユーザー`, role, status: "active", joinedAt: "2026-08-14T00:00:00.000Z" }]''',
    '''        currentUserRole: state.currentRole,
        members: [{ userId, displayName: `${state.currentRole}ユーザー`, role: state.currentRole, status: "active", joinedAt: "2026-08-14T00:00:00.000Z" }]''',
    "fixture role refresh",
)
replace_once(
    "tests/e2e/phase2-manual-editor.spec.mjs",
    '''    if (pathname === `/api/workspaces/${workspaceId}/manuals` && method === "POST") {
      const body = request.postDataJSON();''',
    '''    if (pathname === `/api/workspaces/${workspaceId}/manuals` && method === "POST") {
      if (state.failNextManualCreate) {
        const failure = state.failNextManualCreate;
        state.failNextManualCreate = null;
        if (failure.status === 403 || failure.status === 404) {
          state.currentRole = "viewer";
          state.canEdit = false;
        }
        return json(failure.status, { code: failure.code, message: failure.message });
      }
      const body = request.postDataJSON();''',
    "fixture create rejection",
)
replace_once(
    "tests/e2e/phase2-manual-editor.spec.mjs",
    '''    if (pathname === `/api/workspaces/${workspaceId}/manuals/${manualId}/steps/${firstStepId}` && method === "PATCH") {
      if (state.failNextStepPatch) {
        const failure = state.failNextStepPatch;
        state.failNextStepPatch = null;
        if (failure.status === 403) state.canEdit = false;
        return json(failure.status, { code: failure.code, message: failure.message });
      }
      const body = request.postDataJSON();
      state.instructionSeenOnPatch = body.instruction;
      state.steps[0] = { ...state.steps[0], ...body, updatedAt: "2026-08-14T00:00:03.000Z" };
      return json(200, { stepId: firstStepId });
    }''',
    '''    if (pathname === `/api/workspaces/${workspaceId}/manuals/${manualId}/steps/${firstStepId}` && method === "PATCH") {
      const body = request.postDataJSON();
      state.expectedUpdatedAtSeen = body.expectedUpdatedAt;
      if (state.failNextStepPatch) {
        const failure = state.failNextStepPatch;
        state.failNextStepPatch = null;
        if (failure.status === 403) {
          state.currentRole = "viewer";
          state.canEdit = false;
        }
        return json(failure.status, { code: failure.code, message: failure.message });
      }
      const { expectedUpdatedAt, ...stepPatch } = body;
      state.instructionSeenOnPatch = stepPatch.instruction;
      state.steps[0] = { ...state.steps[0], ...stepPatch, updatedAt: "2026-08-14T00:00:03.000Z" };
      return json(200, { stepId: firstStepId });
    }''',
    "fixture patch version",
)
replace_once(
    "tests/e2e/phase2-manual-editor.spec.mjs",
    '''  expect(state.instructionSeenOnPatch).toBe("利用者が手修正した文章です。");
  expect(JSON.stringify(state.steps)).not.toContain("person@example.com");
});


test("権限失効時は編集UIを閉じて最新権限を再取得する", async ({ page }) => {''',
    '''  expect(state.instructionSeenOnPatch).toBe("利用者が手修正した文章です。");
  expect(state.expectedUpdatedAtSeen).toBe("2026-08-14T00:00:02.000Z");
  expect(JSON.stringify(state.steps)).not.toContain("person@example.com");
});

test("手順書作成中の権限失効は作成フォームを閉じて最新権限を取得する", async ({ page }) => {
  const state = await installManualFixture(page, "editor", { empty: true });
  await openManualScreen(page);
  state.failNextManualCreate = { status: 403, code: "MANUAL_CREATE_FORBIDDEN", message: "作成権限がありません。" };
  await page.locator("#manual-create-title").fill("権限失効テスト");
  await page.getByRole("button", { name: "手順書を作成" }).click();
  await expect(page.locator("#manual-create-form")).toHaveCount(0);
  await expect(page.getByText("現在の権限では手順書を作成・編集できません。閲覧はできます。" )).toBeVisible();
});


test("権限失効時は編集UIを閉じて最新権限を再取得する", async ({ page }) => {''',
    "create permission browser test",
)

# Static API checker must require the corrected version source.
replace_once(
    "scripts/check-phase2-manual-edit-api.mjs",
    '''  "MANUAL_STEP_EDIT_CONFLICT",
  "expected_step_updated_at: existing.updatedAt",
  "MANUAL_STEP_DELETE_RESULT_UNKNOWN",''',
    '''  "MANUAL_STEP_EDIT_CONFLICT",
  "MANUAL_STEP_VERSION_INVALID",
  "requiredExpectedStepUpdatedAt",
  "expected_step_updated_at: expectedUpdatedAt",
  "MANUAL_STEP_DELETE_RESULT_UNKNOWN",''',
    "checker implementation contract",
)
replace_once(
    "scripts/check-phase2-manual-edit-api.mjs",
    '''  "MANUAL_STEP_EDIT_CONFLICT",
  "202608140012_phase2_manual_edit_http_contract.sql",''',
    '''  "MANUAL_STEP_EDIT_CONFLICT",
  "`expectedUpdatedAt`",
  "202608140012_phase2_manual_edit_http_contract.sql",''',
    "checker documentation contract",
)

print("Phase 2 final review fixes applied.")
