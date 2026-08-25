#!/usr/bin/env bash
# Block until start-infra.sh finishes (Cursor runs start + terminals in parallel).
set -euo pipefail

DUST_DEV_SCRIPT_NAME=wait-for-infra
# shellcheck source=.cursor/scripts/common.sh
source "$(dirname "$0")/common.sh"
# shellcheck source=.cursor/scripts/env.defaults.sh
source "$(dirname "$0")/env.defaults.sh"

READY_FILE="${DUST_INFRA_LOG_DIR}/infra.ready"
MAX_WAIT_SECONDS="${DUST_INFRA_WAIT_SECONDS:-900}"
POLL_INTERVAL="${DUST_INFRA_WAIT_POLL:-2}"

if [ -f "$READY_FILE" ]; then
  log "Infra already ready"
  exit 0
fi

log "Waiting for start-infra to finish (up to ${MAX_WAIT_SECONDS}s)..."
log "Ready marker: ${READY_FILE}"

attempt=0
max_attempts=$((MAX_WAIT_SECONDS / POLL_INTERVAL))
while [ "$attempt" -lt "$max_attempts" ]; do
  if [ -f "$READY_FILE" ]; then
    log "Infra is ready"
    exit 0
  fi

  attempt=$((attempt + 1))
  if [ "$attempt" -eq 1 ] || [ $((attempt % 15)) -eq 0 ]; then
    log "Still waiting for infra (${attempt}/${max_attempts})..."
    if [ -s "${DUST_INFRA_LOG_DIR}/setup-dev-db.log" ]; then
      tail -1 "${DUST_INFRA_LOG_DIR}/setup-dev-db.log" 2>/dev/null || true
    fi
  fi
  sleep "$POLL_INTERVAL"
done

log "Timed out waiting for infra. Check the start-infra output and ${DUST_INFRA_LOG_DIR}/"
if [ -f "${DUST_INFRA_LOG_DIR}/init-elasticsearch.log" ]; then
  tail -20 "${DUST_INFRA_LOG_DIR}/init-elasticsearch.log"
fi
if [ -f "${DUST_INFRA_LOG_DIR}/setup-dev-db.log" ]; then
  tail -20 "${DUST_INFRA_LOG_DIR}/setup-dev-db.log"
fi
exit 1
