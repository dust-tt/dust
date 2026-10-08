#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test "$(curl -fsS -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/project/project-id)" = dust-dev
: "${DFS_BIN:?Set the tested binary directory}"
run=runtime/client-cache-preliminary
out=results/client-cache/preliminary
mkdir -p "$run" "$out"
if ! test -d "$run/corpus"; then python3 vendor/generate.py "$run/corpus" > "$out/generate.log"; fi
if ! test -f "$run/credentials/credentials.json"; then "$DFS_BIN/dfsctl" provision --directory "$run/credentials" > "$out/provision.log"; fi
"$DFS_BIN/dfsd" --db "$run/db" --credentials "$run/credentials/credentials.json" > "$out/server.log" 2>&1 &
server_pid=$!
trap 'kill -TERM "$server_pid" 2>/dev/null || true; wait "$server_pid" || true' EXIT
for attempt in $(seq 1 100); do
  if "$DFS_BIN/dfsctl" --token-file "$run/credentials/admin.token" metrics > "$out/server-before.json" 2>/dev/null; then break; fi
  kill -0 "$server_pid"
  sleep 0.1
done
if ! test -f "$run/imported"; then
  "$DFS_BIN/dfsctl" --token-file "$run/credentials/admin.token" import --source "$run/corpus" --name corpus > "$out/import.json"
  touch "$run/imported"
fi
for variant in baseline current current-zero; do
  bin="$DFS_BIN"
  cache_bytes=33554432
  if test "$variant" = baseline; then bin="$PWD/results/client-cache/baseline-bin"; fi
  if test "$variant" = current-zero; then cache_bytes=0; fi
  sha256sum "$bin/dfs-mount" > "$out/$variant-binary.sha256"
  sudo systemd-run --quiet --wait --pipe --collect --unit="dfs-cache-probe-$variant" \
    --working-directory="$PWD" --property=MemoryMax=512M --property=MemorySwapMax=0 \
    --property=MemoryAccounting=yes python3 scripts/kernel-cache-run.py \
    --backend kernel --workload full --memory-bytes=536870912 --cache-bytes="$cache_bytes" \
    --bin "$bin" --token-file "$run/credentials/admin.token" --reference "$run/corpus" \
    --output "$out/$variant" > "$out/$variant.log" 2>&1
  "$DFS_BIN/dfsctl" --token-file "$run/credentials/admin.token" metrics > "$out/server-after-$variant.json"
done
