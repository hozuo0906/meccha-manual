\set ON_ERROR_STOP on

\set workspace_a 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
\set workspace_b 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
\set workspace_lock 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
\set editor_id '11111111-1111-4111-8111-111111111111'
\set viewer_id '22222222-2222-4222-8222-222222222222'
\set admin_id 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01'
\set owner_id 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02'
\set manual_a '33333333-3333-4333-8333-333333333333'
\set manual_b '44444444-4444-4444-8444-444444444444'
\set manual_lock '55555555-5555-4555-8555-555555555555'
\set revision_a '66666666-6666-4666-8666-666666666666'
\set revision_b '77777777-7777-4777-8777-777777777777'
\set revision_published '88888888-8888-4888-8888-888888888888'
\set revision_lock '99999999-9999-4999-8999-999999999999'
\set lock_step_a 'aaaaaaaa-0000-4000-8000-000000000001'
\set lock_step_b 'aaaaaaaa-0000-4000-8000-000000000002'

insert into public.manuals (id, workspace_id) values
  (:'manual_a', :'workspace_a'),
  (:'manual_b', :'workspace_b'),
  (:'manual_lock', :'workspace_lock');

insert into public.manual_revisions (id, workspace_id, manual_id, state) values
  (:'revision_a', :'workspace_a', :'manual_a', 'draft'),
  (:'revision_published', :'workspace_a', :'manual_a', 'published'),
  (:'revision_b', :'workspace_b', :'manual_b', 'draft'),
  (:'revision_lock', :'workspace_lock', :'manual_lock', 'draft');

insert into public.workspace_members (workspace_id, user_id, role, status) values
  (:'workspace_a', :'editor_id', 'editor', 'active'),
  (:'workspace_a', :'viewer_id', 'viewer', 'active'),
  (:'workspace_a', :'admin_id', 'admin', 'active'),
  (:'workspace_a', :'owner_id', 'owner', 'active'),
  (:'workspace_b', :'editor_id', 'editor', 'active'),
  (:'workspace_lock', :'editor_id', 'editor', 'active');

insert into public.manual_steps (
  id, workspace_id, revision_id, position, type, title, instruction, created_by
) values
  (:'lock_step_a', :'workspace_lock', :'revision_lock', 0, 'action', 'Lock A', '', :'editor_id'),
  (:'lock_step_b', :'workspace_lock', :'revision_lock', 1, 'action', 'Lock B', '', :'editor_id');

set role authenticated;
select set_config('request.jwt.claim.sub', :'editor_id', false);

select public.append_manual_step(
  :'revision_a', 'action', '保存ボタン', '［保存ボタン］をクリックします。',
  'click', '保存ボタン', null, null, '{}'::jsonb, '{}'::jsonb
) as step_a \gset

select public.append_manual_step(
  :'revision_a', 'note', '補足', '内容を確認します。',
  null, null, null, null, '{}'::jsonb, '{}'::jsonb
) as step_b \gset

reset role;

do $$
begin
  if (select count(*) from public.manual_steps where revision_id = '66666666-6666-4666-8666-666666666666' and deleted_at is null) <> 2 then
    raise exception 'append did not create exactly two active steps';
  end if;
  if (select min(position) from public.manual_steps where revision_id = '66666666-6666-4666-8666-666666666666') <> 0
     or (select max(position) from public.manual_steps where revision_id = '66666666-6666-4666-8666-666666666666') <> 1 then
    raise exception 'append positions are not serialized to 0,1';
  end if;
end;
$$;

-- The mutation boundary is intentionally role-based: editor, admin, and owner
-- may use the RPC, while viewer is rejected below. This keeps the matrix
-- credential-free and exercises the same predicate used by every mutation.
set role authenticated;
select set_config('request.jwt.claim.sub', :'admin_id', false);
select public.append_manual_step(
  :'revision_a', 'note', '管理者追記', '管理者が追記します。',
  null, null, null, null, '{}'::jsonb, '{}'::jsonb
) as admin_step \gset

select set_config('request.jwt.claim.sub', :'owner_id', false);
select public.append_manual_step(
  :'revision_a', 'note', '所有者追記', '所有者が追記します。',
  null, null, null, null, '{}'::jsonb, '{}'::jsonb
) as owner_step \gset
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'editor_id', false);
do $$
declare
  target_id uuid;
  stale_updated_at timestamptz;
  rejected boolean := false;
begin
  select id, updated_at
  into target_id, stale_updated_at
  from public.manual_steps
  where revision_id = '66666666-6666-4666-8666-666666666666'
    and title = '保存ボタン';

  perform public.update_manual_step(
    '66666666-6666-4666-8666-666666666666', target_id, stale_updated_at,
    'action', '保存', '手修正済み instruction', 'click', '保存', null, null, '{}'::jsonb, '{}'::jsonb
  );

  begin
    perform public.update_manual_step(
      '66666666-6666-4666-8666-666666666666', target_id, stale_updated_at,
      'action', '競合上書き', '古い更新', 'click', '古い対象', null, null, '{}'::jsonb, '{}'::jsonb
    );
  exception
    when others then
      if sqlerrm like '%manual step changed concurrently%' then
        rejected := true;
      else
        raise;
      end if;
  end;

  if not rejected then
    raise exception 'stale manual step update was accepted';
  end if;
