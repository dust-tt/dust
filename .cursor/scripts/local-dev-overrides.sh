#!/usr/bin/env bash
# In-container Cloud Agent overrides applied *after* the 1Password Environment is sourced.
# This is the override policy (forced local infra), not a handpicked dump of secrets.
# Cursor runtime secrets (DEV_WORKOS_*, GCP_SERVICE_ACCOUNT, OP_SERVICE_ACCOUNT_TOKEN, …)
# are already injected into the process environment — do not re-export them here.

export DUST_REPO_ROOT="${DUST_REPO_ROOT:-/workspace}"
export NODE_ENV="development"
export SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-/tmp/dust-dev-sa.json}"

export POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
export POSTGRES_PORT="${POSTGRES_PORT:-5432}"
export REDIS_HOST="${REDIS_HOST:-localhost}"
export REDIS_PORT="${REDIS_PORT:-6379}"

# Force local URIs — 1Password often points at cloud Postgres/Temporal/APIs.
export FRONT_DATABASE_URI="postgres://dev:dev@${POSTGRES_HOST}:${POSTGRES_PORT}/dust_front"
export FRONT_DATABASE_READ_REPLICA_URI="$FRONT_DATABASE_URI"
export CORE_DATABASE_URI="postgres://dev:dev@${POSTGRES_HOST}:${POSTGRES_PORT}/dust_api"
export CORE_DATABASE_READ_REPLICA_URI="$CORE_DATABASE_URI"
export CONNECTORS_DATABASE_URI="postgres://dev:dev@${POSTGRES_HOST}:${POSTGRES_PORT}/dust_connectors"
export CONNECTORS_DATABASE_READ_REPLICA_URI="$CONNECTORS_DATABASE_URI"
export OAUTH_DATABASE_URI="postgres://dev:dev@${POSTGRES_HOST}:${POSTGRES_PORT}/dust_oauth"

export REDIS_URI="redis://${REDIS_HOST}:${REDIS_PORT}"
export REDIS_CACHE_URI="$REDIS_URI"
export ELASTICSEARCH_URL="http://${ELASTICSEARCH_HOST:-localhost}:${ELASTICSEARCH_PORT:-9200}"
export ELASTICSEARCH_USERNAME="${ELASTICSEARCH_USERNAME:-elastic}"
export ELASTICSEARCH_PASSWORD="${ELASTICSEARCH_PASSWORD:-}"
export TEMPORAL_ADDRESS="${DUST_LOCAL_TEMPORAL_ADDRESS:-127.0.0.1:7233}"

export CORE_API="http://localhost:3001"
export DUST_FRONT_API="http://localhost:3000"
export DUST_FRONT_INTERNAL_API="http://localhost:3000"
export DUST_INTERNAL_API_URL="http://localhost:3000"
export DUST_CLIENT_FACING_URL="http://localhost:3000"
export DUST_PUBLIC_URL="http://localhost:3000"
export DUST_AUTH_REDIRECT_BASE_URL="http://localhost:3000"
export NEXT_PUBLIC_DUST_API_URL="http://localhost:3000"
export NEXT_PUBLIC_DUST_APP_URL="http://localhost:3011"
export NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL="http://localhost:3000"
