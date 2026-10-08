#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
setup_pid=$1
while kill -0 "$setup_pid" 2>/dev/null; do sleep 2; done
tar -xzf runtime/demand-source.tar.gz
"$HOME/.cargo/bin/cargo" clean --release --package dfs-poc
"$HOME/.cargo/bin/cargo" build --locked --release
"$HOME/.cargo/bin/cargo" test --locked --release
sha256sum target/release/{dfs-mount,dfsd,dfsctl} > results/demand/cloud-binaries.sha256
python3 scripts/fingerprint.py > results/demand/cloud-source.json
bash scripts/start-demand-server.sh 10.128.0.8
