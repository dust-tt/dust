#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -f results/optimization/equal-path/completed.txt
run=runtime/controlled
variant=${1:-read-path}
case "$variant" in read-path|adaptive|directory-cache) ;; *) exit 2 ;; esac
out="results/optimization/$variant"
mkdir -p "$out" "$run/bench" "$run/dfs"
common=(--endpoint https://10.128.0.6:7443 --ca runtime/data/controlled/server.crt --token-file runtime/data/controlled/credentials/admin.token)
RUST_LOG=info "$run/dfs-mount-$variant" "${common[@]}" --allow-other --mountpoint "$run/dfs" --metrics-file "$out/dfs-metrics.json" > "$out/dfs-mount.log" 2>&1 &
dfs=$!
cleanup() {
  if mountpoint -q "$run/bench"; then sudo umount "$run/bench"; fi
  kill -TERM "$dfs" 2>/dev/null || true
  wait "$dfs" 2>/dev/null || true
}
trap cleanup EXIT
for attempt in $(seq 1 600); do
  if mountpoint -q "$run/dfs"; then break; fi
  sleep 0.1
done
mountpoint -q "$run/dfs"
mountpoint -q "$run/nfs"
python3 - <<'PY' > "$out/order.txt"
import random
rng = random.Random(84)
for number in range(1, 4):
    backends = ['dfs', 'nfs', 'ext4']
    rng.shuffle(backends)
    for backend in backends:
        print(number, backend)
PY
while read -r round backend; do
  case "$backend" in
    dfs) source="$run/dfs/files/corpus" ;;
    nfs) source="$run/nfs/corpus" ;;
    ext4) source="$run/corpus" ;;
  esac
  prefix="$out/$round-$backend"
  sudo mount --bind "$source" "$run/bench"
  findmnt "$run/bench" > "$prefix-mount.txt"
  date -u +%FT%TZ > "$prefix-start.txt"
  if test "$backend" = dfs; then
    /usr/bin/time -v python3 scripts/benchmark-observed.py --metrics "$out/dfs-metrics.json" --observations "$prefix-rpcs.json" "$run/bench" --warm-runs 3 > "$prefix.txt" 2> "$prefix-resources.txt"
  else
    /usr/bin/time -v python3 vendor/benchmark.py "$run/bench" --warm-runs 3 > "$prefix.txt" 2> "$prefix-resources.txt"
  fi
  date -u +%FT%TZ > "$prefix-end.txt"
  if test "$round" = 1; then
    python3 scripts/metadata-syscalls.py "$run/bench" > "$prefix-metadata-diagnostic.json"
    python3 scripts/metadata-bookkeeping.py "$run/bench" > "$prefix-metadata-bookkeeping.json"
  fi
  sudo umount "$run/bench"
done < "$out/order.txt"
sha256sum "$run/dfs-mount-$variant" vendor/benchmark.py vendor/generate.py > "$out/binaries-source.sha256"
echo success > "$out/completed.txt"
