from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one occurrence, found {count}")
    return text.replace(old, new, 1)


def replace_in_section(text: str, start_marker: str, end_marker: str, old: str, new: str, label: str) -> str:
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    section = text[start:end]
    updated = replace_once(section, old, new, label)
    return text[:start] + updated + text[end:]


# 1. Keep publication and draft metadata updates on the same manual -> revision lock order.
core_path = Path("supabase/migrations/202608020001_phase2_manual_core.sql")
core = core_path.read_text(encoding="utf-8")
core = replace_in_section(
    core,
    "create or replace function public.publish_manual(",
    "\n\ncreate or replace function public.create_manual_draft(",
    """  from public.manuals m
  where m.id = target_manual_id
    and m.archived_at is null;
""",
    """  from public.manuals m
  where m.id = target_manual_id
    and m.archived_at is null
  for update of m;
""",
    "publish_manual locks manual first",
)
core_path.write_text(core, encoding="utf-8")


# 2. Enforce the public HTTP step contract even for direct authenticated RPC calls.
step_path = Path("supabase/migrations/202608140010_phase2_manual_step_mutations.sql")
step_sql = step_path.read_text(encoding="utf-8")
validation = """  if step_asset_id is not null
    or coalesce(step_annotation, '{}'::jsonb) <> '{}'::jsonb
    or coalesce(step_masking, '{}'::jsonb) <> '{}'::jsonb
  then
    raise exception 'manual step internal fields are not accepted';
  end if;

  if step_type <> 'action'
    and (step_action_type is not null or step_target_text is not null)
  then
    raise exception 'non-action manual step cannot include action fields';
  end if;

  if step_url is not null
    and (
      char_length(step_url) > 2048
      or step_url !~* '^https?://[^/?#@]+([/?#]|$)'
      or step_url ~ '[[:space:][:cntrl:]]'
    )
  then
    raise exception 'manual step url is invalid';
  end if;

"""

append_start = step_sql.index("create or replace function public.append_manual_step(")
append_end = step_sql.index("\n\ncreate or replace function public.update_manual_step(", append_start)
append_section = step_sql[append_start:append_end]
append_anchor = """  if not public.has_workspace_role(
    target_workspace_id,
    actor_id,
    array['owner', 'admin', 'editor']::public.workspace_role[]
  ) then
    raise exception 'workspace editor role required';
  end if;

"""
append_section = replace_once(
    append_section,
    append_anchor,
    append_anchor + validation,
    "append_manual_step validates direct RPC input",
)
step_sql = step_sql[:append_start] + append_section + step_sql[append_end:]

update_start = step_sql.index("create or replace function public.update_manual_step(")
update_end = step_sql.index("\n\ncreate or replace function public.soft_delete_manual_step(", update_start)
update_section = step_sql[update_start:update_end]
update_section = replace_once(
    update_section,
    append_anchor,
    append_anchor + validation,
    "update_manual_step validates direct RPC input",
)
update_section = replace_once(
    update_section,
    """      url = step_url,
      asset_id = step_asset_id,
      annotation = coalesce(step_annotation, '{}'::jsonb),
      masking = coalesce(step_masking, '{}'::jsonb),
      updated_at = clock_timestamp()
""",
    """      url = step_url,
      updated_at = clock_timestamp()
""",
    "step updates preserve internal fields",
)
step_sql = step_sql[:update_start] + update_section + step_sql[update_end:]
step_path.write_text(step_sql, encoding="utf-8")


# 3. The Worker passes only the public/default internal values; the RPC preserves stored internals.
router_path = Path("apps/worker/src/manual-edit-router.ts")
router = router_path.read_text(encoding="utf-8")
router = replace_once(
    router,
    """      step_url: next.url,
      step_asset_id: next.assetId,
      step_annotation: next.annotation,
      step_masking: next.masking
""",
    """      step_url: next.url,
      step_asset_id: null,
      step_annotation: {},
      step_masking: {}
""",
    "Worker does not forward internal step fields",
)
router_path.write_text(router, encoding="utf-8")


