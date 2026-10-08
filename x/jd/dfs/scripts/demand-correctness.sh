#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
base=$(realpath "$1")
label=$2
run="runtime/demand-check-$label"
out="results/demand/correctness-$label"
mkdir -p "$run/bin" "$out"
for name in dfsd dfsctl dfs-load dfs-recovery; do ln -sf "$base/$name" "$run/bin/$name"; done
printf '#!/usr/bin/env bash\nexec %q --read-ahead-bytes 262144 "$@"\n' "$base/dfs-mount" > "$run/bin/dfs-mount"
chmod +x "$run/bin/dfs-mount"
export DFS_BIN="$run/bin"
timeout 120 bash scripts/smoke.sh
python3 scripts/collect-run.py "$(cat results/latest-smoke.txt)" "$out/smoke"
timeout 120 bash scripts/policy-mount.sh
python3 scripts/collect-run.py "$(cat results/latest-policy.txt)" "$out/policy"
python3 scripts/failure-scenarios.py --bin "$DFS_BIN" --run "$run/failures"
python3 scripts/collect-run.py "$run/failures" "$out/failures"
echo success > "$out/completed.txt"
