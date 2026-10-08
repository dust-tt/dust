#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
run=runtime/resource-followup
mkdir -p "$run"
common=(--endpoint https://10.128.0.4:7443 --ca runtime/network/server.crt)
target/release/dfs-load "${common[@]}" --token-file runtime/network/admin-1.token --workers 8 --samples 3000 --payload-bytes 65536 --output "$run/busy.json" > "$run/busy.log" 2>&1 &
busy=$!
target/release/dfs-load "${common[@]}" --token-file runtime/network/admin.token --samples 2000 --pace-us 2000 --output "$run/probe.json"
wait "$busy"
