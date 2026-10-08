#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
run=runtime/controlled
out=results/optimization/equal-path
mkdir -p "$out" "$run"/{bench,dfs,gcs-default,gcs-cached,gcs-cache}
if ! rg -q '^user_allow_other$' /etc/fuse.conf; then printf 'user_allow_other\n' | sudo tee -a /etc/fuse.conf > /dev/null; fi
common=(--endpoint https://10.128.0.6:7443 --ca runtime/data/controlled/server.crt --token-file runtime/data/controlled/credentials/admin.token)
RUST_LOG=info target/release/dfs-mount "${common[@]}" --allow-other --mountpoint "$run/dfs" --metrics-file "$out/dfs-metrics.json" > "$out/dfs-mount.log" 2>&1 &
dfs=$!
gcsfuse --foreground -o allow_other --implicit-dirs --only-dir corpus --log-file "$out/gcs-default.log" dust-dev-dfs-opt-corpus-jd-20260930 "$run/gcs-default" > "$out/gcs-default-start.log" 2>&1 &
gcs_default=$!
gcsfuse --foreground -o allow_other --implicit-dirs --only-dir corpus --cache-dir "$run/gcs-cache" --file-cache-max-size-mb 256 --log-file "$out/gcs-cached.log" dust-dev-dfs-opt-corpus-jd-20260930 "$run/gcs-cached" > "$out/gcs-cached-start.log" 2>&1 &
gcs_cached=$!
cleanup() {
  if mountpoint -q "$run/bench"; then sudo umount "$run/bench"; fi
  fusermount3 -u "$run/gcs-default" 2>/dev/null || true
  fusermount3 -u "$run/gcs-cached" 2>/dev/null || true
  kill -TERM "$dfs" "$gcs_default" "$gcs_cached" 2>/dev/null || true
  wait "$dfs" "$gcs_default" "$gcs_cached" 2>/dev/null || true
}
trap cleanup EXIT
for attempt in $(seq 1 600); do
  if mountpoint -q "$run/dfs" && mountpoint -q "$run/gcs-default" && mountpoint -q "$run/gcs-cached"; then break; fi
  sleep 0.1
done
mountpoint -q "$run/dfs"
mountpoint -q "$run/gcs-default"
mountpoint -q "$run/gcs-cached"
mountpoint -q "$run/nfs"
python3 - <<'PY' > "$out/order.json"
import json, random
backends = ['dfs', 'nfs', 'ext4', 'gcs-default', 'gcs-cached']
rng = random.Random(42)
orders = []
for _ in range(3):
    order = backends.copy()
    rng.shuffle(order)
    orders.append(order)
print(json.dumps(orders, indent=2))
PY
python3 - <<'PY' > "$out/order.txt"
import json
for number, order in enumerate(json.load(open('results/optimization/equal-path/order.json')), 1):
    for backend in order:
        print(number, backend)
PY
while read -r round backend; do
  source="$run/$backend"
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
    python3 scripts/profile-metadata.py "$run/bench" > "$prefix-metadata-profile.txt"
  fi
  sudo umount "$run/bench"
done < "$out/order.txt"
sha256sum target/release/dfs-mount vendor/benchmark.py vendor/generate.py > "$out/binaries-source.sha256"
python3 scripts/fingerprint.py > "$out/source-manifest.json"
echo success > "$out/completed.txt"
