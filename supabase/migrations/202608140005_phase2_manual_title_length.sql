-- Phase 2 manual titles must remain bounded and nonblank so list responses stay available.
-- Existing rows are not truncated or normalized; validation fails safely if incompatible data exists.
-- The btrim character set mirrors ECMAScript String.prototype.trim whitespace/line terminators.

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
    where conname = 'manuals_title_nonblank'
      and conrelid = 'public.manuals'::regclass
  ) then
    alter table public.manuals
      add constraint manuals_title_nonblank
      check (
        char_length(
          btrim(
            title,
            ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13) ||
            chr(160) || chr(5760) ||
            chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) ||
            chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202) ||
            chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279)
          )
        ) > 0
      )
      not valid;
  end if;
end $$;

alter table public.manuals validate constraint manuals_title_nonblank;

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

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'manual_revisions_title_nonblank'
      and conrelid = 'public.manual_revisions'::regclass
  ) then
    alter table public.manual_revisions
      add constraint manual_revisions_title_nonblank
      check (
        char_length(
          btrim(
            title,
            ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13) ||
            chr(160) || chr(5760) ||
            chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) ||
            chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202) ||
            chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279)
          )
        ) > 0
      )
      not valid;
  end if;
end $$;

alter table public.manual_revisions validate constraint manual_revisions_title_nonblank;
