-- Phase 2: manual core schema, revision model, steps, and RLS.
-- This migration depends on 202608010001_phase1_identity_workspaces.sql.

do $$
begin
  create type public.manual_status as enum ('draft', 'reviewing', 'published', 'stale', 'archived');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.revision_state as enum ('draft', 'published', 'superseded');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.manual_step_type as enum ('action', 'note', 'decision', 'warning');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.manual_action_type as enum ('click', 'input', 'select', 'navigate', 'wait', 'other');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  parent_id uuid references public.folders (id) on delete set null,
  name text not null,
  position integer not null default 0,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint folders_name_required check (length(trim(name)) > 0),
  constraint folders_position_non_negative check (position >= 0),
  constraint folders_not_self_parent check (parent_id is null or parent_id <> id)
);

create index if not exists folders_workspace_parent_position_idx
  on public.folders (workspace_id, parent_id, position);

create table if not exists public.manuals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  folder_id uuid references public.folders (id) on delete set null,
  title text not null,
  status public.manual_status not null default 'draft',
  current_draft_revision_id uuid,
  current_published_revision_id uuid,
  owner_id uuid not null references auth.users (id),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint manuals_title_required check (length(trim(title)) > 0)
);

create index if not exists manuals_workspace_folder_updated_idx
  on public.manuals (workspace_id, folder_id, updated_at desc);

create index if not exists manuals_workspace_status_idx
  on public.manuals (workspace_id, status);

create table if not exists public.manual_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  manual_id uuid not null references public.manuals (id) on delete cascade,
  revision_no integer not null,
  state public.revision_state not null default 'draft',
  title text not null,
  description text not null default '',
  source_url text,
  cover_asset_id uuid,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint manual_revisions_title_required check (length(trim(title)) > 0),
  constraint manual_revisions_revision_no_positive check (revision_no > 0),
  constraint manual_revisions_source_url_http check (
    source_url is null or source_url ~* '^https?://'
  )
);

create unique index if not exists manual_revisions_manual_revision_no_unique
  on public.manual_revisions (manual_id, revision_no);

create unique index if not exists manual_revisions_one_draft_per_manual_unique
  on public.manual_revisions (manual_id)
  where state = 'draft';

create unique index if not exists manual_revisions_one_published_per_manual_unique
  on public.manual_revisions (manual_id)
  where state = 'published';

create index if not exists manual_revisions_workspace_manual_idx
  on public.manual_revisions (workspace_id, manual_id, revision_no desc);

create table if not exists public.manual_steps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  revision_id uuid not null references public.manual_revisions (id) on delete cascade,
  position integer not null,
  type public.manual_step_type not null default 'action',
  title text not null,
  instruction text not null default '',
  action_type public.manual_action_type,
  target_text text,
  url text,
  asset_id uuid,
  annotation jsonb not null default '{}'::jsonb,
  masking jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint manual_steps_position_non_negative check (position >= 0),
  constraint manual_steps_title_required check (length(trim(title)) > 0),
  constraint manual_steps_url_http check (url is null or url ~* '^https?://')
);

create unique index if not exists manual_steps_revision_position_active_unique
  on public.manual_steps (revision_id, position)
  where deleted_at is null;

create index if not exists manual_steps_workspace_revision_position_idx
  on public.manual_steps (workspace_id, revision_id, position);

create table if not exists public.step_targets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  step_id uuid not null references public.manual_steps (id) on delete cascade,
  selector_candidates jsonb not null default '[]'::jsonb,
  frame_path jsonb not null default '[]'::jsonb,
  rect jsonb not null default '{}'::jsonb,
  confidence numeric(5, 4) not null default 0,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint step_targets_confidence_range check (confidence >= 0 and confidence <= 1)
);

create index if not exists step_targets_workspace_step_idx
  on public.step_targets (workspace_id, step_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'manuals_current_draft_revision_fk'
  ) then
    alter table public.manuals
      add constraint manuals_current_draft_revision_fk
      foreign key (current_draft_revision_id)
      references public.manual_revisions (id)
      on delete set null
      deferrable initially deferred;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'manuals_current_published_revision_fk'
  ) then
    alter table public.manuals
      add constraint manuals_current_published_revision_fk
      foreign key (current_published_revision_id)
      references public.manual_revisions (id)
      on delete set null
      deferrable initially deferred;
  end if;
end $$;

