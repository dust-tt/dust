#!/usr/bin/env bash
set -euo pipefail

# Simple runner for the Datadog Log Exporter TS CLI.
# - Ensures the CLI is built (runs npm install/build if needed)
# - Verifies required env vars
# - Forwards all arguments to the CLI

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f "dist/index.js" ]]; then
  echo "[datadog-log-exporter] Building TypeScript CLI..."
  npm install >/dev/null 2>&1
  npm run build
fi

if [[ -z "${DATADOG_API_KEY:-}" ]]; then
  echo "Error: DATADOG_API_KEY is not set" >&2
  exit 1
fi

if [[ -z "${DATADOG_APP_KEY:-}" ]]; then
  echo "Error: DATADOG_APP_KEY is not set" >&2
  exit 1
fi

exec node dist/index.js "$@"

