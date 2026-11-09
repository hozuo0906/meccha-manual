\set ON_ERROR_STOP on

-- Runs after the restore regression against the same disposable Postgres fixture.
-- Synthetic fixtures belong to this test only; leave earlier tests untouched.
reset role;
begin;
insert into public.manuals (id, workspace_id, title, status, archived_at)
values
  ('d1170001-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '専用取得テスト', 'archived', '2026-11-09T00:00:00Z'),
  ('d1170002-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '日時なし', 'archived', null),
  ('d1170003-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '状態不一致', 'draft', '2026-11-09T00:00:00Z'),
  ('d1170004-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '通常手順書', 'draft', null),
  ('d1170005-0000-4000-8000-000000000005', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '別領域の専用取得テスト', 'archived', '2026-11-09T00:00:00Z');

insert into public.manual_revisions (id, workspace_id, manual_id, revision_no, state, title, created_by)
values
  ('d1171001-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd1170001-0000-4000-8000-000000000001', 3, 'draft', '現在の下書き', '11111111-1111-4111-8111-111111111111'),
  ('d1171002-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd1170001-0000-4000-8000-000000000001', 2, 'published', '現在の公開版', '11111111-1111-4111-8111-111111111111'),
  ('d1171003-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd1170001-0000-4000-8000-000000000001', 1, 'superseded', '過去版', '11111111-1111-4111-8111-111111111111'),
  ('d1171005-0000-4000-8000-000000000005', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'd1170005-0000-4000-8000-000000000005', 1, 'draft', '別領域の下書き', '11111111-1111-4111-8111-111111111111');

select set_config('app.manual_publish_context', 'on', true);
update public.manuals set current_draft_revision_id = 'd1171001-0000-4000-8000-000000000001',
  current_published_revision_id = 'd1171002-0000-4000-8000-000000000002'
where id = 'd1170001-0000-4000-8000-000000000001';
update public.manuals set current_draft_revision_id = 'd1171005-0000-4000-8000-000000000005'
where id = 'd1170005-0000-4000-8000-000000000005';
select set_config('app.manual_publish_context', '', true);

insert into public.manual_steps (id, workspace_id, revision_id, position, type, title, created_by, deleted_at)
values
  ('d1172001-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd1171001-0000-4000-8000-000000000001', 2, 'note', '下書きの後半', '11111111-1111-4111-8111-111111111111', null),
  ('d1172002-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd1171001-0000-4000-8000-000000000001', 0, 'note', '下書きの先頭', '11111111-1111-4111-8111-111111111111', null),
  ('d1172003-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd1171001-0000-4000-8000-000000000001', 1, 'note', '削除済み', '11111111-1111-4111-8111-111111111111', '2026-11-09T00:00:00Z'),
  ('d1172004-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd1171002-0000-4000-8000-000000000002', 0, 'note', '公開版の手順', '11111111-1111-4111-8111-111111111111', null),
  ('d1172005-0000-4000-8000-000000000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd1171003-0000-4000-8000-000000000003', 0, 'note', '過去版の手順', '11111111-1111-4111-8111-111111111111', null),
  ('d1172006-0000-4000-8000-000000000006', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'd1171005-0000-4000-8000-000000000005', 0, 'note', '別領域の手順', '11111111-1111-4111-8111-111111111111', null);

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
do $$
declare detail jsonb;
begin
  if not exists (select 1 from public.list_archived_manuals('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    where id = 'd1170001-0000-4000-8000-000000000001')
    or exists (select 1 from public.list_archived_manuals('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
      where id in (
        'd1170002-0000-4000-8000-000000000002',
        'd1170003-0000-4000-8000-000000000003',
        'd1170004-0000-4000-8000-000000000004',
        'd1170005-0000-4000-8000-000000000005'
      ) or workspace_id is distinct from 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
        or status is distinct from 'archived' or archived_at is null) then
    raise exception 'editor archived list included another workspace, invalid state, or omitted own manual';
  end if;
  detail := public.get_archived_manual_detail('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd1170001-0000-4000-8000-000000000001');
  if detail->'can_edit' is distinct from 'true'::jsonb
    or detail#>>'{manual,id}' is distinct from 'd1170001-0000-4000-8000-000000000001'
    or detail#>>'{draft,id}' is distinct from 'd1171001-0000-4000-8000-000000000001'
    or detail#>>'{draft,state}' is distinct from 'draft'
    or detail#>>'{draft,title}' is distinct from '現在の下書き'
    or (select jsonb_agg(step->>'id' order by ordinal) from jsonb_array_elements(detail->'steps') with ordinality as s(step, ordinal))
      is distinct from '["d1172002-0000-4000-8000-000000000002","d1172001-0000-4000-8000-000000000001"]'::jsonb then
    raise exception 'editor detail lost permission, current draft precedence, step order, or deleted-step filtering';
  end if;
  -- B really has a readable archived manual for its editor, so the later
  -- cross-workspace negative cannot pass merely because its target is absent.
  if (select count(*) from public.list_archived_manuals('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')) <> 1
    or public.get_archived_manual_detail('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'd1170005-0000-4000-8000-000000000005') is null then
    raise exception 'workspace B positive control missing';
  end if;
end;
$$;

-- Both inconsistent archive states and an ordinary active manual are hidden.
do $$
declare rejected boolean := false; target_id uuid;
begin
  foreach target_id in array array[
    'd1170002-0000-4000-8000-000000000002',
    'd1170003-0000-4000-8000-000000000003',
    'd1170004-0000-4000-8000-000000000004'
  ]::uuid[] loop
    rejected := not exists (select 1 from public.list_archived_manuals('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') where id = target_id)
      and public.get_archived_manual_detail('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', target_id) is null;
    if not rejected then raise exception 'non-archived or inconsistent manual exposed: %', target_id; end if;
  end loop;
  rejected := public.get_archived_manual_detail('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'd1170001-0000-4000-8000-000000000001') is null;
  if not rejected then raise exception 'manual ID crossed the requested workspace'; end if;
end;
$$;

-- The dedicated definer read must not relax normal member SELECT visibility.
do $$
declare rejected boolean := false;
begin
  if not exists (select 1 from public.manuals where id = 'd1170004-0000-4000-8000-000000000004') then
    raise exception 'normal member SELECT positive control missing';
  end if;
  rejected := not exists (select 1 from public.manuals where id in (
    'd1170001-0000-4000-8000-000000000001', 'd1170005-0000-4000-8000-000000000005'));
  if not rejected then raise exception 'normal SELECT exposed archived manuals'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
do $$
declare detail jsonb;
begin
  if not exists (select 1 from public.list_archived_manuals('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    where id = 'd1170001-0000-4000-8000-000000000001')
    or exists (select 1 from public.list_archived_manuals('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
      where id in (
        'd1170002-0000-4000-8000-000000000002',
        'd1170003-0000-4000-8000-000000000003',
        'd1170004-0000-4000-8000-000000000004',
        'd1170005-0000-4000-8000-000000000005'
      ) or workspace_id is distinct from 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
        or status is distinct from 'archived' or archived_at is null) then
    raise exception 'viewer cannot list own workspace archived manuals';
  end if;
  detail := public.get_archived_manual_detail('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd1170001-0000-4000-8000-000000000001');
  if detail->'can_edit' is distinct from 'false'::jsonb
    or detail#>>'{draft,id}' is distinct from 'd1171001-0000-4000-8000-000000000001'
    or jsonb_array_length(detail->'steps') is distinct from 2 then
    raise exception 'viewer detail missing or editable';
  end if;
  if exists (select 1 from public.manuals where id = 'd1170001-0000-4000-8000-000000000001') then
    raise exception 'viewer normal SELECT exposed archived manual';
  end if;
end;
$$;
do $$
declare rejected boolean := false;
begin
  rejected := not exists (select 1 from public.list_archived_manuals('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'))
    and public.get_archived_manual_detail('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'd1170005-0000-4000-8000-000000000005') is null;
  if not rejected then raise exception 'workspace A viewer read workspace B'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', true);
do $$
declare rejected boolean := false;
begin
  rejected := not exists (select 1 from public.list_archived_manuals('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))
    and public.get_archived_manual_detail('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd1170001-0000-4000-8000-000000000001') is null;
  if not rejected then raise exception 'nonmember read archived manuals'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', '', true);
do $$
declare rejected boolean := false;
begin
  if auth.uid() is not null then raise exception 'unauthenticated test has a subject'; end if;
  rejected := not exists (select 1 from public.list_archived_manuals('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))
    and public.get_archived_manual_detail('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd1170001-0000-4000-8000-000000000001') is null;
  if not rejected then raise exception 'unauthenticated caller read archived manuals'; end if;
end;
$$;

-- With no draft pointer, detail must follow the current published revision.
reset role;
select set_config('app.manual_publish_context', 'on', true);
update public.manuals set current_draft_revision_id = null where id = 'd1170001-0000-4000-8000-000000000001';
select set_config('app.manual_publish_context', '', true);
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
do $$
declare detail jsonb;
begin
  detail := public.get_archived_manual_detail('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'd1170001-0000-4000-8000-000000000001');
  if detail#>>'{draft,id}' is distinct from 'd1171002-0000-4000-8000-000000000002'
    or detail#>>'{draft,state}' is distinct from 'published'
    or detail#>>'{draft,title}' is distinct from '現在の公開版'
    or detail->'can_edit' is distinct from 'false'::jsonb
    or (select jsonb_agg(step->>'id') from jsonb_array_elements(detail->'steps') as s(step))
      is distinct from '["d1172004-0000-4000-8000-000000000004"]'::jsonb then
    raise exception 'detail did not follow current published revision';
  end if;
end;
$$;

reset role;
do $$
begin
  if has_function_privilege('anon', 'public.list_archived_manuals(uuid)', 'EXECUTE') then
    raise exception 'anon can list archived manuals';
  end if;
  if has_function_privilege('anon', 'public.get_archived_manual_detail(uuid,uuid)', 'EXECUTE') then
    raise exception 'anon can read archived manual detail';
  end if;
  if not has_function_privilege('authenticated', 'public.list_archived_manuals(uuid)', 'EXECUTE') then
    raise exception 'authenticated cannot execute archived list';
  end if;
  if not has_function_privilege('authenticated', 'public.get_archived_manual_detail(uuid,uuid)', 'EXECUTE') then
    raise exception 'authenticated cannot execute archived detail';
  end if;
end;
$$;
rollback;
