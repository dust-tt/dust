#!/usr/bin/env bash
set -euo pipefail
test "$(hostname -s)" = dfs-tantivy-jd-20261002-server
experiment=/home/dfs/x/jd/dfs
run="$experiment/runtime/search-cloud"
mkdir -p "$experiment/runtime/tantivy-corpus"
tar -xzf /tmp/dfs-tantivy-corpus.tar.gz -C "$experiment/runtime/tantivy-corpus"
"$run/bin/dfsctl" --endpoint http://127.0.0.1:7453 --token-file "$run/credentials/admin.token" import --source "$experiment/runtime/tantivy-corpus/corpus/docs" --name corpus > "$experiment/runtime/tantivy-source/results/search-cloud/tantivy/import.json"