# 4. Align Accepted documentation with the implemented 8 MiB response boundary.
setup_path = Path("docs/04-data/phase2-manual-core-setup.md")
setup = setup_path.read_text(encoding="utf-8")
setup = replace_once(
    setup,
    "- 詳細APIは200 active steps、6 MiBを上限とし、本文フィールド上限をDBとWorkerで一致させる。",
    "- 詳細APIは200 active steps、8 MiBを上限とし、本文フィールド上限をDBとWorkerで一致させる。",
    "Accepted setup uses 8 MiB",
)
setup_path.write_text(setup, encoding="utf-8")

contract_path = Path("docs/05-api/phase2-manual-edit-api.md")
contract = contract_path.read_text(encoding="utf-8")
contract = replace_once(
    contract,
    "- RPCは`authenticated`だけが実行でき、`public`と`anon`には公開しない。",
    "- RPCは`authenticated`だけが実行でき、`public`と`anon`には公開しない。\n- step追加・更新RPCもHTTP契約と同じ境界を強制し、`asset_id`、`annotation`、`masking`の外部入力、非action手順のaction項目、userinfo・空白・制御文字を含むURLを拒否する。step更新では既存の内部項目を保持する。",
    "document direct RPC boundary",
)
contract_path.write_text(contract, encoding="utf-8")


# 5. Expand disposable DB fixture just enough to exercise the real publish_manual function.
fixture_path = Path("tests/sql/phase2-manual-edit-http-fixture.sql")
fixture = fixture_path.read_text(encoding="utf-8")
fixture = replace_once(
    fixture,
    """  workspace_id uuid not null,
  title text not null,
  current_draft_revision_id uuid,
  archived_at timestamptz
""",
    """  workspace_id uuid not null,
  title text not null,
  status text not null default 'draft',
  current_draft_revision_id uuid,
  current_published_revision_id uuid,
  archived_at timestamptz
""",
    "fixture manual publication columns",
)
fixture = replace_once(
    fixture,
    """  description text not null default '',
  updated_at timestamptz not null default clock_timestamp()
""",
    """  description text not null default '',
  updated_at timestamptz not null default clock_timestamp(),
  published_at timestamptz
""",
    "fixture revision publication columns",
)
fixture = replace_once(
    fixture,
    """insert into public.manuals (id, workspace_id, title, current_draft_revision_id)
values
  ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '旧タイトル', '44444444-4444-4444-8444-444444444444'),
  ('55555555-5555-4555-8555-555555555555', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '公開済み手順', null),
  ('66666666-6666-4666-8666-666666666666', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '別領域', '77777777-7777-4777-8777-777777777777');
""",
    """insert into public.manuals (id, workspace_id, title, status, current_draft_revision_id, current_published_revision_id)
values
  ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '旧タイトル', 'draft', '44444444-4444-4444-8444-444444444444', null),
  ('55555555-5555-4555-8555-555555555555', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '公開済み手順', 'published', null, '88888888-8888-4888-8888-888888888888'),
  ('66666666-6666-4666-8666-666666666666', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '別領域', 'draft', '77777777-7777-4777-8777-777777777777', null);
""",
    "fixture publication values",
)
fixture_path.write_text(fixture, encoding="utf-8")


# 6. Add DB regression tests for direct RPC bypasses and internal-field preservation.
direct_tests = r'''

-- Authenticated callers must not bypass the Worker contract through SECURITY DEFINER RPCs.
do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.append_manual_step(
      '44444444-4444-4444-8444-444444444444',
      'action', '内部画像', '', 'click', '保存', null,
      '99999999-9999-4999-8999-999999999999', '{}'::jsonb, '{}'::jsonb
    );
  exception
    when others then
      if sqlerrm like '%manual step internal fields are not accepted%' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'direct RPC accepted asset_id'; end if;
end;
$$;

do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.append_manual_step(
      '44444444-4444-4444-8444-444444444444',
      'note', '不正action項目', '', 'click', '保存', null,
      null, '{}'::jsonb, '{}'::jsonb
    );
  exception
    when others then
      if sqlerrm like '%non-action manual step cannot include action fields%' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'direct RPC accepted action fields on a note'; end if;
end;
$$;

do $$
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

http_test_path = Path("tests/sql/phase2-manual-edit-http-test.sql")
http_test = http_test_path.read_text(encoding="utf-8")
http_test = replace_once(
    http_test,
    "\nreset role;\n\ndo $$\nbegin\n  if has_function_privilege('anon', 'public.update_manual_draft(uuid,uuid,timestamptz,text,text)', 'EXECUTE') then",
    direct_tests + "\nreset role;\n\ndo $$\nbegin\n  if has_function_privilege('anon', 'public.update_manual_draft(uuid,uuid,timestamptz,text,text)', 'EXECUTE') then",
    "HTTP DB direct RPC regression tests",
)
http_test_path.write_text(http_test, encoding="utf-8")

step_test_path = Path("tests/sql/phase2-manual-step-rpc-test.sql")
step_test = step_test_path.read_text(encoding="utf-8")
step_tests = r'''

