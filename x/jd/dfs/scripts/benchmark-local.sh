#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bin=${DFS_BIN:-target/release}
run="${DFS_RUN_ROOT:-runtime}/benchmark-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$run"/{mount,mount-b,credentials} results
python3 -m unittest discover -s vendor -p test_benchmark.py > "$run/benchmark-tests.txt" 2>&1
python3 vendor/generate.py "$run/corpus" --seed 42 > "$run/generate.txt"
"$bin/dfsctl" provision --directory "$run/credentials" --tenants 2
RUST_LOG=info "$bin/dfsd" --db "$run/db" --credentials "$run/credentials/credentials.json" > "$run/server.log" 2>&1 &
server_pid=$!
mount_pid=
mount_b_pid=
metrics_pid=
cleanup() {
  if test -n "$metrics_pid"; then kill -TERM "$metrics_pid" 2>/dev/null || true; wait "$metrics_pid" 2>/dev/null || true; fi
  if test -n "$mount_b_pid"; then kill -TERM "$mount_b_pid" 2>/dev/null || true; wait "$mount_b_pid" 2>/dev/null || true; fi
  if test -n "$mount_pid"; then kill -TERM "$mount_pid" 2>/dev/null || true; wait "$mount_pid" 2>/dev/null || true; fi
  kill -TERM "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
}
trap cleanup EXIT
for attempt in $(seq 1 100); do
  if "$bin/dfsctl" --token-file "$run/credentials/admin.token" metrics > "$run/metrics-start.json" 2>/dev/null; then break; fi
  sleep 0.1
done
"$bin/dfsctl" --token-file "$run/credentials/admin.token" import --source "$run/corpus" --name corpus > "$run/import.json"
RUST_LOG=info "$bin/dfs-mount" --token-file "$run/credentials/admin.token" --mountpoint "$run/mount" --metrics-file "$run/client-metrics.json" > "$run/mount.log" 2>&1 &
mount_pid=$!
for attempt in $(seq 1 600); do
  if mountpoint -q "$run/mount"; then break; fi
  sleep 0.1
done
mountpoint -q "$run/mount"
python3 scripts/sample-metrics.py --bin "$bin" --token-file "$run/credentials/admin.token" --pids "$server_pid" "$mount_pid" --output "$run/resources.jsonl" &
metrics_pid=$!
python3 scripts/fingerprint.py > "$run/source-manifest.json"
cp "$run/client-metrics.json" "$run/client-before.json"
python3 scripts/benchmark-observed.py --demand-filled --metrics "$run/client-metrics.json" --observations "$run/readonly-rpcs.json" "$run/mount/files/corpus" --warm-runs 3 > "$run/dfs.txt"
sleep 1.1
cp "$run/client-metrics.json" "$run/client-after.json"
python3 vendor/benchmark.py "$run/corpus" --warm-runs 3 > "$run/local-baseline.txt"
"$bin/dfs-load" --token-file "$run/credentials/admin.token" --samples 1000 --output "$run/publication.json"
"$bin/dfs-race-bench" --token-file "$run/credentials/admin-1.token" --samples "${DFS_RACE_SAMPLES:-100}" --output "$run/namespace-races.jsonl"
RUST_LOG=info "$bin/dfs-mount" --token-file "$run/credentials/admin.token" --mountpoint "$run/mount-b" --metrics-file "$run/client-b-metrics.json" > "$run/mount-b.log" 2>&1 &
mount_b_pid=$!
for attempt in $(seq 1 600); do
  if mountpoint -q "$run/mount-b"; then break; fi
  sleep 0.1
done
mountpoint -q "$run/mount-b"
python3 scripts/namespace-mount-races.py --mount-a "$run/mount" --mount-b "$run/mount-b" --samples "${DFS_MOUNT_RACE_SAMPLES:-10}" --output "$run/mount-races.jsonl"
"$bin/dfsctl" --token-file "$run/credentials/admin.token" metrics > "$run/metrics-end.json"
du -sb "$run/db" > "$run/storage.txt"
uname -a > "$run/environment.txt"
findmnt "$run/mount" >> "$run/environment.txt"
printf '%s\n' "$run" > results/latest-benchmark.txt
