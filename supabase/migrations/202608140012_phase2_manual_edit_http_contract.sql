-- Phase 2 manual edit HTTP contract.
-- Repository-only until an approved environment migration is executed.
-- Existing rows are never truncated or normalized; constraint validation fails safely.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'manual_revisions_description_length'
      and conrelid = 'public.manual_revisions'::regclass
  ) then
    alter table public.manual_revisions
      add constraint manual_revisions_description_length
      check (char_length(description) <= 10000)
      not valid;
  end if;
end $$;

alter table public.manual_revisions validate constraint manual_revisions_description_length;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'manual_steps_title_length'
      and conrelid = 'public.manual_steps'::regclass
  ) then
    alter table public.manual_steps
      add constraint manual_steps_title_length
      check (char_length(title) between 1 and 128)
      not valid;
  end if;
end $$;

alter table public.manual_steps validate constraint manual_steps_title_length;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'manual_steps_title_nonblank'
      and conrelid = 'public.manual_steps'::regclass
  ) then
    alter table public.manual_steps
      add constraint manual_steps_title_nonblank
      check (
        char_length(
          btrim(
            title,
            ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13) ||
            chr(160) || chr(5760) ||
            chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) ||
            chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202) ||
            chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279)
          )
        ) > 0
      )
      not valid;
  end if;
end $$;

alter table public.manual_steps validate constraint manual_steps_title_nonblank;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'manual_steps_instruction_length'
      and conrelid = 'public.manual_steps'::regclass
  ) then
    alter table public.manual_steps
      add constraint manual_steps_instruction_length
      check (char_length(instruction) <= 4000)
      not valid;
  end if;
end $$;

alter table public.manual_steps validate constraint manual_steps_instruction_length;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'manual_steps_target_text_length'
      and conrelid = 'public.manual_steps'::regclass
  ) then
    alter table public.manual_steps
      add constraint manual_steps_target_text_length
      check (target_text is null or char_length(target_text) between 1 and 256)
      not valid;
  end if;
end $$;

alter table public.manual_steps validate constraint manual_steps_target_text_length;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'manual_steps_target_text_nonblank'
      and conrelid = 'public.manual_steps'::regclass
  ) then
    alter table public.manual_steps
      add constraint manual_steps_target_text_nonblank
      check (
        target_text is null
        or char_length(
          btrim(
            target_text,
            ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13) ||
            chr(160) || chr(5760) ||
            chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) ||
            chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202) ||
            chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279)
          )
        ) > 0
      )
      not valid;
  end if;
end $$;

alter table public.manual_steps validate constraint manual_steps_target_text_nonblank;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'manual_steps_url_length'
      and conrelid = 'public.manual_steps'::regclass
  ) then
    alter table public.manual_steps
      add constraint manual_steps_url_length
      check (url is null or char_length(url) <= 2048)
      not valid;
  end if;
end $$;

alter table public.manual_steps validate constraint manual_steps_url_length;

do $$
begin
  if exists (
    select 1
    from public.manual_steps ms
    where ms.deleted_at is null
    group by ms.revision_id
    having count(*) > 200
  ) then
    raise exception 'manual step limit preflight failed';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'manual_steps_annotation_size'
      and conrelid = 'public.manual_steps'::regclass
  ) then
    alter table public.manual_steps
      add constraint manual_steps_annotation_size
      check (octet_length(annotation::text) <= 65536)
      not valid;
  end if;
end $$;

alter table public.manual_steps validate constraint manual_steps_annotation_size;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'manual_steps_masking_size'
      and conrelid = 'public.manual_steps'::regclass
  ) then
    alter table public.manual_steps
      add constraint manual_steps_masking_size
      check (octet_length(masking::text) <= 65536)
      not valid;
  end if;
end $$;

alter table public.manual_steps validate constraint manual_steps_masking_size;

-- Return the editor detail from one PostgreSQL statement and therefore one MVCC snapshot.
-- SECURITY INVOKER keeps the existing member RLS policies authoritative.
create or replace function public.get_manual_edit_detail(
  target_workspace_id uuid,
  target_manual_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'can_edit', public.has_workspace_role(
      m.workspace_id,
      auth.uid(),
      array['owner', 'admin', 'editor']::public.workspace_role[]
    ),
    'manual', jsonb_build_object(
      'id', m.id,
      'workspace_id', m.workspace_id,
      'title', m.title,
      'status', m.status,
      'current_draft_revision_id', m.current_draft_revision_id,
      'current_published_revision_id', m.current_published_revision_id,
      'updated_at', m.updated_at
    ),
    'draft', case
      when m.current_draft_revision_id is null then null
      else (
        select jsonb_build_object(
          'id', mr.id,
          'workspace_id', mr.workspace_id,
          'manual_id', mr.manual_id,
          'revision_no', mr.revision_no,
          'state', mr.state,
          'title', mr.title,
          'description', mr.description,
          'updated_at', mr.updated_at
        )
        from public.manual_revisions mr
        where mr.id = m.current_draft_revision_id
          and mr.workspace_id = m.workspace_id
          and mr.manual_id = m.id
          and mr.state = 'draft'
      )
    end,
    'steps', case
      when m.current_draft_revision_id is null then '[]'::jsonb
      else (
        select coalesce(jsonb_agg(to_jsonb(detail_step) order by detail_step.position), '[]'::jsonb)
        from (
          select
            ms.id,
            ms.workspace_id,
            ms.revision_id,
            ms.position,
            ms.type,
            ms.title,
            ms.instruction,
            ms.action_type,
            ms.target_text,
            ms.url,
            ms.updated_at
          from public.manual_steps ms
          where ms.workspace_id = m.workspace_id
            and ms.revision_id = m.current_draft_revision_id
            and ms.deleted_at is null
          order by ms.position
          limit 201
        ) detail_step
      )
    end
  )
  from public.manuals m
  where m.workspace_id = target_workspace_id
    and m.id = target_manual_id
    and m.archived_at is null
  limit 1;
