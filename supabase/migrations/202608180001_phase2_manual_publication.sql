-- Phase 2: optimistic publication and next-draft creation boundaries.

create or replace function public.publish_manual_revision(
  target_manual_id uuid,
  expected_draft_revision_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_workspace_id uuid;
  draft_revision_id uuid;
  old_published_revision_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication required';
  end if;
  if expected_draft_revision_id is null then
    raise exception 'expected draft revision required';
  end if;

  select m.workspace_id, m.current_draft_revision_id, m.current_published_revision_id
  into target_workspace_id, draft_revision_id, old_published_revision_id
  from public.manuals m
  where m.id = target_manual_id
    and m.archived_at is null
  for update of m;

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
  if draft_revision_id is distinct from expected_draft_revision_id then
    raise exception 'manual publication draft changed concurrently';
  end if;

  perform set_config('app.manual_publish_context', 'on', true);

  if old_published_revision_id is not null then
    update public.manual_revisions
    set state = 'superseded'
    where id = old_published_revision_id
      and manual_id = target_manual_id
      and state = 'published';
    if not found then
      raise exception 'manual publication pointer changed concurrently';
    end if;
  end if;

  update public.manual_revisions
  set state = 'published',
      published_at = now()
  where id = expected_draft_revision_id
    and manual_id = target_manual_id
    and workspace_id = target_workspace_id
    and state = 'draft';
  if not found then
    raise exception 'draft revision is not publishable';
  end if;

  update public.manuals
  set status = 'published',
      current_published_revision_id = expected_draft_revision_id,
      current_draft_revision_id = null
  where id = target_manual_id
    and current_draft_revision_id = expected_draft_revision_id;
  if not found then
    raise exception 'manual publication draft changed concurrently';
  end if;

  return expected_draft_revision_id;
end;
$$;

create or replace function public.create_manual_draft_from_published(
  target_manual_id uuid,
  expected_published_revision_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_workspace_id uuid;
  published_revision_id uuid;
  existing_draft_revision_id uuid;
  next_revision_no integer;
  new_revision_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication required';
  end if;
  if expected_published_revision_id is null then
    raise exception 'expected published revision required';
  end if;

  select m.workspace_id, m.current_published_revision_id, m.current_draft_revision_id
  into target_workspace_id, published_revision_id, existing_draft_revision_id
  from public.manuals m
  where m.id = target_manual_id
    and m.archived_at is null
  for update of m;

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
  if published_revision_id is distinct from expected_published_revision_id then
    raise exception 'manual draft source changed concurrently';
  end if;
  if existing_draft_revision_id is not null then
    return existing_draft_revision_id;
  end if;

  select coalesce(max(revision_no), 0) + 1
  into next_revision_no
  from public.manual_revisions
  where manual_id = target_manual_id;

  insert into public.manual_revisions (
    workspace_id, manual_id, revision_no, state, title, description,
    source_url, cover_asset_id, created_by
  )
  select
    mr.workspace_id, mr.manual_id, next_revision_no, 'draft', mr.title, mr.description,
    mr.source_url, mr.cover_asset_id, actor_id
  from public.manual_revisions mr
  where mr.id = expected_published_revision_id
    and mr.manual_id = target_manual_id
    and mr.workspace_id = target_workspace_id
    and mr.state = 'published'
  returning id into new_revision_id;

  if new_revision_id is null then
    raise exception 'published revision not found';
  end if;

  insert into public.manual_steps (
    workspace_id, revision_id, position, type, title, instruction,
    action_type, target_text, url, asset_id, annotation, masking, created_by
  )
  select
    ms.workspace_id, new_revision_id, ms.position, ms.type, ms.title, ms.instruction,
    ms.action_type, ms.target_text, ms.url, ms.asset_id, ms.annotation, ms.masking, actor_id
  from public.manual_steps ms
  where ms.revision_id = expected_published_revision_id
    and ms.workspace_id = target_workspace_id
    and ms.deleted_at is null
  order by ms.position;

  perform set_config('app.manual_publish_context', 'on', true);

  update public.manuals
  set current_draft_revision_id = new_revision_id,
      status = 'draft'
  where id = target_manual_id
    and current_published_revision_id = expected_published_revision_id
    and current_draft_revision_id is null;
  if not found then
    raise exception 'manual draft source changed concurrently';
  end if;

  return new_revision_id;
end;
$$;

do $$
begin
  if to_regprocedure('public.publish_manual(uuid)') is not null then
    revoke all on function public.publish_manual(uuid) from authenticated;
  end if;
  if to_regprocedure('public.create_manual_draft(uuid)') is not null then
    revoke all on function public.create_manual_draft(uuid) from authenticated;
  end if;
end $$;
revoke all on function public.publish_manual_revision(uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_manual_draft_from_published(uuid, uuid) from public, anon, authenticated;
grant execute on function public.publish_manual_revision(uuid, uuid) to authenticated;
grant execute on function public.create_manual_draft_from_published(uuid, uuid) to authenticated;
