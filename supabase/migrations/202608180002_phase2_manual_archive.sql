-- Phase 2: non-destructive manual archive boundary.

-- Step mutations previously locked only the draft revision. Wrap every public step
-- RPC so it locks the owning manual first and advances the archive version after a
-- successful content change. Archive, publication, draft metadata, and step writes
-- now share the manual -> revision lock order.
alter function public.append_manual_step(
  uuid, public.manual_step_type, text, text, public.manual_action_type,
  text, text, uuid, jsonb, jsonb
) rename to append_manual_step_archive_impl;
alter function public.update_manual_step(
  uuid, uuid, timestamptz, public.manual_step_type, text, text,
  public.manual_action_type, text, text, uuid, jsonb, jsonb
) rename to update_manual_step_archive_impl;
alter function public.soft_delete_manual_step(uuid, uuid)
  rename to soft_delete_manual_step_archive_impl;
alter function public.reorder_manual_steps(uuid, uuid[])
  rename to reorder_manual_steps_archive_impl;

revoke all on function public.append_manual_step_archive_impl(
  uuid, public.manual_step_type, text, text, public.manual_action_type,
  text, text, uuid, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.update_manual_step_archive_impl(
  uuid, uuid, timestamptz, public.manual_step_type, text, text,
  public.manual_action_type, text, text, uuid, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.soft_delete_manual_step_archive_impl(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.reorder_manual_steps_archive_impl(uuid, uuid[])
  from public, anon, authenticated;

create function public.append_manual_step(
  target_revision_id uuid,
  step_type public.manual_step_type,
  step_title text,
  step_instruction text default '',
  step_action_type public.manual_action_type default null,
  step_target_text text default null,
  step_url text default null,
  step_asset_id uuid default null,
  step_annotation jsonb default '{}'::jsonb,
  step_masking jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_manual_id uuid;
  new_step_id uuid;
begin
  select m.id into target_manual_id
  from public.manual_revisions mr
  join public.manuals m on m.id = mr.manual_id
  where mr.id = target_revision_id and m.archived_at is null
  for update of m;
  if target_manual_id is null then raise exception 'draft revision not found'; end if;

  new_step_id := public.append_manual_step_archive_impl(
    target_revision_id, step_type, step_title, step_instruction, step_action_type,
    step_target_text, step_url, step_asset_id, step_annotation, step_masking
  );
  update public.manuals set updated_at = clock_timestamp() where id = target_manual_id;
  return new_step_id;
end;
$$;

create function public.update_manual_step(
  target_revision_id uuid,
  target_step_id uuid,
  expected_step_updated_at timestamptz,
  step_type public.manual_step_type,
  step_title text,
  step_instruction text,
  step_action_type public.manual_action_type,
  step_target_text text,
  step_url text,
  step_asset_id uuid,
  step_annotation jsonb,
  step_masking jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare target_manual_id uuid;
begin
  select m.id into target_manual_id
  from public.manual_revisions mr
  join public.manuals m on m.id = mr.manual_id
  where mr.id = target_revision_id and m.archived_at is null
  for update of m;
  if target_manual_id is null then raise exception 'draft revision not found'; end if;

  perform public.update_manual_step_archive_impl(
    target_revision_id, target_step_id, expected_step_updated_at, step_type,
    step_title, step_instruction, step_action_type, step_target_text, step_url,
    step_asset_id, step_annotation, step_masking
  );
  update public.manuals set updated_at = clock_timestamp() where id = target_manual_id;
end;
$$;

create function public.soft_delete_manual_step(target_revision_id uuid, target_step_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare target_manual_id uuid;
begin
  select m.id into target_manual_id
  from public.manual_revisions mr
  join public.manuals m on m.id = mr.manual_id
  where mr.id = target_revision_id and m.archived_at is null
  for update of m;
  if target_manual_id is null then raise exception 'draft revision not found'; end if;

  perform public.soft_delete_manual_step_archive_impl(target_revision_id, target_step_id);
  update public.manuals set updated_at = clock_timestamp() where id = target_manual_id;
end;
$$;

create function public.reorder_manual_steps(target_revision_id uuid, ordered_step_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare target_manual_id uuid;
begin
  select m.id into target_manual_id
  from public.manual_revisions mr
  join public.manuals m on m.id = mr.manual_id
  where mr.id = target_revision_id and m.archived_at is null
  for update of m;
  if target_manual_id is null then raise exception 'draft revision not found'; end if;

  perform public.reorder_manual_steps_archive_impl(target_revision_id, ordered_step_ids);
  update public.manuals set updated_at = clock_timestamp() where id = target_manual_id;
end;
$$;

revoke all on function public.append_manual_step(
  uuid, public.manual_step_type, text, text, public.manual_action_type,
  text, text, uuid, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.update_manual_step(
  uuid, uuid, timestamptz, public.manual_step_type, text, text,
  public.manual_action_type, text, text, uuid, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.soft_delete_manual_step(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reorder_manual_steps(uuid, uuid[]) from public, anon, authenticated;

grant execute on function public.append_manual_step(
  uuid, public.manual_step_type, text, text, public.manual_action_type,
  text, text, uuid, jsonb, jsonb
) to authenticated;
grant execute on function public.update_manual_step(
  uuid, uuid, timestamptz, public.manual_step_type, text, text,
  public.manual_action_type, text, text, uuid, jsonb, jsonb
) to authenticated;
grant execute on function public.soft_delete_manual_step(uuid, uuid) to authenticated;
grant execute on function public.reorder_manual_steps(uuid, uuid[]) to authenticated;

create or replace function public.archive_manual(
  target_workspace_id uuid,
  target_manual_id uuid,
  expected_manual_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  manual_workspace_id uuid;
  manual_status_before public.manuals.status%type;
  draft_revision_id uuid;
  published_revision_id uuid;
  manual_updated_at timestamptz;
  manual_archived_at timestamptz;
begin
  if actor_id is null then
    raise exception 'authentication required';
  end if;
  if target_workspace_id is null or target_manual_id is null then
    raise exception 'manual not found';
  end if;
  if expected_manual_updated_at is null then
    raise exception 'expected manual updated at required';
  end if;

  select m.workspace_id, m.status, m.current_draft_revision_id,
    m.current_published_revision_id, m.updated_at, m.archived_at
  into manual_workspace_id, manual_status_before, draft_revision_id,
    published_revision_id, manual_updated_at, manual_archived_at
  from public.manuals m
  where m.id = target_manual_id
    and m.workspace_id = target_workspace_id
  for update of m;

  if manual_workspace_id is null or manual_archived_at is not null then
    raise exception 'manual not found';
  end if;
  if not public.has_workspace_role(
    manual_workspace_id,
    actor_id,
    array['owner', 'admin', 'editor']::public.workspace_role[]
  ) then
    raise exception 'workspace editor role required';
  end if;
  if manual_updated_at is distinct from expected_manual_updated_at then
    raise exception 'manual archive changed concurrently';
  end if;

  -- The existing lifecycle trigger protects status changes behind a transaction-local
  -- trusted context. Archive preserves both revision pointers and revision contents.
  perform set_config('app.manual_publish_context', 'on', true);

  update public.manuals
  set status = 'archived',
      archived_at = clock_timestamp()
  where id = target_manual_id
    and workspace_id = target_workspace_id
    and archived_at is null
    and updated_at = expected_manual_updated_at;
  if not found then
    raise exception 'manual archive changed concurrently';
  end if;

  insert into public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, metadata)
  values (
    manual_workspace_id,
    actor_id,
    'manual.archived',
    'manual',
    target_manual_id,
    jsonb_build_object(
      'previousStatus', manual_status_before,
      'draftRevisionId', draft_revision_id,
      'publishedRevisionId', published_revision_id
    )
  );

  return target_manual_id;
end;
$$;

revoke all on function public.archive_manual(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.archive_manual(uuid, uuid, timestamptz) to authenticated;
