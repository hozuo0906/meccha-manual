\set ON_ERROR_STOP on

-- Runs after the archive regression against the same disposable Postgres fixture.
-- Synthetic data only. Roll back fixtures and mutations at the end.
reset role;
begin;
insert into public.manuals (id, workspace_id, title, status)
values ('a3333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '復元テスト', 'draft');
insert into public.manual_revisions (id, workspace_id, manual_id, state, title, created_by)
values ('a4444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'a3333333-3333-4333-8333-333333333333', 'draft', '復元テスト', '11111111-1111-4111-8111-111111111111');
select set_config('app.manual_publish_context', 'on', true);
update public.manuals set current_draft_revision_id = 'a4444444-4444-4444-8444-444444444444'
where id = 'a3333333-3333-4333-8333-333333333333';
select set_config('app.manual_publish_context', '', true);
select set_config('app.test_restore_version', updated_at::text, true)
from public.manuals where id = 'a3333333-3333-4333-8333-333333333333';
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

do $$
declare rejected boolean := false;
begin
  begin
    perform public.restore_manual('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a3333333-3333-4333-8333-333333333333', current_setting('app.test_restore_version')::timestamptz);
  exception when others then
    if sqlerrm = 'manual not found' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'non-archived manual restored'; end if;
end;
$$;
select public.archive_manual('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a3333333-3333-4333-8333-333333333333', current_setting('app.test_restore_version')::timestamptz);
reset role;
select set_config('app.test_restore_version', updated_at::text, true) from public.manuals where id = 'a3333333-3333-4333-8333-333333333333';
set role authenticated;

do $$
declare rejected boolean := false;
begin
  begin
    perform public.restore_manual('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a3333333-3333-4333-8333-333333333333', current_setting('app.test_restore_version')::timestamptz - interval '1 second');
  exception when others then
    if sqlerrm = 'manual restore changed concurrently' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'stale version restored manual'; end if;
end;
$$;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);

do $$
declare rejected boolean := false;
begin
  begin
    perform public.restore_manual('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a3333333-3333-4333-8333-333333333333', current_setting('app.test_restore_version')::timestamptz);
  exception when others then
    if sqlerrm = 'workspace editor role required' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'viewer restored manual'; end if;
end;
$$;
select set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', true);

do $$
declare rejected boolean := false;
begin
  begin
    perform public.restore_manual('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a3333333-3333-4333-8333-333333333333', current_setting('app.test_restore_version')::timestamptz);
  exception when others then
    if sqlerrm = 'workspace editor role required' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'nonmember restored manual'; end if;
end;
$$;
select set_config('request.jwt.claim.sub', '', true);

do $$
declare rejected boolean := false;
begin
  begin
    perform public.restore_manual('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a3333333-3333-4333-8333-333333333333', current_setting('app.test_restore_version')::timestamptz);
  exception when others then
    if sqlerrm = 'authentication required' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'unauthenticated restored manual'; end if;
end;
$$;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

do $$
declare rejected boolean := false;
begin
  begin
    perform public.restore_manual('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'a3333333-3333-4333-8333-333333333333', current_setting('app.test_restore_version')::timestamptz);
  exception when others then
    if sqlerrm = 'manual not found' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'workspace mismatch restored manual'; end if;
end;
$$;
reset role;
do $$
begin
  if not exists (select 1 from public.manuals where id = 'a3333333-3333-4333-8333-333333333333' and status = 'archived'
    and archived_at is not null and updated_at = current_setting('app.test_restore_version')::timestamptz)
    or exists (select 1 from public.audit_logs where resource_id = 'a3333333-3333-4333-8333-333333333333' and action = 'manual.restored') then
    raise exception 'rejected restore changed state or audit';
  end if;
end;
$$;
set role authenticated;
select public.restore_manual('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a3333333-3333-4333-8333-333333333333', current_setting('app.test_restore_version')::timestamptz);

do $$
declare rejected boolean := false;
begin
  begin
    perform public.restore_manual('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a3333333-3333-4333-8333-333333333333', current_setting('app.test_restore_version')::timestamptz);
  exception when others then
    if sqlerrm = 'manual not found' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'double restore accepted'; end if;
end;
$$;
reset role;
do $$
begin
  if not exists (select 1 from public.manuals where id = 'a3333333-3333-4333-8333-333333333333' and status = 'draft' and archived_at is null
    and current_draft_revision_id = 'a4444444-4444-4444-8444-444444444444' and current_published_revision_id is null) then
    raise exception 'draft restore changed status or pointers';
  end if;
  if not exists (select 1 from public.audit_logs where resource_id = 'a3333333-3333-4333-8333-333333333333' and workspace_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    and actor_id = '11111111-1111-4111-8111-111111111111' and action = 'manual.restored' and resource_type = 'manual'
    and metadata->>'restoredStatus' = 'draft'
    and metadata->>'draftRevisionId' = 'a4444444-4444-4444-8444-444444444444'
    and metadata->'publishedRevisionId' = 'null'::jsonb) then
    raise exception 'restore audit missing';
  end if;
end;
$$;

-- Published fixture has a real immutable published revision and pointer.
do $$
declare
  version timestamptz;
  before_manual public.manuals%rowtype;
  after_manual public.manuals%rowtype;
  before_revision jsonb;
begin
  select * into before_manual from public.manuals where id = '55555555-5555-4555-8555-555555555555';
  select to_jsonb(r) into before_revision from public.manual_revisions r where id = before_manual.current_published_revision_id;
  if before_manual.status <> 'published' or before_revision is null then
    raise exception 'published fixture missing';
  end if;
  perform public.archive_manual('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', before_manual.id, before_manual.updated_at);
  select updated_at into version from public.manuals where id = before_manual.id;
  perform public.restore_manual('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', before_manual.id, version);
  select * into after_manual from public.manuals where id = before_manual.id;
  if after_manual.status <> 'published' or after_manual.archived_at is not null
    or after_manual.current_draft_revision_id is distinct from before_manual.current_draft_revision_id
    or after_manual.current_published_revision_id is distinct from before_manual.current_published_revision_id
    or before_revision is distinct from (select to_jsonb(r) from public.manual_revisions r where id = after_manual.current_published_revision_id)
    or not exists (select 1 from public.audit_logs a where a.resource_id = before_manual.id
      and a.action = 'manual.restored' and a.metadata->>'restoredStatus' = 'published'
      and a.metadata->>'publishedRevisionId' = before_manual.current_published_revision_id::text) then
    raise exception 'published restore changed state, revision pointers, content, or omitted audit';
  end if;
end;
$$;

-- Exercise all allowed historical states through real archive/restore RPC calls.
do $$
declare
  restored_status text;
  version timestamptz;
  manual public.manuals%rowtype;
begin
  foreach restored_status in array array['reviewing', 'stale'] loop
    perform set_config('app.manual_publish_context', 'on', true);
    update public.manuals set status = restored_status where id = 'a3333333-3333-4333-8333-333333333333' returning updated_at into version;
    perform set_config('app.manual_publish_context', '', true);
    perform public.archive_manual('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a3333333-3333-4333-8333-333333333333', version);
    select updated_at into version from public.manuals where id = 'a3333333-3333-4333-8333-333333333333';
    -- now() is transaction-stable; give each synthetic archive a distinct time.
    update public.audit_logs set created_at = clock_timestamp() where resource_id = 'a3333333-3333-4333-8333-333333333333' and action = 'manual.archived' and metadata->>'previousStatus' = restored_status;
    perform public.restore_manual('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a3333333-3333-4333-8333-333333333333', version);
    select * into manual from public.manuals where id = 'a3333333-3333-4333-8333-333333333333';
    if manual.status <> restored_status or manual.archived_at is not null then
      raise exception 'restore did not recover %', restored_status;
    end if;
  end loop;
end;
$$;

-- Missing/invalid latest audit must not fall back to older valid records.
select public.archive_manual('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a3333333-3333-4333-8333-333333333333', updated_at)
from public.manuals where id = 'a3333333-3333-4333-8333-333333333333';
select set_config('app.test_restore_version', updated_at::text, true)
from public.manuals where id = 'a3333333-3333-4333-8333-333333333333';
-- Restrict synthetic audit mutations to this test fixture.
delete from public.audit_logs where resource_id = 'a3333333-3333-4333-8333-333333333333' and action = 'manual.archived';
set role authenticated;

do $$
declare rejected boolean := false;
begin
  begin
    perform public.restore_manual('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a3333333-3333-4333-8333-333333333333', current_setting('app.test_restore_version')::timestamptz);
  exception when others then
    if sqlerrm = 'manual restore state unknown' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'missing audit allowed restore'; end if;
end;
$$;
reset role;
insert into public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, metadata)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'manual.archived', 'manual', 'a3333333-3333-4333-8333-333333333333', '{"previousStatus":"draft"}');
insert into public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, metadata, created_at)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'manual.archived', 'manual', 'a3333333-3333-4333-8333-333333333333', '{"previousStatus":"invalid"}', clock_timestamp() + interval '1 second');
set role authenticated;

