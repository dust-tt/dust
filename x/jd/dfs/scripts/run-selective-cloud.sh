#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
server=$1
nfs=$2
ulimit -c 0
for mode in old selective; do
  binary=runtime/grants/bin
  if test "$mode" = old; then binary=runtime/grants/bin-old; fi
  for delivery in watch poll; do
    flags=()
    if test "$delivery" = poll; then flags+=(--drop-events); fi
    run="runtime/selective-cache-$mode-$delivery"
    python3 scripts/selective-cache-scenarios.py --bin "$binary" --run "$run" --mode "$mode" "${flags[@]}"
    cp "$run/results.json" "results/selective/cache-$mode-$delivery.json"
  done
done
systemd-run --quiet --wait --pipe --collect --unit=dfs-selective-propagation -p MemoryMax=2G -p MemorySwapMax=0 --working-directory="$PWD" /usr/bin/python3 scripts/grant-scenarios.py --server "$server" --nfs "$nfs" --output results/selective/propagation
python3 scripts/selective-scan-matrix.py --server "$server" --nfs "$nfs" --output results/selective/scans
python3 scripts/selective-full-matrix.py --server "$server" --nfs "$nfs" --output results/selective/full
cp -a results/grants results/selective/setup
python3 scripts/fingerprint.py > results/selective/source-final.json
printf 'complete\n' > results/selective/complete.txt