end;
$$;
select public.reorder_manual_steps(
  :'revision_a',
  array[
    :'step_b'::uuid,
    :'step_a'::uuid,
    :'admin_step'::uuid,
    :'owner_step'::uuid
  ]
);
reset role;

do $$
declare
  step_a_id uuid;
  step_b_id uuid;
begin
  select id into step_a_id from public.manual_steps where revision_id = '66666666-6666-4666-8666-666666666666' and title = '保存';
  select id into step_b_id from public.manual_steps where revision_id = '66666666-6666-4666-8666-666666666666' and title = '補足';
  if (select instruction from public.manual_steps where id = step_a_id) <> '手修正済み instruction' then
    raise exception 'update did not preserve supplied instruction';
  end if;
  if (select position from public.manual_steps where id = step_b_id) <> 0
     or (select position from public.manual_steps where id = step_a_id) <> 1 then
    raise exception 'reorder did not produce requested zero-based order';
  end if;
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', :'editor_id', false);
do $$
declare
  target_id uuid;
begin
  select id into target_id
  from public.manual_steps
  where revision_id = '66666666-6666-4666-8666-666666666666' and title = '保存';
  begin
    perform public.reorder_manual_steps(
      '66666666-6666-4666-8666-666666666666',
      array[target_id, target_id]
    );
    raise exception 'expected duplicate reorder rejection';
  exception
    when others then
      if sqlerrm = 'expected duplicate reorder rejection' then raise; end if;
      if sqlerrm not like '%exactly once%' and sqlerrm not like '%duplicates%' then raise; end if;
  end;
end;
$$;
reset role;

do $$
declare
  step_a_id uuid;
  step_b_id uuid;
begin
  select id into step_a_id from public.manual_steps where revision_id = '66666666-6666-4666-8666-666666666666' and title = '保存';
  select id into step_b_id from public.manual_steps where revision_id = '66666666-6666-4666-8666-666666666666' and title = '補足';
  if (select position from public.manual_steps where id = step_b_id) <> 0
     or (select position from public.manual_steps where id = step_a_id) <> 1 then
    raise exception 'failed reorder changed persisted positions';
  end if;
end;
$$;

insert into public.manual_steps (
  workspace_id, revision_id, position, type, title, instruction, created_by
) values (:'workspace_b', :'revision_b', 0, 'note', 'Foreign', '', :'editor_id');

set role authenticated;
select set_config('request.jwt.claim.sub', :'editor_id', false);
do $$
declare
  local_id uuid;
  foreign_id uuid;
begin
  select id into local_id from public.manual_steps where revision_id = '66666666-6666-4666-8666-666666666666' and title = '補足';
  select id into foreign_id from public.manual_steps where revision_id = '77777777-7777-4777-8777-777777777777' and title = 'Foreign';
  begin
    perform public.reorder_manual_steps(
      '66666666-6666-4666-8666-666666666666',
      array[
        (select id from public.manual_steps where revision_id = '66666666-6666-4666-8666-666666666666' and title = '保存'),
        (select id from public.manual_steps where revision_id = '66666666-6666-4666-8666-666666666666' and title = '補足'),
        (select id from public.manual_steps where revision_id = '66666666-6666-4666-8666-666666666666' and title = '管理者追記'),
        (select id from public.manual_steps where revision_id = '66666666-6666-4666-8666-666666666666' and title = '所有者追記'),
        foreign_id
      ]
    );
    raise exception 'expected cross revision rejection';
  exception
    when others then
      if sqlerrm = 'expected cross revision rejection' then raise; end if;
      if sqlerrm not like '%invalid step%' then raise; end if;
  end;
end;
$$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'viewer_id', false);
do $$
begin
  begin
    perform public.append_manual_step(
      '66666666-6666-4666-8666-666666666666', 'note', 'Viewer write', '', null, null, null, null, '{}'::jsonb, '{}'::jsonb
    );
    raise exception 'expected viewer rejection';
  exception
    when others then
      if sqlerrm = 'expected viewer rejection' then raise; end if;
      if sqlerrm not like '%workspace editor role required%' then raise; end if;
  end;
end;
$$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'editor_id', false);
do $$
begin
  begin
    perform public.append_manual_step(
      '88888888-8888-4888-8888-888888888888', 'note', 'Published write', '', null, null, null, null, '{}'::jsonb, '{}'::jsonb
    );
    raise exception 'expected published rejection';
  exception
    when others then
      if sqlerrm = 'expected published rejection' then raise; end if;
      if sqlerrm not like '%draft revision not found%' then raise; end if;
  end;
