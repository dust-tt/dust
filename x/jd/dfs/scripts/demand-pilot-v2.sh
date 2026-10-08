#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -s results/demand/correctness-cloud-v2/completed.txt
for corpus in corpus large; do
  token=admin.token
  if test "$corpus" = large; then token=admin-1.token; fi
  python3 scripts/demand-controlled.py --endpoint https://10.128.0.8:7443 --ca runtime/data/demand/server.crt --token-file "runtime/data/demand/credentials/$token" --nfs 10.35.15.130 --candidate runtime/demand-v2-bin/dfs-mount --baseline runtime/controlled/dfs-mount-before --output "results/demand/pilot-v2-$corpus" --corpus "$corpus" --rounds 1 --native-root runtime/controlled/native --backends demand adjacent --workloads scan branch deep tails one-head heads sha
  python3 scripts/analyze-demand.py "results/demand/pilot-v2-$corpus" > "results/demand/pilot-v2-$corpus-summary.json"
done
