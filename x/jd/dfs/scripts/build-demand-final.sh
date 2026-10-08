#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
tar -xzf runtime/source-final.tar.gz --exclude=scripts/build-demand-final.sh
"$HOME/.cargo/bin/rustup" component add clippy rustfmt
"$HOME/.cargo/bin/cargo" clean --release --package dfs-poc
"$HOME/.cargo/bin/cargo" build --locked --release
"$HOME/.cargo/bin/cargo" test --locked --release
"$HOME/.cargo/bin/cargo" clippy --locked --release --all-targets -- -D warnings
"$HOME/.cargo/bin/cargo" fmt --check
mkdir -p runtime/demand-final-bin
for name in dfsd dfsctl dfs-mount dfs-load dfs-recovery; do
  cp "target/release/$name" "runtime/demand-final-bin/$name"
  strip "runtime/demand-final-bin/$name"
done
sha256sum runtime/demand-final-bin/* > results/demand/final-binaries.sha256
python3 scripts/fingerprint.py > results/demand/final-source.json
tar -czf runtime/demand-final-client.tar.gz runtime/demand-final-bin
printf 'success\n' > results/demand/final-built.txt
