import { expect, test } from "@playwright/test";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const targetUserId = "22222222-2222-4222-8222-222222222222";
const roles = {
  owner: { label: "管理責任者", canManage: true, userId: "00000000-0000-4000-8000-000000000001" },
  admin: { label: "管理者", canManage: true, userId: "00000000-0000-4000-8000-000000000002" },
  editor: { label: "編集者", canManage: false, userId: "00000000-0000-4000-8000-000000000003" },
  viewer: { label: "閲覧者", canManage: false, userId: "00000000-0000-4000-8000-000000000004" }
};

function sessionFor(role) {
  const roleConfig = roles[role];
  return {
    user: { id: roleConfig.userId, email: `${role}@example.invalid` },
    profile: { id: roleConfig.userId, display_name: `${roleConfig.label}ユーザー`, locale: "ja-JP", timezone: "Asia/Tokyo" },
    workspaces: [{
      id: workspaceId,
      name: "品質確認ワークスペース",
      slug: "phase1-quality",
      status: "active",
      created_at: "2026-08-12T00:00:00.000Z"
    }]
  };
}

async function installApiFixture(page, role, initiallyAuthenticated = false) {
  let authenticated = initiallyAuthenticated;
  const session = sessionFor(role);

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (pathname === "/api/auth/login" && request.method() === "POST") {
      authenticated = true;
      return json(200, { user: session.user });
    }
    if (pathname === "/api/auth/logout" && request.method() === "POST") {
      authenticated = false;
      return json(200, { status: "ok" });
    }
    if (pathname === "/api/session" && request.method() === "GET") {
      return authenticated
        ? json(200, session)
        : json(401, { code: "SESSION_REQUIRED", message: "ログインしてください。" });
    }
    if (pathname === `/api/workspaces/${workspaceId}/members` && request.method() === "GET") {
      return json(200, {
        workspaceId,
        currentUserRole: role,
        members: [
          {
            userId: session.user.id,
            displayName: `${roles[role].label}ユーザー`,
            role,
            status: "active",
            joinedAt: "2026-08-12T00:00:00.000Z"
          },
          {
            userId: targetUserId,
            displayName: "テストメンバー",
            role: "editor",
            status: "active",
            joinedAt: "2026-08-12T00:00:00.000Z"
          }
        ]
      });
    }
    return json(404, { code: "NOT_FOUND", message: "テストfixtureに未定義のAPIです。" });
  });
}

async function loginAndLoadMembers(page, role) {
  await installApiFixture(page, role);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
  await page.getByLabel("メールアドレス").fill(`${role}@example.invalid`);
  await page.getByLabel("パスワード").fill("not-a-real-password");
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page.getByRole("heading", { name: "ワークスペース", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "メンバー一覧を表示" }).click();
  await expect(page.getByRole("region", { name: "ワークスペースメンバー一覧" })).toBeVisible();
}

for (const [role, config] of Object.entries(roles)) {
  test(`${config.label}はログインから権限別メンバー画面、ログアウトまで完了できる`, async ({ page }) => {
    await loginAndLoadMembers(page, role);

    await expect(page.getByLabel("現在の利用状況")).toContainText(`現在の権限：${config.label}`);
    const addForm = page.locator("#member-add-form");
    const targetRoleSave = page.locator(`#member-save-${targetUserId}`);
    const targetStop = page.locator(`#member-stop-${targetUserId}`);
    if (config.canManage) {
      await expect(addForm).toBeVisible();
      await expect(targetRoleSave).toBeVisible();
      await expect(targetRoleSave).toHaveAccessibleName(/テストメンバー.*権限を保存/);
      await expect(targetStop).toBeVisible();
      await expect(targetStop).toHaveAccessibleName(/テストメンバー.*利用を停止/);
    } else {
      await expect(addForm).toHaveCount(0);
      await expect(targetRoleSave).toHaveCount(0);
      await expect(targetStop).toHaveCount(0);
      await expect(page.getByText(`現在の権限は「${config.label}」です。`)).toBeVisible();
    }

    await page.getByRole("button", { name: "ログアウト" }).click();
    await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
    await expect(page.getByText(`ログイン中：${role}@example.invalid`)).toHaveCount(0);
  });
}

test("キーボードの本文スキップ、可視フォーカス、200%相当の再配置を実ブラウザで確認する", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await installApiFixture(page, "owner", true);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ワークスペース", exact: true })).toBeVisible();

  const skipLink = page.getByRole("link", { name: "本文へ移動" });
  await page.keyboard.press("Tab");
  if (!(await skipLink.evaluate((element) => element === document.activeElement))) {
    const focusIsDocumentEntry = await page.evaluate(() =>
      document.activeElement === document.body || document.activeElement === document.documentElement
    );
    expect(focusIsDocumentEntry, "本文スキップより前に別のページ内要素へフォーカスしました").toBe(true);
    await page.keyboard.press("Tab");
  }
  await expect(skipLink).toBeFocused();
  await skipLink.press("Enter");
  await expect(page.locator("#screen-content")).toBeFocused();

  const reloadButton = page.locator("#reload-button");
  await page.keyboard.press("Tab");
  await expect(reloadButton).toBeFocused();
  const focusStyle = await reloadButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, boxShadow: style.boxShadow };
  });
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(focusStyle.boxShadow).not.toBe("none");
  await page.keyboard.press("Tab");
  await expect(page.locator("#current-workspace")).toBeFocused();

  await page.getByRole("button", { name: "メンバー一覧を表示" }).click();
  await expect(page.getByRole("region", { name: "ワークスペースメンバー一覧" })).toBeVisible();

  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    navColumns: getComputedStyle(document.querySelector(".nav")).gridTemplateColumns
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
  expect(layout.navColumns.trim().split(/\s+/).length).toBeLessThanOrEqual(2);
  expect((await reloadButton.boundingBox())?.height || 0).toBeGreaterThanOrEqual(44);

  await expect(page.locator("#members-message")).toHaveAttribute("aria-live", "polite");
  const targetRoleSave = page.locator(`#member-save-${targetUserId}`);
  await expect(targetRoleSave).toBeVisible();
  await expect(targetRoleSave).toHaveAccessibleName(/テストメンバー.*権限を保存/);
});
