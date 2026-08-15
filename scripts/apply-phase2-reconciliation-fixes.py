from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one occurrence, found {count}")
    return text.replace(old, new, 1)


app_path = Path("apps/worker/src/app-assets.ts")
app = app_path.read_text(encoding="utf-8")

app = replace_once(
    app,
    '''  const sequence = ++manualRequestSequence;
  manualsState = { workspaceId, status: "loading", items: manualsState.workspaceId === workspaceId ? manualsState.items : [], message: "", messageKind: "notice" };''',
    '''  const sequence = ++manualRequestSequence;
  const carriedMessage = options.message ?? (
    manualsState.workspaceId === workspaceId && manualsState.status === "idle"
      ? manualsState.message
      : ""
  );
  const carriedMessageKind = options.messageKind ?? (
    manualsState.workspaceId === workspaceId && manualsState.status === "idle"
      ? manualsState.messageKind
      : "notice"
  );
  manualsState = {
    workspaceId,
    status: "loading",
    items: manualsState.workspaceId === workspaceId ? manualsState.items : [],
    message: carriedMessage,
    messageKind: carriedMessageKind
  };''',
    "carry reconciliation message while loading manuals",
)
app = replace_once(
    app,
    '''    manualsState = { workspaceId, status: "loaded", items: payload.manuals, message: options.message || "", messageKind: options.messageKind || "notice" };''',
    '''    manualsState = { workspaceId, status: "loaded", items: payload.manuals, message: carriedMessage, messageKind: carriedMessageKind };''',
    "keep reconciliation message after loading manuals",
)

app = replace_once(
    app,
    '''    if (isTerminalSessionError(error)) {
      setManualMutationBusyState(false);
      return loadSession();
    }
    if (
      options.preserveDomOnError && currentScreen === "manual-detail" &&''',
    '''    if (isTerminalSessionError(error)) {
      setManualMutationBusyState(false);
      return loadSession();
    }
    if (isManualPermissionRevocation(error)) {
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
      if (
        currentScreen === "manual-detail" &&
        currentWorkspaceSelection?.workspaceId === workspaceId &&
        manualDetailState.workspaceId === workspaceId &&
        manualDetailState.manualId === manualId &&
        manualDetailState.value
      ) {
        manualDetailState = {
          ...manualDetailState,
          status: "loaded",
          value: {
            ...manualDetailState.value,
            permissions: { ...(manualDetailState.value.permissions || {}), canEdit: false }
          },
          message: error.message,
          messageKind: "error"
        };
        renderShell(currentSession, "", "notice", "manual-detail-message");
        await loadWorkspaceMembers(workspaceId, {
          message: error.message,
          messageKind: "error",
          focusId: "manual-detail-message",
          alreadyRendered: true
        });
      }
      return;
    }
    if (
      options.preserveDomOnError && currentScreen === "manual-detail" &&''',
    "fail closed during detail refresh",
)

app = replace_once(
    app,
    '''    if (currentWorkspaceSelection?.workspaceId !== workspaceId || currentScreen !== "manuals") {
      setManualMutationBusyState(false);
      return;
    }
    manualsState = { ...manualsState, workspaceId, status: "idle", message: "", messageKind: "notice" };
    setManualMutationBusyState(false);''',
    '''    if (manualsState.workspaceId === workspaceId) {
      manualsState = { ...manualsState, workspaceId, status: "idle", message: "", messageKind: "notice" };
    }
    if (currentWorkspaceSelection?.workspaceId !== workspaceId || currentScreen !== "manuals") {
      setManualMutationBusyState(false);
      return;
    }
    setManualMutationBusyState(false);''',
    "invalidate list before ignoring delayed create success",
)

app = replace_once(
    app,
    '''    if (isTerminalSessionError(error)) {
      setManualMutationBusyState(false);
      return loadSession();
    }
    if (currentWorkspaceSelection?.workspaceId !== workspaceId || currentScreen !== "manuals") {
      setManualMutationBusyState(false);
      return;
    }
    if (error.status === 403 || error.status === 404) {''',
    '''    if (isTerminalSessionError(error)) {
      setManualMutationBusyState(false);
      return loadSession();
    }
    const resultUnknown = manualMutationUnknown(error);
    if (resultUnknown && manualsState.workspaceId === workspaceId) {
      manualsState = {
        ...manualsState,
        status: "idle",
        message: "作成結果を一覧で確認してください。重ねて作成しないでください。",
        messageKind: "warning"
      };
    }
    if (currentWorkspaceSelection?.workspaceId !== workspaceId || currentScreen !== "manuals") {
      setManualMutationBusyState(false);
      return;
    }
    if (error.status === 403 || error.status === 404) {''',
    "reconcile ambiguous create before navigation guard",
)
app = replace_once(
    app,
    '''    if (manualMutationUnknown(error)) {
      setManualMutationBusyState(false);
      await loadManuals(workspaceId, { message: "作成結果を一覧で確認してください。重ねて作成しないでください。", messageKind: "warning", focusId: "manuals-message" });''',
    '''    if (resultUnknown) {
      setManualMutationBusyState(false);
      await loadManuals(workspaceId, { message: "作成結果を一覧で確認してください。重ねて作成しないでください。", messageKind: "warning", focusId: "manuals-message" });''',
    "reuse ambiguous create classification",
)

