#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bin=${DFS_BIN:-target/release}
run="runtime/policy-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$run"/{a,b,credentials}
"$bin/dfsctl" provision --directory "$run/credentials"
RUST_LOG=info "$bin/dfsd" --db "$run/db" --credentials "$run/credentials/credentials.json" > "$run/server.log" 2>&1 &
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
  if "$bin/dfsctl" --token-file "$run/credentials/admin.token" metrics > /dev/null 2>&1; then break; fi
  sleep 0.1
done
RUST_LOG=info "$bin/dfs-mount" --token-file "$run/credentials/admin.token" --mountpoint "$run/a" > "$run/mount-a.log" 2>&1 &
mount_a_pid=$!
RUST_LOG=info "$bin/dfs-mount" --token-file "$run/credentials/alice.token" --mountpoint "$run/b" --drop-events > "$run/mount-b.log" 2>&1 &
mount_b_pid=$!
for attempt in $(seq 1 100); do
  if mountpoint -q "$run/a" && mountpoint -q "$run/b"; then break; fi
  sleep 0.1
done
mountpoint -q "$run/a"
mountpoint -q "$run/b"
python3 scripts/policy-scenarios.py "$run" --bin "$bin"
printf '%s\n' "$run" > results/latest-policy.txt
