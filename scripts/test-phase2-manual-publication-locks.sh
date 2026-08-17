#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=postgres}"

EDITOR_ID="11111111-1111-4111-8111-111111111111"
MANUAL_ID="33333333-3333-4333-8333-333333333333"
DRAFT_ID="44444444-4444-4444-8444-444444444444"
psql_base=(psql -X -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE")

update_log="$(mktemp)"
publish_log="$(mktemp)"
cleanup() { rm -f "$update_log" "$publish_log"; }
trap cleanup EXIT

expected_updated_at="$("${psql_base[@]}" -At -c "select updated_at from public.manual_revisions where id = '${DRAFT_ID}'::uuid")"
content_version="$("${psql_base[@]}" -At -c "select md5(mr.updated_at::text || '|' || coalesce((select string_agg(ms.id::text || ':' || ms.updated_at::text, ',' order by ms.position) from public.manual_steps ms where ms.revision_id = mr.id and ms.deleted_at is null), '')) from public.manual_revisions mr where mr.id = '${DRAFT_ID}'::uuid")"

"${psql_base[@]}" -c "begin; select id from public.manuals where id = '${MANUAL_ID}'::uuid for update; select pg_sleep(1.0); commit;" >/dev/null &
locker_pid=$!
sleep 0.2

set +e
PGOPTIONS='-c statement_timeout=8000' "${psql_base[@]}" -c "set role authenticated; select set_config('request.jwt.claim.sub', '${EDITOR_ID}', false); select public.update_manual_draft('${MANUAL_ID}'::uuid, '${DRAFT_ID}'::uuid, '${expected_updated_at}'::timestamptz, 'Concurrent title', 'Concurrent description');" >"$update_log" 2>&1 &
update_pid=$!
PGOPTIONS='-c statement_timeout=8000' "${psql_base[@]}" -c "set role authenticated; select set_config('request.jwt.claim.sub', '${EDITOR_ID}', false); select public.publish_manual_revision('${MANUAL_ID}'::uuid, '${DRAFT_ID}'::uuid, '${content_version}', true);" >"$publish_log" 2>&1 &
publish_pid=$!
wait "$locker_pid"
wait "$update_pid"; update_status=$?
wait "$publish_pid"; publish_status=$?
set -e

if grep -Eqi 'deadlock detected|statement timeout|canceling statement' "$update_log" "$publish_log"; then
  echo "draft save/publication lock ordering produced a deadlock or timeout" >&2
  cat "$update_log" >&2
  cat "$publish_log" >&2
  exit 1
fi
if [[ "$publish_status" -ne 0 ]]; then
  echo "publication must complete regardless of which operation acquires the manual lock first" >&2
  cat "$update_log" >&2
  cat "$publish_log" >&2
  exit 1
fi
if [[ "$update_status" -ne 0 ]] && ! grep -Eqi 'draft revision not found|current draft revision changed' "$update_log"; then
  echo "draft update failed for an unexpected reason" >&2
  cat "$update_log" >&2
  exit 1
fi

final_state="$("${psql_base[@]}" -At -F '|' -c "select status, coalesce(current_draft_revision_id::text, ''), current_published_revision_id::text from public.manuals where id = '${MANUAL_ID}'::uuid")"
if [[ "$final_state" != "published||${DRAFT_ID}" ]]; then
  echo "publication did not leave a consistent manual state: $final_state" >&2
  exit 1
fi

echo "publish_manual_revision and update_manual_draft share a deadlock-free manual-first lock order: OK"
