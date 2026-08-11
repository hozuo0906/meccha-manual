-- Phase 1 member management: bounded member reads, consent-based join codes,
-- role/status updates, and last-owner protection at the database boundary.
-- This file is repository-only until an explicitly approved external migration run.

-- A member name is shown together with up to 999 other names in one bounded RPC
-- response. PostgreSQL char_length/left count Unicode code points, so 64 keeps
-- Japanese names useful while keeping the complete JSON response below the Worker
-- limit even when every member uses four-byte characters.
update public.profiles
set display_name = left(public.normalize_workspace_name(display_name), 64)
where display_name is distinct from left(public.normalize_workspace_name(display_name), 64);

alter table public.profiles
  drop constraint if exists profiles_display_name_length;

alter table public.profiles
  add constraint profiles_display_name_length
  check (
    display_name = public.normalize_workspace_name(display_name)
    and char_length(display_name) between 0 and 64
  )
  not valid;

alter table public.profiles
  validate constraint profiles_display_name_length;

-- Keep future Auth sign-ups inside the same profile contract. The defensive
-- fallback also covers metadata made only of supported leading/trailing spaces.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_display_name text := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'user'
  );
  bounded_display_name text := left(public.normalize_workspace_name(requested_display_name), 64);
begin
  insert into public.profiles (id, display_name, locale, timezone)
  values (
    new.id,
    coalesce(nullif(bounded_display_name, ''), 'user'),
    'ja-JP',
    'Asia/Tokyo'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.protect_workspace_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_workspace_id uuid := case when tg_op = 'INSERT' then new.workspace_id else old.workspace_id end;
begin
  -- Every membership mutation takes the workspace row first. This gives all
  -- callers one lock order and prevents two admins updating each other from
  -- deadlocking on actor/target membership rows.
  perform 1
  from public.workspaces w
  where w.id = locked_workspace_id
  for update;

  if tg_op = 'INSERT' then
    if auth.uid() is null then
      raise exception 'authentication required';
    end if;

    new.created_by := auth.uid();

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

    if new.role = 'owner' and old.role <> 'owner' then
      raise exception 'owner role changes require a dedicated transfer flow';
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

  if tg_op = 'DELETE' then
    if old.role = 'owner'
      and old.status = 'active'
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

    return old;
  end if;

  return null;
end;
$$;

create table if not exists public.workspace_join_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_workspace_id uuid references public.workspaces (id),
  consumed_by uuid references auth.users (id),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint workspace_join_codes_hash_length check (octet_length(token_hash) = 32),
  constraint workspace_join_codes_consumption_complete check (
    (consumed_at is null and consumed_workspace_id is null and consumed_by is null)
    or
    (consumed_at is not null and consumed_workspace_id is not null and consumed_by is not null)
  )
);

drop index if exists public.workspace_join_codes_one_live_per_user;
drop index if exists public.workspace_join_codes_one_per_user;

-- Join codes are ephemeral credentials, not an issuance history. Keep only the
-- newest row if an earlier unreleased version of this migration created more than
-- one row, then enforce a hard one-row-per-user bound.
delete from public.workspace_join_codes older
using public.workspace_join_codes newer
where older.user_id = newer.user_id
  and (older.created_at, older.id) < (newer.created_at, newer.id);

create unique index workspace_join_codes_one_per_user
  on public.workspace_join_codes (user_id);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  actor_id uuid not null references auth.users (id),
  action text not null,
  resource_type text not null,
  resource_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);

alter table public.workspace_join_codes enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select_owner_admin on public.audit_logs;
create policy audit_logs_select_owner_admin
on public.audit_logs
for select
to authenticated
using (
  public.has_workspace_role(
    workspace_id,
    auth.uid(),
    array['owner', 'admin']::public.workspace_role[]
  )
);

drop trigger if exists workspace_members_protect_owner on public.workspace_members;
create trigger workspace_members_protect_owner
before insert or update or delete on public.workspace_members
for each row
execute function public.protect_workspace_owner_membership();