set role authenticated;
select set_config('request.jwt.claim.sub', :'editor_id', false);
do $$
declare
  rejected boolean := false;
  protected_step_id uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  protected_updated_at timestamptz;
begin
  begin
    perform public.append_manual_step(
      '66666666-6666-4666-8666-666666666666',
      'action', '内部画像', '', 'click', '保存', null,
      '99999999-9999-4999-8999-999999999999', '{}'::jsonb, '{}'::jsonb
    );
  exception
    when others then
      if sqlerrm like '%manual step internal fields are not accepted%' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'direct RPC accepted asset_id'; end if;

  rejected := false;
  begin
    perform public.append_manual_step(
      '66666666-6666-4666-8666-666666666666',
      'action', 'userinfo URL', '', 'navigate', '画面', 'https://user@example.com/path',
      null, '{}'::jsonb, '{}'::jsonb
    );
  exception
    when others then
      if sqlerrm like '%manual step url is invalid%' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'direct RPC accepted URL userinfo'; end if;

  select updated_at into protected_updated_at from public.manual_steps where id = protected_step_id;
  perform public.update_manual_step(
    '99999999-9999-4999-8999-999999999999', protected_step_id, protected_updated_at,
    'action', 'Lock A updated', 'public fields only', 'click', '保存', null,
    null, '{}'::jsonb, '{}'::jsonb
  );
end;
$$;
reset role;

do $$
begin
  update public.manual_steps
  set asset_id = '99999999-9999-4999-8999-999999999999',
      annotation = '{"source":"capture"}'::jsonb,
      masking = '{"masked":true}'::jsonb
  where id = 'aaaaaaaa-0000-4000-8000-000000000001';
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', :'editor_id', false);
do $$
declare
  protected_updated_at timestamptz;
begin
  select updated_at into protected_updated_at
  from public.manual_steps
  where id = 'aaaaaaaa-0000-4000-8000-000000000001';

  perform public.update_manual_step(
    '99999999-9999-4999-8999-999999999999',
    'aaaaaaaa-0000-4000-8000-000000000001',
    protected_updated_at,
    'action', 'Lock A public edit', 'internal fields survive', 'click', '保存', null,
    null, '{}'::jsonb, '{}'::jsonb
  );
end;
$$;
reset role;

do $$
begin
  if not exists (
    select 1 from public.manual_steps
    where id = 'aaaaaaaa-0000-4000-8000-000000000001'
      and asset_id = '99999999-9999-4999-8999-999999999999'
      and annotation = '{"source":"capture"}'::jsonb
      and masking = '{"masked":true}'::jsonb
  ) then
    raise exception 'public step update erased internal fields';
  end if;
