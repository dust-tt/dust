#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test "$(hostname -s)" = dfs-tantivy-jd-20261002-server
export PATH="$HOME/.cargo/bin:$PATH"
export CARGO_TARGET_DIR="/home/dfs/x/jd/dfs/runtime/data/tantivy-target"
export CARGO_BUILD_JOBS=12
export CARGO_PROFILE_DEV_DEBUG=0
export CARGO_PROFILE_TEST_DEBUG=0
export CARGO_PROFILE_RELEASE_DEBUG=1
mkdir -p results/search-cloud/tantivy
cargo fmt --all -- --check > results/search-cloud/tantivy/format.log 2>&1
cargo test --release --locked --features lexical-search > results/search-cloud/tantivy/tests.log 2>&1
cargo clippy --release --locked --features lexical-search --all-targets -- -D warnings > results/search-cloud/tantivy/clippy.log 2>&1
cargo build --locked --release --features lexical-search --bin dfsd --bin dfsctl > results/search-cloud/tantivy/release.log 2>&1
sha256sum Cargo.lock Cargo.toml src/lexical/*.rs src/export.rs src/bin/dfsd.rs tests/lexical.rs > results/search-cloud/tantivy/source.sha256
sha256sum "$CARGO_TARGET_DIR/release/dfsd" > results/search-cloud/tantivy/binary.sha256
