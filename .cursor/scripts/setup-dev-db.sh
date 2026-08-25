#!/usr/bin/env bash
# One-time / idempotent DB bootstrap: migrations only.
# Dev-user seed runs from start-mprocs.sh where Cursor runtime secrets (DEV_WORKOS_*) are set.
set -euo pipefail

DUST_DEV_SCRIPT_NAME=setup-dev-db
# shellcheck source=.cursor/scripts/common.sh
source "$(dirname "$0")/common.sh"
# shellcheck source=.cursor/scripts/env.defaults.sh
source "$(dirname "$0")/env.defaults.sh"
ensure_workspace_deps

core_schema_ready=$(
  PGPASSWORD=dev psql "$CORE_DATABASE_URI" -tAc \
    "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='sqlite_workers' LIMIT 1" \
    2>/dev/null | tr -d '[:space:]'
)

if [ "$core_schema_ready" != "1" ]; then
  log "Initializing core + oauth databases (cargo run --bin init_db)..."
  (
    cd "${DUST_REPO_ROOT}/core"
    cargo run --bin init_db
  ) >"${DUST_INFRA_LOG_DIR}/core-init-db.log" 2>&1 || {
    log "Core init_db failed; see ${DUST_INFRA_LOG_DIR}/core-init-db.log"
    tail -30 "${DUST_INFRA_LOG_DIR}/core-init-db.log"
    exit 1
  }
else
  log "Core schema already present; skipping init_db"
fi

schema_ready=$(
  PGPASSWORD=dev psql "$FRONT_DATABASE_URI" -tAc \
    "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='users' LIMIT 1" \
    2>/dev/null | tr -d '[:space:]'
)

if [ "$schema_ready" = "1" ]; then
  log "Front schema already present; skipping migrations"
else
  log "Applying front migrations..."
  (
    cd "${DUST_REPO_ROOT}/front"
    npm run migration:apply
  ) >"${DUST_INFRA_LOG_DIR}/front-migration.log" 2>&1 || {
    log "Front migration failed; see ${DUST_INFRA_LOG_DIR}/front-migration.log"
    tail -30 "${DUST_INFRA_LOG_DIR}/front-migration.log"
    exit 1
  }

  log "Applying connectors migrations..."
  (
    cd "${DUST_REPO_ROOT}/connectors"
    npm run migration:apply
  ) >"${DUST_INFRA_LOG_DIR}/connectors-migration.log" 2>&1 || {
    log "Connectors migration failed; see ${DUST_INFRA_LOG_DIR}/connectors-migration.log"
    tail -30 "${DUST_INFRA_LOG_DIR}/connectors-migration.log"
    exit 1
  }
fi

log "Database setup complete"
