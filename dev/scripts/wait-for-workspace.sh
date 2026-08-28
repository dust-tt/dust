#!/usr/bin/env bash
# Block until the workspace checkout is visible, then optionally exec a sibling script.
#
# Cursor Cloud may run environment.json `start` / `terminals` before `/workspace` has
# the git tree (warm-fork gitSetup: reuse). Those commands do not retry on exit 127, so
# callers bootstrap with a short `until [ -f ... ]` then invoke this helper for a
# bounded wait + clear error before exec'ing infra/apps.
#
# Usage (from repo root / environment.json):
#   bash dev/scripts/wait-for-workspace.sh --then infra.sh
#   bash dev/scripts/wait-for-workspace.sh --then apps.sh
#   bash dev/scripts/wait-for-workspace.sh /workspace/dev/scripts/infra.sh
set -euo pipefail

DUST_DEV_SCRIPT_NAME=wait-for-workspace
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=dev/scripts/common.sh
source "${SCRIPT_DIR}/common.sh"

MAX_WAIT_SECONDS="${DUST_WORKSPACE_WAIT_SECONDS:-120}"
POLL_INTERVAL="${DUST_WORKSPACE_WAIT_POLL:-0.5}"
REQUIRED_PATH=""
THEN_SCRIPT=""

usage() {
  sed -n '2,14p' "$0"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --then)
      THEN_SCRIPT="${2:?--then requires a script name}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [ -n "$REQUIRED_PATH" ]; then
        echo "Unexpected argument: $1" >&2
        usage >&2
        exit 1
      fi
      REQUIRED_PATH="$1"
      shift
      ;;
  esac
done

if [ -z "$REQUIRED_PATH" ]; then
  if [ -n "$THEN_SCRIPT" ]; then
    if [[ "$THEN_SCRIPT" == /* ]]; then
      REQUIRED_PATH="$THEN_SCRIPT"
    else
      REQUIRED_PATH="${SCRIPT_DIR}/${THEN_SCRIPT}"
    fi
  else
    REQUIRED_PATH="${DUST_REPO_ROOT}/dev/scripts/infra.sh"
  fi
fi

if [ ! -e "$REQUIRED_PATH" ]; then
  log "Waiting for workspace path (up to ${MAX_WAIT_SECONDS}s): ${REQUIRED_PATH}"
  start_ts=$SECONDS
  last_log_ts=-10
  while [ ! -e "$REQUIRED_PATH" ]; do
    elapsed=$((SECONDS - start_ts))
    if [ "$elapsed" -ge "$MAX_WAIT_SECONDS" ]; then
      log "Timed out after ${MAX_WAIT_SECONDS}s waiting for workspace checkout: ${REQUIRED_PATH}"
      log "Cursor may have started before the git tree was mounted; see warm-fork gitSetup: reuse."
      exit 1
    fi
    if [ $((elapsed - last_log_ts)) -ge 10 ]; then
      log "Still waiting for workspace (${elapsed}/${MAX_WAIT_SECONDS}s)..."
      last_log_ts=$elapsed
    fi
    sleep "$POLL_INTERVAL"
  done
  log "Workspace path is available: ${REQUIRED_PATH}"
fi

if [ -z "$THEN_SCRIPT" ]; then
  exit 0
fi

if [[ "$THEN_SCRIPT" == /* ]]; then
  exec bash "$THEN_SCRIPT"
fi
exec bash "${SCRIPT_DIR}/${THEN_SCRIPT}"