end;
$$;
'''
step_test = replace_once(
    step_test,
    "\nset role anon;\n",
    step_tests + "\nset role anon;\n",
    "manual step direct RPC and preservation tests",
)
step_test_path.write_text(step_test, encoding="utf-8")


# 7. Verify the Worker does not relay stored internal fields to public mutation RPCs.
worker_test_path = Path("tests/manual-edit-api.test.mjs")
worker_test = worker_test_path.read_text(encoding="utf-8")
worker_test = replace_once(
    worker_test,
    '''    assert.equal(rpcBody.step_instruction, "手修正済みです。");
    assert.equal(rpcBody.step_action_type, "select");
    assert.equal(rpcBody.step_target_text, "プラン選択");''',
    '''    assert.equal(rpcBody.step_instruction, "手修正済みです。");
    assert.equal(rpcBody.step_action_type, "select");
    assert.equal(rpcBody.step_target_text, "プラン選択");
    assert.equal(rpcBody.step_asset_id, null);
    assert.deepEqual(rpcBody.step_annotation, {});
    assert.deepEqual(rpcBody.step_masking, {});''',
    "Worker RPC internal fields default",
)
worker_test_path.write_text(worker_test, encoding="utf-8")


# 8. Strengthen static contracts so the boundary cannot regress silently.
step_check_path = Path("scripts/check-phase2-manual-step-migration.mjs")
step_check = step_check_path.read_text(encoding="utf-8")
step_check = replace_once(
    step_check,
    '''  "grant execute on function public.reorder_manual_steps(uuid, uuid[]) to authenticated"
];''',
    '''  "grant execute on function public.reorder_manual_steps(uuid, uuid[]) to authenticated",
  "manual step internal fields are not accepted",
  "non-action manual step cannot include action fields",
  "manual step url is invalid"
];''',
    "manual step hardening static requirements",
)
step_check = replace_once(
    step_check,
    '''for (const snippet of forbidden) {
  if (sql.toLowerCase().includes(snippet.toLowerCase())) {
    errors.push(`Forbidden manual-step migration contract: ${snippet}`);
  }
}
''',
    '''for (const snippet of forbidden) {
  if (sql.toLowerCase().includes(snippet.toLowerCase())) {
    errors.push(`Forbidden manual-step migration contract: ${snippet}`);
  }
}
const updateSection = sql.slice(
  sql.indexOf("create or replace function public.update_manual_step("),
  sql.indexOf("create or replace function public.soft_delete_manual_step(")
);
if (updateSection.includes("asset_id = step_asset_id") || updateSection.includes("annotation = coalesce(step_annotation")) {
  errors.push("update_manual_step must preserve internal fields instead of replacing them from public input");
}
''',
    "manual step preservation static check",
)
step_check_path.write_text(step_check, encoding="utf-8")

edit_check_path = Path("scripts/check-phase2-manual-edit-api.mjs")
edit_check = edit_check_path.read_text(encoding="utf-8")
edit_check = replace_once(
    edit_check,
    '''if (!setup.includes("202608140012_phase2_manual_edit_http_contract.sql")) {
  errors.push("Accepted Phase 2 rollout omits manual edit HTTP migration");
}
''',
    '''if (!setup.includes("202608140012_phase2_manual_edit_http_contract.sql")) {
  errors.push("Accepted Phase 2 rollout omits manual edit HTTP migration");
}
if (!setup.includes("200 active steps、8 MiB")) {
  errors.push("Accepted Phase 2 setup does not match the 8 MiB manual detail boundary");
}
''',
    "Accepted setup 8 MiB static check",
)
edit_check_path.write_text(edit_check, encoding="utf-8")


# 9. Add a real concurrent PostgreSQL test using the exact publish_manual function from the core migration.
publication_lock_script = r'''#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=postgres}"

