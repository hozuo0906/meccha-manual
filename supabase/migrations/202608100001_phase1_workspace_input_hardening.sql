-- Phase 1 forward hardening: enforce the workspace input contract at the DB boundary.
-- This file is repository-only until an explicitly approved external migration run.

create or replace function public.normalize_workspace_name(workspace_name text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  select btrim(
    workspace_name,
    E' \t\n\r\f' || chr(11) || chr(160) || chr(5760) ||
    chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) ||
    chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) ||
    chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287) ||
    chr(12288) || chr(65279)
  );
$$;

alter table public.workspaces
  drop constraint if exists workspaces_name_length;

alter table public.workspaces
  add constraint workspaces_name_length
  check (
    name = public.normalize_workspace_name(name)
    and char_length(name) between 1 and 64
  )
  not valid;

alter table public.workspaces
  validate constraint workspaces_name_length;

create or replace function public.create_workspace(
  workspace_name text,
  workspace_slug text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  normalized_name text := public.normalize_workspace_name(workspace_name);
  normalized_slug text := lower(trim(workspace_slug));
  new_workspace_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication required';
  end if;

  if normalized_name is null or char_length(normalized_name) not between 1 and 64 then
    raise exception 'workspace name must be between 1 and 64 characters'
      using errcode = '22023';
  end if;

  if normalized_slug is null or normalized_slug !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' then
    raise exception 'workspace slug format is invalid'
      using errcode = '22023';
  end if;

  insert into public.workspaces (name, slug, created_by)
  values (normalized_name, normalized_slug, actor_id)
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role, status, created_by)
  values (new_workspace_id, actor_id, 'owner', 'active', actor_id);

  return new_workspace_id;
end;
$$;

revoke execute on function public.create_workspace(text, text) from public, anon;
grant execute on function public.create_workspace(text, text) to authenticated;