end;
$$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'editor_id', false);
do $$
begin
  begin
    update public.manual_steps set title = 'bypass'
    where revision_id = '66666666-6666-4666-8666-666666666666';
    raise exception 'expected direct update permission denial';
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.manual_steps
    where revision_id = '66666666-6666-4666-8666-666666666666';
    raise exception 'expected direct delete permission denial';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.manual_steps (workspace_id, revision_id, position, type, title, instruction, created_by)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '66666666-6666-4666-8666-666666666666',
      50, 'note', 'bypass', '', '11111111-1111-4111-8111-111111111111'
    );
    raise exception 'expected direct insert permission denial';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
reset role;


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

  rejected := false;
  begin
    perform public.append_manual_step(
      '66666666-6666-4666-8666-666666666666',
      'action', 'backslash URL', '', 'navigate', '画面',
      'https://example.com' || chr(92) || 'path',
      null, '{}'::jsonb, '{}'::jsonb
    );
  exception
    when others then
      if sqlerrm like '%manual step url is invalid%' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'direct RPC accepted backslash URL'; end if;

  rejected := false;
  begin
    perform public.append_manual_step(
      '66666666-6666-4666-8666-666666666666',
      'action', 'punycode URL', '', 'navigate', '画面', 'https://xn--/',
      null, '{}'::jsonb, '{}'::jsonb
    );
  exception
    when others then
      if sqlerrm like '%manual step url is invalid%' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'direct RPC accepted malformed punycode URL'; end if;

  rejected := false;
  begin
    perform public.append_manual_step(
      '66666666-6666-4666-8666-666666666666',
      'action', 'out-of-range hexadecimal IPv4', '', 'navigate', '画面', 'https://0x100000000/',
      null, '{}'::jsonb, '{}'::jsonb
    );
  exception
    when others then
      if sqlerrm like '%manual step url is invalid%' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'direct RPC accepted out-of-range hexadecimal IPv4'; end if;

  rejected := false;
  begin
    perform public.append_manual_step(
      '66666666-6666-4666-8666-666666666666',
      'action', 'oversized serialized URL', '', 'navigate', '画面',
      'https://example.com/' || repeat('あ', 226),
      null, '{}'::jsonb, '{}'::jsonb
    );
  exception
    when others then
      if sqlerrm like '%manual step url is invalid%' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'direct RPC accepted oversized serialized URL'; end if;

  rejected := false;
  begin
    perform public.append_manual_step(
      '66666666-6666-4666-8666-666666666666',
      'action', 'oversized serialized query', '', 'navigate', '画面',
      'https://example.com/?q=' || repeat(chr(39), 2025),
      null, '{}'::jsonb, '{}'::jsonb
    );
  exception
    when others then
      if sqlerrm like '%manual step url is invalid%' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'direct RPC accepted oversized serialized query'; end if;

  perform public.append_manual_step(
    '66666666-6666-4666-8666-666666666666',
    'action', 'zero-padded port URL', '', 'navigate', '画面', 'https://example.com:000080/',
    null, '{}'::jsonb, '{}'::jsonb
  );
  perform public.append_manual_step(
    '66666666-6666-4666-8666-666666666666',
    'action', 'empty port URL', '', 'navigate', '画面', 'HTTPS://example.com:/',
    null, '{}'::jsonb, '{}'::jsonb
  );
  perform public.append_manual_step(
    '66666666-6666-4666-8666-666666666666',
    'action', 'long zero-padded port URL', '', 'navigate', '画面',
    'https://example.com:' || repeat('0', 100) || '80/',
    null, '{}'::jsonb, '{}'::jsonb
  );
  perform public.append_manual_step(
    '66666666-6666-4666-8666-666666666666',
    'action', 'RFC 3986 delimiter boundary URL', '', 'navigate', '画面',
    'https://example.com/' || repeat(';=' || chr(39), 676),
    null, '{}'::jsonb, '{}'::jsonb
  );

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

set role anon;
do $$
begin
  begin
    perform public.append_manual_step(
      '66666666-6666-4666-8666-666666666666', 'note', 'anonymous insert', '', null, null, null, null, '{}'::jsonb, '{}'::jsonb
    );
    raise exception 'expected anonymous append denial';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.update_manual_step(
      '66666666-6666-4666-8666-666666666666',
      'aaaaaaaa-0000-4000-8000-000000000001',
      null, 'action', 'anonymous update', '', 'click', null, null, null, '{}'::jsonb, '{}'::jsonb
    );
    raise exception 'expected anonymous update denial';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.soft_delete_manual_step(
      '66666666-6666-4666-8666-666666666666',
      'aaaaaaaa-0000-4000-8000-000000000001'
    );
    raise exception 'expected anonymous soft delete denial';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.reorder_manual_steps(
      '66666666-6666-4666-8666-666666666666',
      array[]::uuid[]
    );
    raise exception 'expected anonymous execute denial';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :'editor_id', false);
select public.soft_delete_manual_step(:'revision_a', :'step_b');
reset role;

do $$
begin
  if not exists (
    select 1
    from public.manual_steps
    where revision_id = '66666666-6666-4666-8666-666666666666'
      and title = '補足'
      and deleted_at is not null
  ) then
    raise exception 'soft delete did not retain row with deleted_at';
  end if;
end;
$$;

select 'phase2 manual step RPC database test OK' as result;
