#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test "$(curl -fsS -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/project/project-id)" = dust-dev
source "$HOME/.cargo/env"
while systemctl is-active --quiet dfs-cache-baseline-build; do sleep 5; done
test "$(systemctl show dfs-cache-baseline-build -p Result --value)" = success
baseline=/home/jd/x/jd/baseline/dfs
mkdir -p results/client-cache/baseline-bin
if ! test -f results/client-cache/baseline-binaries.sha256; then
  cp "$baseline/target/release/dfsd" "$baseline/target/release/dfsctl" "$baseline/target/release/dfs-mount" results/client-cache/baseline-bin/
  sha256sum results/client-cache/baseline-bin/* > results/client-cache/baseline-binaries.sha256
fi
sha256sum --check results/client-cache/baseline-binaries.sha256
export CARGO_TARGET_DIR="$baseline/target"
cargo fmt --all
cargo test --locked --release > results/client-cache/tests.log 2>&1
if ! cargo clippy --locked --release --all-targets -- -D warnings > results/client-cache/clippy-strict.log 2>&1; then
  cargo clippy --locked --release --all-targets -- -D warnings -A clippy::result_large_err > results/client-cache/clippy.log 2>&1
fi
