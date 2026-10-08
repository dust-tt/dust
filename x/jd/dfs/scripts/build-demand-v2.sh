#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
server_pid=$(cat runtime/data/demand/server.pid)
sha256sum "/proc/$server_pid/exe" > results/demand/running-server.sha256
cp results/demand/cloud-source.json results/demand/running-server-source.json
tar -xzf runtime/source-adaptive-v2-final.tar.gz
"$HOME/.cargo/bin/cargo" clean --release --package dfs-poc
"$HOME/.cargo/bin/cargo" build --locked --release
"$HOME/.cargo/bin/cargo" test --locked --release
mkdir -p runtime/demand-v2-bin
for name in dfsd dfsctl dfs-mount dfs-load dfs-recovery; do
  cp "target/release/$name" "runtime/demand-v2-bin/$name"
  strip "runtime/demand-v2-bin/$name"
done
sha256sum runtime/demand-v2-bin/* > results/demand/v2-binaries.sha256
python3 scripts/fingerprint.py > results/demand/v2-source.json
tar -czf runtime/demand-v2-client.tar.gz runtime/demand-v2-bin
printf 'success\n' > results/demand/v2-built.txt
