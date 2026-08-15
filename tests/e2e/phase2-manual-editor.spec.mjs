import { expect, test } from "@playwright/test";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const manualId = "33333333-3333-4333-8333-333333333333";
const draftId = "44444444-4444-4444-8444-444444444444";
const firstStepId = "55555555-5555-4555-8555-555555555555";

function sessionFor(role) {
  return {
    user: { id: userId, email: `${role}@example.invalid` },
    profile: { id: userId, display_name: `${role}ユーザー`, locale: "ja-JP", timezone: "Asia/Tokyo" },
    workspaces: [{
      id: workspaceId,
      name: "手順書テスト",
      slug: "manual-editor-test",
      status: "active",
      created_at: "2026-08-14T00:00:00.000Z"
    }]
  };
}

async function installManualFixture(page, role, options = {}) {
  const state = {
    manuals: options.empty ? [] : [{
      id: manualId,
      folderId: null,
      title: "既存の保存手順",
      status: "draft",
      currentDraftRevisionId: draftId,
      currentPublishedRevisionId: null,
      updatedAt: "2026-08-14T00:00:00.000Z"
    }],
    steps: options.steps ? [...options.steps] : [],
    instructionSeenOnPatch: null,
    expectedUpdatedAtSeen: null,
    failNextManualCreate: null,
    failNextStepPatch: null,
    currentRole: role,
    canEdit: role !== "viewer"
  };
  const session = sessionFor(role);

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const method = request.method();
    const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (pathname === "/api/session" && method === "GET") return json(200, session);
    if (pathname === "/api/auth/logout" && method === "POST") return json(200, { status: "ok" });
    if (pathname === `/api/workspaces/${workspaceId}/members` && method === "GET") {
      return json(200, {
        workspaceId,
        currentUserRole: state.currentRole,
        members: [{ userId, displayName: `${state.currentRole}ユーザー`, role: state.currentRole, status: "active", joinedAt: "2026-08-14T00:00:00.000Z" }]
      });
    }
    if (pathname === `/api/workspaces/${workspaceId}/manuals` && method === "GET") {
      return json(200, { manuals: state.manuals });
    }
    if (pathname === `/api/workspaces/${workspaceId}/manuals` && method === "POST") {
      if (state.failNextManualCreate) {
        const failure = state.failNextManualCreate;
        state.failNextManualCreate = null;
        if (failure.status === 403 || failure.status === 404) {
          state.currentRole = "viewer";
          state.canEdit = false;
        }
        return json(failure.status, { code: failure.code, message: failure.message });
      }
      const body = request.postDataJSON();
      state.manuals = [{
        id: manualId,
        folderId: null,
        title: body.title,
        status: "draft",
        currentDraftRevisionId: draftId,
        currentPublishedRevisionId: null,
        updatedAt: "2026-08-14T00:00:01.000Z"
      }];
      return json(201, { manualId });
    }
    if (pathname === `/api/workspaces/${workspaceId}/manuals/${manualId}` && method === "GET") {
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
          updatedAt: "2026-08-14T00:00:01.000Z"
        },
        steps: state.steps,
        permissions: { canEdit: state.canEdit }
      });
    }
    if (pathname === `/api/workspaces/${workspaceId}/manuals/${manualId}/draft` && method === "PATCH") {
      const body = request.postDataJSON();
      state.manuals[0].title = body.title;
      return json(200, { draftId });
    }
    if (pathname === `/api/workspaces/${workspaceId}/manuals/${manualId}/steps` && method === "POST") {
      const body = request.postDataJSON();
      const instruction = body.instruction || `［${body.targetText}］をクリックします。`;
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
        if (failure.status === 403 || failure.status === 404) {
          state.currentRole = "viewer";
          state.canEdit = false;
        }
        return json(failure.status, { code: failure.code, message: failure.message });
      }
      const { expectedUpdatedAt, ...stepPatch } = body;
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
