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
  title text not null,
  status text not null default 'draft',
  current_draft_revision_id uuid,
  current_published_revision_id uuid,
  updated_at timestamptz not null default clock_timestamp(),
  archived_at timestamptz
);

create table public.manual_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  manual_id uuid not null references public.manuals(id),
  revision_no integer not null default 1,
  state public.manual_revision_state not null,
  title text not null,
  description text not null default '',
  source_url text,
  cover_asset_id uuid,
  created_by uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  published_at timestamptz
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
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, actor_id uuid not null,
  action text not null, resource_type text not null, resource_id uuid not null,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create unique index manual_steps_revision_position_active
  on public.manual_steps (revision_id, position)
  where deleted_at is null;

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

alter table public.workspace_members enable row level security;
alter table public.manuals enable row level security;
alter table public.manual_revisions enable row level security;
alter table public.manual_steps enable row level security;

create policy workspace_members_select_self
on public.workspace_members
for select
to authenticated
using (user_id = auth.uid() and status = 'active');

create policy manuals_select_members
on public.manuals
for select
to authenticated
using (
  archived_at is null
  and exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = manuals.workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
  )
);

create policy manuals_write_editors
on public.manuals
for all
to authenticated
using (
  public.has_workspace_role(
    manuals.workspace_id,
    auth.uid(),
    array['owner', 'admin', 'editor']::public.workspace_role[]
  )
)
with check (
  public.has_workspace_role(
    manuals.workspace_id,
    auth.uid(),
    array['owner', 'admin', 'editor']::public.workspace_role[]
  )
);

create policy manual_revisions_select_members
on public.manual_revisions
for select
to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = manual_revisions.workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
  )
);

create policy manual_revisions_write_editors
on public.manual_revisions
for all
to authenticated
using (
  public.has_workspace_role(
    manual_revisions.workspace_id,
    auth.uid(),
    array['owner', 'admin', 'editor']::public.workspace_role[]
  )
)
with check (
  public.has_workspace_role(
    manual_revisions.workspace_id,
    auth.uid(),
    array['owner', 'admin', 'editor']::public.workspace_role[]
  )
);

create policy manual_steps_select_members
on public.manual_steps
for select
to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = manual_steps.workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
  )
);

create policy manual_steps_write_editors
on public.manual_steps
for all
to authenticated
using (
  public.has_workspace_role(
    manual_steps.workspace_id,
    auth.uid(),
    array['owner', 'admin', 'editor']::public.workspace_role[]
  )
)
with check (
  public.has_workspace_role(
    manual_steps.workspace_id,
    auth.uid(),
    array['owner', 'admin', 'editor']::public.workspace_role[]
  )
);

grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function public.has_workspace_role(uuid, uuid, public.workspace_role[]) to authenticated;
grant select, insert, update, delete on table public.manuals, public.manual_revisions, public.manual_steps to authenticated;
grant select on table public.workspace_members to authenticated;

insert into public.workspace_members (workspace_id, user_id, role)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'editor'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'viewer'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'editor');

insert into public.manuals (id, workspace_id, title, status, current_draft_revision_id, current_published_revision_id)
values
  ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '旧タイトル', 'draft', '44444444-4444-4444-8444-444444444444', null),
  ('55555555-5555-4555-8555-555555555555', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '公開済み手順', 'published', null, '88888888-8888-4888-8888-888888888888'),
  ('66666666-6666-4666-8666-666666666666', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '別領域', 'draft', '77777777-7777-4777-8777-777777777777', null);

insert into public.manual_revisions (id, workspace_id, manual_id, state, title, description, updated_at)
values
  ('44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'draft', '旧タイトル', '旧説明', '2026-08-14T00:00:01Z'),
  ('88888888-8888-4888-8888-888888888888', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '55555555-5555-4555-8555-555555555555', 'published', '公開済み手順', '', '2026-08-14T00:00:02Z'),
  ('77777777-7777-4777-8777-777777777777', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '66666666-6666-4666-8666-666666666666', 'draft', '別領域', '', '2026-08-14T00:00:03Z');
