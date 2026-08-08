-- Phase 1 hardening: keep tenant identity and audit ownership immutable.
-- This timestamp deliberately precedes every Phase 2 migration.

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
  select target_user_id = auth.uid()
    and exists (
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

create or replace function public.protect_workspace_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id is distinct from old.id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'workspace identity and creation audit fields are immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists workspaces_protect_identity on public.workspaces;
create trigger workspaces_protect_identity
before update on public.workspaces
for each row
execute function public.protect_workspace_identity();

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
    if new.workspace_id is distinct from old.workspace_id
      or new.user_id is distinct from old.user_id
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception 'workspace membership identity and creation audit fields are immutable';
    end if;

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

revoke execute on function public.create_workspace(text, text) from public, anon;
revoke execute on function public.is_workspace_member(uuid, uuid) from public, anon;
revoke execute on function public.has_workspace_role(uuid, uuid, public.workspace_role[]) from public, anon;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_workspace_identity() from public, anon, authenticated;
revoke execute on function public.protect_workspace_owner_membership() from public, anon, authenticated;

grant execute on function public.create_workspace(text, text) to authenticated;
grant execute on function public.is_workspace_member(uuid, uuid) to authenticated;
grant execute on function public.has_workspace_role(uuid, uuid, public.workspace_role[]) to authenticated;
