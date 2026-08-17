-- Phase 2 manual editing: serialize every step mutation through the draft revision lock.
-- This migration is repository-only until an approved environment migration is executed.

create or replace function public.manual_step_url_is_valid(candidate text)
returns boolean
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  authority text;
  host text;
  port_text text;
begin
  if char_length(candidate) > 2048
    or candidate !~* '^https?://'
    or candidate ~ '[[:space:][:cntrl:]]'
  then
    return false;
  end if;

  authority := substring(candidate from '^https?://([^/?#]+)');
  if authority is null or authority = '' or authority like '%@%' or authority like '%\%%' then
    return false;
  end if;

  if authority like '[%' then
    if authority !~ '^\[[0-9A-Fa-f:.]+\](?::[0-9]{1,5})?$' then
      return false;
    end if;
    host := substring(authority from '^\[([^]]+)\]');
    begin
      if family(host::inet) <> 6 then return false; end if;
    exception when others then
      return false;
    end;
  else
    if authority like '%:%' and authority !~ '^[^:]+:[0-9]{1,5}$' then
      return false;
    end if;
    host := split_part(authority, ':', 1);
    if host = ''
      or host !~ '^[!-~]+$'
      or host <> translate(host, '#%/:<>?@[\]^|', '')
    then
      return false;
    end if;
    if host ~ '^[0-9.]*[0-9][0-9.]*$' then
      begin
        if family(host::inet) <> 4 then return false; end if;
      exception when others then
        return false;
      end;
    end if;
    if exists (
      select 1
      from unnest(string_to_array(lower(host), '.')) as hostname_label(label)
      where hostname_label.label like 'xn--%'
    ) then
      return false;
    end if;
  end if;

  port_text := substring(authority from ':([0-9]+)$');
  if port_text is not null and port_text::integer > 65535 then
    return false;
  end if;

  return true;
exception when others then
  return false;
end;
$$;

revoke all on function public.manual_step_url_is_valid(text) from public, anon, authenticated;

