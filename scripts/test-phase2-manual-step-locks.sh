#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=postgres}"

EDITOR_ID="11111111-1111-4111-8111-111111111111"
REVISION_ID="99999999-9999-4999-8999-999999999999"
STEP_A="aaaaaaaa-0000-4000-8000-000000000001"
STEP_B="aaaaaaaa-0000-4000-8000-000000000002"

psql_base=(psql -X -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE")

expect_revision_lock_timeout() {
  local label="$1"
  local mutation_sql="$2"
  local log_file
  log_file="$(mktemp)"

  "${psql_base[@]}" -c "begin; select id from public.manual_revisions where id = '${REVISION_ID}'::uuid for update; select pg_sleep(1.5); commit;" >/dev/null &
  local locker_pid=$!
  sleep 0.2

  set +e
  "${psql_base[@]}" -c "set statement_timeout = '350ms'; set role authenticated; select set_config('request.jwt.claim.sub', '${EDITOR_ID}', false); ${mutation_sql}" >"$log_file" 2>&1
  local status=$?
  set -e

  wait "$locker_pid"

  if [[ "$status" -eq 0 ]]; then
    echo "$label unexpectedly bypassed the draft revision lock" >&2
    cat "$log_file" >&2
    rm -f "$log_file"
    exit 1
  fi

  if ! grep -qi "statement timeout" "$log_file"; then
    echo "$label failed for a reason other than waiting on the shared revision lock" >&2
    cat "$log_file" >&2
    rm -f "$log_file"
    exit 1
  fi

  rm -f "$log_file"
  echo "$label waits on the draft revision lock: OK"
}

expect_revision_lock_timeout \
  "append_manual_step" \
  "select public.append_manual_step('${REVISION_ID}'::uuid, 'note', 'Concurrent append', '', null, null, null, null, '{}'::jsonb, '{}'::jsonb);"

expect_revision_lock_timeout \
  "update_manual_step" \
  "select public.update_manual_step('${REVISION_ID}'::uuid, '${STEP_A}'::uuid, 'action', 'Concurrent update', '', 'click', 'target', null, null, '{}'::jsonb, '{}'::jsonb);"

expect_revision_lock_timeout \
  "soft_delete_manual_step" \
  "select public.soft_delete_manual_step('${REVISION_ID}'::uuid, '${STEP_A}'::uuid);"

expect_revision_lock_timeout \
  "reorder_manual_steps" \
  "select public.reorder_manual_steps('${REVISION_ID}'::uuid, array['${STEP_B}'::uuid, '${STEP_A}'::uuid]);"

echo "Phase 2 manual step lock serialization test OK."
