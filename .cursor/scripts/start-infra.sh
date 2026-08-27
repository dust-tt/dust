#!/usr/bin/env bash
# Start infra services and bootstrap databases (migrations). Dev-user seed runs in start-mprocs.
set +e

DUST_DEV_SCRIPT_NAME=start-infra
# shellcheck source=.cursor/scripts/common.sh
source "$(dirname "$0")/common.sh"
# shellcheck source=.cursor/scripts/env.defaults.sh
source "$(dirname "$0")/env.defaults.sh"

install_cursor_runtime_config
rm -f "${DUST_INFRA_LOG_DIR}/infra.ready"

ensure_node_path
ensure_workspace_deps

start_bg() {
  local name="$1"
  shift
  log "Starting $name..."
  "$@" >"${DUST_INFRA_LOG_DIR}/${name}.log" 2>&1 &
}

# --- Postgres ---
if ! pgrep -x postgres >/dev/null 2>&1; then
  pg_version="$(ls /etc/postgresql 2>/dev/null | sort -rn | head -1)"
  if [ -z "$pg_version" ]; then
    log "Postgres not installed"
    exit 1
  fi
  start_bg postgres sudo pg_ctlcluster "$pg_version" main start
  sleep 2
fi

# --- Redis ---
if ! redis-cli ping >/dev/null 2>&1; then
  log "Starting redis..."
  sudo redis-server /etc/redis/redis.conf --daemonize yes
fi

# --- Qdrant ---
if ! pgrep -x qdrant >/dev/null 2>&1; then
  start_bg qdrant bash -lc "cd /opt/qdrant && ./qdrant"
fi

# --- Elasticsearch ---
if ! curl -sf "http://${ELASTICSEARCH_HOST}:${ELASTICSEARCH_PORT}" >/dev/null 2>&1; then
  if ! id elasticsearch >/dev/null 2>&1; then
    groupadd -r elasticsearch 2>/dev/null || true
    useradd -r -g elasticsearch -d /opt/es -s /usr/sbin/nologin elasticsearch 2>/dev/null || true
  fi
  mkdir -p /opt/es/data /opt/es/logs
  chown -R elasticsearch:elasticsearch /opt/es
  start_bg elasticsearch sudo -u elasticsearch bash -lc \
    'ES_JAVA_OPTS="-Xms512m -Xmx512m" /opt/es/bin/elasticsearch -d -p /tmp/es.pid -E discovery.type=single-node -E xpack.security.enabled=false -E bootstrap.memory_lock=false -E path.data=/opt/es/data -E path.logs=/opt/es/logs'
fi

# --- Temporal dev server ---
bash "$(dirname "$0")/ensure-temporal.sh" \
  >"${DUST_INFRA_LOG_DIR}/ensure-temporal.log" 2>&1 || {
  log "Temporal setup failed; see ${DUST_INFRA_LOG_DIR}/ensure-temporal.log"
  tail -30 "${DUST_INFRA_LOG_DIR}/ensure-temporal.log"
  exit 1
}

log "Initializing databases..."
bash "$(dirname "$0")/init-databases.sh" || exit 1

log "Ensuring Elasticsearch indices..."
bash "$(dirname "$0")/init-elasticsearch-indices.sh" \
  >"${DUST_INFRA_LOG_DIR}/init-elasticsearch.log" 2>&1 || {
  log "Elasticsearch index init failed; see ${DUST_INFRA_LOG_DIR}/init-elasticsearch.log"
  tail -40 "${DUST_INFRA_LOG_DIR}/init-elasticsearch.log"
  exit 1
}

if require_op_credentials; then
  log "Running DB migrations via op run..."
  bash "$(dirname "$0")/with-op-run.sh" bash "$(dirname "$0")/setup-dev-db.sh" \
    >"${DUST_INFRA_LOG_DIR}/setup-dev-db.log" 2>&1 || {
    log "setup-dev-db failed; see ${DUST_INFRA_LOG_DIR}/setup-dev-db.log"
    tail -30 "${DUST_INFRA_LOG_DIR}/setup-dev-db.log"
    exit 1
  }

  log "Ensuring Temporal namespaces exist..."
  bash "$(dirname "$0")/with-op-run.sh" bash "$(dirname "$0")/ensure-temporal.sh" \
    >"${DUST_INFRA_LOG_DIR}/temporal-namespaces.log" 2>&1 || true
else
  log "Skipping op-backed DB setup (OP_SERVICE_ACCOUNT_TOKEN missing)"
  bash "$(dirname "$0")/setup-dev-db.sh" >"${DUST_INFRA_LOG_DIR}/setup-dev-db.log" 2>&1 || {
    log "setup-dev-db failed; see ${DUST_INFRA_LOG_DIR}/setup-dev-db.log"
    tail -30 "${DUST_INFRA_LOG_DIR}/setup-dev-db.log"
    exit 1
  }
fi

log "Infra ready. App services run in Cursor terminals."
log "Infra logs: ${DUST_INFRA_LOG_DIR}/"
date -u +%Y-%m-%dT%H:%M:%SZ >"${DUST_INFRA_LOG_DIR}/infra.ready"
