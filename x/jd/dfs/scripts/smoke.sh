#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bin=${DFS_BIN:-target/release}
mount_options=()
scenarios=scripts/unix_scenarios.py
if test "${DFS_WRITEBACK:-0}" = 1; then
  mount_options+=(--experimental-kernel-writeback)
  scenarios=scripts/writeback_scenarios.py
fi
if test -n "${DFS_CACHE_BYTES:-}"; then
  mount_options+=(--cache-bytes "$DFS_CACHE_BYTES")
fi
mkdir -p runtime
run=$(mktemp -d "runtime/smoke-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
mkdir -p "$run"/{a,b,credentials} results
"$bin/dfsctl" provision --directory "$run/credentials"
RUST_LOG=${RUST_LOG:-info} "$bin/dfsd" --db "$run/db" --credentials "$run/credentials/credentials.json" > "$run/server.log" 2>&1 &
server_pid=$!
mount_a_pid=
mount_b_pid=
cleanup() {
  if test -n "$mount_a_pid"; then kill -TERM "$mount_a_pid" 2>/dev/null || true; fi
  if test -n "$mount_b_pid"; then kill -TERM "$mount_b_pid" 2>/dev/null || true; fi
  wait "$mount_a_pid" "$mount_b_pid" 2>/dev/null || true
  kill -TERM "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
}
trap cleanup EXIT
for attempt in $(seq 1 100); do
  if "$bin/dfsctl" --token-file "$run/credentials/admin.token" metrics > "$run/metrics-start.json" 2>/dev/null; then break; fi
  sleep 0.1
done
RUST_LOG=${RUST_LOG:-info} "$bin/dfs-mount" "${mount_options[@]}" --token-file "$run/credentials/admin.token" --mountpoint "$run/a" > "$run/mount-a.log" 2>&1 &
mount_a_pid=$!
RUST_LOG=${RUST_LOG:-info} "$bin/dfs-mount" "${mount_options[@]}" --token-file "$run/credentials/admin.token" --mountpoint "$run/b" > "$run/mount-b.log" 2>&1 &
mount_b_pid=$!
for attempt in $(seq 1 100); do
  if mountpoint -q "$run/a" && mountpoint -q "$run/b"; then break; fi
  sleep 0.1
done
mountpoint -q "$run/a"
mountpoint -q "$run/b"
python3 "$scenarios" "$run/a" "$run/b" --output "$run/unix.json" 2>&1 | tee "$run/unix.log"
"$bin/dfsctl" --token-file "$run/credentials/admin.token" metrics > "$run/metrics-end.json"
printf '%s\n' "$run" > results/latest-smoke.txt
