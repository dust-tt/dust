#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
run=runtime/data/resource-followup
mkdir -p "$run"
pid=$(systemctl show -p MainPID --value dfsd-poc)
test "$pid" -gt 0
python3 scripts/sample-metrics.py --bin target/release --endpoint https://127.0.0.1:7443 --ca runtime/server.crt --token-file runtime/data/network/credentials/admin.token --pids "$pid" --db runtime/data/network/db --output "$run/resources.jsonl" > "$run/sampler.log" 2>&1 &
sampler=$!
trap 'kill -TERM "$sampler" 2>/dev/null || true; wait "$sampler" 2>/dev/null || true' EXIT
cat "/proc/$pid/io" > "$run/io-before.txt"
du -sb runtime/data/network/db > "$run/storage-before.txt"
while ! test -f "$run/stop"; do sleep 1; done
sleep 3
kill -TERM "$sampler"
wait "$sampler"
trap - EXIT
cat "/proc/$pid/io" > "$run/io-after.txt"
du -sb runtime/data/network/db > "$run/storage-after.txt"
cp runtime/data/network/db/LOG "$run/rocksdb.log"
echo success > "$run/completed.txt"
