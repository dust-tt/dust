#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test "$(hostname -s)" = dfs-tantivy-jd-20261002-server
build_unit="${1:?build unit required}"
while systemctl is-active --quiet "$build_unit"; do
  sleep 2
done
test "$(systemctl show "$build_unit" -p Result --value)" = success
sudo systemctl stop dfs-search-tantivy-lance dfs-search-tantivy
for dataset in count100k bytes-large; do
  mkdir -p "results/tantivy-optimized/$dataset"
  echo pending > "results/tantivy-optimized/$dataset/phase"
done
for dataset in count100k bytes-large; do
  python3 lexical/scale-server.py --experiment tantivy-optimized --dataset "$dataset" --action attach > "results/tantivy-optimized/$dataset-attach.log" 2>&1
  python3 lexical/scale-server.py --experiment tantivy-optimized --dataset "$dataset" --action tantivy > "results/tantivy-optimized/$dataset-index.log" 2>&1
  while test "$(cat "results/tantivy-optimized/$dataset/phase")" != tantivy_measured; do
    sleep 2
  done
  python3 lexical/scale-live.py --experiment tantivy-optimized --dataset "$dataset" --output "results/tantivy-optimized/$dataset/tantivy-live.json" > "results/tantivy-optimized/$dataset-live.log" 2>&1
  python3 lexical/scale-server.py --experiment tantivy-optimized --dataset "$dataset" --action stop > "results/tantivy-optimized/$dataset-stop.log" 2>&1
  python3 lexical/scale-summarize.py "results/tantivy-optimized/$dataset"
  gzip "results/tantivy-optimized/$dataset/memory.jsonl"
done
sudo systemctl start dfs-search-tantivy dfs-search-tantivy-lance