app_path.write_text(app, encoding="utf-8")


e2e_path = Path("tests/e2e/phase2-manual-editor.spec.mjs")
e2e = e2e_path.read_text(encoding="utf-8")
e2e = replace_once(
    e2e,
    '''    failNextManualCreate: null,
    failNextStepPatch: null,''',
    '''    failNextManualCreate: null,
    failNextManualDetail: null,
    failNextStepPatch: null,''',
    "detail failure fixture state",
)

old_create_route = '''    if (pathname === `/api/workspaces/${workspaceId}/manuals` && method === "POST") {
      if (state.failNextManualCreate) {
        const failure = state.failNextManualCreate;
        state.failNextManualCreate = null;
        if (failure.status === 403 || failure.code === "MANUALS_NOT_FOUND") {
          state.currentRole = "viewer";
          state.canEdit = false;
        }
        return json(failure.status, { code: failure.code, message: failure.message });
      }
      const body = request.postDataJSON();
      state.lastManualCreateBody = body;
      state.manuals = [{
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
      return json(201, { manualId });
    }'''
new_create_route = '''    if (pathname === `/api/workspaces/${workspaceId}/manuals` && method === "POST") {
      const failure = state.failNextManualCreate;
      state.failNextManualCreate = null;
      const body = request.postDataJSON();
      state.lastManualCreateBody = body;
      if (!failure || failure.commitBeforeFailure) {
        state.manuals = [{
          id: manualId,
          folderId: null,
          title: body.title,
          status: "draft",
          currentDraftRevisionId: draftId,
          currentPublishedRevisionId: null,
          updatedAt: "2026-08-14T00:00:01.000Z"
        }];
      }
      if (state.manualCreateDeferred) await state.manualCreateDeferred;
      state.manualCreateResolved = true;
      if (failure) {
        if (failure.status === 403 || failure.code === "MANUALS_NOT_FOUND") {
          state.currentRole = "viewer";
          state.canEdit = false;
        }
        if (failure.mode === "abort") return route.abort("failed");
        if (failure.mode === "invalid-json") {
          return route.fulfill({ status: 201, contentType: "application/json", body: "{" });
        }
        return json(failure.status, { code: failure.code, message: failure.message });
      }
      return json(201, { manualId });
    }'''
e2e = replace_once(e2e, old_create_route, new_create_route, "deferred create outcome fixture")

e2e = replace_once(
    e2e,
    '''    if (
      (pathname === `/api/workspaces/${workspaceId}/manuals/${manualId}` ||
        pathname === `/api/workspaces/${workspaceId}/manuals/${secondManualId}`) &&
      method === "GET"
    ) {
      const requestedManualId = pathname.split("/").at(-1);''',
    '''    if (
      (pathname === `/api/workspaces/${workspaceId}/manuals/${manualId}` ||
        pathname === `/api/workspaces/${workspaceId}/manuals/${secondManualId}`) &&
      method === "GET"
    ) {
      if (state.failNextManualDetail) {
        const failure = state.failNextManualDetail;
        state.failNextManualDetail = null;
        if (failure.status === 403 || failure.code === "MANUALS_NOT_FOUND") {
          state.currentRole = "viewer";
          state.canEdit = false;
        }
        return json(failure.status, { code: failure.code, message: failure.message });
      }
      const requestedManualId = pathname.split("/").at(-1);''',
    "detail refresh failure fixture",
)

e2e = replace_once(
    e2e,
    '''  state.releaseManualCreate();
  await expect.poll(() => state.manualCreateResolved).toBe(true);
  await expect(page.getByRole("heading", { name: "メンバー管理", exact: true })).toBeVisible();
  await expect(page.locator("#manual-detail-heading")).toHaveCount(0);
});''',
    '''  const listGetsBeforeCompletion = state.manualListGetCount;
  state.releaseManualCreate();
  await expect.poll(() => state.manualCreateResolved).toBe(true);
  await expect(page.getByRole("heading", { name: "メンバー管理", exact: true })).toBeVisible();
  await expect(page.locator("#manual-detail-heading")).toHaveCount(0);
  await page.getByRole("button", { name: "手順書", exact: true }).click();
  await expect(page.getByRole("button", { name: /遅延する作成/ })).toBeVisible();
  expect(state.manualListGetCount).toBeGreaterThan(listGetsBeforeCompletion);
});''',
    "delayed create success list reconciliation test",
)

