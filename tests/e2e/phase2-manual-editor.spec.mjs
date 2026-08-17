import { expect, test } from "@playwright/test";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const secondWorkspaceId = "88888888-8888-4888-8888-888888888888";
const userId = "22222222-2222-4222-8222-222222222222";
const manualId = "33333333-3333-4333-8333-333333333333";
const draftId = "44444444-4444-4444-8444-444444444444";
const firstStepId = "55555555-5555-4555-8555-555555555555";
const secondManualId = "66666666-6666-4666-8666-666666666666";
const secondDraftId = "77777777-7777-4777-8777-777777777777";

function sessionFor(role, options = {}) {
  const workspaces = [{
    id: workspaceId,
    name: "手順書テスト",
    slug: "manual-editor-test",
    status: "active",
    created_at: "2026-08-14T00:00:00.000Z"
  }];
  if (options.secondWorkspace) {
    workspaces.push({
      id: secondWorkspaceId,
      name: "別ワークスペース",
      slug: "manual-editor-second",
      status: "active",
      created_at: "2026-08-14T00:00:00.100Z"
    });
  }
  return {
    user: { id: userId, email: `${role}@example.invalid` },
    profile: { id: userId, display_name: `${role}ユーザー`, locale: "ja-JP", timezone: "Asia/Tokyo" },
    workspaces
  };
}

async function installManualFixture(page, role, options = {}) {
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
    manuals: initialManuals,
    steps: options.steps ? [...options.steps] : [],
    instructionSeenOnPatch: null,
    expectedUpdatedAtSeen: null,
    expectedDraftUpdatedAtSeen: null,
    draftUpdatedAt: "2026-08-14T00:00:01.000Z",
    manualListGetCount: 0,
    manualCreateDeferred: null,
    releaseManualCreate: null,
    manualCreateResolved: false,
    draftPatchDeferred: null,
    releaseDraftPatch: null,
    draftPatchResolved: false,
    failNextManualCreate: null,
    failNextManualDetail: null,
    failNextStepPatch: null,
    lastManualCreateBody: null,
    lastDraftPatchBody: null,
    lastStepCreateBody: null,
    lastStepPatchBody: null,
    currentRole: role,
    canEdit: role !== "viewer"
  };
  if (options.deferManualCreate) {
    state.manualCreateDeferred = new Promise((resolve) => { state.releaseManualCreate = resolve; });
  }
  if (options.deferDraftPatch) {
    state.draftPatchDeferred = new Promise((resolve) => { state.releaseDraftPatch = resolve; });
  }
  const session = sessionFor(role, options);

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const method = request.method();
    const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (pathname === "/api/session" && method === "GET") return json(200, session);
    if (pathname === "/api/auth/logout" && method === "POST") return json(200, { status: "ok" });
    if ((pathname === `/api/workspaces/${workspaceId}/members` || pathname === `/api/workspaces/${secondWorkspaceId}/members`) && method === "GET") {
      const requestedWorkspaceId = pathname.split("/")[3];
      return json(200, {
        workspaceId: requestedWorkspaceId,
        currentUserRole: state.currentRole,
        members: [{ userId, displayName: `${state.currentRole}ユーザー`, role: state.currentRole, status: "active", joinedAt: "2026-08-14T00:00:00.000Z" }]
      });
    }
    if (pathname === `/api/workspaces/${secondWorkspaceId}/manuals` && method === "GET") {
      return json(200, { manuals: [] });
    }
    if (pathname === `/api/workspaces/${workspaceId}/manuals` && method === "GET") {
      state.manualListGetCount += 1;
      return json(200, { manuals: state.manuals });
    }
    if (pathname === `/api/workspaces/${workspaceId}/manuals` && method === "POST") {
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
    }
    if (
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
    }
    if (pathname === `/api/workspaces/${workspaceId}/manuals/${manualId}/draft` && method === "PATCH") {
      const body = request.postDataJSON();
      state.lastDraftPatchBody = body;
      state.expectedDraftUpdatedAtSeen = body.expectedUpdatedAt;
      if (body.expectedUpdatedAt !== state.draftUpdatedAt) {
        return json(409, { code: "MANUAL_DRAFT_EDIT_CONFLICT", message: "別の更新が先に保存されました。" });
      }
      state.manuals[0].title = body.title;
      state.manuals[0].updatedAt = "2026-08-14T00:00:04.000Z";
      state.draftUpdatedAt = "2026-08-14T00:00:04.000Z";
      if (state.draftPatchDeferred) await state.draftPatchDeferred;
      state.draftPatchResolved = true;
      return json(200, { draftId });
    }
    if (pathname === `/api/workspaces/${workspaceId}/manuals/${manualId}/steps` && method === "POST") {
      const body = request.postDataJSON();
      state.lastStepCreateBody = body;
      const instruction = body.instruction || (body.type === "action" ? `［${body.targetText}］をクリックします。` : "");
      state.steps.push({
        id: firstStepId,
        position: state.steps.length,
        type: body.type,
        title: body.title,
        instruction,
        actionType: body.actionType,
        targetText: body.targetText,
        url: body.url,
        updatedAt: "2026-08-14T00:00:02.000Z"
      });
      return json(201, { stepId: firstStepId });
    }
    if (pathname === `/api/workspaces/${workspaceId}/manuals/${manualId}/steps/${firstStepId}` && method === "PATCH") {
      const body = request.postDataJSON();
      state.expectedUpdatedAtSeen = body.expectedUpdatedAt;
      if (state.failNextStepPatch) {
        const failure = state.failNextStepPatch;
        state.failNextStepPatch = null;
        if (failure.status === 403 || failure.code === "MANUALS_NOT_FOUND") {
          state.currentRole = "viewer";
          state.canEdit = false;
        }
        if (failure.code === "MANUAL_STEP_NOT_FOUND") state.steps = [];
        return json(failure.status, { code: failure.code, message: failure.message });
      }
      const { expectedUpdatedAt, ...stepPatch } = body;
      state.lastStepPatchBody = body;
      state.instructionSeenOnPatch = stepPatch.instruction;
      state.steps[0] = { ...state.steps[0], ...stepPatch, updatedAt: "2026-08-14T00:00:03.000Z" };
      return json(200, { stepId: firstStepId });
    }
    if (pathname === `/api/workspaces/${workspaceId}/manuals/${manualId}/steps/${firstStepId}` && method === "DELETE") {
      state.steps = [];
      return json(200, { stepId: firstStepId, deleted: true });
    }
    if (pathname === `/api/workspaces/${workspaceId}/manuals/${manualId}/steps/reorder` && method === "POST") {
      return json(200, { reordered: true });
    }
    return json(404, { code: "NOT_FOUND", message: "fixtureに未定義のAPIです。" });
  });

  return state;
}

