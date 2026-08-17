\set ON_ERROR_STOP on

reset role;

select m.updated_at as archive_expected_updated_at
from public.manuals m
where m.id = '33333333-3333-4333-8333-333333333333' \gset

select set_config('app.test_archive_updated_at', :'archive_expected_updated_at', false);
select set_config('app.test_archive_status', m.status::text, false),
  set_config('app.test_archive_draft_id', coalesce(m.current_draft_revision_id::text, ''), false),
  set_config('app.test_archive_published_id', coalesce(m.current_published_revision_id::text, ''), false)
from public.manuals m
where m.id = '33333333-3333-4333-8333-333333333333';

set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);

do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.archive_manual(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '33333333-3333-4333-8333-333333333333',
      current_setting('app.test_archive_updated_at')::timestamptz
    );
  exception
    when others then
      if sqlerrm like '%workspace editor role required%' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'viewer archived a manual'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

select ms.id as archive_conflict_step_id
from public.manual_steps ms
where ms.revision_id = '44444444-4444-4444-8444-444444444444'
  and ms.deleted_at is null
order by ms.position
limit 1 \gset

select public.soft_delete_manual_step(
  '44444444-4444-4444-8444-444444444444',
  :'archive_conflict_step_id'
);

do $$
begin
  if not exists (
    select 1 from public.manuals m
    where m.id = '33333333-3333-4333-8333-333333333333'
      and m.updated_at > current_setting('app.test_archive_updated_at')::timestamptz
  ) then
    raise exception 'step mutation did not advance the manual archive version';
  end if;
end;
$$;

do $$
declare rejected boolean := false;
begin
  begin
    perform public.archive_manual(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '33333333-3333-4333-8333-333333333333',
      current_setting('app.test_archive_updated_at')::timestamptz
    );
  exception when others then
    if sqlerrm like '%manual archive changed concurrently%' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'step mutation was hidden by archive'; end if;
end;
$$;

select set_config('app.test_archive_updated_at', m.updated_at::text, false)
from public.manuals m
where m.id = '33333333-3333-4333-8333-333333333333';

do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.archive_manual(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '33333333-3333-4333-8333-333333333333',
      (current_setting('app.test_archive_updated_at')::timestamptz - interval '1 second')
    );
  exception
    when others then
      if sqlerrm like '%manual archive changed concurrently%' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'stale manual version archived a manual'; end if;
end;
$$;

do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.archive_manual(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '33333333-3333-4333-8333-333333333333',
      current_setting('app.test_archive_updated_at')::timestamptz
    );
  exception
    when others then
      if sqlerrm like '%manual not found%' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'workspace mismatch archived a manual'; end if;
end;
$$;

select public.archive_manual(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '33333333-3333-4333-8333-333333333333',
  current_setting('app.test_archive_updated_at')::timestamptz
) = '33333333-3333-4333-8333-333333333333'::uuid as archived_expected_manual;

select public.get_manual_edit_detail(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '33333333-3333-4333-8333-333333333333'
) is null as archived_detail_hidden;

do $$
begin
  if exists (
    select 1 from public.manuals
    where id = '33333333-3333-4333-8333-333333333333'
  ) then
    raise exception 'archived manual remains directly visible to authenticated member';
  end if;
end;
$$;

reset role;

do $$
begin
  if not exists (
    select 1 from public.manuals m
    where m.id = '33333333-3333-4333-8333-333333333333'
      and m.status = 'archived'
      and m.archived_at is not null
      and coalesce(m.current_draft_revision_id::text, '') = current_setting('app.test_archive_draft_id')
      and coalesce(m.current_published_revision_id::text, '') = current_setting('app.test_archive_published_id')
  ) then
    raise exception 'archive did not preserve manual data and revision pointers';
  end if;
  if not exists (
    select 1 from public.audit_logs a
    where a.workspace_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and a.actor_id = '11111111-1111-4111-8111-111111111111'
      and a.action = 'manual.archived'
      and a.resource_type = 'manual'
      and a.resource_id = '33333333-3333-4333-8333-333333333333'
      and a.metadata->>'previousStatus' = current_setting('app.test_archive_status')
      and coalesce(a.metadata->>'draftRevisionId', '') = current_setting('app.test_archive_draft_id')
      and coalesce(a.metadata->>'publishedRevisionId', '') = current_setting('app.test_archive_published_id')
  ) then
    raise exception 'archive audit log is missing';
  end if;
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.archive_manual(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '33333333-3333-4333-8333-333333333333',
      current_setting('app.test_archive_updated_at')::timestamptz
    );
  exception
    when others then
      if sqlerrm like '%manual not found%' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'already archived manual was accepted'; end if;
end;
$$;

reset role;

do $$
begin
  if has_function_privilege('anon', 'public.archive_manual(uuid,uuid,timestamptz)', 'EXECUTE') then
    raise exception 'anon can execute archive_manual';
  end if;
  if not has_function_privilege('authenticated', 'public.archive_manual(uuid,uuid,timestamptz)', 'EXECUTE') then
    raise exception 'authenticated cannot execute archive_manual';
  end if;
end;
$$;
