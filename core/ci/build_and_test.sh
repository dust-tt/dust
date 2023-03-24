#!/bin/bash

set -euo pipefail

export RUSTFLAGS="-D warnings"

# Print version information
rustc -Vv
cargo -V

# Build and test
cargo build --locked
cargo test
cargo fmt --all -- --check