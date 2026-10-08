#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -s results/demand/correctness-cloud-adjacent/completed.txt
test -s results/demand/native-ready.txt
python3 scripts/demand-controlled.py --endpoint https://10.128.0.8:7443 --ca runtime/data/demand/server.crt --token-file runtime/data/demand/credentials/admin.token --nfs 10.35.15.130 --candidate runtime/demand-bin/dfs-mount --baseline runtime/controlled/dfs-mount-before --output results/demand/pilot-candidate --rounds 1 --native-root runtime/controlled/native --backends before demand adjacent --workloads scan branch deep tails one-file one-head heads sha
python3 scripts/analyze-demand.py results/demand/pilot-candidate > results/demand/pilot-candidate-summary.json
