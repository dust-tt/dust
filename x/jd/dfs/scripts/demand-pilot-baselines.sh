#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
while ! test -s results/demand/data-ready.txt; do sleep 2; done
python3 scripts/demand-controlled.py --endpoint https://10.128.0.8:7443 --ca /dev/null --token-file /dev/null --nfs 10.35.15.130 --candidate runtime/controlled/dfs-mount-before --baseline runtime/controlled/dfs-mount-before --output results/demand/pilot-baselines --rounds 1 --backends nfs ext4 --workloads one-file tails branch deep scan sha
