#!/usr/bin/env bash
set -euo pipefail

DUST_DEV_SCRIPT_NAME=init-databases
# shellcheck source=dev/scripts/common.sh
source "$(dirname "$0")/common.sh"
# shellcheck source=dev/scripts/env.sh
source "$(dirname "$0")/env.sh"

admin_uri="postgres://dev:dev@${POSTGRES_HOST}:${POSTGRES_PORT}/postgres"

log "Waiting for Postgres at ${POSTGRES_HOST}:${POSTGRES_PORT}..."
for _ in $(seq 1 60); do
  if sudo -u postgres psql -tc "select 1" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='dev'" | grep -q 1; then
  log "Creating Postgres role dev"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE USER dev WITH PASSWORD 'dev' SUPERUSER;"
else
  sudo -u postgres psql -c "ALTER USER dev WITH SUPERUSER;" >/dev/null
fi

for _ in $(seq 1 30); do
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