ambiguous_test = '''

test("作成結果不明で別画面へ移動しても一覧再取得と重複防止警告を行う", async ({ page }) => {
  const state = await installManualFixture(page, "editor", { empty: true, deferManualCreate: true });
  state.failNextManualCreate = {
    mode: "abort",
    commitBeforeFailure: true,
    status: 502,
    code: "NETWORK_ERROR",
    message: "通信結果を確認できません。"
  };
  await openManualScreen(page);
  await page.locator("#manual-create-title").fill("結果不明の作成");
  await page.getByRole("button", { name: "手順書を作成" }).click();
  await expect.poll(() => state.lastManualCreateBody?.title).toBe("結果不明の作成");
  await page.getByRole("button", { name: "メンバー管理", exact: true }).click();
  const listGetsBeforeCompletion = state.manualListGetCount;
  state.releaseManualCreate();
  await expect.poll(() => state.manualCreateResolved).toBe(true);
  await expect(page.getByRole("heading", { name: "メンバー管理", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "手順書", exact: true }).click();
  await expect(page.locator("#manuals-message")).toContainText("作成結果を一覧で確認してください。重ねて作成しないでください。");
  await expect(page.getByRole("button", { name: /結果不明の作成/ })).toBeVisible();
  expect(state.manualListGetCount).toBeGreaterThan(listGetsBeforeCompletion);
});
'''
e2e = replace_once(
    e2e,
    '\n\ntest("編集者は手順書作成から手順追加・手修正文保持まで完了できる", async ({ page }) => {',
    ambiguous_test + '\n\ntest("編集者は手順書作成から手順追加・手修正文保持まで完了できる", async ({ page }) => {',
    "ambiguous create reconciliation E2E",
)

revocation_test = '''

test("保存後の詳細再取得で所属喪失した場合も編集UIを閉じる", async ({ page }) => {
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
  state.failNextManualDetail = {
    status: 404,
    code: "MANUALS_NOT_FOUND",
    message: "所属を確認できません。"
  };
  await page.locator(`#step-instruction-${firstStepId}`).fill("保存後に権限が失効する文章");
  await page.getByRole("button", { name: "手順を保存" }).click();
  await expect(page.locator("#manual-draft-form")).toHaveCount(0);
  await expect(page.locator(".manual-step-form")).toHaveCount(0);
  await expect(page.getByText("現在の権限では閲覧のみ利用できます。" )).toBeVisible();
  expect(state.currentRole).toBe("viewer");
  expect(state.canEdit).toBe(false);
});
'''
e2e = replace_once(
    e2e,
    '\n\ntest("step不存在404は権限喪失と誤判定せず未保存の基本情報を保持する", async ({ page }) => {',
    revocation_test + '\n\ntest("step不存在404は権限喪失と誤判定せず未保存の基本情報を保持する", async ({ page }) => {',
    "detail refresh revocation E2E",
)

e2e_path.write_text(e2e, encoding="utf-8")


unit_path = Path("tests/manual-editor-ui.test.mjs")
unit = unit_path.read_text(encoding="utf-8")
unit = replace_once(
    unit,
    '''  assert.match(source, /if \\(error\\.status === 404\\)[\\s\\S]*restoreDrafts: retainedDrafts/);''',
    '''  assert.match(source, /if \\(error\\.status === 404\\)[\\s\\S]*restoreDrafts: retainedDrafts/);
  assert.match(source, /if \\(isManualPermissionRevocation\\(error\\)\\)[\\s\\S]*options\\.preserveDomOnError/);
  assert.match(source, /const resultUnknown = manualMutationUnknown\\(error\\)[\\s\\S]*status: "idle"[\\s\\S]*重ねて作成しないでください。[\\s\\S]*currentScreen !== "manuals"/);
  assert.match(source, /manualsState\\.workspaceId === workspaceId[\\s\\S]*status: "idle"[\\s\\S]*currentScreen !== "manuals"/);
  assert.match(source, /const carriedMessage = options\\.message \\?\\?[\\s\\S]*manualsState\\.status === "idle"/);''',
    "static reconciliation and refresh revocation contracts",
)
unit = replace_once(
    unit,
    '''  assert.match(spec, /作成応答の前に画面を移動した場合は遅延成功で詳細を開かない/);''',
    '''  assert.match(spec, /作成応答の前に画面を移動した場合は遅延成功で詳細を開かない/);
  assert.match(spec, /作成結果不明で別画面へ移動しても一覧再取得と重複防止警告を行う/);
  assert.match(spec, /保存後の詳細再取得で所属喪失した場合も編集UIを閉じる/);''',
    "static reconciliation E2E coverage",
)
unit_path.write_text(unit, encoding="utf-8")
