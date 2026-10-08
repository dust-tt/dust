#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
run=runtime/data/colocated-final
corpus=$(cat results/latest-benchmark.txt)/corpus
mkdir -p "$run/mount" runtime/boot-baseline
common=(--endpoint https://127.0.0.1:7443 --ca runtime/server.crt --token-file runtime/data/network/credentials/admin.token)
RUST_LOG=info target/release/dfs-mount "${common[@]}" --mountpoint "$run/mount" --metrics-file "$run/client-metrics.json" > "$run/mount.log" 2>&1 &
mount=$!
trap 'kill -TERM "$mount" 2>/dev/null || true; wait "$mount" 2>/dev/null || true' EXIT
for attempt in $(seq 1 600); do if mountpoint -q "$run/mount"; then break; fi; sleep 0.1; done
mountpoint -q "$run/mount"
cp "$run/client-metrics.json" "$run/client-before.json"
python3 scripts/benchmark-observed.py --metrics "$run/client-metrics.json" --observations "$run/readonly-rpcs.json" "$run/mount/files/corpus" --warm-runs 3 > "$run/dfs.txt"
python3 vendor/benchmark.py "$corpus" --warm-runs 3 > "$run/pd-ssd-baseline.txt"
cp -a "$corpus/." runtime/boot-baseline/
python3 vendor/benchmark.py runtime/boot-baseline --warm-runs 3 > "$run/boot-baseline.txt"
target/release/dfs-load "${common[@]}" --samples 2000 --output "$run/publication.json"
cp "$run/client-metrics.json" "$run/client-after.json"
sha256sum target/release/dfsd target/release/dfs-mount target/release/dfs-load target/release/dfsctl > "$run/binaries.sha256"
python3 scripts/fingerprint.py > "$run/source-manifest.json"
uname -a > "$run/environment.txt"
findmnt "$run/mount" >> "$run/environment.txt"
echo success > "$run/completed.txt"
