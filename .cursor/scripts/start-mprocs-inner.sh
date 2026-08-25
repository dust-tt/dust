#!/usr/bin/env bash
# Container entrypoint for tools/mprocs.yaml — deps, watches, and services.
# npm install + bacon rebuilds happen here, not in Cursor install/start.
set -euo pipefail

DUST_DEV_SCRIPT_NAME=start-mprocs
# shellcheck source=.cursor/scripts/common.sh
source "$(dirname "$0")/common.sh"
# shellcheck source=.cursor/scripts/env.defaults.sh
source "$(dirname "$0")/env.defaults.sh"

ensure_node_path
install_cursor_runtime_config

cd "$DUST_REPO_ROOT"

# Force dependents to wait for a fresh sdks-js build (same as tools/start-mprocs.sh).
rm -rf sdks/js/dist

log "Running npm install (incremental; re-run this terminal to pick up lockfile changes)..."
npm install

export DUST_USE_START_MPROCS=1

log "Starting mprocs (select a process and press r to restart; q to quit)"
cd "${DUST_REPO_ROOT}/tools"
exec env \
  SHELL=/bin/bash \
  TERM="${TERM}" \
  COLORTERM="${COLORTERM}" \
  LANG="${LANG}" \
  LC_ALL="${LC_ALL}" \
  mprocs --config mprocs.yaml
