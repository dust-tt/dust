#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
variant=${1:-baseline}
bin=target/linux/release
run=runtime/demand-local
out=results/demand/local-$variant
mkdir -p "$run"/{mount,credentials} "$out"
if ! test -f "$run/credentials/credentials.json"; then "$bin/dfsctl" provision --directory "$run/credentials"; fi
if ! test -d "$run/corpus"; then python3 vendor/generate.py "$run/corpus" --seed 42 > "$out/generate.txt"; fi
RUST_LOG=info "$bin/dfsd" --db "$run/db" --credentials "$run/credentials/credentials.json" > "$out/server.log" 2>&1 &
server_pid=$!
mount_pid=
cleanup() {
  if test -n "$mount_pid"; then kill -TERM "$mount_pid" 2>/dev/null || true; wait "$mount_pid" 2>/dev/null || true; fi
  kill -TERM "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
}
trap cleanup EXIT
for attempt in $(seq 1 100); do
  if "$bin/dfsctl" --token-file "$run/credentials/admin.token" metrics > "$out/server-before.json" 2>/dev/null; then break; fi
  sleep 0.1
done
if ! test -f "$run/import.json"; then "$bin/dfsctl" --token-file "$run/credentials/admin.token" import --source "$run/corpus" --name corpus > "$run/import.json"; fi
mount_bin=$bin/dfs-mount
if test "$variant" = baseline; then mount_bin=runtime/demand-baseline-bin/dfs-mount; fi
read_ahead=0
if test "$variant" = adjacent || test "$variant" = adaptive; then read_ahead=262144; fi
extra=()
if test "$variant" != baseline; then extra=(--read-ahead-bytes "$read_ahead"); fi
RUST_LOG=info "$mount_bin" --token-file "$run/credentials/admin.token" --mountpoint "$run/mount" --prefetch-bytes 0 --cache-bytes 33554432 --metrics-file "$out/client.json" "${extra[@]}" > "$out/mount.log" 2>&1 &
mount_pid=$!
for attempt in $(seq 1 200); do
  if mountpoint -q "$run/mount" && test -s "$out/client.json"; then break; fi
  sleep 0.05
done
mountpoint -q "$run/mount"
cp "$out/client.json" "$out/client-before.json"
python3 vendor/benchmark.py "$run/mount/files/corpus" --warm-runs 1 > "$out/benchmark.txt"
sleep 1.2
cp "$out/client.json" "$out/client-after.json"
"$bin/dfsctl" --token-file "$run/credentials/admin.token" metrics > "$out/server-after.json"