$$;

revoke all on function public.get_manual_edit_detail(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_manual_edit_detail(uuid, uuid) to authenticated;

create or replace function public.enforce_manual_steps_active_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  needs_check boolean := false;
  active_step_count integer;
begin
  if tg_op = 'INSERT' then
    needs_check := new.deleted_at is null;
  elsif tg_op = 'UPDATE' then
    needs_check := new.deleted_at is null
      and (old.deleted_at is not null or old.revision_id is distinct from new.revision_id);
  end if;

  if not needs_check then
    return new;
  end if;

  perform 1
  from public.manual_revisions mr
  where mr.id = new.revision_id
  for update;

  if not found then
    raise exception 'draft revision not found';
  end if;

  if tg_op = 'INSERT' then
    select count(*)::integer
    into active_step_count
    from public.manual_steps ms
    where ms.revision_id = new.revision_id
      and ms.deleted_at is null;
  else
    select count(*)::integer
    into active_step_count
    from public.manual_steps ms
    where ms.revision_id = new.revision_id
      and ms.deleted_at is null
      and ms.id <> old.id;
  end if;

  if active_step_count >= 200 then
    raise exception 'manual step limit exceeded';
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'manual_steps_active_limit_guard'
      and tgrelid = 'public.manual_steps'::regclass
      and not tgisinternal
  ) then
    create trigger manual_steps_active_limit_guard
    before insert or update of revision_id, deleted_at on public.manual_steps
    for each row
    execute function public.enforce_manual_steps_active_limit();
  end if;
end $$;

revoke all on function public.enforce_manual_steps_active_limit() from public, anon, authenticated;

drop function if exists public.update_manual_draft(uuid, text, text);
drop function if exists public.update_manual_draft(uuid, timestamptz, text, text);
drop function if exists public.update_manual_draft(uuid, uuid, timestamptz, text, text);

create function public.update_manual_draft(
  target_manual_id uuid,
  expected_draft_revision_id uuid,
  expected_draft_updated_at timestamptz,
  draft_title text,
  draft_description text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_workspace_id uuid;
  target_draft_revision_id uuid;
  current_draft_updated_at timestamptz;
begin
  if actor_id is null then
    raise exception 'authentication required';
  end if;

  if expected_draft_revision_id is null or expected_draft_updated_at is null then
    raise exception 'expected draft version is required';
  end if;

  select m.workspace_id, m.current_draft_revision_id
  into target_workspace_id, target_draft_revision_id
  from public.manuals m
  where m.id = target_manual_id
    and m.archived_at is null
  for update;

  if target_workspace_id is null then
    raise exception 'manual not found';
  end if;

  if not public.has_workspace_role(
    target_workspace_id,
    actor_id,
    array['owner', 'admin', 'editor']::public.workspace_role[]
  ) then
    raise exception 'workspace editor role required';
  end if;

  if target_draft_revision_id is null then
    raise exception 'draft revision not found';
  end if;

  if target_draft_revision_id is distinct from expected_draft_revision_id then
    raise exception 'current draft revision changed';
  end if;

  select mr.updated_at
  into current_draft_updated_at
  from public.manual_revisions mr
  where mr.id = target_draft_revision_id
    and mr.manual_id = target_manual_id
    and mr.workspace_id = target_workspace_id
    and mr.state = 'draft'
  for update;

  if not found then
    raise exception 'draft revision not found';
  end if;

  if current_draft_updated_at is distinct from expected_draft_updated_at then
    raise exception 'manual draft changed concurrently';
  end if;

  update public.manual_revisions mr
  set title = draft_title,
      description = coalesce(draft_description, ''),
      updated_at = clock_timestamp()
  where mr.id = target_draft_revision_id
    and mr.manual_id = target_manual_id
    and mr.workspace_id = target_workspace_id
    and mr.state = 'draft';

  if not found then
    raise exception 'draft revision not found';
  end if;

  update public.manuals
  set title = draft_title
  where id = target_manual_id
    and workspace_id = target_workspace_id
    and current_draft_revision_id = target_draft_revision_id;

  if not found then
    raise exception 'current draft revision changed';
  end if;

  return target_draft_revision_id;
end;
$$;

-- All API-supported manual and revision writes use SECURITY DEFINER RPCs.
revoke insert, update, delete on table public.manuals from authenticated;
revoke insert, update, delete on table public.manual_revisions from authenticated;

revoke all on function public.update_manual_draft(uuid, uuid, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.update_manual_draft(uuid, uuid, timestamptz, text, text) to authenticated;