drop trigger if exists folders_set_updated_at on public.folders;
create trigger folders_set_updated_at
before update on public.folders
for each row
execute function public.set_updated_at();

drop trigger if exists manuals_set_updated_at on public.manuals;
create trigger manuals_set_updated_at
before update on public.manuals
for each row
execute function public.set_updated_at();

drop trigger if exists manual_revisions_set_updated_at on public.manual_revisions;
create trigger manual_revisions_set_updated_at
before update on public.manual_revisions
for each row
execute function public.set_updated_at();

drop trigger if exists manual_steps_set_updated_at on public.manual_steps;
create trigger manual_steps_set_updated_at
before update on public.manual_steps
for each row
execute function public.set_updated_at();

drop trigger if exists step_targets_set_updated_at on public.step_targets;
create trigger step_targets_set_updated_at
before update on public.step_targets
for each row
execute function public.set_updated_at();

create or replace function public.can_view_manual(
  target_manual_id uuid,
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
    from public.manuals m
    where m.id = target_manual_id
      and m.archived_at is null
      and public.is_workspace_member(m.workspace_id, target_user_id)
  );
$$;

create or replace function public.can_edit_manual(
  target_manual_id uuid,
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
    from public.manuals m
    where m.id = target_manual_id
      and m.archived_at is null
      and public.has_workspace_role(
        m.workspace_id,
        target_user_id,
        array['owner', 'admin', 'editor']::public.workspace_role[]
      )
  );
$$;

create or replace function public.is_draft_revision(target_revision_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.manual_revisions mr
    where mr.id = target_revision_id
      and mr.state = 'draft'
  );
$$;

create or replace function public.protect_folder_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.workspace_id <> old.workspace_id then
    raise exception 'folder workspace_id is immutable';
  end if;

  if new.parent_id is not null
    and not exists (
      select 1
      from public.folders parent
      where parent.id = new.parent_id
        and parent.workspace_id = new.workspace_id
    )
  then
    raise exception 'parent folder must belong to the same workspace';
  end if;

  return new;
end;
$$;

drop trigger if exists folders_protect_workspace on public.folders;
create trigger folders_protect_workspace
before insert or update on public.folders
for each row
execute function public.protect_folder_workspace();

create or replace function public.protect_manual_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and (
      new.workspace_id <> old.workspace_id
      or new.owner_id <> old.owner_id
      or new.created_by <> old.created_by
      or new.created_at <> old.created_at
    )
  then
    raise exception 'manual ownership fields are immutable';
  end if;

  if tg_op = 'UPDATE'
    and coalesce(current_setting('app.manual_publish_context', true), '') <> 'on'
    and (
      new.status <> old.status
      or new.current_draft_revision_id is distinct from old.current_draft_revision_id
      or new.current_published_revision_id is distinct from old.current_published_revision_id
    )
  then
    raise exception 'manual publication fields must be changed through publish_manual';
  end if;

  if new.folder_id is not null
    and not exists (
      select 1
      from public.folders f
      where f.id = new.folder_id
        and f.workspace_id = new.workspace_id
        and f.archived_at is null
    )
  then
    raise exception 'folder must belong to the same workspace';
  end if;

  if new.current_draft_revision_id is not null
    and not exists (
      select 1
      from public.manual_revisions mr
      where mr.id = new.current_draft_revision_id
        and mr.manual_id = new.id
        and mr.workspace_id = new.workspace_id
        and mr.state = 'draft'
    )
  then
    raise exception 'current draft revision must belong to the same manual';
  end if;

  if new.current_published_revision_id is not null
    and not exists (
      select 1
      from public.manual_revisions mr
      where mr.id = new.current_published_revision_id
        and mr.manual_id = new.id
        and mr.workspace_id = new.workspace_id
        and mr.state = 'published'
    )
  then
    raise exception 'current published revision must belong to the same manual';
  end if;

  return new;
end;
$$;

drop trigger if exists manuals_protect_workspace on public.manuals;
create trigger manuals_protect_workspace
before insert or update on public.manuals
for each row
execute function public.protect_manual_workspace();

