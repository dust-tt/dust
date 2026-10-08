#!/usr/bin/env bash
# Start the local FoundationDB server if needed, create the database on a fresh data
# volume, and wait until it is available. Safe to re-run.
set -euo pipefail

DUST_DEV_SCRIPT_NAME=ensure-fdb
# shellcheck source=dev/scripts/common.sh
source "$(dirname "$0")/common.sh"
# shellcheck source=dev/scripts/env.sh
source "$(dirname "$0")/env.sh"

FDB_WAIT_SECONDS="${DUST_FDB_WAIT_SECONDS:-60}"
FDB_CLI_TIMEOUT_SECONDS=5
# fdbserver reserves a 2GiB page cache by default; keep it small for a dev container.
FDB_CACHE_MEMORY="${DUST_FDB_CACHE_MEMORY:-512MiB}"

fdb_available() {
  fdbcli --timeout "$FDB_CLI_TIMEOUT_SECONDS" --exec "status minimal" 2>/dev/null |
    grep -q "The database is available"
}

start_fdb_server() {
  mkdir -p "$DUST_FDB_DATA_DIR" "$DUST_FDB_LOG_DIR" "$DUST_INFRA_LOG_DIR"
  log "Starting FoundationDB on 127.0.0.1:${FDB_PORT}..."
  # Own session, like Qdrant: fdbserver has no daemon mode and must outlive this script.
  setsid nohup fdbserver \
    --cluster-file "$FDB_CLUSTER_FILE" \
    --public-address "127.0.0.1:${FDB_PORT}" \
    --listen-address "127.0.0.1:${FDB_PORT}" \
    --datadir "$DUST_FDB_DATA_DIR" \
    --logdir "$DUST_FDB_LOG_DIR" \
    --cache-memory "$FDB_CACHE_MEMORY" \
    </dev/null >>"${DUST_INFRA_LOG_DIR}/fdb.log" 2>&1 &
}

# On a fresh data volume the server runs but no database exists yet; `configure new`
# creates it and is refused ("already exists") once it does, so retrying is safe.
wait_for_database() {
  local attempt=0
  until fdb_available; do
    attempt=$((attempt + 1))
    if [ "$attempt" -gt "$FDB_WAIT_SECONDS" ]; then
      log "FoundationDB did not become available within ${FDB_WAIT_SECONDS}s"
      tail -20 "${DUST_INFRA_LOG_DIR}/fdb.log" 2>/dev/null || true
      return 1
    fi
    fdbcli --timeout "$FDB_CLI_TIMEOUT_SECONDS" --exec "configure new single ssd" >/dev/null 2>&1 || true
    sleep 1
  done
}

if [ ! -f "$FDB_CLUSTER_FILE" ]; then
  log "Missing ${FDB_CLUSTER_FILE}; run init-data-dirs.sh first"
  exit 1
fi

if ! pgrep -x fdbserver >/dev/null 2>&1; then
  start_fdb_server
fi

wait_for_database
log "FoundationDB is available (cluster file ${FDB_CLUSTER_FILE})"
