#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
run=runtime/controlled
out=results/optimization/baselines
mkdir -p "$out" "$run"/{nfs,gcs,gcs-cache}
python3 vendor/benchmark.py "$run/corpus" --warm-runs 3 > "$out/ext4.txt"
gcsfuse --foreground --implicit-dirs --only-dir corpus --log-file "$out/gcs-default.log" dust-dev-dfs-opt-corpus-jd-20260930 "$run/gcs" > "$out/gcs-default-start.txt" 2>&1 &
gcs=$!
trap 'fusermount3 -u runtime/controlled/gcs 2>/dev/null || true; kill -TERM "$gcs" 2>/dev/null || true; wait "$gcs" 2>/dev/null || true' EXIT
for attempt in $(seq 1 300); do if mountpoint -q "$run/gcs"; then break; fi; sleep 0.1; done
mountpoint -q "$run/gcs"
findmnt "$run/gcs" > "$out/gcs-default-mount.txt"
python3 vendor/benchmark.py "$run/gcs" --warm-runs 3 > "$out/gcs-default.txt"
fusermount3 -u "$run/gcs"
wait "$gcs"
gcsfuse --foreground --implicit-dirs --only-dir corpus --cache-dir "$run/gcs-cache" --file-cache-max-size-mb 256 --log-file "$out/gcs-cached.log" dust-dev-dfs-opt-corpus-jd-20260930 "$run/gcs" > "$out/gcs-cached-start.txt" 2>&1 &
gcs=$!
for attempt in $(seq 1 300); do if mountpoint -q "$run/gcs"; then break; fi; sleep 0.1; done
mountpoint -q "$run/gcs"
findmnt "$run/gcs" > "$out/gcs-cached-mount.txt"
python3 vendor/benchmark.py "$run/gcs" --warm-runs 3 > "$out/gcs-cached.txt"
fusermount3 -u "$run/gcs"
wait "$gcs"
trap - EXIT
echo success > "$out/gcs-completed.txt"
