\set ON_ERROR_STOP on

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

select public.update_manual_draft(
  '33333333-3333-4333-8333-333333333333',
  '更新タイトル',
  '更新説明'
) = '44444444-4444-4444-8444-444444444444'::uuid as editor_updated_draft;

do $$
begin
  if not exists (
    select 1
    from public.manuals m
    join public.manual_revisions mr on mr.id = m.current_draft_revision_id
    where m.id = '33333333-3333-4333-8333-333333333333'
      and m.title = '更新タイトル'
      and mr.title = '更新タイトル'
      and mr.description = '更新説明'
  ) then
    raise exception 'manual and draft metadata were not updated atomically';
  end if;
end;
$$;

do $$
declare
  rejected boolean := false;
begin
  begin
    update public.manuals
    set title = '直接更新'
    where id = '33333333-3333-4333-8333-333333333333';
  exception
    when insufficient_privilege then rejected := true;
  end;
  if not rejected then
    raise exception 'authenticated direct manual update was allowed';
  end if;
end;
$$;

do $$
declare
  rejected boolean := false;
begin
  begin
    update public.manual_revisions
    set description = '直接更新'
    where id = '44444444-4444-4444-8444-444444444444';
  exception
    when insufficient_privilege then rejected := true;
  end;
  if not rejected then
    raise exception 'authenticated direct revision update was allowed';
  end if;
end;
$$;

do $$
declare
  rejected boolean := false;
begin
  begin
    update public.manual_steps
    set title = '直接更新'
    where false;
  exception
    when insufficient_privilege then rejected := true;
  end;
  if not rejected then
    raise exception 'authenticated direct step update was allowed';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);

do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.update_manual_draft(
      '33333333-3333-4333-8333-333333333333',
      'viewer変更',
      'viewer変更'
    );
  exception
    when others then
      if sqlerrm like '%workspace editor role required%' then
        rejected := true;
      else
        raise;
      end if;
  end;
  if not rejected then
    raise exception 'viewer updated manual draft';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.update_manual_draft(
      '55555555-5555-4555-8555-555555555555',
      '下書きなし',
      ''
    );
  exception
    when others then
      if sqlerrm like '%draft revision not found%' then
        rejected := true;
      else
        raise;
      end if;
  end;
  if not rejected then
    raise exception 'manual without draft was updated';
  end if;
end;
$$;

do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.update_manual_draft(
      '33333333-3333-4333-8333-333333333333',
      repeat(chr(9), 3),
      ''
    );
  exception
    when check_violation then rejected := true;
  end;
  if not rejected then
    raise exception 'blank manual title was accepted';
  end if;
end;
$$;

do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.update_manual_draft(
      '33333333-3333-4333-8333-333333333333',
      '説明上限',
      repeat('あ', 10001)
    );
  exception
    when check_violation then rejected := true;
  end;
  if not rejected then
    raise exception 'oversized manual description was accepted';
  end if;
end;
$$;

select public.append_manual_step(
  '44444444-4444-4444-8444-444444444444',
  'action',
  '保存',
  '［保存ボタン］をクリックします。',
  'click',
  '保存ボタン',
  null,
  null,
  '{}'::jsonb,
  '{}'::jsonb
) is not null as editor_appended_step;

do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.append_manual_step(
      '44444444-4444-4444-8444-444444444444',
      'action',
      repeat('あ', 129),
      '',
      'click',
      '保存',
      null,
      null,
      '{}'::jsonb,
      '{}'::jsonb
    );
  exception
    when check_violation then rejected := true;
  end;
  if not rejected then
    raise exception 'oversized step title was accepted';
  end if;
end;
$$;

do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.append_manual_step(
      '44444444-4444-4444-8444-444444444444',
      'action',
      '長い手順',
      repeat('あ', 4001),
      'click',
      '保存',
      null,
      null,
      '{}'::jsonb,
      '{}'::jsonb
    );
  exception
    when check_violation then rejected := true;
  end;
  if not rejected then
    raise exception 'oversized step instruction was accepted';
  end if;
end;
$$;

do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.append_manual_step(
      '44444444-4444-4444-8444-444444444444',
      'action',
      '長い対象',
      '',
      'click',
      repeat('あ', 257),
      null,
      null,
      '{}'::jsonb,
      '{}'::jsonb
    );
  exception
    when check_violation then rejected := true;
  end;
  if not rejected then
    raise exception 'oversized step target was accepted';
  end if;
end;
$$;

do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.append_manual_step(
      '44444444-4444-4444-8444-444444444444',
      'action',
      '長いURL',
      '',
      'navigate',
      '画面',
      'https://example.com/' || repeat('a', 2049),
      null,
      '{}'::jsonb,
      '{}'::jsonb
    );
  exception
    when check_violation then rejected := true;
  end;
  if not rejected then
    raise exception 'oversized step URL was accepted';
  end if;
end;
$$;

reset role;

do $$
begin
  if has_function_privilege('anon', 'public.update_manual_draft(uuid,text,text)', 'EXECUTE') then
    raise exception 'anon can execute update_manual_draft';
  end if;
  if not has_function_privilege('authenticated', 'public.update_manual_draft(uuid,text,text)', 'EXECUTE') then
    raise exception 'authenticated cannot execute update_manual_draft';
  end if;
end;
$$;
