-- Phase 1: identity, workspaces, members, and RLS foundation.
-- This migration is safe to run in the Supabase SQL Editor for the first project setup.

create extension if not exists pgcrypto;

do $$
begin
  create type public.workspace_role as enum ('owner', 'admin', 'editor', 'viewer');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.workspace_status as enum ('active', 'suspended', 'deleted');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.workspace_member_status as enum ('active', 'invited', 'removed');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_path text,
  locale text not null default 'ja-JP',
  timezone text not null default 'Asia/Tokyo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_locale_ja_only check (locale = 'ja-JP'),
  constraint profiles_timezone_required check (length(trim(timezone)) > 0)
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  status public.workspace_status not null default 'active',
  settings jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_name_required check (length(trim(name)) > 0),
  constraint workspaces_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$')
);

create unique index if not exists workspaces_slug_unique
  on public.workspaces (lower(slug))
  where status <> 'deleted';

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.workspace_role not null,
  status public.workspace_member_status not null default 'active',
  joined_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user_id_idx
  on public.workspace_members (user_id);

create index if not exists workspace_members_workspace_active_idx
  on public.workspace_members (workspace_id, status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists workspaces_set_updated_at on public.workspaces;
create trigger workspaces_set_updated_at
before update on public.workspaces
for each row
execute function public.set_updated_at();

drop trigger if exists workspace_members_set_updated_at on public.workspace_members;
create trigger workspace_members_set_updated_at
before update on public.workspace_members
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, locale, timezone)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'user'
    ),
    'ja-JP',
    'Asia/Tokyo'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

create or replace function public.is_workspace_member(
  target_workspace_id uuid,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = target_user_id
      and wm.status = 'active'
  );
$$;

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
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = target_user_id
      and wm.status = 'active'
      and wm.role = any(allowed_roles)
  );
$$;

create or replace function public.protect_workspace_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.role = 'owner'
      and exists (
        select 1
        from public.workspace_members wm
        where wm.workspace_id = new.workspace_id
          and wm.role = 'owner'
          and wm.status = 'active'
      )
    then
      raise exception 'workspace already has an active owner';
    end if;

    if new.status = 'active' and new.joined_at is null then
      new.joined_at = now();
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.role = 'owner' and new.role <> 'owner' then
      raise exception 'owner role changes require a dedicated transfer flow';
    end if;

    if old.role = 'owner'
      and old.status = 'active'
      and new.status <> 'active'
      and not exists (
        select 1
        from public.workspace_members wm
        where wm.workspace_id = old.workspace_id
          and wm.user_id <> old.user_id
          and wm.role = 'owner'
          and wm.status = 'active'
      )
    then
      raise exception 'workspace must keep at least one active owner';
    end if;

    if new.status = 'active' and new.joined_at is null then
      new.joined_at = now();
    end if;

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists workspace_members_protect_owner on public.workspace_members;
create trigger workspace_members_protect_owner
before insert or update on public.workspace_members
for each row
execute function public.protect_workspace_owner_membership();

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
  new_workspace_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication required';
  end if;

  insert into public.workspaces (name, slug, created_by)
  values (workspace_name, lower(workspace_slug), actor_id)
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role, status, created_by)
  values (new_workspace_id, actor_id, 'owner', 'active', actor_id);

  return new_workspace_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

drop policy if exists profiles_select_self_or_workspace_members on public.profiles;
create policy profiles_select_self_or_workspace_members
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.workspace_members viewer
    join public.workspace_members subject
      on subject.workspace_id = viewer.workspace_id
    where viewer.user_id = auth.uid()
      and viewer.status = 'active'
      and subject.user_id = profiles.id
      and subject.status = 'active'
  )
);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists workspaces_select_members on public.workspaces;
create policy workspaces_select_members
on public.workspaces
for select
to authenticated
using (
  status <> 'deleted'
  and public.is_workspace_member(id, auth.uid())
);

drop policy if exists workspaces_update_owner_admin on public.workspaces;
create policy workspaces_update_owner_admin
on public.workspaces
for update
to authenticated
using (
  status <> 'deleted'
  and public.has_workspace_role(id, auth.uid(), array['owner', 'admin']::public.workspace_role[])
)
with check (
  status <> 'deleted'
  and public.has_workspace_role(id, auth.uid(), array['owner', 'admin']::public.workspace_role[])
);

drop policy if exists workspace_members_select_workspace_members on public.workspace_members;
create policy workspace_members_select_workspace_members
on public.workspace_members
for select
to authenticated
using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists workspace_members_insert_owner_admin on public.workspace_members;
create policy workspace_members_insert_owner_admin
on public.workspace_members
for insert
to authenticated
with check (
  public.has_workspace_role(workspace_id, auth.uid(), array['owner', 'admin']::public.workspace_role[])
  and role <> 'owner'
);

drop policy if exists workspace_members_update_owner_admin on public.workspace_members;
create policy workspace_members_update_owner_admin
on public.workspace_members
for update
to authenticated
using (
  public.has_workspace_role(workspace_id, auth.uid(), array['owner', 'admin']::public.workspace_role[])
)
with check (
  public.has_workspace_role(workspace_id, auth.uid(), array['owner', 'admin']::public.workspace_role[])
  and role <> 'owner'
);

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.workspaces from anon, authenticated;
revoke all on table public.workspace_members from anon, authenticated;

grant select, insert, update on table public.profiles to authenticated;
grant select, update on table public.workspaces to authenticated;
grant select, insert, update on table public.workspace_members to authenticated;
grant execute on function public.create_workspace(text, text) to authenticated;
grant execute on function public.is_workspace_member(uuid, uuid) to authenticated;
grant execute on function public.has_workspace_role(uuid, uuid, public.workspace_role[]) to authenticated;
