#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
variant=${1:-read-path}
case "$variant" in read-path|adaptive|directory-cache) ;; *) exit 2 ;; esac
test -x "runtime/controlled/dfs-mount-$variant"
out="results/optimization/$variant-correctness"
mkdir -p "runtime/$variant-bin" "$out"
for name in dfsd dfsctl dfs-load dfs-recovery; do
  ln -sf "$(pwd)/target/release/$name" "runtime/$variant-bin/$name"
done
ln -sf "$(pwd)/runtime/controlled/dfs-mount-$variant" "runtime/$variant-bin/dfs-mount"
export DFS_BIN="runtime/$variant-bin"
bash scripts/smoke.sh
python3 scripts/collect-run.py "$(cat results/latest-smoke.txt)" "$out/smoke"
bash scripts/policy-mount.sh
python3 scripts/collect-run.py "$(cat results/latest-policy.txt)" "$out/policy"
python3 scripts/failure-scenarios.py --bin "$DFS_BIN" --run "runtime/$variant-failures"
python3 scripts/collect-run.py "runtime/$variant-failures" "$out/failures"
echo success > "$out/completed.txt"
