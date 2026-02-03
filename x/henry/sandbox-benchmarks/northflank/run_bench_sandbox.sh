#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../../../.." && pwd)"

cd "$REPO_ROOT/front"

exec npx tsx ../x/henry/sandbox-benchmarks/northflank/bench_sandbox.ts "$@"
