#!/usr/bin/env bash
# Wait until local Temporal gRPC is ready (and ensure namespaces when using the shared image).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec bash "${ROOT}/dev/scripts/ensure-temporal.sh"
