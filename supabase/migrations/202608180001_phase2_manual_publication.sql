-- Phase 2: optimistic publication and next-draft creation boundaries.

create or replace function public.get_manual_edit_detail(target_workspace_id uuid, target_manual_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'can_edit', public.has_workspace_role(m.workspace_id, auth.uid(), array['owner', 'admin', 'editor']::public.workspace_role[]),
    'manual', jsonb_build_object(
      'id', m.id, 'workspace_id', m.workspace_id, 'title', m.title, 'status', m.status,
      'current_draft_revision_id', m.current_draft_revision_id,
      'current_published_revision_id', m.current_published_revision_id, 'updated_at', m.updated_at
    ),
    'draft', (
      select jsonb_build_object(
        'id', mr.id, 'workspace_id', mr.workspace_id, 'manual_id', mr.manual_id,
        'revision_no', mr.revision_no, 'state', mr.state, 'title', mr.title,
        'description', mr.description, 'updated_at', mr.updated_at,
        'content_version', md5(mr.updated_at::text || '|' || coalesce((
          select string_agg(ms.id::text || ':' || ms.updated_at::text, ',' order by ms.position)
          from public.manual_steps ms where ms.revision_id = mr.id and ms.deleted_at is null
        ), ''))
      )
      from public.manual_revisions mr
      where mr.id = coalesce(m.current_draft_revision_id, m.current_published_revision_id)
        and mr.workspace_id = m.workspace_id and mr.manual_id = m.id
        and ((m.current_draft_revision_id is null and mr.state = 'published')
          or (m.current_draft_revision_id is not null and mr.state = 'draft'))
    ),
    'steps', (
      select coalesce(jsonb_agg(to_jsonb(detail_step) order by detail_step.position), '[]'::jsonb)
      from (
        select ms.id, ms.workspace_id, ms.revision_id, ms.position, ms.type, ms.title,
          ms.instruction, ms.action_type, ms.target_text, ms.url, ms.updated_at
        from public.manual_steps ms
        where ms.workspace_id = m.workspace_id
          and ms.revision_id = coalesce(m.current_draft_revision_id, m.current_published_revision_id)
          and ms.deleted_at is null
        order by ms.position limit 201
      ) detail_step
    )
  )
  from public.manuals m
  where m.workspace_id = target_workspace_id and m.id = target_manual_id and m.archived_at is null
  limit 1;
$$;

revoke all on function public.get_manual_edit_detail(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_manual_edit_detail(uuid, uuid) to authenticated;

create or replace function public.publish_manual_revision(
  target_manual_id uuid,
  expected_draft_revision_id uuid,
  expected_content_version text,
  confirmed_sensitive_data_review boolean
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
  current_content_version text;
begin
  if actor_id is null then
    raise exception 'authentication required';
  end if;
  if expected_draft_revision_id is null then
    raise exception 'expected draft revision required';
  end if;
  if expected_content_version is null or expected_content_version = '' then
    raise exception 'expected content version required';
  end if;
  if confirmed_sensitive_data_review is not true then
    raise exception 'sensitive data review confirmation required';
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

  perform 1 from public.manual_revisions mr
  where mr.id = expected_draft_revision_id and mr.manual_id = target_manual_id and mr.state = 'draft'
  for update;
  if not found then raise exception 'draft revision is not publishable'; end if;

  select md5(mr.updated_at::text || '|' || coalesce((
    select string_agg(ms.id::text || ':' || ms.updated_at::text, ',' order by ms.position)
    from public.manual_steps ms
    where ms.revision_id = mr.id and ms.deleted_at is null
  ), ''))
  into current_content_version
  from public.manual_revisions mr
  where mr.id = expected_draft_revision_id and mr.state = 'draft';
  if current_content_version is distinct from expected_content_version then
    raise exception 'manual publication content changed concurrently';
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

  insert into public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, metadata)
  values (
    target_workspace_id, actor_id, 'manual.published', 'manual', target_manual_id,
    jsonb_build_object('revisionId', expected_draft_revision_id)
  );

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
revoke all on function public.publish_manual_revision(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.create_manual_draft_from_published(uuid, uuid) from public, anon, authenticated;
grant execute on function public.publish_manual_revision(uuid, uuid, text, boolean) to authenticated;
grant execute on function public.create_manual_draft_from_published(uuid, uuid) to authenticated;
