#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker build -t dfs-poc-build -f deploy/Dockerfile .
docker run --rm -v "$PWD:/dfs" dfs-poc-build cargo build --locked --release
