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

step_updated_at() {
  local step_id="$1"
  "${psql_base[@]}" -At -c "select updated_at from public.manual_steps where id = '${step_id}'::uuid"
}

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

STEP_A_UPDATED_AT="$(step_updated_at "$STEP_A")"
expect_revision_lock_timeout \
  "update_manual_step" \
  "select public.update_manual_step('${REVISION_ID}'::uuid, '${STEP_A}'::uuid, '${STEP_A_UPDATED_AT}'::timestamptz, 'action', 'Concurrent update', '', 'click', 'target', null, null, '{}'::jsonb, '{}'::jsonb);"

expect_revision_lock_timeout \
  "soft_delete_manual_step" \
  "select public.soft_delete_manual_step('${REVISION_ID}'::uuid, '${STEP_A}'::uuid);"

expect_revision_lock_timeout \
  "reorder_manual_steps" \
  "select public.reorder_manual_steps('${REVISION_ID}'::uuid, array['${STEP_B}'::uuid, '${STEP_A}'::uuid]);"

expect_concurrent_update_conflict() {
  local expected_updated_at
  local log_a
  local log_b
  local status_a
  local status_b
  local loser_log
  local final_pair

  expected_updated_at="$(step_updated_at "$STEP_B")"
  log_a="$(mktemp)"
  log_b="$(mktemp)"

  "${psql_base[@]}" -c "begin; select id from public.manual_revisions where id = '${REVISION_ID}'::uuid for update; select pg_sleep(1.0); commit;" >/dev/null &
  local locker_pid=$!
  sleep 0.2

  set +e
  "${psql_base[@]}" -c "set role authenticated; select set_config('request.jwt.claim.sub', '${EDITOR_ID}', false); select public.update_manual_step('${REVISION_ID}'::uuid, '${STEP_B}'::uuid, '${expected_updated_at}'::timestamptz, 'action', 'Concurrent A', 'instruction A', 'click', 'target A', null, null, '{}'::jsonb, '{}'::jsonb);" >"$log_a" 2>&1 &
  local pid_a=$!
  "${psql_base[@]}" -c "set role authenticated; select set_config('request.jwt.claim.sub', '${EDITOR_ID}', false); select public.update_manual_step('${REVISION_ID}'::uuid, '${STEP_B}'::uuid, '${expected_updated_at}'::timestamptz, 'action', 'Concurrent B', 'instruction B', 'click', 'target B', null, null, '{}'::jsonb, '{}'::jsonb);" >"$log_b" 2>&1 &
  local pid_b=$!

  wait "$locker_pid"
  wait "$pid_a"
  status_a=$?
  wait "$pid_b"
  status_b=$?
  set -e

  if [[ "$status_a" -eq 0 && "$status_b" -eq 0 ]] || [[ "$status_a" -ne 0 && "$status_b" -ne 0 ]]; then
    echo "concurrent update expected exactly one success" >&2
    cat "$log_a" >&2
    cat "$log_b" >&2
    rm -f "$log_a" "$log_b"
    exit 1
  fi

  if [[ "$status_a" -eq 0 ]]; then
    loser_log="$log_b"
  else
    loser_log="$log_a"
  fi
  if ! grep -qi "manual step changed concurrently" "$loser_log"; then
    echo "concurrent update loser did not receive the optimistic conflict" >&2
    cat "$loser_log" >&2
    rm -f "$log_a" "$log_b"
    exit 1
  fi

  final_pair="$("${psql_base[@]}" -At -F '|' -c "select title, instruction from public.manual_steps where id = '${STEP_B}'::uuid")"
  if [[ "$final_pair" != "Concurrent A|instruction A" && "$final_pair" != "Concurrent B|instruction B" ]]; then
    echo "concurrent update persisted a mixed or unexpected field set: $final_pair" >&2
    rm -f "$log_a" "$log_b"
    exit 1
  fi

  rm -f "$log_a" "$log_b"
  echo "update_manual_step rejects the second same-version writer: OK"
}

expect_concurrent_update_conflict

echo "Phase 2 manual step lock serialization and optimistic conflict test OK."
