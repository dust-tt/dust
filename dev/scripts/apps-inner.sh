#!/usr/bin/env bash
# Launch tools/mprocs.yaml (deps watches + services). Prefer apps.sh / up.sh as the entry.
set -euo pipefail

DUST_DEV_SCRIPT_NAME=apps-inner
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=dev/scripts/common.sh
source "${SCRIPT_DIR}/common.sh"
# shellcheck source=dev/scripts/env.sh
source "${SCRIPT_DIR}/env.sh"

ensure_node_path
install_mprocs_config

cd "$DUST_REPO_ROOT"

# Force dependents to wait for a fresh sdks-js build.
rm -rf sdks/js/dist

export DUST_USE_START_MPROCS=1
export DUST_IN_CONTAINER="${DUST_IN_CONTAINER:-1}"

log "Starting mprocs (select a process and press r to restart; q to quit)"
cd "${DUST_REPO_ROOT}/tools"
exec env \
  SHELL=/bin/bash \
  TERM="${TERM}" \
  COLORTERM="${COLORTERM}" \
  LANG="${LANG}" \
  LC_ALL="${LC_ALL}" \
  DUST_IN_CONTAINER="${DUST_IN_CONTAINER}" \
  mprocs --config mprocs.yaml
