#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test "$(curl -fsS -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/project/project-id)" = dust-dev
: "${DFS_BIN:?Set the tested binary directory}"
run=runtime/client-cache-preliminary
out=${DFS_PRESSURE_OUTPUT:-results/client-cache/pressure}
mkdir -p "$out"
test -f "$run/imported"
sha256sum "$DFS_BIN/dfsd" "$DFS_BIN/dfs-mount" > "$out/binaries.sha256"
"$DFS_BIN/dfsd" --db "$run/db" --credentials "$run/credentials/credentials.json" --tenant-bytes="${DFS_PRESSURE_TENANT_BYTES:-8589934592}" > "$out/server.log" 2>&1 &
server_pid=$!
trap 'kill -TERM "$server_pid" 2>/dev/null || true; wait "$server_pid" || true' EXIT
ready=0
for attempt in $(seq 1 1200); do
  if "$DFS_BIN/dfsctl" --token-file "$run/credentials/admin.token" metrics > "$out/server-before.json" 2>/dev/null; then ready=1; break; fi
  kill -0 "$server_pid"
  sleep 0.1
done
test "$ready" = 1
for cache_bytes in 0 33554432; do
  sudo systemd-run --quiet --wait --pipe --collect --unit="dfs-writeback-pressure-$cache_bytes" \
    --working-directory="$PWD" --property=MemoryMax=256M --property=MemorySwapMax=0 \
    --property=MemoryAccounting=yes python3 scripts/kernel-cache-run.py \
    --backend kernel --workload pressure --memory-bytes=268435456 --cache-bytes="$cache_bytes" \
    --experimental-kernel-writeback --durable-sync --pressure-bytes="${DFS_PRESSURE_BYTES:-536870912}" \
    --bin "$DFS_BIN" --token-file "$run/credentials/admin.token" --reference "$run/corpus" \
    --output "$out/cache-$cache_bytes" > "$out/cache-$cache_bytes.log" 2>&1
  "$DFS_BIN/dfsctl" --token-file "$run/credentials/admin.token" metrics > "$out/server-after-$cache_bytes.json"
done
