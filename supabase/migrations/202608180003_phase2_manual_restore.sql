-- Phase 2: non-destructive manual restore from archive (ADR-0042).

create or replace function public.restore_manual(
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
  previous_status text;
  restored_status public.manuals.status%type;
  archive_created_at timestamptz;
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

  if manual_workspace_id is null or manual_archived_at is null or manual_status_before <> 'archived' then
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
    raise exception 'manual restore changed concurrently';
  end if;

  select a.metadata->>'previousStatus', a.created_at
  into previous_status, archive_created_at
  from public.audit_logs a
  where a.workspace_id = target_workspace_id
    and a.resource_type = 'manual'
    and a.resource_id = target_manual_id
    and a.action = 'manual.archived'
  order by a.created_at desc, a.id desc
  limit 1;

  if previous_status is null or previous_status not in ('draft', 'reviewing', 'published', 'stale')
    or exists (
      select 1 from public.audit_logs a
      where a.workspace_id = target_workspace_id
        and a.resource_type = 'manual'
        and a.resource_id = target_manual_id
        and a.action = 'manual.archived'
        and a.created_at = archive_created_at
        and (a.metadata->>'previousStatus') is distinct from previous_status
    ) then
    raise exception 'manual restore state unknown';
  end if;
  restored_status := previous_status;

  perform set_config('app.manual_publish_context', 'on', true);

  update public.manuals
  set status = restored_status,
      archived_at = null
  where id = target_manual_id
    and workspace_id = target_workspace_id
    and archived_at is not null
    and status = 'archived'
    and updated_at = expected_manual_updated_at;
  if not found then
    raise exception 'manual restore changed concurrently';
  end if;

  insert into public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, metadata)
  values (
    manual_workspace_id,
    actor_id,
    'manual.restored',
    'manual',
    target_manual_id,
    jsonb_build_object(
      'restoredStatus', restored_status,
      'draftRevisionId', draft_revision_id,
      'publishedRevisionId', published_revision_id
    )
  );

  return target_manual_id;
end;
$$;

revoke all on function public.restore_manual(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.restore_manual(uuid, uuid, timestamptz) to authenticated;
