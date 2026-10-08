#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -s results/demand/correctness-cloud-final/completed.txt
python3 scripts/demand-controlled.py --endpoint https://10.128.0.8:7443 --ca runtime/data/demand/server.crt --token-file runtime/data/demand/credentials/admin.token --nfs 10.35.15.130 --candidate runtime/demand-final-bin/dfs-mount --baseline runtime/controlled/dfs-mount-before --output results/demand/final-corpus --rounds 3 --native-root runtime/controlled/native --backends before adjacent nfs ext4 --workloads full scan branch deep tails one-file one-head heads sha
python3 scripts/analyze-demand.py results/demand/final-corpus > results/demand/final-corpus-summary.json
python3 scripts/demand-controlled.py --endpoint https://10.128.0.8:7443 --ca runtime/data/demand/server.crt --token-file runtime/data/demand/credentials/admin-1.token --nfs 10.35.15.130 --candidate runtime/demand-final-bin/dfs-mount --baseline runtime/controlled/dfs-mount-before --output results/demand/final-large --corpus large --rounds 3 --native-root runtime/controlled/native --backends adjacent nfs ext4 --workloads scan branch deep tails one-head heads sha
python3 scripts/analyze-demand.py results/demand/final-large > results/demand/final-large-summary.json