EDITOR_ID="11111111-1111-4111-8111-111111111111"
MANUAL_ID="33333333-3333-4333-8333-333333333333"
DRAFT_ID="44444444-4444-4444-8444-444444444444"
psql_base=(psql -X -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE")

publish_sql="$(mktemp)"
update_log="$(mktemp)"
publish_log="$(mktemp)"
cleanup() { rm -f "$publish_sql" "$update_log" "$publish_log"; }
trap cleanup EXIT

python - <<'PY' > "$publish_sql"
from pathlib import Path
text = Path("supabase/migrations/202608020001_phase2_manual_core.sql").read_text(encoding="utf-8")
start = text.index("create or replace function public.publish_manual(")
end = text.index("\n\ncreate or replace function public.create_manual_draft(", start)
print(text[start:end])
PY
"${psql_base[@]}" -f "$publish_sql" >/dev/null

expected_updated_at="$("${psql_base[@]}" -At -c "select updated_at from public.manual_revisions where id = '${DRAFT_ID}'::uuid")"

"${psql_base[@]}" -c "begin; select id from public.manuals where id = '${MANUAL_ID}'::uuid for update; select pg_sleep(1.0); commit;" >/dev/null &
locker_pid=$!
sleep 0.2

set +e
PGOPTIONS='-c statement_timeout=8000' "${psql_base[@]}" -c "set role authenticated; select set_config('request.jwt.claim.sub', '${EDITOR_ID}', false); select public.update_manual_draft('${MANUAL_ID}'::uuid, '${DRAFT_ID}'::uuid, '${expected_updated_at}'::timestamptz, 'Concurrent title', 'Concurrent description');" >"$update_log" 2>&1 &
update_pid=$!
PGOPTIONS='-c statement_timeout=8000' "${psql_base[@]}" -c "set role authenticated; select set_config('request.jwt.claim.sub', '${EDITOR_ID}', false); select public.publish_manual('${MANUAL_ID}'::uuid);" >"$publish_log" 2>&1 &
publish_pid=$!
wait "$locker_pid"
wait "$update_pid"; update_status=$?
wait "$publish_pid"; publish_status=$?
set -e

if grep -Eqi 'deadlock detected|statement timeout|canceling statement' "$update_log" "$publish_log"; then
  echo "draft save/publication lock ordering produced a deadlock or timeout" >&2
  cat "$update_log" >&2
  cat "$publish_log" >&2
  exit 1
fi
if [[ "$publish_status" -ne 0 ]]; then
  echo "publication must complete regardless of which operation acquires the manual lock first" >&2
  cat "$update_log" >&2
  cat "$publish_log" >&2
  exit 1
fi
if [[ "$update_status" -ne 0 ]] && ! grep -Eqi 'draft revision not found|current draft revision changed' "$update_log"; then
  echo "draft update failed for an unexpected reason" >&2
  cat "$update_log" >&2
  exit 1
fi

final_state="$("${psql_base[@]}" -At -F '|' -c "select status, coalesce(current_draft_revision_id::text, ''), current_published_revision_id::text from public.manuals where id = '${MANUAL_ID}'::uuid")"
if [[ "$final_state" != "published||${DRAFT_ID}" ]]; then
  echo "publication did not leave a consistent manual state: $final_state" >&2
  exit 1
fi

echo "publish_manual and update_manual_draft share a deadlock-free manual-first lock order: OK"
'''
publication_lock_path = Path("scripts/test-phase2-manual-publication-locks.sh")
publication_lock_path.write_text(publication_lock_script, encoding="utf-8")
publication_lock_path.chmod(0o755)


# 10. Make permanent CI exercise the new DB and documentation boundaries.
workflow_path = Path(".github/workflows/manual-edit-api.yml")
workflow = workflow_path.read_text(encoding="utf-8")
workflow = replace_once(
    workflow,
    '''      - "apps/worker/src/manual-edit-router.ts"
      - "apps/worker/src/domain/manual/instruction-template.ts"''',
    '''      - "apps/worker/src/manual-edit-router.ts"
      - "apps/worker/src/domain/manual/instruction-template.ts"
      - "supabase/migrations/202608020001_phase2_manual_core.sql"''',
    "manual edit workflow watches publication function",
)
workflow = replace_once(
    workflow,
    '''      - "scripts/test-phase2-manual-draft-locks.sh"
      - "supabase/migrations/202608140005_phase2_manual_title_length.sql"''',
    '''      - "scripts/test-phase2-manual-draft-locks.sh"
      - "scripts/test-phase2-manual-publication-locks.sh"
      - "supabase/migrations/202608140005_phase2_manual_title_length.sql"''',
    "manual edit workflow watches publication lock test",
)
workflow = replace_once(
    workflow,
    '''      - name: Exercise draft metadata lock and optimistic conflict
        run: bash scripts/test-phase2-manual-draft-locks.sh
      - name: Validate migration safety and ordering''',
    '''      - name: Exercise draft metadata lock and optimistic conflict
        run: bash scripts/test-phase2-manual-draft-locks.sh
      - name: Exercise publication and draft metadata lock order
        run: bash scripts/test-phase2-manual-publication-locks.sh
      - name: Validate migration safety and ordering''',
    "manual edit workflow runs publication lock test",
)
workflow_path.write_text(workflow, encoding="utf-8")

print("Phase 2 final hardening patches applied.")
