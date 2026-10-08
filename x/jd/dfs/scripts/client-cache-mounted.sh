#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test "$(curl -fsS -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/project/project-id)" = dust-dev
: "${DFS_BIN:?Set the tested binary directory}"
out=${DFS_CHECK_OUTPUT:-results/client-cache}
mkdir -p "$out"
for cache_bytes in 33554432 0; do
  DFS_CACHE_BYTES="$cache_bytes" bash scripts/smoke.sh > "$out/mounted-$cache_bytes.log" 2>&1
  cp "$(cat results/latest-smoke.txt)/unix.json" "$out/mounted-$cache_bytes.json"
done
bash scripts/policy-mount.sh > "$out/policy.log" 2>&1
cp "$(cat results/latest-policy.txt)/policy.json" "$out/policy.json"