create or replace function public.list_workspace_members(target_workspace_id uuid)
returns table (
  user_id uuid,
  display_name text,
  role public.workspace_role,
  status public.workspace_member_status,
  joined_at timestamptz,
  actor_role public.workspace_role,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  actor_membership_role public.workspace_role;
  workspace_member_count bigint;
begin
  select wm.role
  into actor_membership_role
  from public.workspace_members wm
  join public.workspaces w on w.id = wm.workspace_id
  where wm.workspace_id = target_workspace_id
    and wm.user_id = actor_id
    and wm.status = 'active'
    and w.status = 'active';

  if actor_id is null or actor_membership_role is null then
    raise exception 'MM_WORKSPACE_MEMBERS_NOT_FOUND';
  end if;

  select count(*)
  into workspace_member_count
  from public.workspace_members wm
  where wm.workspace_id = target_workspace_id
    and wm.status = 'active';

  if workspace_member_count > 1000 then
    raise exception 'MM_WORKSPACE_MEMBERS_LIMIT_EXCEEDED';
  end if;

  return query
  select
    wm.user_id,
    left(coalesce(nullif(public.normalize_workspace_name(p.display_name), ''), '名前未設定'), 64) as display_name,
    wm.role,
    wm.status,
    wm.joined_at,
    actor_membership_role,
    workspace_member_count
  from public.workspace_members wm
  left join public.profiles p on p.id = wm.user_id
  where wm.workspace_id = target_workspace_id
    and wm.status = 'active'
  order by
    case wm.status when 'active' then 0 when 'invited' then 1 else 2 end,
    case wm.role when 'owner' then 0 when 'admin' then 1 when 'editor' then 2 else 3 end,
    lower(left(coalesce(nullif(public.normalize_workspace_name(p.display_name), ''), '名前未設定'), 64)),
    wm.user_id;
end;
$$;

create or replace function public.create_workspace_join_code()
returns table (
  join_code text,
  expires_at timestamptz
)
language plpgsql
security definer
-- Supabase normally installs pgcrypto in the trusted extensions schema, while a
-- plain PostgreSQL database may install it in public. Both locations are fixed.
set search_path = extensions, public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  random_bytes bytea;
  attempt integer;
begin
  if actor_id is null then
    raise exception 'MM_AUTHENTICATION_REQUIRED';
  end if;

  -- Serialize replacement codes for the same user without locking membership
  -- rows or exposing whether the user belongs to any workspace.
  perform 1
  from auth.users au
  where au.id = actor_id
  for update;

  for attempt in 1..5 loop
    random_bytes := gen_random_bytes(32);
    join_code := 'mmj_' || rtrim(translate(encode(random_bytes, 'base64'), '+/', '-_'), '=');
    expires_at := now() + interval '10 minutes';

    begin
      insert into public.workspace_join_codes (
        user_id,
        token_hash,
        expires_at,
        consumed_at,
        consumed_workspace_id,
        consumed_by,
        revoked_at,
        created_at
      )
      values (
        actor_id,
        digest(convert_to(join_code, 'UTF8'), 'sha256'),
        expires_at,
        null,
        null,
        null,
        null,
        now()
      )
      on conflict (user_id) do update
      set token_hash = excluded.token_hash,
          expires_at = excluded.expires_at,
          consumed_at = null,
          consumed_workspace_id = null,
          consumed_by = null,
          revoked_at = null,
          created_at = excluded.created_at;
      return next;
      return;
    exception
      when unique_violation then
        -- A digest collision is cryptographically implausible, but retrying keeps
        -- the function fail-closed without ever returning an unpersisted code.
        null;
    end;
  end loop;

  raise exception 'MM_JOIN_CODE_CREATE_FAILED';
end;
$$;

create or replace function public.redeem_workspace_join_code(
  target_workspace_id uuid,
  join_code text,
  target_role public.workspace_role
)
returns table (
  user_id uuid,
  display_name text,
  role public.workspace_role,
  status public.workspace_member_status,
  joined_at timestamptz
)
language plpgsql
security definer
set search_path = extensions, public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  actor_membership_role public.workspace_role;
  code_row public.workspace_join_codes%rowtype;
  previous_role public.workspace_role;
  previous_status public.workspace_member_status;
  active_member_count bigint;
  audit_action text;
begin
  -- Workspace is always the first lock for every membership mutation.
  perform 1
  from public.workspaces w
  where w.id = target_workspace_id
    and w.status = 'active'
  for update;

  select wm.role
  into actor_membership_role
  from public.workspace_members wm
  join public.workspaces w on w.id = wm.workspace_id
  where wm.workspace_id = target_workspace_id
    and wm.user_id = actor_id
    and wm.status = 'active'
    and w.status = 'active';

  if actor_id is null or actor_membership_role is null then
    raise exception 'MM_WORKSPACE_MEMBERS_NOT_FOUND';
  end if;

  if actor_membership_role not in ('owner', 'admin') then
    raise exception 'MM_MEMBER_MANAGE_FORBIDDEN';
  end if;

  if target_role not in ('admin', 'editor', 'viewer') then
    raise exception 'MM_OWNER_TRANSFER_REQUIRED';
  end if;

  if join_code is null or join_code !~ '^mmj_[A-Za-z0-9_-]{43}$' then
    raise exception 'MM_JOIN_CODE_UNAVAILABLE';
  end if;

  select jc.*
  into code_row
  from public.workspace_join_codes jc
  where jc.token_hash = digest(convert_to(join_code, 'UTF8'), 'sha256')
  for update;

  if code_row.id is null
    or code_row.consumed_at is not null
    or code_row.revoked_at is not null
    or code_row.expires_at <= now()
  then
    raise exception 'MM_JOIN_CODE_UNAVAILABLE';
  end if;

  select wm.role, wm.status
  into previous_role, previous_status
  from public.workspace_members wm
  where wm.workspace_id = target_workspace_id
    and wm.user_id = code_row.user_id
  for update;

  if not (
    previous_status is null
    or (previous_status = 'removed' and previous_role <> 'owner')
  ) then
    raise exception 'MM_JOIN_CODE_UNAVAILABLE';
  end if;

  select count(*)
  into active_member_count
  from public.workspace_members wm
  where wm.workspace_id = target_workspace_id
    and wm.status = 'active';

  if active_member_count >= 1000 then
    raise exception 'MM_WORKSPACE_MEMBERS_LIMIT_EXCEEDED';
  end if;

  if previous_status is null then
    insert into public.workspace_members (
      workspace_id,
      user_id,
      role,
      status,
      joined_at,
      created_by
    )
    values (
      target_workspace_id,
      code_row.user_id,
      target_role,
      'active',
      now(),
      actor_id
    );
    audit_action := 'workspace_member.added';
  else
    update public.workspace_members wm
    set role = target_role,
        status = 'active',
        joined_at = now()
    where wm.workspace_id = target_workspace_id
      and wm.user_id = code_row.user_id;
    audit_action := 'workspace_member.rejoined';
  end if;

  update public.workspace_join_codes
  set consumed_at = now(),
      consumed_workspace_id = target_workspace_id,
      consumed_by = actor_id
  where id = code_row.id;

  insert into public.audit_logs (
    workspace_id,
    actor_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    target_workspace_id,
    actor_id,
    audit_action,
    'workspace_member',
    code_row.user_id,
    jsonb_build_object(
      'oldRole', previous_role,
      'newRole', target_role,
      'oldStatus', previous_status,
      'newStatus', 'active'
    )
  );

  return query
  select
    wm.user_id,
    left(coalesce(nullif(public.normalize_workspace_name(p.display_name), ''), '名前未設定'), 64) as display_name,
    wm.role,
    wm.status,
    wm.joined_at
  from public.workspace_members wm
  left join public.profiles p on p.id = wm.user_id
  where wm.workspace_id = target_workspace_id
    and wm.user_id = code_row.user_id;
end;
$$;

create or replace function public.update_workspace_member(
  target_workspace_id uuid,
  target_user_id uuid,
  target_role public.workspace_role,
  target_status public.workspace_member_status
)
returns table (
  user_id uuid,
  display_name text,
  role public.workspace_role,
  status public.workspace_member_status,
  joined_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  actor_membership_role public.workspace_role;
  previous_role public.workspace_role;
  previous_status public.workspace_member_status;
begin
  perform 1
  from public.workspaces w
  where w.id = target_workspace_id
    and w.status = 'active'
  for update;

  select wm.role
  into actor_membership_role
  from public.workspace_members wm
  join public.workspaces w on w.id = wm.workspace_id
  where wm.workspace_id = target_workspace_id
    and wm.user_id = actor_id
    and wm.status = 'active'
    and w.status = 'active';

  if actor_id is null or actor_membership_role is null then
    raise exception 'MM_WORKSPACE_MEMBERS_NOT_FOUND';
  end if;

  if actor_membership_role not in ('owner', 'admin') then
    raise exception 'MM_MEMBER_MANAGE_FORBIDDEN';
  end if;

  if target_role not in ('admin', 'editor', 'viewer') then
    raise exception 'MM_OWNER_TRANSFER_REQUIRED';
  end if;

  if target_status not in ('active', 'removed') then
    raise exception 'MM_MEMBER_STATUS_INVALID';
  end if;

  select wm.role, wm.status
  into previous_role, previous_status
  from public.workspace_members wm
  where wm.workspace_id = target_workspace_id
    and wm.user_id = target_user_id
  for update;

  if previous_role is null then
    raise exception 'MM_MEMBER_UPDATE_UNAVAILABLE';
  end if;

  if previous_role = 'owner' then
    raise exception 'MM_OWNER_TRANSFER_REQUIRED';
  end if;

  if previous_status <> 'active' and target_status = 'active' then
    raise exception 'MM_MEMBER_UPDATE_UNAVAILABLE';
  end if;

  update public.workspace_members wm
  set
    role = target_role,
    status = target_status,
    joined_at = case
      when target_status = 'active' and wm.status <> 'active' then now()
      else wm.joined_at
    end
  where wm.workspace_id = target_workspace_id
    and wm.user_id = target_user_id;

  if previous_role is distinct from target_role or previous_status is distinct from target_status then
    insert into public.audit_logs (
      workspace_id,
      actor_id,
      action,
      resource_type,
      resource_id,
      metadata
    ) values (
      target_workspace_id,
      actor_id,
      case
        when previous_status is distinct from target_status then 'workspace_member.status_changed'
        else 'workspace_member.role_changed'
      end,
      'workspace_member',
      target_user_id,
      jsonb_build_object(
        'oldRole', previous_role,
        'newRole', target_role,
        'oldStatus', previous_status,
        'newStatus', target_status
      )
    );
  end if;

  return query
  select
    wm.user_id,
    left(coalesce(nullif(public.normalize_workspace_name(p.display_name), ''), '名前未設定'), 64) as display_name,
    wm.role,
    wm.status,
    wm.joined_at
  from public.workspace_members wm
  left join public.profiles p on p.id = wm.user_id
  where wm.workspace_id = target_workspace_id
    and wm.user_id = target_user_id;
end;
$$;

revoke execute on function public.list_workspace_members(uuid) from public, anon;
revoke execute on function public.create_workspace_join_code() from public, anon;
revoke execute on function public.redeem_workspace_join_code(uuid, text, public.workspace_role) from public, anon;
revoke execute on function public.update_workspace_member(uuid, uuid, public.workspace_role, public.workspace_member_status) from public, anon;

-- Membership writes must pass through the bounded SECURITY DEFINER RPCs above.
-- Keeping the old table grants would allow authenticated clients to bypass
-- consent, active-workspace checks, the supported status transitions, and audit.
revoke insert, update, delete on table public.workspace_members from authenticated;
revoke all on table public.workspace_join_codes from public, anon, authenticated;
revoke insert, update, delete on table public.audit_logs from public, anon, authenticated;
grant select on table public.audit_logs to authenticated;

grant execute on function public.list_workspace_members(uuid) to authenticated;
grant execute on function public.create_workspace_join_code() to authenticated;
grant execute on function public.redeem_workspace_join_code(uuid, text, public.workspace_role) to authenticated;
grant execute on function public.update_workspace_member(uuid, uuid, public.workspace_role, public.workspace_member_status) to authenticated;