async function openManualScreen(page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ワークスペース", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "手順書", exact: true }).click();
  await expect(page.getByRole("heading", { name: "手順書", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "手順書", exact: true })).toBeFocused();
}

test("手順書入力はUnicode code point単位の上限を守る", async ({ page }) => {
  const state = await installManualFixture(page, "editor", { empty: true });
  await openManualScreen(page);

  const title = "𠮷".repeat(64);
  const description = "先" + "𠮷".repeat(9998) + "末";
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
  }))).toEqual({ codePoints: 10000, codeUnits: 19998 });

  await createDescription.focus();
  await createDescription.evaluate((element) => element.setSelectionRange(1, 1));
  await page.keyboard.type("追");
  await expect(createDescription).toHaveValue(description);
  expect((await createDescription.inputValue()).endsWith("末")).toBe(true);

  await page.getByRole("button", { name: "手順書を作成" }).click();
  await expect(page.locator("#manual-detail-heading")).toHaveText(title);
  expect(Array.from(state.lastManualCreateBody.title)).toHaveLength(64);
  expect(Array.from(state.lastManualCreateBody.description)).toHaveLength(10000);

  const draftDescription = page.locator("#manual-draft-description");
  await draftDescription.fill(description);
  expect(await draftDescription.evaluate((element) => ({
    codePoints: Array.from(element.value).length,
    codeUnits: element.value.length
  }))).toEqual({ codePoints: 10000, codeUnits: 19998 });
  await page.getByRole("button", { name: "基本情報を保存" }).click();
  await expect(page.locator("#manual-detail-message")).toContainText("基本情報を保存しました。");
  expect(Array.from(state.lastDraftPatchBody.description)).toHaveLength(10000);
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

test("基本情報保存後に一覧を再取得して更新タイトルを表示する", async ({ page }) => {
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
  await expect(page.getByRole("button", { name: "基本情報を保存" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "手順を追加" })).toBeDisabled();
  state.releaseDraftPatch();
  await expect.poll(() => state.draftPatchResolved).toBe(true);
  await expect(page.locator("#manual-detail-heading")).toHaveText("別の保存手順");
  await expect(page.getByRole("button", { name: "基本情報を保存" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "手順を追加" })).toBeEnabled();
});

test("作成応答の前に画面を移動した場合は遅延成功で詳細を開かない", async ({ page }) => {
  const state = await installManualFixture(page, "editor", { empty: true, deferManualCreate: true });
  await openManualScreen(page);
  await page.locator("#manual-create-title").fill("遅延する作成");
  await page.getByRole("button", { name: "手順書を作成" }).click();
  await expect.poll(() => state.lastManualCreateBody?.title).toBe("遅延する作成");
  await page.getByRole("button", { name: "メンバー管理", exact: true }).click();
  const listGetsBeforeCompletion = state.manualListGetCount;
  state.releaseManualCreate();
  await expect.poll(() => state.manualCreateResolved).toBe(true);
  await expect(page.getByRole("heading", { name: "メンバー管理", exact: true })).toBeVisible();
  await expect(page.locator("#manual-detail-heading")).toHaveCount(0);
  await page.getByRole("button", { name: "手順書", exact: true }).click();
  await expect(page.getByRole("button", { name: /遅延する作成/ })).toBeVisible();
  expect(state.manualListGetCount).toBeGreaterThan(listGetsBeforeCompletion);
});

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


