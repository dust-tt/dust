#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
run=runtime/network
bin=target/release
endpoint=https://10.128.0.4:7443
common=(--endpoint "$endpoint" --ca "$run/server.crt" --token-file "$run/admin.token")
mkdir -p "$run"/{a,b,cold}
"$bin/dfsctl" "${common[@]}" metrics > "$run/metrics-before.json"
RUST_LOG=info "$bin/dfs-mount" "${common[@]}" --mountpoint "$run/a" --metrics-file "$run/a-metrics.json" > "$run/a.log" 2>&1 &
a=$!
RUST_LOG=info "$bin/dfs-mount" "${common[@]}" --mountpoint "$run/b" --metrics-file "$run/b-metrics.json" > "$run/b.log" 2>&1 &
b=$!
metrics=
cleanup() { if test -n "$metrics"; then kill -TERM "$metrics" 2>/dev/null || true; wait "$metrics" 2>/dev/null || true; metrics=; fi; kill -TERM "$a" "$b" 2>/dev/null || true; wait "$a" "$b" 2>/dev/null || true; }
trap cleanup EXIT
for attempt in $(seq 1 1200); do
  if mountpoint -q "$run/a" && mountpoint -q "$run/b"; then break; fi
  sleep 0.1
done
mountpoint -q "$run/a"
mountpoint -q "$run/b"
python3 scripts/sample-metrics.py --bin "$bin" "${common[@]}" --pids "$a" "$b" --output "$run/client-resources.jsonl" > "$run/client-sampler.log" 2>&1 &
metrics=$!
python3 scripts/visibility.py "$run/a" "$run/b" "${common[@]}" --bin "$bin" --output "$run/visibility-idle.json"
python3 scripts/benchmark-observed.py --metrics "$run/a-metrics.json" --observations "$run/readonly-rpcs.json" "$run/a/files/corpus" --warm-runs 3 > "$run/dfs-warm.txt"
"$bin/dfs-load" "${common[@]}" --samples 2000 --output "$run/probe-idle.json"
"$bin/dfs-load" --endpoint "$endpoint" --ca "$run/server.crt" --token-file "$run/admin-1.token" --workers 8 --samples 3000 --payload-bytes 65536 --output "$run/busy-tenant.json" > "$run/busy.log" 2>&1 &
busy=$!
"$bin/dfs-load" "${common[@]}" --samples 2000 --pace-us 2000 --output "$run/probe-busy.json" &
probe=$!
python3 scripts/visibility.py "$run/a" "$run/b" "${common[@]}" --bin "$bin" --output "$run/visibility-busy.json"
wait "$probe"
wait "$busy"
"$bin/dfsctl" "${common[@]}" metrics > "$run/metrics-after.json"
cleanup
trap - EXIT
RUST_LOG=info "$bin/dfs-mount" "${common[@]}" --mountpoint "$run/cold" --prefetch-bytes 0 --metrics-file "$run/cold-metrics.json" > "$run/cold.log" 2>&1 &
cold=$!
trap 'kill -TERM "$cold" 2>/dev/null || true; wait "$cold" 2>/dev/null || true' EXIT
for attempt in $(seq 1 300); do if mountpoint -q "$run/cold"; then break; fi; sleep 0.1; done
cp "$run/cold-metrics.json" "$run/cold-before.json"
python3 vendor/benchmark.py "$run/cold/files/corpus" --warm-runs 1 > "$run/dfs-client-cold.txt"
sleep 1.1
cp "$run/cold-metrics.json" "$run/cold-after.json"
python3 vendor/generate.py "$run/corpus" --seed 42 > "$run/generate.txt"
python3 vendor/benchmark.py "$run/corpus" --warm-runs 3 > "$run/client-baseline.txt"
sha256sum target/release/dfsd target/release/dfs-mount target/release/dfs-load target/release/dfsctl > "$run/binaries.sha256"
uname -a > "$run/environment.txt"
python3 scripts/fingerprint.py > "$run/source-manifest.json"
echo success > "$run/completed.txt"