create or replace function public.append_manual_step(
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
  actor_id uuid := auth.uid();
  target_workspace_id uuid;
  next_position integer;
  new_step_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication required';
  end if;

  select mr.workspace_id
  into target_workspace_id
  from public.manual_revisions mr
  join public.manuals m on m.id = mr.manual_id
  where mr.id = target_revision_id
    and mr.state = 'draft'
    and m.archived_at is null
  for update of mr;

  if target_workspace_id is null then
    raise exception 'draft revision not found';
  end if;

  if not public.has_workspace_role(
    target_workspace_id,
    actor_id,
    array['owner', 'admin', 'editor']::public.workspace_role[]
  ) then
    raise exception 'workspace editor role required';
  end if;

  if step_asset_id is not null
    or coalesce(step_annotation, '{}'::jsonb) <> '{}'::jsonb
    or coalesce(step_masking, '{}'::jsonb) <> '{}'::jsonb
  then
    raise exception 'manual step internal fields are not accepted';
  end if;

  if step_type <> 'action'
    and (step_action_type is not null or step_target_text is not null)
  then
    raise exception 'non-action manual step cannot include action fields';
  end if;

  if step_url is not null and not public.manual_step_url_is_valid(step_url) then
    raise exception 'manual step url is invalid';
  end if;

  select coalesce(max(ms.position), -1) + 1
  into next_position
  from public.manual_steps ms
  where ms.revision_id = target_revision_id
    and ms.deleted_at is null;

  insert into public.manual_steps (
    workspace_id,
    revision_id,
    position,
    type,
    title,
    instruction,
    action_type,
    target_text,
    url,
    asset_id,
    annotation,
    masking,
    created_by
  )
  values (
    target_workspace_id,
    target_revision_id,
    next_position,
    step_type,
    step_title,
    coalesce(step_instruction, ''),
    step_action_type,
    step_target_text,
    step_url,
    step_asset_id,
    coalesce(step_annotation, '{}'::jsonb),
    coalesce(step_masking, '{}'::jsonb),
    actor_id
  )
  returning id into new_step_id;

  return new_step_id;
end;
$$;

create or replace function public.update_manual_step(
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
declare
  actor_id uuid := auth.uid();
  target_workspace_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication required';
  end if;

  if expected_step_updated_at is null then
    raise exception 'expected step updated_at is required';
  end if;

  select mr.workspace_id
  into target_workspace_id
  from public.manual_revisions mr
  join public.manuals m on m.id = mr.manual_id
  where mr.id = target_revision_id
    and mr.state = 'draft'
    and m.archived_at is null
  for update of mr;

  if target_workspace_id is null then
    raise exception 'draft revision not found';
  end if;

  if not public.has_workspace_role(
    target_workspace_id,
    actor_id,
    array['owner', 'admin', 'editor']::public.workspace_role[]
  ) then
    raise exception 'workspace editor role required';
  end if;

  if step_asset_id is not null
    or coalesce(step_annotation, '{}'::jsonb) <> '{}'::jsonb
    or coalesce(step_masking, '{}'::jsonb) <> '{}'::jsonb
  then
    raise exception 'manual step internal fields are not accepted';
  end if;

  if step_type <> 'action'
    and (step_action_type is not null or step_target_text is not null)
  then
    raise exception 'non-action manual step cannot include action fields';
  end if;

  if step_url is not null and not public.manual_step_url_is_valid(step_url) then
    raise exception 'manual step url is invalid';
  end if;

  update public.manual_steps ms
  set type = step_type,
      title = step_title,
      instruction = coalesce(step_instruction, ''),
      action_type = step_action_type,
      target_text = step_target_text,
      url = step_url,
      updated_at = clock_timestamp()
  where ms.id = target_step_id
    and ms.revision_id = target_revision_id
    and ms.workspace_id = target_workspace_id
    and ms.deleted_at is null
    and ms.updated_at = expected_step_updated_at;

  if not found then
    if exists (
      select 1
      from public.manual_steps ms
      where ms.id = target_step_id
        and ms.revision_id = target_revision_id
        and ms.workspace_id = target_workspace_id
        and ms.deleted_at is null
    ) then
      raise exception 'manual step changed concurrently';
    end if;
    raise exception 'active manual step not found';
  end if;
end;
$$;

create or replace function public.soft_delete_manual_step(
  target_revision_id uuid,
  target_step_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_workspace_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication required';
  end if;

  select mr.workspace_id
  into target_workspace_id
  from public.manual_revisions mr
  join public.manuals m on m.id = mr.manual_id
  where mr.id = target_revision_id
    and mr.state = 'draft'
    and m.archived_at is null
  for update of mr;

  if target_workspace_id is null then
    raise exception 'draft revision not found';
  end if;

  if not public.has_workspace_role(
    target_workspace_id,
    actor_id,
    array['owner', 'admin', 'editor']::public.workspace_role[]
  ) then
    raise exception 'workspace editor role required';
  end if;

  update public.manual_steps
  set deleted_at = now()
  where id = target_step_id
    and revision_id = target_revision_id
    and workspace_id = target_workspace_id
    and deleted_at is null;

  if not found then
    raise exception 'active manual step not found';
  end if;
end;
$$;

create or replace function public.reorder_manual_steps(
  target_revision_id uuid,
  ordered_step_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_workspace_id uuid;
  active_step_count integer;
  max_position integer;
  temporary_base bigint;
begin
  if actor_id is null then
    raise exception 'authentication required';
  end if;

  if ordered_step_ids is null then
    raise exception 'ordered step ids are required';
  end if;

  select mr.workspace_id
  into target_workspace_id
  from public.manual_revisions mr
  join public.manuals m on m.id = mr.manual_id
  where mr.id = target_revision_id
    and mr.state = 'draft'
    and m.archived_at is null
  for update of mr;

  if target_workspace_id is null then
    raise exception 'draft revision not found';
  end if;

  if not public.has_workspace_role(
    target_workspace_id,
    actor_id,
    array['owner', 'admin', 'editor']::public.workspace_role[]
  ) then
    raise exception 'workspace editor role required';
  end if;

  select count(*), coalesce(max(ms.position), -1)
  into active_step_count, max_position
  from public.manual_steps ms
  where ms.revision_id = target_revision_id
    and ms.deleted_at is null;

  if active_step_count <> cardinality(ordered_step_ids) then
    raise exception 'ordered step ids must contain every active step exactly once';
  end if;

  if exists (
    select 1
    from unnest(ordered_step_ids) as requested(step_id)
    group by requested.step_id
    having count(*) <> 1
  ) then
    raise exception 'ordered step ids must not contain duplicates';
  end if;

  if exists (
    select 1
    from unnest(ordered_step_ids) as requested(step_id)
    left join public.manual_steps ms
      on ms.id = requested.step_id
     and ms.revision_id = target_revision_id
     and ms.workspace_id = target_workspace_id
     and ms.deleted_at is null
    where ms.id is null
  ) then
    raise exception 'ordered step ids contain an invalid step';
  end if;

  temporary_base := max_position::bigint + active_step_count::bigint + 1;
  if temporary_base + active_step_count::bigint > 2147483647 then
    raise exception 'manual step positions exceed supported range';
  end if;

  update public.manual_steps ms
  set position = temporary_base::integer + requested.ordinality::integer
  from unnest(ordered_step_ids) with ordinality as requested(step_id, ordinality)
  where ms.id = requested.step_id
    and ms.revision_id = target_revision_id
    and ms.workspace_id = target_workspace_id
    and ms.deleted_at is null;

  if not found and active_step_count > 0 then
    raise exception 'manual step reorder changed concurrently';
  end if;

  update public.manual_steps ms
  set position = requested.ordinality::integer - 1
  from unnest(ordered_step_ids) with ordinality as requested(step_id, ordinality)
  where ms.id = requested.step_id
    and ms.revision_id = target_revision_id
    and ms.workspace_id = target_workspace_id
    and ms.deleted_at is null;

  if not found and active_step_count > 0 then
    raise exception 'manual step reorder changed concurrently';
  end if;
end;
$$;

-- All API-supported step writes must acquire the same revision-first lock above.
revoke insert, update, delete on table public.manual_steps from authenticated;

revoke all on function public.append_manual_step(
  uuid,
  public.manual_step_type,
  text,
  text,
  public.manual_action_type,
  text,
  text,
  uuid,
  jsonb,
  jsonb
) from public, anon, authenticated;
revoke all on function public.update_manual_step(
  uuid,
  uuid,
  timestamptz,
  public.manual_step_type,
  text,
  text,
  public.manual_action_type,
  text,
  text,
  uuid,
  jsonb,
  jsonb
) from public, anon, authenticated;
revoke all on function public.soft_delete_manual_step(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reorder_manual_steps(uuid, uuid[]) from public, anon, authenticated;

grant execute on function public.append_manual_step(
  uuid,
  public.manual_step_type,
  text,
  text,
  public.manual_action_type,
  text,
  text,
  uuid,
  jsonb,
  jsonb
) to authenticated;
grant execute on function public.update_manual_step(
  uuid,
  uuid,
  timestamptz,
  public.manual_step_type,
  text,
  text,
  public.manual_action_type,
  text,
  text,
  uuid,
  jsonb,
  jsonb
) to authenticated;
grant execute on function public.soft_delete_manual_step(uuid, uuid) to authenticated;
grant execute on function public.reorder_manual_steps(uuid, uuid[]) to authenticated;
