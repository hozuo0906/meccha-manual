-- Phase 2 manual titles must remain bounded so list responses stay available.
-- Existing rows are not truncated; validation fails safely if incompatible data exists.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'manuals_title_length'
      and conrelid = 'public.manuals'::regclass
  ) then
    alter table public.manuals
      add constraint manuals_title_length
      check (char_length(title) between 1 and 64)
      not valid;
  end if;
end $$;

alter table public.manuals validate constraint manuals_title_length;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'manual_revisions_title_length'
      and conrelid = 'public.manual_revisions'::regclass
  ) then
    alter table public.manual_revisions
      add constraint manual_revisions_title_length
      check (char_length(title) between 1 and 64)
      not valid;
  end if;
end $$;

alter table public.manual_revisions validate constraint manual_revisions_title_length;
