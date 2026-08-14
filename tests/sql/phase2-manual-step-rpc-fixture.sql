\set ON_ERROR_STOP on

create extension if not exists pgcrypto;

create role anon nologin;
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
create type public.manual_revision_state as enum ('draft', 'published', 'superseded');
create type public.manual_step_type as enum ('action', 'note', 'decision', 'warning');
create type public.manual_action_type as enum ('click', 'input', 'select', 'navigate', 'wait', 'other');

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
  archived_at timestamptz
);

create table public.manual_revisions (
  id uuid primary key,
  workspace_id uuid not null,
  manual_id uuid not null references public.manuals(id),
  state public.manual_revision_state not null
);

create table public.manual_steps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  revision_id uuid not null references public.manual_revisions(id),
  position integer not null,
  type public.manual_step_type not null,
  title text not null,
  instruction text not null default '',
  action_type public.manual_action_type,
  target_text text,
  url text,
  asset_id uuid,
  annotation jsonb not null default '{}'::jsonb,
  masking jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  deleted_at timestamptz
);

create unique index manual_steps_revision_position_active
  on public.manual_steps (revision_id, position)
  where deleted_at is null;

alter table public.workspace_members enable row level security;
alter table public.manuals enable row level security;
alter table public.manual_revisions enable row level security;
alter table public.manual_steps enable row level security;

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

create policy manual_steps_select_member
on public.manual_steps
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = manual_steps.workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
  )
);

-- Mirror the pre-forward-migration state: authenticated originally had direct step DML.
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function public.has_workspace_role(uuid, uuid, public.workspace_role[]) to authenticated;
grant select, insert, update, delete on table public.manual_steps to authenticated;
grant select on table public.manuals, public.manual_revisions, public.workspace_members to authenticated;
