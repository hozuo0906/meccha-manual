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

create or replace function public.update_manual_draft(
  target_manual_id uuid,
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
begin
  if actor_id is null then
    raise exception 'authentication required';
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

  update public.manual_revisions mr
  set title = draft_title,
      description = coalesce(draft_description, '')
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

revoke all on function public.update_manual_draft(uuid, text, text) from public, anon, authenticated;
grant execute on function public.update_manual_draft(uuid, text, text) to authenticated;
