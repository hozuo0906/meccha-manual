from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one occurrence, found {count}")
    return text.replace(old, new, 1)


# --- UI: retain ambiguous create state per workspace and render initial revocation safely.
app_path = Path("apps/worker/src/app-assets.ts")
app = app_path.read_text(encoding="utf-8")

app = replace_once(
    app,
    'let manualsState = { workspaceId: "", status: "idle", items: [], message: "", messageKind: "notice" };\nlet manualDetailState =',
    'let manualsState = { workspaceId: "", status: "idle", items: [], message: "", messageKind: "notice" };\nconst manualCreateReconciliationByWorkspace = new Map();\nlet manualDetailState =',
    "declare per-workspace manual create reconciliation map",
)

app = replace_once(
    app,
    '  manualsState = { workspaceId: "", status: "idle", items: [], message: "", messageKind: "notice" };\n  manualDetailState =',
    '  manualsState = { workspaceId: "", status: "idle", items: [], message: "", messageKind: "notice" };\n  manualCreateReconciliationByWorkspace.clear();\n  manualDetailState =',
    "clear reconciliation state on auth-subject reset",
)

app = replace_once(
    app,
    '  manualsState = { workspaceId: selected.id, status: "idle", items: [], message: "", messageKind: "notice" };\n  manualDetailState =',
    '  const pendingManualCreate = manualCreateReconciliationByWorkspace.get(selected.id);\n  manualsState = {\n    workspaceId: selected.id,\n    status: "idle",\n    items: [],\n    message: pendingManualCreate?.message || "",\n    messageKind: pendingManualCreate?.messageKind || "notice"\n  };\n  manualDetailState =',
    "restore reconciliation warning on workspace switch",
)

app = replace_once(
    app,
    '  const sequence = ++manualRequestSequence;\n  const carriedMessage = options.message ?? (\n    manualsState.workspaceId === workspaceId && manualsState.status === "idle"\n      ? manualsState.message\n      : ""\n  );\n  const carriedMessageKind = options.messageKind ?? (\n    manualsState.workspaceId === workspaceId && manualsState.status === "idle"\n      ? manualsState.messageKind\n      : "notice"\n  );',
    '  const sequence = ++manualRequestSequence;\n  const pendingManualCreate = manualCreateReconciliationByWorkspace.get(workspaceId);\n  const carriedMessage = options.message ?? pendingManualCreate?.message ?? (\n    manualsState.workspaceId === workspaceId && manualsState.status === "idle"\n      ? manualsState.message\n      : ""\n  );\n  const carriedMessageKind = options.messageKind ?? pendingManualCreate?.messageKind ?? (\n    manualsState.workspaceId === workspaceId && manualsState.status === "idle"\n      ? manualsState.messageKind\n      : "notice"\n  );',
    "carry reconciliation warning into list reload",
)

app = replace_once(
    app,
    '    manualsState = { workspaceId, status: "loaded", items: payload.manuals, message: carriedMessage, messageKind: carriedMessageKind };\n    renderShell(currentSession, "", "notice", options.focusId || null);',
    '    manualsState = { workspaceId, status: "loaded", items: payload.manuals, message: carriedMessage, messageKind: carriedMessageKind };\n    if (pendingManualCreate) manualCreateReconciliationByWorkspace.delete(workspaceId);\n    renderShell(currentSession, "", "notice", options.focusId || null);',
    "clear reconciliation memory after a successful confirming list load",
)

old_revocation = '''    if (isManualPermissionRevocation(error)) {
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
    }'''
new_revocation = '''    if (isManualPermissionRevocation(error)) {
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
      const currentDetail =
        currentScreen === "manual-detail" &&
        currentWorkspaceSelection?.workspaceId === workspaceId &&
        manualDetailState.workspaceId === workspaceId &&
        manualDetailState.manualId === manualId;
      if (currentDetail) {
        if (manualDetailState.value) {
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
        } else {
          manualDetailState = {
            workspaceId,
            manualId,
            status: "error",
            value: null,
            message: error.message,
            messageKind: "error"
          };
        }
        renderShell(currentSession, "", "notice", "manual-detail-message");
        await loadWorkspaceMembers(workspaceId, {
          message: error.message,
          messageKind: "error",
          focusId: "manual-detail-message",
          alreadyRendered: true
        });
      }
      return;
    }'''
app = replace_once(app, old_revocation, new_revocation, "render initial detail revocation")

