#!/usr/bin/env bash
# Ensure the local Temporal dev server is up before starting workers or connectors.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec bash "${ROOT}/.cursor/scripts/ensure-temporal.sh"
