\set ON_ERROR_STOP on

reset role;

insert into public.manuals (
  id, workspace_id, title, status, current_draft_revision_id, current_published_revision_id
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '公開境界テスト',
  'draft',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  null
);

insert into public.manual_revisions (
  id, workspace_id, manual_id, revision_no, state, title, description, created_by
) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  1,
  'draft',
  '公開境界テスト',
  '公開前説明',
  '11111111-1111-4111-8111-111111111111'
);

insert into public.manual_steps (
  workspace_id, revision_id, position, type, title, instruction, created_by
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  0,
  'action',
  '公開する',
  '公開ボタンを押します。',
  '11111111-1111-4111-8111-111111111111'
);

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

select public.publish_manual_revision(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
) = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid as published_expected_draft;

do $$
begin
  if not exists (
    select 1
    from public.manuals m
    join public.manual_revisions mr on mr.id = m.current_published_revision_id
    where m.id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and m.status = 'published'
      and m.current_draft_revision_id is null
      and mr.id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      and mr.state = 'published'
      and mr.published_at is not null
  ) then
    raise exception 'publication pointers are inconsistent';
  end if;
end;
$$;

select public.create_manual_draft_from_published(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
) as next_draft_id \gset

select set_config('app.test_next_draft', :'next_draft_id', false);

select public.create_manual_draft_from_published(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
) = current_setting('app.test_next_draft')::uuid as repeated_create_returns_same_draft;

do $$
begin
  if not exists (
    select 1
    from public.manuals m
    join public.manual_revisions mr on mr.id = m.current_draft_revision_id
    where m.id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and m.current_published_revision_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      and mr.id = current_setting('app.test_next_draft')::uuid
      and mr.state = 'draft'
      and mr.revision_no = 2
      and mr.title = '公開境界テスト'
      and mr.description = '公開前説明'
  ) then
    raise exception 'next draft metadata was not copied';
  end if;
  if (select count(*) from public.manual_steps where revision_id = current_setting('app.test_next_draft')::uuid and deleted_at is null) <> 1 then
    raise exception 'next draft active steps were not copied';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);

do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.create_manual_draft_from_published(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    );
  exception
    when others then
      if sqlerrm like '%workspace editor role required%' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'viewer created a draft'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.publish_manual_revision(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    );
  exception
    when others then
      if sqlerrm like '%manual publication draft changed concurrently%' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'stale draft publication was accepted'; end if;
end;
$$;

reset role;
