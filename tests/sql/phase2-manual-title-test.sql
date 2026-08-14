\set ON_ERROR_STOP on

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  false
);

insert into public.manuals (
  id,
  workspace_id,
  title,
  owner_id,
  created_by
)
values (
  '22222222-2222-4222-8222-222222222222',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  repeat('あ', 64),
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111'
);

insert into public.manual_revisions (
  id,
  workspace_id,
  manual_id,
  title,
  created_by
)
values (
  '33333333-3333-4333-8333-333333333333',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222',
  repeat('い', 64),
  '11111111-1111-4111-8111-111111111111'
);

do $$
declare
  rejected boolean := false;
begin
  begin
    insert into public.manuals (
      id,
      workspace_id,
      title,
      owner_id,
      created_by
    )
    values (
      '44444444-4444-4444-8444-444444444444',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      repeat('う', 65),
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111'
    );
  exception
    when check_violation then rejected := true;
  end;

  if not rejected then
    raise exception '65-character manual title was accepted';
  end if;
end;
$$;

do $$
declare
  rejected boolean := false;
begin
  begin
    insert into public.manual_revisions (
      id,
      workspace_id,
      manual_id,
      title,
      created_by
    )
    values (
      '55555555-5555-4555-8555-555555555555',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '22222222-2222-4222-8222-222222222222',
      repeat('え', 65),
      '11111111-1111-4111-8111-111111111111'
    );
  exception
    when check_violation then rejected := true;
  end;

  if not rejected then
    raise exception '65-character revision title was accepted';
  end if;
end;
$$;

do $$
declare
  rejected boolean := false;
begin
  begin
    update public.manuals
    set title = repeat('お', 65)
    where id = '22222222-2222-4222-8222-222222222222';
  exception
    when check_violation then rejected := true;
  end;

  if not rejected then
    raise exception '65-character manual title update was accepted';
  end if;
end;
$$;

do $$
declare
  rejected boolean := false;
begin
  begin
    update public.manual_revisions
    set title = repeat('か', 65)
    where id = '33333333-3333-4333-8333-333333333333';
  exception
    when check_violation then rejected := true;
  end;

  if not rejected then
    raise exception '65-character revision title update was accepted';
  end if;
end;
$$;

do $$
declare
  rejected boolean := false;
begin
  begin
    insert into public.manuals (
      id,
      workspace_id,
      title,
      owner_id,
      created_by
    )
    values (
      '66666666-6666-4666-8666-666666666666',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      repeat(chr(9), 3),
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111'
    );
  exception
    when check_violation then rejected := true;
  end;

  if not rejected then
    raise exception 'tab-only manual title was accepted';
  end if;
end;
$$;

do $$
declare
  rejected boolean := false;
begin
  begin
    insert into public.manual_revisions (
      id,
      workspace_id,
      manual_id,
      title,
      created_by
    )
    values (
      '77777777-7777-4777-8777-777777777777',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '22222222-2222-4222-8222-222222222222',
      repeat(chr(160), 3),
      '11111111-1111-4111-8111-111111111111'
    );
  exception
    when check_violation then rejected := true;
  end;

  if not rejected then
    raise exception 'NBSP-only revision title was accepted';
  end if;
end;
$$;

do $$
declare
  rejected boolean := false;
begin
  begin
    update public.manuals
    set title = repeat(chr(9), 3)
    where id = '22222222-2222-4222-8222-222222222222';
  exception
    when check_violation then rejected := true;
  end;

  if not rejected then
    raise exception 'tab-only manual title update was accepted';
  end if;
end;
$$;

do $$
declare
  rejected boolean := false;
begin
  begin
    update public.manual_revisions
    set title = repeat(chr(160), 3)
    where id = '33333333-3333-4333-8333-333333333333';
  exception
    when check_violation then rejected := true;
  end;

  if not rejected then
    raise exception 'NBSP-only revision title update was accepted';
  end if;
end;
$$;

reset role;

do $$
begin
  if (
    select char_length(title)
    from public.manuals
    where id = '22222222-2222-4222-8222-222222222222'
  ) <> 64 then
    raise exception 'valid manual title was changed after rejected update';
  end if;

  if (
    select char_length(title)
    from public.manual_revisions
    where id = '33333333-3333-4333-8333-333333333333'
  ) <> 64 then
    raise exception 'valid revision title was changed after rejected update';
  end if;
end;
$$;

select 'phase2 manual title constraint database test OK' as result;
