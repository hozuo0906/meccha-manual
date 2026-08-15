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

expected_updated_at="$("${psql_base[@]}" -At -c "select updated_at from public.manual_revisions where id = '${DRAFT_ID}'::uuid")"
log_a="$(mktemp)"
log_b="$(mktemp)"

"${psql_base[@]}" -c "begin; select id from public.manuals where id = '${MANUAL_ID}'::uuid for update; select pg_sleep(1.0); commit;" >/dev/null &
locker_pid=$!
sleep 0.2

set +e
"${psql_base[@]}" -c "set role authenticated; select set_config('request.jwt.claim.sub', '${EDITOR_ID}', false); select public.update_manual_draft('${MANUAL_ID}'::uuid, '${DRAFT_ID}'::uuid, '${expected_updated_at}'::timestamptz, 'Concurrent A', 'description A');" >"$log_a" 2>&1 &
pid_a=$!
"${psql_base[@]}" -c "set role authenticated; select set_config('request.jwt.claim.sub', '${EDITOR_ID}', false); select public.update_manual_draft('${MANUAL_ID}'::uuid, '${DRAFT_ID}'::uuid, '${expected_updated_at}'::timestamptz, 'Concurrent B', 'description B');" >"$log_b" 2>&1 &
pid_b=$!

wait "$locker_pid"
wait "$pid_a"; status_a=$?
wait "$pid_b"; status_b=$?
set -e

if [[ "$status_a" -eq 0 && "$status_b" -eq 0 ]] || [[ "$status_a" -ne 0 && "$status_b" -ne 0 ]]; then
  echo "concurrent draft update expected exactly one success" >&2
  cat "$log_a" >&2
  cat "$log_b" >&2
  rm -f "$log_a" "$log_b"
  exit 1
fi

loser_log="$log_a"
if [[ "$status_a" -eq 0 ]]; then loser_log="$log_b"; fi
if ! grep -qi "manual draft changed concurrently" "$loser_log"; then
  echo "concurrent draft update loser did not receive the optimistic conflict" >&2
  cat "$loser_log" >&2
  rm -f "$log_a" "$log_b"
  exit 1
fi

final_pair="$("${psql_base[@]}" -At -F '|' -c "select title, description from public.manual_revisions where id = '${DRAFT_ID}'::uuid")"
if [[ "$final_pair" != "Concurrent A|description A" && "$final_pair" != "Concurrent B|description B" ]]; then
  echo "concurrent draft update persisted mixed metadata: $final_pair" >&2
  rm -f "$log_a" "$log_b"
  exit 1
fi

rm -f "$log_a" "$log_b"
echo "update_manual_draft rejects the second same-version writer: OK"