test("別workspaceへ切り替えた後の作成結果不明も元workspaceで警告と再取得を維持する", async ({ page }) => {
  const state = await installManualFixture(page, "editor", { empty: true, deferManualCreate: true, secondWorkspace: true });
  state.failNextManualCreate = {
    mode: "abort",
    commitBeforeFailure: true,
    status: 502,
    code: "NETWORK_ERROR",
    message: "通信結果を確認できません。"
  };
  await openManualScreen(page);
  await page.locator("#manual-create-title").fill("workspace越境中の結果不明");
  await page.getByRole("button", { name: "手順書を作成" }).click();
  await expect.poll(() => state.lastManualCreateBody?.title).toBe("workspace越境中の結果不明");
  await page.locator("#current-workspace").selectOption(secondWorkspaceId);
  state.releaseManualCreate();
  await expect.poll(() => state.manualCreateResolved).toBe(true);
  const listGetsBeforeReturn = state.manualListGetCount;
  await page.locator("#current-workspace").selectOption(workspaceId);
  await page.getByRole("button", { name: "手順書", exact: true }).click();
  await expect(page.locator("#manuals-message")).toContainText("作成結果を一覧で確認してください。重ねて作成しないでください。");
  await expect(page.getByRole("button", { name: /workspace越境中の結果不明/ })).toBeVisible();
  expect(state.manualListGetCount).toBeGreaterThan(listGetsBeforeReturn);
});


test("初回詳細読込中に所属を失ってもloadingのまま残さず安全な状態を表示する", async ({ page }) => {
  const state = await installManualFixture(page, "editor");
  await openManualScreen(page);
  state.failNextManualDetail = {
    status: 404,
    code: "MANUALS_NOT_FOUND",
    message: "所属を確認できません。"
  };
  await page.getByRole("button", { name: /既存の保存手順/ }).click();
  await expect(page.locator("#manual-detail-message")).toContainText("所属を確認できません。");
  await expect(page.locator("#manual-draft-form")).toHaveCount(0);
  await expect(page.locator(".manual-step-form")).toHaveCount(0);
  await expect(page.getByText("手順書を読み込んでいます")).toHaveCount(0);
  expect(state.currentRole).toBe("viewer");
  expect(state.canEdit).toBe(false);
});


test("編集者は手順書作成から手順追加・手修正文保持まで完了できる", async ({ page }) => {
  const state = await installManualFixture(page, "editor", { empty: true });
  await openManualScreen(page);

  await expect(page.getByText("手順書はまだありません。" )).toBeVisible();
  await page.locator("#manual-create-title").fill("入会受付手順");
  await page.locator("#manual-create-description").fill("受付担当者向け");
  await page.getByRole("button", { name: "手順書を作成" }).click();

  await expect(page.getByRole("heading", { name: "入会受付手順" })).toBeVisible();
  await page.locator("#new-step-title").fill("保存する");
  await page.locator("#new-step-target").fill("保存ボタン");
  await page.getByRole("button", { name: "手順を追加" }).click();
  const instruction = page.locator(`#step-instruction-${firstStepId}`);
  const target = page.locator(`#step-target-${firstStepId}`);
  await expect(instruction).toHaveValue("［保存ボタン］をクリックします。");

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
  await expect(page.locator(`#step-instruction-${firstStepId}`)).toHaveValue("利用者が手修正した文章です。");
  await expect(page.locator("#manual-draft-description")).toHaveValue("別フォームの未保存説明");
  expect(state.instructionSeenOnPatch).toBe("利用者が手修正した文章です。");
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

test("所属削除の404でも編集UIを閉じる", async ({ page }) => {
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
  await page.getByRole("button", { name: "手順書一覧へ戻る" }).click();
  await expect(page.locator("#manual-create-form")).toHaveCount(0);
});

test("閲覧者は手順書と手順を閲覧できるが編集フォームは表示されない", async ({ page }) => {
  await installManualFixture(page, "viewer", {
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
  await expect(page.getByText("［保存ボタン］をクリックします。" )).toBeVisible();
  await expect(page.locator("#manual-draft-form")).toHaveCount(0);
  await expect(page.locator("#manual-step-add-form")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "手順を保存" })).toHaveCount(0);
  await expect(page.getByText("現在の権限では閲覧のみ利用できます。" )).toBeVisible();
});

test("非action手順はaction専用項目を送信しない", async ({ page }) => {
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

test("手順書画面は狭い表示でも横スクロールせずキーボードで移動できる", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await installManualFixture(page, "editor");
  await openManualScreen(page);
  const heading = page.getByRole("heading", { name: "手順書", exact: true });
  await expect(heading).toBeFocused();
  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    navColumns: getComputedStyle(document.querySelector(".nav")).gridTemplateColumns
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
  expect(layout.navColumns.trim().split(/\s+/).length).toBeLessThanOrEqual(2);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "再読み込み" })).toBeFocused();
  await expect(page.locator("#manuals-message")).toHaveAttribute("aria-live", "polite");
  await page.getByRole("button", { name: "メンバー管理", exact: true }).click();
  await expect(page.getByRole("heading", { name: "メンバー管理", exact: true })).toBeFocused();
});
