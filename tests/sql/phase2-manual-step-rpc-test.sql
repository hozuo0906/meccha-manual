\set ON_ERROR_STOP on

-- Stable fixture identities.
\set workspace_a 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
\set workspace_b 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
\set workspace_lock 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
\set editor_id '11111111-1111-4111-8111-111111111111'
\set viewer_id '22222222-2222-4222-8222-222222222222'
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
  :'revision_a',
  'action',
  '保存ボタン',
  '［保存ボタン］をクリックします。',
  'click',
  '保存ボタン',
  null,
  null,
  '{}'::jsonb,
  '{}'::jsonb
) as step_a \gset

select public.append_manual_step(
  :'revision_a',
  'note',
  '補足',
  '内容を確認します。',
  null,
  null,
  null,
  null,
  '{}'::jsonb,
  '{}'::jsonb
) as step_b \gset

reset role;

do $$
begin
  if (select count(*) from public.manual_steps where revision_id = :'revision_a' and deleted_at is null) <> 2 then
    raise exception 'append did not create exactly two active steps';
  end if;
  if (select min(position) from public.manual_steps where revision_id = :'revision_a') <> 0
     or (select max(position) from public.manual_steps where revision_id = :'revision_a') <> 1 then
    raise exception 'append positions are not serialized to 0,1';
  end if;
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', :'editor_id', false);
select public.update_manual_step(
  :'revision_a', :'step_a', 'action', '保存', '手修正済み instruction', 'click', '保存', null, null, '{}'::jsonb, '{}'::jsonb
);
select public.reorder_manual_steps(:'revision_a', array[:'step_b'::uuid, :'step_a'::uuid]);
reset role;

do $$
begin
  if (select instruction from public.manual_steps where id = :'step_a') <> '手修正済み instruction' then
    raise exception 'update did not preserve supplied instruction';
  end if;
  if (select position from public.manual_steps where id = :'step_b') <> 0
     or (select position from public.manual_steps where id = :'step_a') <> 1 then
    raise exception 'reorder did not produce requested zero-based order';
  end if;
end;
$$;

-- Invalid reorder must roll back without changing positions.
set role authenticated;
select set_config('request.jwt.claim.sub', :'editor_id', false);
do $$
begin
  begin
    perform public.reorder_manual_steps(:'revision_a', array[:'step_a'::uuid, :'step_a'::uuid]);
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
begin
  if (select position from public.manual_steps where id = :'step_b') <> 0
     or (select position from public.manual_steps where id = :'step_a') <> 1 then
    raise exception 'failed reorder changed persisted positions';
  end if;
end;
$$;

-- Cross-revision ID is rejected atomically.
insert into public.manual_steps (
  workspace_id, revision_id, position, type, title, instruction, created_by
) values (:'workspace_b', :'revision_b', 0, 'note', 'Foreign', '', :'editor_id')
returning id as foreign_step \gset

set role authenticated;
select set_config('request.jwt.claim.sub', :'editor_id', false);
do $$
begin
  begin
    perform public.reorder_manual_steps(:'revision_a', array[:'step_b'::uuid, :'foreign_step'::uuid]);
    raise exception 'expected cross revision rejection';
  exception
    when others then
      if sqlerrm = 'expected cross revision rejection' then raise; end if;
      if sqlerrm not like '%invalid step%' then raise; end if;
  end;
end;
$$;
reset role;

-- Viewer can read but cannot mutate through the definer RPCs.
set role authenticated;
select set_config('request.jwt.claim.sub', :'viewer_id', false);
do $$
begin
  begin
    perform public.append_manual_step(:'revision_a', 'note', 'Viewer write', '', null, null, null, null, '{}'::jsonb, '{}'::jsonb);
    raise exception 'expected viewer rejection';
  exception
    when others then
      if sqlerrm = 'expected viewer rejection' then raise; end if;
      if sqlerrm not like '%workspace editor role required%' then raise; end if;
  end;
end;
$$;
reset role;

-- Published revisions are never step mutation targets.
set role authenticated;
select set_config('request.jwt.claim.sub', :'editor_id', false);
do $$
begin
  begin
    perform public.append_manual_step(:'revision_published', 'note', 'Published write', '', null, null, null, null, '{}'::jsonb, '{}'::jsonb);
    raise exception 'expected published rejection';
  exception
    when others then
      if sqlerrm = 'expected published rejection' then raise; end if;
      if sqlerrm not like '%draft revision not found%' then raise; end if;
  end;
end;
$$;
reset role;

-- Direct authenticated DML is revoked; every supported mutation must use a lock-taking RPC.
set role authenticated;
select set_config('request.jwt.claim.sub', :'editor_id', false);
do $$
begin
  begin
    update public.manual_steps set title = 'bypass' where id = :'step_a';
    raise exception 'expected direct update permission denial';
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.manual_steps where id = :'step_a';
    raise exception 'expected direct delete permission denial';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.manual_steps (workspace_id, revision_id, position, type, title, instruction, created_by)
    values (:'workspace_a', :'revision_a', 50, 'note', 'bypass', '', :'editor_id');
    raise exception 'expected direct insert permission denial';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- Anonymous callers cannot execute any step mutation RPC.
set role anon;
do $$
begin
  begin
    perform public.reorder_manual_steps(:'revision_a', array[]::uuid[]);
    raise exception 'expected anonymous execute denial';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- Soft deletion is an RPC mutation and leaves the row for audit/recovery.
set role authenticated;
select set_config('request.jwt.claim.sub', :'editor_id', false);
select public.soft_delete_manual_step(:'revision_a', :'step_b');
reset role;

do $$
begin
  if (select deleted_at from public.manual_steps where id = :'step_b') is null then
    raise exception 'soft delete did not retain row with deleted_at';
  end if;
end;
$$;

select 'phase2 manual step RPC database test OK' as result;
