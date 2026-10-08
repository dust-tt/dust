#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -s results/demand/server-large-ready.txt
mkdir -p runtime/demand-bin
for name in dfsd dfsctl dfs-mount dfs-load dfs-recovery; do
  cp "target/release/$name" "runtime/demand-bin/$name"
  strip "runtime/demand-bin/$name"
done
sha256sum runtime/demand-bin/* > results/demand/client-binaries.sha256
tar -czf runtime/demand-client.tar.gz runtime/demand-bin runtime/data/demand/server.crt runtime/data/demand/credentials/admin.token runtime/data/demand/credentials/admin-1.token
