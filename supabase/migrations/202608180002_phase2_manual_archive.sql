-- Phase 2: non-destructive manual archive boundary.

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
