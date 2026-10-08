#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
run=runtime/controlled
common=(--endpoint https://10.128.0.6:7443 --ca runtime/data/controlled/server.crt --token-file runtime/data/controlled/credentials/admin.token)
for variant in before metadata; do
  out="results/optimization/dfs-$variant"
  mkdir -p "$out" "$run/dfs"
  binary=target/release/dfs-mount
  if test "$variant" = before; then binary="$run/dfs-mount-before"; fi
  RUST_LOG=info "$binary" "${common[@]}" --mountpoint "$run/dfs" --metrics-file "$out/client-metrics.json" > "$out/mount.log" 2>&1 &
  mount=$!
  trap 'fusermount3 -uz runtime/controlled/dfs 2>/dev/null || true; kill -TERM "$mount" 2>/dev/null || true; wait "$mount" 2>/dev/null || true' EXIT
  for attempt in $(seq 1 600); do if mountpoint -q "$run/dfs"; then break; fi; sleep 0.1; done
  mountpoint -q "$run/dfs"
  cp "$out/client-metrics.json" "$out/client-before.json"
  python3 scripts/benchmark-observed.py --metrics "$out/client-metrics.json" --observations "$out/readonly-rpcs.json" "$run/dfs/files/corpus" --warm-runs 3 > "$out/benchmark.txt"
  sleep 1.1
  cp "$out/client-metrics.json" "$out/client-after.json"
  findmnt "$run/dfs" > "$out/mount-options.txt"
  sha256sum "$binary" > "$out/binary.sha256"
  kill -TERM "$mount"
  wait "$mount"
  trap - EXIT
done
python3 scripts/fingerprint.py > results/optimization/client-source-manifest.json