app = replace_once(
    app,
    '    if (manualsState.workspaceId === workspaceId) {\n      manualsState = { ...manualsState, workspaceId, status: "idle", message: "", messageKind: "notice" };\n    }',
    '    manualCreateReconciliationByWorkspace.delete(workspaceId);\n    if (manualsState.workspaceId === workspaceId) {\n      manualsState = { ...manualsState, workspaceId, status: "idle", message: "", messageKind: "notice" };\n    }',
    "clear old reconciliation after determinate create success",
)

app = replace_once(
    app,
    '''    const resultUnknown = manualMutationUnknown(error);
    if (resultUnknown && manualsState.workspaceId === workspaceId) {
      manualsState = {
        ...manualsState,
        status: "idle",
        message: "作成結果を一覧で確認してください。重ねて作成しないでください。",
        messageKind: "warning"
      };
    }''',
    '''    const resultUnknown = manualMutationUnknown(error);
    if (resultUnknown) {
      const warning = {
        message: "作成結果を一覧で確認してください。重ねて作成しないでください。",
        messageKind: "warning"
      };
      manualCreateReconciliationByWorkspace.set(workspaceId, warning);
      if (manualsState.workspaceId === workspaceId) {
        manualsState = { ...manualsState, status: "idle", ...warning };
      }
    }''',
    "persist ambiguous create independently of current workspace",
)

app_path.write_text(app, encoding="utf-8")


# --- DB: canonical Worker URLs are ASCII in the authority; direct RPCs must obey the same authority boundary.
step_path = Path("supabase/migrations/202608140010_phase2_manual_step_mutations.sql")
step_sql = step_path.read_text(encoding="utf-8")
helper = r'''create or replace function public.manual_step_url_is_valid(candidate text)
returns boolean
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  authority text;
  host text;
  port_text text;
  label text;
begin
  if char_length(candidate) > 2048
    or candidate !~* '^https?://'
    or candidate ~ '[[:space:][:cntrl:]]'
  then
    return false;
  end if;

  authority := substring(candidate from '^https?://([^/?#]+)');
  if authority is null or authority = '' or authority like '%@%' or authority like '%\%%' then
    return false;
  end if;

  if authority like '[%' then
    if authority !~ '^\[[0-9A-Fa-f:.]+\](?::[0-9]{1,5})?$' then
      return false;
    end if;
    host := substring(authority from '^\[([^]]+)\]');
    begin
      if family(host::inet) <> 6 then return false; end if;
    exception when others then
      return false;
    end;
  else
    if authority !~ '^[A-Za-z0-9.-]+(?::[0-9]{1,5})?$' then
      return false;
    end if;
    host := split_part(authority, ':', 1);
    if host = '' or host like '.%' or host like '%.' or host like '%..%' then
      return false;
    end if;
    foreach label in array string_to_array(host, '.') loop
      if char_length(label) > 63 or label !~ '^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$' then
        return false;
      end if;
    end loop;
  end if;

  port_text := substring(authority from ':([0-9]+)$');
  if port_text is not null and port_text::integer > 65535 then
    return false;
  end if;

  return true;
exception when others then
  return false;
end;
$$;

revoke all on function public.manual_step_url_is_valid(text) from public, anon, authenticated;

'''
step_sql = replace_once(
    step_sql,
    '-- This migration is repository-only until an approved environment migration is executed.\n\ncreate or replace function public.append_manual_step(',
    '-- This migration is repository-only until an approved environment migration is executed.\n\n' + helper + 'create or replace function public.append_manual_step(',
    "add canonical direct-RPC URL validator",
)
old_url_check = '''  if step_url is not null
    and (
      char_length(step_url) > 2048
      or step_url !~* '^https?://[^/?#@]+([/?#]|$)'
      or step_url ~ '[[:space:][:cntrl:]]'
    )
  then
    raise exception 'manual step url is invalid';
  end if;'''
new_url_check = '''  if step_url is not null and not public.manual_step_url_is_valid(step_url) then
    raise exception 'manual step url is invalid';
  end if;'''
if step_sql.count(old_url_check) != 2:
    raise SystemExit(f"URL validation blocks: expected 2, found {step_sql.count(old_url_check)}")
step_sql = step_sql.replace(old_url_check, new_url_check)
step_path.write_text(step_sql, encoding="utf-8")


