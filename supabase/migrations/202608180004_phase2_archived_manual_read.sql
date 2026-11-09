-- DEC-117: dedicated archived reads. Existing SELECT policies and normal RPC stay unchanged.
-- Definer reads require the caller's active workspace role; no caller-supplied actor is accepted.
create or replace function public.list_archived_manuals(target_workspace_id uuid)
returns table (
  id uuid, workspace_id uuid, folder_id uuid, title text, status text,
  current_draft_revision_id uuid, current_published_revision_id uuid,
  updated_at timestamptz, archived_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.workspace_id, m.folder_id, m.title, m.status::text,
    m.current_draft_revision_id, m.current_published_revision_id, m.updated_at, m.archived_at
  from public.manuals m
  where m.workspace_id = target_workspace_id
    and m.status = 'archived' and m.archived_at is not null
    and auth.uid() is not null
    and public.has_workspace_role(m.workspace_id, auth.uid(), array['owner', 'admin', 'editor', 'viewer']::public.workspace_role[])
  order by m.updated_at desc, m.id
  limit 1001;
$$;

revoke all on function public.list_archived_manuals(uuid) from public, anon, authenticated;
grant execute on function public.list_archived_manuals(uuid) to authenticated;

create or replace function public.get_archived_manual_detail(target_workspace_id uuid, target_manual_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'can_edit', public.has_workspace_role(m.workspace_id, auth.uid(), array['owner', 'admin', 'editor']::public.workspace_role[]),
    'manual', jsonb_build_object(
      'id', m.id, 'workspace_id', m.workspace_id, 'title', m.title, 'status', m.status, 'archived_at', m.archived_at,
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
          from public.manual_steps ms where ms.workspace_id = m.workspace_id and ms.revision_id = mr.id and ms.deleted_at is null
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
  where m.workspace_id = target_workspace_id and m.id = target_manual_id and m.status = 'archived' and m.archived_at is not null
    and auth.uid() is not null
    and public.has_workspace_role(m.workspace_id, auth.uid(), array['owner', 'admin', 'editor', 'viewer']::public.workspace_role[])
  limit 1;
$$;

revoke all on function public.get_archived_manual_detail(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_archived_manual_detail(uuid, uuid) to authenticated;

