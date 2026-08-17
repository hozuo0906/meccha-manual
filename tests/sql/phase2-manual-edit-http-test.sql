\set ON_ERROR_STOP on

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

select public.update_manual_draft(
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '2026-08-14T00:00:01Z',
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
    perform public.update_manual_draft(
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
      '2026-08-14T00:00:01Z',
      '古い画面のタイトル',
      '古い画面の説明'
    );
  exception
    when others then
      if sqlerrm like '%manual draft changed concurrently%' then
        rejected := true;
      else
        raise;
      end if;
  end;
  if not rejected then
    raise exception 'stale manual draft update was accepted';
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
      '44444444-4444-4444-8444-444444444444',
      '2026-08-14T00:00:01Z',
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
      '88888888-8888-4888-8888-888888888888',
      '2026-08-14T00:00:02Z',
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
      '44444444-4444-4444-8444-444444444444',
      (select updated_at from public.manual_revisions where id = '44444444-4444-4444-8444-444444444444'),
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
      '44444444-4444-4444-8444-444444444444',
      (select updated_at from public.manual_revisions where id = '44444444-4444-4444-8444-444444444444'),
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
  detail jsonb;
begin
  detail := public.get_manual_edit_detail(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '33333333-3333-4333-8333-333333333333'
  );
  if detail is null
    or detail->'manual'->>'id' <> '33333333-3333-4333-8333-333333333333'
    or detail->'draft'->>'id' <> '44444444-4444-4444-8444-444444444444'
    or jsonb_array_length(detail->'steps') <> 1
    or detail->'steps'->0 ?| array['asset_id', 'annotation', 'masking']
    or (detail->>'can_edit')::boolean is not true
  then
    raise exception 'manual edit detail RPC did not return one coherent public snapshot';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
do $$
begin
  if public.get_manual_edit_detail(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '33333333-3333-4333-8333-333333333333'
  ) is null then
    raise exception 'same-workspace viewer could not read manual edit detail';
  end if;
  if (public.get_manual_edit_detail(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '33333333-3333-4333-8333-333333333333'
  )->>'can_edit')::boolean is not false then
    raise exception 'viewer manual edit detail retained stale edit permission';
  end if;
  if public.get_manual_edit_detail(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '66666666-6666-4666-8666-666666666666'
  ) is not null then
    raise exception 'non-member viewer read cross-workspace manual edit detail';
  end if;
end;
$$;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

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
    when others then
      if sqlerrm like '%manual step url is invalid%' or sqlstate = '23514' then
        rejected := true;
      else
        raise;
      end if;
  end;
  if not rejected then
    raise exception 'oversized step URL was accepted';
  end if;
end;
$$;

do $$
declare
  valid_step_id uuid;
  candidate text;
begin
  valid_step_id := public.append_manual_step(
    '44444444-4444-4444-8444-444444444444',
    'action', 'internal host URL', '', 'navigate', '画面', 'https://service_name.example/',
    null, '{}'::jsonb, '{}'::jsonb
  );
  perform public.soft_delete_manual_step(
    '44444444-4444-4444-8444-444444444444',
    valid_step_id
  );
  valid_step_id := public.append_manual_step(
    '44444444-4444-4444-8444-444444444444',
    'action', 'zero-padded port URL', '', 'navigate', '画面', 'https://example.com:000080/',
    null, '{}'::jsonb, '{}'::jsonb
  );
  perform public.soft_delete_manual_step(
    '44444444-4444-4444-8444-444444444444',
    valid_step_id
  );
  valid_step_id := public.append_manual_step(
    '44444444-4444-4444-8444-444444444444',
    'action', 'empty port URL', '', 'navigate', '画面', 'HTTPS://example.com:/',
    null, '{}'::jsonb, '{}'::jsonb
  );
  perform public.soft_delete_manual_step(
    '44444444-4444-4444-8444-444444444444',
    valid_step_id
  );
  valid_step_id := public.append_manual_step(
    '44444444-4444-4444-8444-444444444444',
    'action', 'long zero-padded port URL', '', 'navigate', '画面',
    'https://example.com:' || repeat('0', 100) || '80/',
    null, '{}'::jsonb, '{}'::jsonb
  );
  perform public.soft_delete_manual_step(
    '44444444-4444-4444-8444-444444444444',
    valid_step_id
  );
  valid_step_id := public.append_manual_step(
    '44444444-4444-4444-8444-444444444444',
    'action', 'Unicode URL boundary', '', 'navigate', '画面',
    'https://example.com/' || repeat('あ', 225),
    null, '{}'::jsonb, '{}'::jsonb
  );
  perform public.soft_delete_manual_step(
    '44444444-4444-4444-8444-444444444444',
    valid_step_id
  );
  foreach candidate in array array[
    'https://0xffffffff/',
    'https://0x7f.1/',
    'https://0177.1/',
    'https://127.1/',
    'https://4294967295/',
    'https://0x/'
  ] loop
    valid_step_id := public.append_manual_step(
      '44444444-4444-4444-8444-444444444444',
      'action', 'numeric IPv4 URL', '', 'navigate', '画面', candidate,
      null, '{}'::jsonb, '{}'::jsonb
    );
    perform public.soft_delete_manual_step(
      '44444444-4444-4444-8444-444444444444',
      valid_step_id
    );
  end loop;
end;
$$;

do $$
declare
  index_no integer;
  rejected boolean := false;
begin
  for index_no in 2..200 loop
    perform public.append_manual_step(
      '44444444-4444-4444-8444-444444444444',
      'note',
      '手順' || index_no::text,
      '',
      null,
      null,
      null,
      null,
      '{}'::jsonb,
      '{}'::jsonb
    );
  end loop;

  begin
    perform public.append_manual_step(
      '44444444-4444-4444-8444-444444444444',
      'note',
      '201件目',
      '',
      null,
      null,
      null,
      null,
      '{}'::jsonb,
      '{}'::jsonb
    );
  exception
    when others then
      if sqlerrm like '%manual step limit exceeded%' then
        rejected := true;
      else
        raise;
      end if;
  end;

  if not rejected then
    raise exception '201st active manual step was accepted';
  end if;
end;
$$;


-- Authenticated callers must not bypass the Worker contract through SECURITY DEFINER RPCs.
do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.append_manual_step(
      '44444444-4444-4444-8444-444444444444',
      'action', '内部画像', '', 'click', '保存', null,
      '99999999-9999-4999-8999-999999999999', '{}'::jsonb, '{}'::jsonb
    );
  exception
    when others then
      if sqlerrm like '%manual step internal fields are not accepted%' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'direct RPC accepted asset_id'; end if;
end;
$$;

do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.append_manual_step(
      '44444444-4444-4444-8444-444444444444',
      'note', '不正action項目', '', 'click', '保存', null,
      null, '{}'::jsonb, '{}'::jsonb
    );
  exception
    when others then
      if sqlerrm like '%non-action manual step cannot include action fields%' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'direct RPC accepted action fields on a note'; end if;
end;
$$;

do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.append_manual_step(
      '44444444-4444-4444-8444-444444444444',
      'action', 'userinfo URL', '', 'navigate', '画面', 'https://user@example.com/path',
      null, '{}'::jsonb, '{}'::jsonb
    );
  exception
    when others then
      if sqlerrm like '%manual step url is invalid%' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'direct RPC accepted URL userinfo'; end if;
end;
$$;


do $$
declare
  candidate text;
  rejected boolean;
begin
  foreach candidate in array array[
    'https://%',
    'https://xn--/',
    'https://xn--bcher-kva.example/',
    'https://[invalid',
    'https://example.com:abc',
    'https://999.999.999.999',
    'https://0x100000000/',
    'https://4294967296/',
    'https://09/',
    'https://example.1/',
    'https://1.2.3.4.5/',
    'https://1.2.3.256/',
    'https://example.com/' || repeat('あ', 226)
  ] loop
    rejected := false;
    begin
      perform public.append_manual_step(
        '44444444-4444-4444-8444-444444444444',
        'action', 'malformed URL', '', 'navigate', '画面', candidate,
        null, '{}'::jsonb, '{}'::jsonb
      );
    exception
      when others then
        if sqlerrm like '%manual step url is invalid%' then rejected := true; else raise; end if;
    end;
    if not rejected then raise exception 'direct RPC accepted malformed URL: %', candidate; end if;
  end loop;
end;
$$;

reset role;

do $$
begin
  if has_function_privilege('anon', 'public.update_manual_draft(uuid,uuid,timestamptz,text,text)', 'EXECUTE') then
    raise exception 'anon can execute update_manual_draft';
  end if;
  if not has_function_privilege('authenticated', 'public.update_manual_draft(uuid,uuid,timestamptz,text,text)', 'EXECUTE') then
    raise exception 'authenticated cannot execute update_manual_draft';
  end if;
  if has_function_privilege('anon', 'public.get_manual_edit_detail(uuid,uuid)', 'EXECUTE') then
    raise exception 'anon can execute get_manual_edit_detail';
  end if;
  if not has_function_privilege('authenticated', 'public.get_manual_edit_detail(uuid,uuid)', 'EXECUTE') then
    raise exception 'authenticated cannot execute get_manual_edit_detail';
  end if;
  if has_function_privilege('authenticated', 'public.manual_step_ipv4_host_is_valid(text)', 'EXECUTE') then
    raise exception 'authenticated can execute private numeric IPv4 validator';
  end if;
  if has_function_privilege('authenticated', 'public.manual_step_url_is_valid(text)', 'EXECUTE') then
    raise exception 'authenticated can execute private step URL validator';
  end if;
end;
$$;
