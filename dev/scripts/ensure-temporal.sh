#!/usr/bin/env bash
# Start the local Temporal dev server if needed and wait until gRPC port 7233 is open.
set -euo pipefail

DUST_DEV_SCRIPT_NAME=ensure-temporal
# shellcheck source=dev/scripts/common.sh
source "$(dirname "$0")/common.sh"
# shellcheck source=dev/scripts/env.sh
source "$(dirname "$0")/env.sh"

# Always probe/start the in-container dev server — never a cloud TEMPORAL_ADDRESS from 1Password.
LOCAL_TEMPORAL_ADDRESS="${DUST_LOCAL_TEMPORAL_ADDRESS:-127.0.0.1:7233}"
TEMPORAL_HOST="${LOCAL_TEMPORAL_ADDRESS}"
TEMPORAL_HOST_ONLY="${TEMPORAL_HOST%%:*}"
TEMPORAL_PORT="${TEMPORAL_HOST##*:}"

TEMPORAL_BIN="$(resolve_temporal_bin)" || exit 1

temporal_port_open() {
  if command -v nc >/dev/null 2>&1; then
    nc -z "$TEMPORAL_HOST_ONLY" "$TEMPORAL_PORT" 2>/dev/null
    return $?
  fi
  (echo >/dev/tcp/"$TEMPORAL_HOST_ONLY"/"$TEMPORAL_PORT") 2>/dev/null
}

start_temporal_dev_server() {
  mkdir -p "$(dirname "$DUST_TEMPORAL_DB_FILE")" "${DUST_INFRA_LOG_DIR}"
  log "Starting Temporal dev server on ${LOCAL_TEMPORAL_ADDRESS} (${TEMPORAL_BIN})..."
  nohup "$TEMPORAL_BIN" server start-dev \
    --ip 0.0.0.0 \
    --port "${TEMPORAL_PORT}" \
    --db-filename "$DUST_TEMPORAL_DB_FILE" \
    >>"${DUST_INFRA_LOG_DIR}/temporal.log" 2>&1 &
}

wait_for_temporal() {
  local attempt=0
  local max_attempts=90

  until temporal_port_open; do
    attempt=$((attempt + 1))
    if [ "$attempt" -gt "$max_attempts" ]; then
      log "Temporal did not become ready on ${LOCAL_TEMPORAL_ADDRESS}"
      if [ -f "${DUST_INFRA_LOG_DIR}/temporal.log" ]; then
        tail -40 "${DUST_INFRA_LOG_DIR}/temporal.log"
      fi
      return 1
    fi
    if [ "$attempt" -eq 1 ] || [ $((attempt % 15)) -eq 0 ]; then
      log "Waiting for Temporal on ${LOCAL_TEMPORAL_ADDRESS} (${attempt}s)..."
    fi
    sleep 1
  done
  log "Temporal is ready on ${LOCAL_TEMPORAL_ADDRESS}"
}

ensure_temporal_namespaces() {
  local ns
  for ns in \
    "${TEMPORAL_NAMESPACE:-}" \
    "${TEMPORAL_AGENT_NAMESPACE:-}" \
    "${TEMPORAL_CONNECTORS_NAMESPACE:-}" \
    "${TEMPORAL_RELOCATION_NAMESPACE:-}"; do
    [ -z "$ns" ] && continue
    [ "$ns" = "default" ] && continue
    "$TEMPORAL_BIN" operator namespace describe --address "$LOCAL_TEMPORAL_ADDRESS" "$ns" >/dev/null 2>&1 \
      || "$TEMPORAL_BIN" operator namespace create --address "$LOCAL_TEMPORAL_ADDRESS" "$ns" \
      || log "Could not ensure Temporal namespace: $ns"
  done
}

create_temporal_search_attribute() {
  local namespace="$1"
  local name="$2"
  local attr_type="$3"
  local err=""

  err=$("$TEMPORAL_BIN" operator search-attribute create \
    --address "$LOCAL_TEMPORAL_ADDRESS" \
    --namespace "$namespace" \
    --name "$name" \
    --type "$attr_type" 2>&1) || {
    if echo "$err" | grep -qi 'already exists'; then
      return 0
    fi
    log "Could not create Temporal search attribute ${name} on ${namespace}: ${err}"
    return 1
  }
}

ensure_temporal_search_attributes() {
  local ns namespaces=()
  local seen=" default "

  namespaces+=("default")
  for ns in \
    "${TEMPORAL_NAMESPACE:-}" \
    "${TEMPORAL_AGENT_NAMESPACE:-}" \
    "${TEMPORAL_CONNECTORS_NAMESPACE:-}" \
    "${TEMPORAL_RELOCATION_NAMESPACE:-}"; do
    [ -z "$ns" ] && continue
    case "$seen" in
      *" ${ns} "*) continue ;;
    esac
    seen="${seen}${ns} "
    namespaces+=("$ns")
  done

  log "Ensuring Temporal search attributes (connectorId, conversationId, workspaceId)..."
  for ns in "${namespaces[@]}"; do
    create_temporal_search_attribute "$ns" connectorId Int
    create_temporal_search_attribute "$ns" conversationId Text
    create_temporal_search_attribute "$ns" workspaceId Text
  done
  log "Temporal search attributes ready"
}

if temporal_port_open; then
  log "Temporal already listening on ${LOCAL_TEMPORAL_ADDRESS}"
elif pgrep -f 'temporal server start-dev' >/dev/null 2>&1; then
  log "Temporal process running; waiting for port ${LOCAL_TEMPORAL_ADDRESS}..."
  wait_for_temporal
else
  start_temporal_dev_server
  wait_for_temporal
fi

ensure_temporal_namespaces
ensure_temporal_search_attributes
