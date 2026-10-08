#!/usr/bin/env bash
set -euo pipefail
ulimit -c 0
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$PATH"
mkdir -p results/kernel-cache runtime/kernel-cache-bin
rustup component add clippy rustfmt
cargo clean --release --package dfs-poc
cargo build --locked --release -j 4
cargo test --locked --release -j 4
cargo clippy --locked --release -j 4 --all-targets -- -D warnings
cargo fmt --check
bash scripts/smoke.sh
bash scripts/policy-mount.sh
python3 scripts/failure-scenarios.py --bin target/release --run runtime/kernel-cache-failures
cp "$(cat results/latest-smoke.txt)/unix.json" results/kernel-cache/cloud-unix.json
cp "$(cat results/latest-policy.txt)/policy.json" results/kernel-cache/cloud-policy.json
cp runtime/kernel-cache-failures/failure.json results/kernel-cache/cloud-failures.json
for name in dfsd dfsctl dfs-mount; do
  cp "target/release/$name" "runtime/kernel-cache-bin/$name"
  strip "runtime/kernel-cache-bin/$name"
done
sha256sum runtime/kernel-cache-bin/* > results/kernel-cache/binaries.sha256
python3 scripts/fingerprint.py > results/kernel-cache/source.json
rustc -Vv > results/kernel-cache/rustc.txt
uname -a > results/kernel-cache/kernel.txt
tar -czf runtime/kernel-cache-binaries.tar.gz runtime/kernel-cache-bin
printf 'ready\n' > results/kernel-cache/build-ready.txt
bash scripts/start-demand-server.sh 10.128.0.10
printf 'ready\n' > results/kernel-cache/server-ready.txt
