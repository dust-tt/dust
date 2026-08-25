#!/usr/bin/env bash
set -euo pipefail

DUST_DEV_SCRIPT_NAME=init-databases
# shellcheck source=.cursor/scripts/common.sh
source "$(dirname "$0")/common.sh"
# shellcheck source=.cursor/scripts/env.defaults.sh
source "$(dirname "$0")/env.defaults.sh"

admin_uri="postgres://dev:dev@${POSTGRES_HOST}:${POSTGRES_PORT}/postgres"

log "Waiting for Postgres at ${POSTGRES_HOST}:${POSTGRES_PORT}..."
for _ in $(seq 1 60); do
  if PGPASSWORD=dev psql "$admin_uri" -tc "select 1" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

for db in dust_api dust_databases_store dust_front dust_front_test dust_connectors dust_connectors_test dust_oauth; do
  if ! PGPASSWORD=dev psql "$admin_uri" -tc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1; then
    log "Creating database $db"
    PGPASSWORD=dev createdb -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U dev "$db"
  fi
done

log "Waiting for Elasticsearch at ${ELASTICSEARCH_HOST}:${ELASTICSEARCH_PORT}..."
for _ in $(seq 1 90); do
  if curl -sf "http://${ELASTICSEARCH_HOST}:${ELASTICSEARCH_PORT}" >/dev/null 2>&1; then
    log "Elasticsearch is ready"
    exit 0
  fi
  sleep 1
done

log "Elasticsearch did not become ready in time"
exit 1
