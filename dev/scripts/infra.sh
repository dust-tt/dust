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
install_chrome_policies
rm -f "${DUST_INFRA_LOG_DIR}/infra.ready"
rm -f "${DUST_APPS_PROMPT_FILE}"
rmdir "${DUST_APPS_PROMPT_FILE}.claimed" 2>/dev/null || true

ensure_node_path

log "Sweeping stale Cargo target artifacts..."
bash "${SCRIPT_DIR}/sweep-cargo-target.sh" \
  >"${DUST_INFRA_LOG_DIR}/sweep-cargo-target.log" 2>&1 || {
  log "Cargo target sweep failed (non-fatal); see ${DUST_INFRA_LOG_DIR}/sweep-cargo-target.log"
}

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

# Qdrant binds its ports a moment after launch. Without this gate infra.ready
# can land first and workers started by apps.sh hit connection refused.
wait_for_qdrant() {
  local attempt=0
  local max_attempts=60
  local url="http://${QDRANT_HTTP_HOST}:${QDRANT_HTTP_PORT}/readyz"

  until curl -sf "$url" >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ "$attempt" -gt "$max_attempts" ]; then
      log "Qdrant did not become ready on ${QDRANT_HTTP_HOST}:${QDRANT_HTTP_PORT}"
      tail -30 "${DUST_INFRA_LOG_DIR}/qdrant.log" 2>/dev/null
      return 1
    fi
    if [ "$attempt" -eq 1 ] || [ $((attempt % 15)) -eq 0 ]; then
      log "Waiting for Qdrant on ${QDRANT_HTTP_HOST}:${QDRANT_HTTP_PORT} (${attempt}s)..."
    fi
    sleep 1
  done
  log "Qdrant is ready on ${QDRANT_HTTP_HOST}:${QDRANT_HTTP_PORT}"
}

log "Preparing data directories under ${DUST_DATA_ROOT}..."
bash "${SCRIPT_DIR}/init-data-dirs.sh" || exit 1

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
  sudo redis-server /etc/redis/redis.conf --daemonize yes --dir "$DUST_REDIS_DATA_DIR"
fi

# --- Qdrant ---
# Unlike the other services here, Qdrant has no daemon mode and stays in the
# foreground, so a plain `&` leaves it in this script's session and it dies with
# the exec that ran infra.sh. Detach it into its own session instead.
if ! pgrep -x qdrant >/dev/null 2>&1; then
  log "Starting qdrant..."
  setsid nohup bash -lc "cd /opt/qdrant && exec ./qdrant" \
    </dev/null >"${DUST_INFRA_LOG_DIR}/qdrant.log" 2>&1 &
fi

# --- Elasticsearch ---
if ! curl -sf "http://${ELASTICSEARCH_HOST}:${ELASTICSEARCH_PORT}" >/dev/null 2>&1; then
  if ! id elasticsearch >/dev/null 2>&1; then
    groupadd -r elasticsearch 2>/dev/null || true
    useradd -r -g elasticsearch -d /opt/es -s /usr/sbin/nologin elasticsearch 2>/dev/null || true
  fi
  mkdir -p "$DUST_ELASTICSEARCH_DATA_DIR" /opt/es/logs
  chown -R elasticsearch:elasticsearch /opt/es "$DUST_ELASTICSEARCH_DATA_DIR"
  # sudo drops the env, so path.data has to be interpolated into the command.
  start_bg elasticsearch sudo -u elasticsearch bash -lc \
    "ES_JAVA_OPTS=\"-Xms512m -Xmx512m\" /opt/es/bin/elasticsearch -d -p /tmp/es.pid -E discovery.type=single-node -E xpack.security.enabled=false -E bootstrap.memory_lock=false -E path.data=${DUST_ELASTICSEARCH_DATA_DIR} -E path.logs=/opt/es/logs"
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
bash "${SCRIPT_DIR}/init-elasticsearch-indices.sh" 2>&1 | tee "${DUST_INFRA_LOG_DIR}/init-elasticsearch.log"
es_init_status=${PIPESTATUS[0]}
if [ "$es_init_status" -ne 0 ]; then
  log "Elasticsearch index init failed; see ${DUST_INFRA_LOG_DIR}/init-elasticsearch.log"
  exit 1
fi

# Materialize 1Password env + local overrides for every subsequent shell/command.
materialize_dev_environment || log "Continuing without a full 1Password env"

log "Running DB migrations..."
bash "${SCRIPT_DIR}/setup-dev-db.sh" \
  >"${DUST_INFRA_LOG_DIR}/setup-dev-db.log" 2>&1 || {
  log "setup-dev-db failed; see ${DUST_INFRA_LOG_DIR}/setup-dev-db.log"
  tail -30 "${DUST_INFRA_LOG_DIR}/setup-dev-db.log"
  exit 1
}

wait_for_qdrant || exit 1

log "Ensuring Qdrant collections..."
bash "${SCRIPT_DIR}/init-qdrant-collections.sh" 2>&1 | tee "${DUST_INFRA_LOG_DIR}/init-qdrant.log"
qdrant_init_status=${PIPESTATUS[0]}
if [ "$qdrant_init_status" -ne 0 ]; then
  log "Qdrant collection init failed; see ${DUST_INFRA_LOG_DIR}/init-qdrant.log"
  exit 1
fi

log "Infra ready. App services: bash dev/scripts/apps.sh (or up.sh)."
log "Infra logs: ${DUST_INFRA_LOG_DIR}/"
date -u +%Y-%m-%dT%H:%M:%SZ >"${DUST_INFRA_LOG_DIR}/infra.ready"
if [ "${DUST_OFFER_START_APPS:-0}" = "1" ]; then
  touch "${DUST_APPS_PROMPT_FILE}"
fi
