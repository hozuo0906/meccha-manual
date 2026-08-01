-- Phase 2 fix: allow create_manual RPC to set the initial draft revision pointer.
-- This is needed for databases that already applied 202608020001_phase2_manual_core.sql.

create or replace function public.create_manual(
  target_workspace_id uuid,
  target_folder_id uuid,
  manual_title text,
  manual_description text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  new_manual_id uuid;
  new_revision_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication required';
  end if;

  if not public.has_workspace_role(
    target_workspace_id,
    actor_id,
    array['owner', 'admin', 'editor']::public.workspace_role[]
  ) then
    raise exception 'workspace editor role required';
  end if;

  if target_folder_id is not null
    and not exists (
      select 1
      from public.folders f
      where f.id = target_folder_id
        and f.workspace_id = target_workspace_id
        and f.archived_at is null
    )
  then
    raise exception 'folder not found in workspace';
  end if;

  insert into public.manuals (
    workspace_id,
    folder_id,
    title,
    status,
    owner_id,
    created_by
  )
  values (
    target_workspace_id,
    target_folder_id,
    manual_title,
    'draft',
    actor_id,
    actor_id
  )
  returning id into new_manual_id;

  insert into public.manual_revisions (
    workspace_id,
    manual_id,
    revision_no,
    state,
    title,
    description,
    created_by
  )
  values (
    target_workspace_id,
    new_manual_id,
    1,
    'draft',
    manual_title,
    coalesce(manual_description, ''),
    actor_id
  )
  returning id into new_revision_id;

  perform set_config('app.manual_publish_context', 'on', true);

  update public.manuals
  set current_draft_revision_id = new_revision_id
  where id = new_manual_id;

  return new_manual_id;
end;
$$;

revoke all on function public.create_manual(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_manual(uuid, uuid, text, text) to authenticated;
