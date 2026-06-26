#!/usr/bin/env bash
# Start the local dev environment with process-compose.
# Replaces tools/start-mprocs.sh.
#
# Requirements:
# * process-compose (`brew install f1bonacc1/tap/process-compose`)
# * cargo-watch (`cargo install cargo-watch`)  -- live reload for Rust services
set -euo pipefail

# Where this script lives (absolute path).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Repo root is the parent of tools/. Exported so process-compose.yaml can build
# absolute working_dir / readiness paths via ${DUST_DEV_ROOT}.
DUST_DEV_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
export DUST_DEV_ROOT

# Sentinel checked by the _check-start-script process: proves the dev stack was
# launched through this wrapper (and therefore that the setup steps below ran).
export DUST_USE_DEV_SH=1

# Force colored output: process-compose captures stdout into its log view, so
# tools would otherwise disable colors when they detect a non-TTY pipe.
export FORCE_COLOR=1

if ! command -v process-compose >/dev/null 2>&1; then
  echo "process-compose is not installed."
  echo "Install it with: brew install f1bonacc1/tap/process-compose"
  exit 1
fi

if ! command -v cargo-watch >/dev/null 2>&1; then
  echo "cargo-watch is not installed."
  echo "Install it with: cargo install cargo-watch"
  exit 1
fi

# Source and select the correct Node version using nvm. All Node projects in
# this repo pin the same version (see .nvmrc), so a single `nvm use` here is
# inherited (via PATH) by every process-compose process.
# If DUST_NODE_VERSION is set (e.g. via `source scripts/try-node24.sh`), use
# that version instead of the .nvmrc default.
# shellcheck disable=SC1090
source ~/.nvm/nvm.sh
if [ -n "${DUST_NODE_VERSION:-}" ]; then
  nvm install "$DUST_NODE_VERSION"
  nvm use "$DUST_NODE_VERSION"
else
  nvm install
fi

# Clear the sdks-js dist so dependents wait for a fresh build instead of
# starting against a stale SDK. The sdks-js readiness probe checks for a dist
# file, so a leftover dist would let front-api/connectors start immediately.
rm -rf "$DUST_DEV_ROOT/sdks/js/dist"

# Install npm workspace dependencies.
(cd "$DUST_DEV_ROOT" && npm install)

# Launch process-compose (TUI). Services and their dependencies are defined in
# process-compose.yaml; closing the TUI stops the managed processes.
cd "$DUST_DEV_ROOT"
exec process-compose -f "$SCRIPT_DIR/process-compose.yaml"