create or replace function public.protect_manual_revision_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.manuals m
    where m.id = new.manual_id
      and m.workspace_id = new.workspace_id
      and m.archived_at is null
  ) then
    raise exception 'manual revision must belong to the same workspace as manual';
  end if;

  if tg_op = 'INSERT' and new.state <> 'draft' then
    raise exception 'manual revisions must be created as draft';
  end if;

  if tg_op = 'UPDATE'
    and (
      new.workspace_id <> old.workspace_id
      or new.manual_id <> old.manual_id
      or new.revision_no <> old.revision_no
      or new.created_by <> old.created_by
      or new.created_at <> old.created_at
    )
  then
    raise exception 'manual revision ownership fields are immutable';
  end if;

  if tg_op = 'UPDATE'
    and old.state = 'published'
    and new.state = 'superseded'
    and coalesce(current_setting('app.manual_publish_context', true), '') = 'on'
    and new.workspace_id = old.workspace_id
    and new.manual_id = old.manual_id
    and new.revision_no = old.revision_no
    and new.title = old.title
    and new.description = old.description
    and new.source_url is not distinct from old.source_url
    and new.cover_asset_id is not distinct from old.cover_asset_id
    and new.created_by = old.created_by
    and new.created_at = old.created_at
    and new.published_at is not distinct from old.published_at
  then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.state <> 'draft' then
    raise exception 'published or superseded revisions are immutable';
  end if;

  if tg_op = 'UPDATE' and old.state = 'draft' and new.state = 'draft' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.state = 'draft'
    and new.state = 'published'
    and coalesce(current_setting('app.manual_publish_context', true), '') = 'on'
  then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.state <> new.state then
    raise exception 'invalid revision state transition';
  end if;

  return new;
end;
$$;

drop trigger if exists manual_revisions_protect_workspace on public.manual_revisions;
create trigger manual_revisions_protect_workspace
before insert or update on public.manual_revisions
for each row
execute function public.protect_manual_revision_workspace();

create or replace function public.protect_manual_revision_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.state <> 'draft' then
    raise exception 'published or superseded revisions cannot be deleted';
  end if;

  return old;
end;
$$;

drop trigger if exists manual_revisions_protect_delete on public.manual_revisions;
create trigger manual_revisions_protect_delete
before delete on public.manual_revisions
for each row
execute function public.protect_manual_revision_delete();

create or replace function public.protect_manual_step_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.manual_revisions mr
    where mr.id = new.revision_id
      and mr.workspace_id = new.workspace_id
      and mr.state = 'draft'
  ) then
    raise exception 'manual steps can only be changed on draft revisions in the same workspace';
  end if;

  return new;
end;
$$;

drop trigger if exists manual_steps_protect_workspace on public.manual_steps;
create trigger manual_steps_protect_workspace
before insert or update on public.manual_steps
for each row
execute function public.protect_manual_step_workspace();

create or replace function public.protect_manual_step_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_draft_revision(old.revision_id) then
    raise exception 'manual steps can only be deleted from draft revisions';
  end if;

  return old;
end;
$$;

drop trigger if exists manual_steps_protect_delete on public.manual_steps;
create trigger manual_steps_protect_delete
before delete on public.manual_steps
for each row
execute function public.protect_manual_step_delete();

create or replace function public.protect_step_target_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.manual_steps ms
    join public.manual_revisions mr on mr.id = ms.revision_id
    where ms.id = new.step_id
      and ms.workspace_id = new.workspace_id
      and mr.state = 'draft'
  ) then
    raise exception 'step targets can only be changed on draft steps in the same workspace';
  end if;

  return new;
end;
$$;

drop trigger if exists step_targets_protect_workspace on public.step_targets;
create trigger step_targets_protect_workspace
before insert or update on public.step_targets
for each row
execute function public.protect_step_target_workspace();

create or replace function public.protect_step_target_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  draft_revision boolean;
begin
  select public.is_draft_revision(ms.revision_id)
  into draft_revision
  from public.manual_steps ms
  where ms.id = old.step_id;

  if not coalesce(draft_revision, false) then
    raise exception 'step targets can only be deleted from draft steps';
  end if;

  return old;
end;
$$;

drop trigger if exists step_targets_protect_delete on public.step_targets;
create trigger step_targets_protect_delete
before delete on public.step_targets
for each row
execute function public.protect_step_target_delete();

