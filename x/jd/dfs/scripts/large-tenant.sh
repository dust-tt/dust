#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
run=runtime/data/large-tenant
mkdir -p "$run"/{source,mount}
python3 - <<'PY'
from pathlib import Path
root = Path('runtime/data/large-tenant/source')
for directory in range(40):
    parent = root / f'dir-{directory:03}'
    parent.mkdir(exist_ok=True)
    for file in range(1000):
        (parent / f'file-{file:04}').touch()
PY
common=(--endpoint https://127.0.0.1:7443 --ca runtime/server.crt --token-file runtime/data/network/credentials/admin.token)
/usr/bin/time -v target/release/dfsctl "${common[@]}" import --source "$run/source" --name large > "$run/import.json" 2> "$run/import-time.txt"
RUST_LOG=info target/release/dfs-mount "${common[@]}" --mountpoint "$run/mount" --prefetch-bytes 0 --metrics-file "$run/client-metrics.json" > "$run/mount.log" 2>&1 &
mount=$!
trap 'kill -TERM "$mount" 2>/dev/null || true; wait "$mount" 2>/dev/null || true' EXIT
for attempt in $(seq 1 1200); do if mountpoint -q "$run/mount"; then break; fi; sleep 0.1; done
mountpoint -q "$run/mount"
python3 - <<'PY' > "$run/count.json"
import json, os, time
start = time.monotonic()
count = sum(len(files) for _, _, files in os.walk('runtime/data/large-tenant/mount/files/large'))
assert count == 40000
print(json.dumps({'files': count, 'walk_seconds': time.monotonic() - start}))
PY
target/release/dfs-load "${common[@]}" --samples 1000 --output "$run/publication.json"
cat "/proc/$mount/status" > "$run/mount-status.txt"
target/release/dfsctl "${common[@]}" metrics > "$run/metrics.json"
du -sb runtime/data/network/db > "$run/storage.txt"
echo success > "$run/completed.txt"
