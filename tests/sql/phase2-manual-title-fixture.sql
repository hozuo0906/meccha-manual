\set ON_ERROR_STOP on

create role authenticated nologin;
create schema auth;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create type public.workspace_role as enum ('owner', 'admin', 'editor', 'viewer');

create table public.workspace_members (
  workspace_id uuid not null,
  user_id uuid not null,
  role public.workspace_role not null,
  status text not null default 'active',
  primary key (workspace_id, user_id)
);

create table public.manuals (
  id uuid primary key,
  workspace_id uuid not null,
  title text not null,
  owner_id uuid not null,
  created_by uuid not null
);

create table public.manual_revisions (
  id uuid primary key,
  workspace_id uuid not null,
  manual_id uuid not null references public.manuals (id),
  title text not null,
  created_by uuid not null
);

create or replace function public.has_workspace_role(
  target_workspace_id uuid,
  target_user_id uuid,
  allowed_roles public.workspace_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_user_id = auth.uid()
    and exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = target_workspace_id
        and wm.user_id = target_user_id
        and wm.status = 'active'
        and wm.role = any(allowed_roles)
    );
$$;

alter table public.manuals enable row level security;
alter table public.manual_revisions enable row level security;

create policy manuals_select_members
on public.manuals
for select
to authenticated
using (
  public.has_workspace_role(
    workspace_id,
    auth.uid(),
    array['owner', 'admin', 'editor', 'viewer']::public.workspace_role[]
  )
);

create policy manuals_insert_editors
on public.manuals
for insert
to authenticated
with check (
  public.has_workspace_role(
    workspace_id,
    auth.uid(),
    array['owner', 'admin', 'editor']::public.workspace_role[]
  )
  and owner_id = auth.uid()
  and created_by = auth.uid()
);

create policy manuals_update_editors
on public.manuals
for update
to authenticated
using (
  public.has_workspace_role(
    workspace_id,
    auth.uid(),
    array['owner', 'admin', 'editor']::public.workspace_role[]
  )
)
with check (
  public.has_workspace_role(
    workspace_id,
    auth.uid(),
    array['owner', 'admin', 'editor']::public.workspace_role[]
  )
);

create policy manual_revisions_select_members
on public.manual_revisions
for select
to authenticated
using (
  public.has_workspace_role(
    workspace_id,
    auth.uid(),
    array['owner', 'admin', 'editor', 'viewer']::public.workspace_role[]
  )
);

create policy manual_revisions_insert_editors
on public.manual_revisions
for insert
to authenticated
with check (
  public.has_workspace_role(
    workspace_id,
    auth.uid(),
    array['owner', 'admin', 'editor']::public.workspace_role[]
  )
  and created_by = auth.uid()
);

create policy manual_revisions_update_editors
on public.manual_revisions
for update
to authenticated
using (
  public.has_workspace_role(
    workspace_id,
    auth.uid(),
    array['owner', 'admin', 'editor']::public.workspace_role[]
  )
)
with check (
  public.has_workspace_role(
    workspace_id,
    auth.uid(),
    array['owner', 'admin', 'editor']::public.workspace_role[]
  )
);

grant usage on schema public, auth to authenticated;
grant execute on function auth.uid() to authenticated;
grant execute on function public.has_workspace_role(uuid, uuid, public.workspace_role[]) to authenticated;
grant select, insert, update on table public.manuals, public.manual_revisions to authenticated;

insert into public.workspace_members (workspace_id, user_id, role, status)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'editor',
  'active'
);