create or replace function public.create_manual(
  target_workspace_id uuid,
  target_folder_id uuid,
  manual_title text,
  manual_description text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  new_manual_id uuid;
  new_revision_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication required';
  end if;

  if not public.has_workspace_role(
    target_workspace_id,
    actor_id,
    array['owner', 'admin', 'editor']::public.workspace_role[]
  ) then
    raise exception 'workspace editor role required';
  end if;

  if target_folder_id is not null
    and not exists (
      select 1
      from public.folders f
      where f.id = target_folder_id
        and f.workspace_id = target_workspace_id
        and f.archived_at is null
    )
  then
    raise exception 'folder not found in workspace';
  end if;

  insert into public.manuals (
    workspace_id,
    folder_id,
    title,
    status,
    owner_id,
    created_by
  )
  values (
    target_workspace_id,
    target_folder_id,
    manual_title,
    'draft',
    actor_id,
    actor_id
  )
  returning id into new_manual_id;

  insert into public.manual_revisions (
    workspace_id,
    manual_id,
    revision_no,
    state,
    title,
    description,
    created_by
  )
  values (
    target_workspace_id,
    new_manual_id,
    1,
    'draft',
    manual_title,
    coalesce(manual_description, ''),
    actor_id
  )
  returning id into new_revision_id;

  perform set_config('app.manual_publish_context', 'on', true);

  update public.manuals
  set current_draft_revision_id = new_revision_id
  where id = new_manual_id;

  return new_manual_id;
end;
$$;

create or replace function public.publish_manual(
  target_manual_id uuid
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
begin
  if actor_id is null then
    raise exception 'authentication required';
  end if;

  select
    m.workspace_id,
    m.current_draft_revision_id,
    m.current_published_revision_id
  into
    target_workspace_id,
    draft_revision_id,
    old_published_revision_id
  from public.manuals m
  where m.id = target_manual_id
    and m.archived_at is null;

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

  if draft_revision_id is null then
    raise exception 'draft revision not found';
  end if;

  perform set_config('app.manual_publish_context', 'on', true);

  if old_published_revision_id is not null then
    update public.manual_revisions
    set state = 'superseded'
    where id = old_published_revision_id
      and state = 'published';
  end if;

  update public.manual_revisions
  set state = 'published',
      published_at = now()
  where id = draft_revision_id
    and manual_id = target_manual_id
    and state = 'draft';

  if not found then
    raise exception 'draft revision is not publishable';
  end if;

  update public.manuals
  set status = 'published',
      current_published_revision_id = draft_revision_id,
      current_draft_revision_id = null
  where id = target_manual_id;

  return draft_revision_id;
end;
$$;

create or replace function public.create_manual_draft(
  target_manual_id uuid
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

  select
    m.workspace_id,
    m.current_published_revision_id,
    m.current_draft_revision_id
  into
    target_workspace_id,
    published_revision_id,
    existing_draft_revision_id
  from public.manuals m
  where m.id = target_manual_id
    and m.archived_at is null;

  if target_workspace_id is null then
    raise exception 'manual not found';
  end if;

  if existing_draft_revision_id is not null then
    return existing_draft_revision_id;
  end if;

  if not public.has_workspace_role(
    target_workspace_id,
    actor_id,
    array['owner', 'admin', 'editor']::public.workspace_role[]
  ) then
    raise exception 'workspace editor role required';
  end if;

  if published_revision_id is null then
    raise exception 'published revision not found';
  end if;

  select coalesce(max(revision_no), 0) + 1
  into next_revision_no
  from public.manual_revisions
  where manual_id = target_manual_id;

  insert into public.manual_revisions (
    workspace_id,
    manual_id,
    revision_no,
    state,
    title,
    description,
    source_url,
    cover_asset_id,
    created_by
  )
  select
    mr.workspace_id,
    mr.manual_id,
    next_revision_no,
    'draft',
    mr.title,
    mr.description,
    mr.source_url,
    mr.cover_asset_id,
    actor_id
  from public.manual_revisions mr
  where mr.id = published_revision_id
    and mr.manual_id = target_manual_id
    and mr.state = 'published'
  returning id into new_revision_id;

  if new_revision_id is null then
    raise exception 'published revision not found';
  end if;

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
  select
    ms.workspace_id,
    new_revision_id,
    ms.position,
    ms.type,
    ms.title,
    ms.instruction,
    ms.action_type,
    ms.target_text,
    ms.url,
    ms.asset_id,
    ms.annotation,
    ms.masking,
    actor_id
  from public.manual_steps ms
  where ms.revision_id = published_revision_id
    and ms.deleted_at is null
  order by ms.position;

  perform set_config('app.manual_publish_context', 'on', true);

  update public.manuals
  set current_draft_revision_id = new_revision_id,
      status = 'draft'
  where id = target_manual_id;

  return new_revision_id;
end;
$$;

alter table public.folders enable row level security;
alter table public.manuals enable row level security;
alter table public.manual_revisions enable row level security;
alter table public.manual_steps enable row level security;
alter table public.step_targets enable row level security;

drop policy if exists folders_select_members on public.folders;
create policy folders_select_members
on public.folders
for select
to authenticated
using (
  archived_at is null
  and public.is_workspace_member(workspace_id, auth.uid())
);

drop policy if exists folders_insert_editors on public.folders;
create policy folders_insert_editors
on public.folders
for insert
to authenticated
with check (
  public.has_workspace_role(workspace_id, auth.uid(), array['owner', 'admin', 'editor']::public.workspace_role[])
  and created_by = auth.uid()
);

drop policy if exists folders_update_editors on public.folders;
create policy folders_update_editors
on public.folders
for update
to authenticated
using (
  public.has_workspace_role(workspace_id, auth.uid(), array['owner', 'admin', 'editor']::public.workspace_role[])
)
with check (
  public.has_workspace_role(workspace_id, auth.uid(), array['owner', 'admin', 'editor']::public.workspace_role[])
);

drop policy if exists manuals_select_members on public.manuals;
create policy manuals_select_members
on public.manuals
for select
to authenticated
using (
  archived_at is null
  and public.is_workspace_member(workspace_id, auth.uid())
);

drop policy if exists manuals_insert_editors on public.manuals;
create policy manuals_insert_editors
on public.manuals
for insert
to authenticated
with check (
  public.has_workspace_role(workspace_id, auth.uid(), array['owner', 'admin', 'editor']::public.workspace_role[])
  and created_by = auth.uid()
  and owner_id = auth.uid()
);

drop policy if exists manuals_update_editors on public.manuals;
create policy manuals_update_editors
on public.manuals
for update
to authenticated
using (
  public.has_workspace_role(workspace_id, auth.uid(), array['owner', 'admin', 'editor']::public.workspace_role[])
)
with check (
  public.has_workspace_role(workspace_id, auth.uid(), array['owner', 'admin', 'editor']::public.workspace_role[])
);

drop policy if exists manual_revisions_select_members on public.manual_revisions;
create policy manual_revisions_select_members
on public.manual_revisions
for select
to authenticated
using (
  public.is_workspace_member(workspace_id, auth.uid())
  and exists (
    select 1
    from public.manuals m
    where m.id = manual_revisions.manual_id
      and m.archived_at is null
  )
);

drop policy if exists manual_revisions_insert_editors on public.manual_revisions;
create policy manual_revisions_insert_editors
on public.manual_revisions
for insert
to authenticated
with check (
  public.has_workspace_role(workspace_id, auth.uid(), array['owner', 'admin', 'editor']::public.workspace_role[])
  and state = 'draft'
  and created_by = auth.uid()
);

drop policy if exists manual_revisions_update_editors on public.manual_revisions;
create policy manual_revisions_update_editors
on public.manual_revisions
for update
to authenticated
using (
  public.has_workspace_role(workspace_id, auth.uid(), array['owner', 'admin', 'editor']::public.workspace_role[])
)
with check (
  public.has_workspace_role(workspace_id, auth.uid(), array['owner', 'admin', 'editor']::public.workspace_role[])
);

drop policy if exists manual_revisions_delete_editors on public.manual_revisions;
create policy manual_revisions_delete_editors
on public.manual_revisions
for delete
to authenticated
using (
  state = 'draft'
  and public.has_workspace_role(workspace_id, auth.uid(), array['owner', 'admin', 'editor']::public.workspace_role[])
);

drop policy if exists manual_steps_select_members on public.manual_steps;
create policy manual_steps_select_members
on public.manual_steps
for select
to authenticated
using (
  deleted_at is null
  and public.is_workspace_member(workspace_id, auth.uid())
);

drop policy if exists manual_steps_insert_editors on public.manual_steps;
create policy manual_steps_insert_editors
on public.manual_steps
for insert
to authenticated
with check (
  public.has_workspace_role(workspace_id, auth.uid(), array['owner', 'admin', 'editor']::public.workspace_role[])
  and public.is_draft_revision(revision_id)
  and created_by = auth.uid()
);

drop policy if exists manual_steps_update_editors on public.manual_steps;
create policy manual_steps_update_editors
on public.manual_steps
for update
to authenticated
using (
  public.has_workspace_role(workspace_id, auth.uid(), array['owner', 'admin', 'editor']::public.workspace_role[])
  and public.is_draft_revision(revision_id)
)
with check (
  public.has_workspace_role(workspace_id, auth.uid(), array['owner', 'admin', 'editor']::public.workspace_role[])
  and public.is_draft_revision(revision_id)
);

drop policy if exists manual_steps_delete_editors on public.manual_steps;
create policy manual_steps_delete_editors
on public.manual_steps
for delete
to authenticated
using (
  public.has_workspace_role(workspace_id, auth.uid(), array['owner', 'admin', 'editor']::public.workspace_role[])
  and public.is_draft_revision(revision_id)
);

drop policy if exists step_targets_select_members on public.step_targets;
create policy step_targets_select_members
on public.step_targets
for select
to authenticated
using (
  public.is_workspace_member(workspace_id, auth.uid())
  and exists (
    select 1
    from public.manual_steps ms
    join public.manual_revisions mr on mr.id = ms.revision_id
    join public.manuals m on m.id = mr.manual_id
    where ms.id = step_targets.step_id
      and ms.deleted_at is null
      and m.archived_at is null
  )
);

drop policy if exists step_targets_insert_editors on public.step_targets;
create policy step_targets_insert_editors
on public.step_targets
for insert
to authenticated
with check (
  public.has_workspace_role(workspace_id, auth.uid(), array['owner', 'admin', 'editor']::public.workspace_role[])
  and created_by = auth.uid()
);

drop policy if exists step_targets_update_editors on public.step_targets;
create policy step_targets_update_editors
on public.step_targets
for update
to authenticated
using (
  public.has_workspace_role(workspace_id, auth.uid(), array['owner', 'admin', 'editor']::public.workspace_role[])
)
with check (
  public.has_workspace_role(workspace_id, auth.uid(), array['owner', 'admin', 'editor']::public.workspace_role[])
);

drop policy if exists step_targets_delete_editors on public.step_targets;
create policy step_targets_delete_editors
on public.step_targets
for delete
to authenticated
using (
  public.has_workspace_role(workspace_id, auth.uid(), array['owner', 'admin', 'editor']::public.workspace_role[])
);

revoke all on table public.folders from anon, authenticated;
revoke all on table public.manuals from anon, authenticated;
revoke all on table public.manual_revisions from anon, authenticated;
revoke all on table public.manual_steps from anon, authenticated;
revoke all on table public.step_targets from anon, authenticated;

grant select, insert, update on table public.folders to authenticated;
grant select, insert, update on table public.manuals to authenticated;
grant select, insert, update, delete on table public.manual_revisions to authenticated;
grant select, insert, update, delete on table public.manual_steps to authenticated;
grant select, insert, update, delete on table public.step_targets to authenticated;
revoke all on function public.can_view_manual(uuid, uuid) from public, anon, authenticated;
revoke all on function public.can_edit_manual(uuid, uuid) from public, anon, authenticated;
revoke all on function public.is_draft_revision(uuid) from public, anon, authenticated;
revoke all on function public.create_manual(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.publish_manual(uuid) from public, anon, authenticated;
revoke all on function public.create_manual_draft(uuid) from public, anon, authenticated;
revoke all on function public.protect_folder_workspace() from public, anon, authenticated;
revoke all on function public.protect_manual_workspace() from public, anon, authenticated;
revoke all on function public.protect_manual_revision_workspace() from public, anon, authenticated;
revoke all on function public.protect_manual_revision_delete() from public, anon, authenticated;
revoke all on function public.protect_manual_step_workspace() from public, anon, authenticated;
revoke all on function public.protect_manual_step_delete() from public, anon, authenticated;
revoke all on function public.protect_step_target_workspace() from public, anon, authenticated;
revoke all on function public.protect_step_target_delete() from public, anon, authenticated;
grant execute on function public.can_view_manual(uuid, uuid) to authenticated;
grant execute on function public.can_edit_manual(uuid, uuid) to authenticated;
grant execute on function public.is_draft_revision(uuid) to authenticated;
grant execute on function public.create_manual(uuid, uuid, text, text) to authenticated;
grant execute on function public.publish_manual(uuid) to authenticated;
grant execute on function public.create_manual_draft(uuid) to authenticated;