do $$
declare rejected boolean := false;
begin
  begin
    perform public.restore_manual('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a3333333-3333-4333-8333-333333333333', current_setting('app.test_restore_version')::timestamptz);
  exception when others then
    if sqlerrm = 'manual restore state unknown' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'invalid latest audit fell back to older state'; end if;
end;
$$;
reset role;
update public.audit_logs set metadata = '{}' where resource_id = 'a3333333-3333-4333-8333-333333333333' and metadata->>'previousStatus' = 'invalid';
set role authenticated;

do $$
declare rejected boolean := false;
begin
  begin
    perform public.restore_manual('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a3333333-3333-4333-8333-333333333333', current_setting('app.test_restore_version')::timestamptz);
  exception when others then
    if sqlerrm = 'manual restore state unknown' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'missing previousStatus allowed restore'; end if;
end;
$$;
reset role;
update public.audit_logs set metadata = '{"previousStatus":"published"}', created_at = now()
where resource_id = 'a3333333-3333-4333-8333-333333333333' and metadata = '{}'::jsonb;
set role authenticated;
do $$
declare rejected boolean := false;
begin
  begin
    perform public.restore_manual('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'a3333333-3333-4333-8333-333333333333', current_setting('app.test_restore_version')::timestamptz);
  exception when others then
    if sqlerrm = 'manual restore state unknown' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'ambiguous same-time audit allowed restore'; end if;
end;
$$;
reset role;
do $$
begin
  if not exists (select 1 from public.manuals where id = 'a3333333-3333-4333-8333-333333333333' and status = 'archived'
    and archived_at is not null and updated_at = current_setting('app.test_restore_version')::timestamptz) then
    raise exception 'unknown-state restore changed manual';
  end if;
  if has_function_privilege('anon', 'public.restore_manual(uuid,uuid,timestamptz)', 'EXECUTE') then
    raise exception 'anon can restore';
  end if;
  if not has_function_privilege('authenticated', 'public.restore_manual(uuid,uuid,timestamptz)', 'EXECUTE') then
    raise exception 'authenticated cannot execute restore';
  end if;
end;
$$;
rollback;
