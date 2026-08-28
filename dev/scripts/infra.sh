#!/usr/bin/env bash
# Start in-container infra (Postgres/Redis/Qdrant/ES/Temporal), materialize secrets, migrate.
# App processes (mprocs) are started separately via apps.sh or up.sh.
set +e

DUST_DEV_SCRIPT_NAME=infra
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=dev/scripts/common.sh
source "${SCRIPT_DIR}/common.sh"
# shellcheck source=dev/scripts/env.sh
source "${SCRIPT_DIR}/env.sh"

install_mprocs_config
rm -f "${DUST_INFRA_LOG_DIR}/infra.ready"

ensure_node_path
ensure_client_built || {
  log "Installing workspace deps once before migrations..."
  bash "${SCRIPT_DIR}/install.sh" || exit 1
  ensure_client_built || exit 1
}

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

# --- Temporal (start + namespaces + search attributes; single call) ---
bash "${SCRIPT_DIR}/ensure-temporal.sh" \
  >"${DUST_INFRA_LOG_DIR}/ensure-temporal.log" 2>&1 || {
  log "Temporal setup failed; see ${DUST_INFRA_LOG_DIR}/ensure-temporal.log"
  tail -30 "${DUST_INFRA_LOG_DIR}/ensure-temporal.log"
  exit 1
}

log "Initializing databases..."
bash "${SCRIPT_DIR}/init-databases.sh" || exit 1

log "Ensuring Elasticsearch indices..."
bash "${SCRIPT_DIR}/init-elasticsearch-indices.sh" \
  >"${DUST_INFRA_LOG_DIR}/init-elasticsearch.log" 2>&1 || {
  log "Elasticsearch index init failed; see ${DUST_INFRA_LOG_DIR}/init-elasticsearch.log"
  tail -40 "${DUST_INFRA_LOG_DIR}/init-elasticsearch.log"
  exit 1
}

# Materialize 1Password env + local overrides for every subsequent shell/command.
materialize_dev_environment || log "Continuing without a full 1Password env"

log "Running DB migrations..."
bash "${SCRIPT_DIR}/setup-dev-db.sh" \
  >"${DUST_INFRA_LOG_DIR}/setup-dev-db.log" 2>&1 || {
  log "setup-dev-db failed; see ${DUST_INFRA_LOG_DIR}/setup-dev-db.log"
  tail -30 "${DUST_INFRA_LOG_DIR}/setup-dev-db.log"
  exit 1
}

log "Infra ready. App services: bash dev/scripts/apps.sh (or up.sh)."
log "Infra logs: ${DUST_INFRA_LOG_DIR}/"
date -u +%Y-%m-%dT%H:%M:%SZ >"${DUST_INFRA_LOG_DIR}/infra.ready"