# --- SQL regression: malformed authorities cannot bypass direct RPC validation.
sql_test_path = Path("tests/sql/phase2-manual-edit-http-test.sql")
sql_test = sql_test_path.read_text(encoding="utf-8")
anchor = r'''do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.append_manual_step(
      '44444444-4444-4444-8444-444444444444',
      'action', 'userinfo URL', '', 'navigate', '画面', 'https://user@example.com/path',
      null, '{}'::jsonb, '{}'::jsonb
    );
  exception
    when others then
      if sqlerrm like '%manual step url is invalid%' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'direct RPC accepted URL userinfo'; end if;
end;
$$;
'''
malformed = anchor + r'''

do $$
declare
  candidate text;
  rejected boolean;
begin
  foreach candidate in array array['https://%', 'https://[invalid', 'https://example.com:abc'] loop
    rejected := false;
    begin
      perform public.append_manual_step(
        '44444444-4444-4444-8444-444444444444',
        'action', 'malformed URL', '', 'navigate', '画面', candidate,
        null, '{}'::jsonb, '{}'::jsonb
      );
    exception
      when others then
        if sqlerrm like '%manual step url is invalid%' then rejected := true; else raise; end if;
    end;
    if not rejected then raise exception 'direct RPC accepted malformed URL: %', candidate; end if;
  end loop;
end;
$$;
'''
sql_test = replace_once(sql_test, anchor, malformed, "add malformed direct-RPC URL tests")
sql_test_path.write_text(sql_test, encoding="utf-8")


# --- Playwright fixture: add a second workspace and the two missing race regressions.
e2e_path = Path("tests/e2e/phase2-manual-editor.spec.mjs")
e2e = e2e_path.read_text(encoding="utf-8")
e2e = replace_once(
    e2e,
    'const workspaceId = "11111111-1111-4111-8111-111111111111";\nconst userId =',
    'const workspaceId = "11111111-1111-4111-8111-111111111111";\nconst secondWorkspaceId = "88888888-8888-4888-8888-888888888888";\nconst userId =',
    "declare second workspace fixture ID",
)
e2e = replace_once(
    e2e,
    '''function sessionFor(role) {
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
}''',
    '''function sessionFor(role, options = {}) {
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
}''',
    "extend session fixture with second workspace",
)
e2e = replace_once(e2e, '  const session = sessionFor(role);', '  const session = sessionFor(role, options);', "pass fixture options to session")
e2e = replace_once(
    e2e,
    '''    if (pathname === `/api/workspaces/${workspaceId}/members` && method === "GET") {
      return json(200, {
        workspaceId,
        currentUserRole: state.currentRole,
        members: [{ userId, displayName: `${state.currentRole}ユーザー`, role: state.currentRole, status: "active", joinedAt: "2026-08-14T00:00:00.000Z" }]
      });
    }
    if (pathname === `/api/workspaces/${workspaceId}/manuals` && method === "GET") {
      state.manualListGetCount += 1;
      return json(200, { manuals: state.manuals });
    }''',
    '''    if ((pathname === `/api/workspaces/${workspaceId}/members` || pathname === `/api/workspaces/${secondWorkspaceId}/members`) && method === "GET") {
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
    }''',
    "support second workspace API fixture",
)

insert_before = 'test("編集者は手順書作成から手順追加・手修正文保持まで完了できる", async ({ page }) => {'
new_tests = r'''test("別workspaceへ切り替えた後の作成結果不明も元workspaceで警告と再取得を維持する", async ({ page }) => {
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


'''
e2e = replace_once(e2e, insert_before, new_tests + insert_before, "add workspace-switch and initial-revocation E2E")
e2e_path.write_text(e2e, encoding="utf-8")


# --- Static contracts keep these race tests from disappearing.
check_path = Path("scripts/check-phase2-manual-editor-ui.mjs")
check = check_path.read_text(encoding="utf-8")
check = replace_once(
    check,
    'if (!e2e.includes("作成応答の前に画面を移動した場合は遅延成功で詳細を開かない")) errors.push("Missing delayed-create navigation browser flow");',
    'if (!e2e.includes("作成応答の前に画面を移動した場合は遅延成功で詳細を開かない")) errors.push("Missing delayed-create navigation browser flow");\nif (!e2e.includes("別workspaceへ切り替えた後の作成結果不明も元workspaceで警告と再取得を維持する")) errors.push("Missing cross-workspace ambiguous-create reconciliation browser flow");\nif (!e2e.includes("初回詳細読込中に所属を失ってもloadingのまま残さず安全な状態を表示する")) errors.push("Missing initial detail revocation browser flow");',
    "require new browser race regressions",
)
check_path.write_text(check, encoding="utf-8")

print("Applied the final three PR #78 review fixes.")
