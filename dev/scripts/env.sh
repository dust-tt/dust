#!/usr/bin/env bash
# Soft defaults + forced in-container overrides for the shared Dust dev environment.
# Source this file for defaults; call apply_local_overrides after loading 1Password
# so cloud URIs lose to local Postgres/Temporal/APIs.
#
# Runtime secrets (OP_SERVICE_ACCOUNT_TOKEN, DEV_WORKOS_*, GCP_SERVICE_ACCOUNT, …)
# are expected to already be in the process environment — do not re-export them here.

export DUST_REPO_ROOT="${DUST_REPO_ROOT:-/workspace}"
export DUST_IN_CONTAINER="${DUST_IN_CONTAINER:-1}"

# 1Password Environment id for shared cloud-agent / container secrets (not a credential).
# Cloud agents get it injected as a runtime secret; this default serves local docker runs.
export OP_ENVIRONMENT_ID="${OP_ENVIRONMENT_ID:-r6iqd3y67zqlbsxnotrj6bm25q}"  # pragma: allowlist secret

export POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
export POSTGRES_PORT="${POSTGRES_PORT:-5432}"
export REDIS_HOST="${REDIS_HOST:-localhost}"
export REDIS_PORT="${REDIS_PORT:-6379}"
export ELASTICSEARCH_HOST="${ELASTICSEARCH_HOST:-localhost}"
export ELASTICSEARCH_PORT="${ELASTICSEARCH_PORT:-9200}"
export QDRANT_HTTP_HOST="${QDRANT_HTTP_HOST:-localhost}"
export QDRANT_HTTP_PORT="${QDRANT_HTTP_PORT:-6333}"
export QDRANT_GRPC_PORT="${QDRANT_GRPC_PORT:-6334}"
export TEMPORAL_ADDRESS="${TEMPORAL_ADDRESS:-127.0.0.1:7233}"
# In-container Temporal (gRPC 7233). Cloud TEMPORAL_ADDRESS from 1Password must not
# drive local lifecycle checks — workers connect to 127.0.0.1:7233 in development.
export DUST_LOCAL_TEMPORAL_ADDRESS="${DUST_LOCAL_TEMPORAL_ADDRESS:-127.0.0.1:7233}"

# Temporal CLI is installed to /usr/local/bin in the dev image; also check the installer path.
for _temporal_dir in /usr/local/bin /root/.temporalio/bin; do
  if [ -x "${_temporal_dir}/temporal" ]; then
    export PATH="${_temporal_dir}:${PATH}"
    break
  fi
done
unset _temporal_dir

export FRONT_DATABASE_URI="${FRONT_DATABASE_URI:-postgres://dev:dev@${POSTGRES_HOST}:${POSTGRES_PORT}/dust_front}"
export FRONT_DATABASE_READ_REPLICA_URI="${FRONT_DATABASE_READ_REPLICA_URI:-$FRONT_DATABASE_URI}"
export CORE_DATABASE_URI="${CORE_DATABASE_URI:-postgres://dev:dev@${POSTGRES_HOST}:${POSTGRES_PORT}/dust_api}"
export CORE_DATABASE_READ_REPLICA_URI="${CORE_DATABASE_READ_REPLICA_URI:-$CORE_DATABASE_URI}"
export CONNECTORS_DATABASE_URI="${CONNECTORS_DATABASE_URI:-postgres://dev:dev@${POSTGRES_HOST}:${POSTGRES_PORT}/dust_connectors}"
export CONNECTORS_DATABASE_READ_REPLICA_URI="${CONNECTORS_DATABASE_READ_REPLICA_URI:-$CONNECTORS_DATABASE_URI}"
export OAUTH_DATABASE_URI="${OAUTH_DATABASE_URI:-postgres://dev:dev@${POSTGRES_HOST}:${POSTGRES_PORT}/dust_oauth}"

export REDIS_URI="${REDIS_URI:-redis://${REDIS_HOST}:${REDIS_PORT}}"
export REDIS_CACHE_URI="${REDIS_CACHE_URI:-$REDIS_URI}"
export ELASTICSEARCH_URL="${ELASTICSEARCH_URL:-http://${ELASTICSEARCH_HOST}:${ELASTICSEARCH_PORT}}"
export QDRANT_CLUSTER_0_URL="${QDRANT_CLUSTER_0_URL:-http://${QDRANT_HTTP_HOST}:${QDRANT_GRPC_PORT}}"
export QDRANT_USE_SHARDING="${QDRANT_USE_SHARDING:-false}"

export CORE_API="${CORE_API:-http://localhost:3001}"
export CORE_PORT="${CORE_PORT:-3001}"
export DUST_FRONT_API="${DUST_FRONT_API:-http://localhost:3000}"
export DUST_FRONT_INTERNAL_API="${DUST_FRONT_INTERNAL_API:-http://localhost:3000}"
export DUST_INTERNAL_API_URL="${DUST_INTERNAL_API_URL:-http://localhost:3000}"
export DUST_CLIENT_FACING_URL="${DUST_CLIENT_FACING_URL:-http://localhost:3000}"
export DUST_PUBLIC_URL="${DUST_PUBLIC_URL:-http://localhost:3000}"
export DUST_AUTH_REDIRECT_BASE_URL="${DUST_AUTH_REDIRECT_BASE_URL:-http://localhost:3000}"
export NEXT_PUBLIC_DUST_API_URL="${NEXT_PUBLIC_DUST_API_URL:-http://localhost:3000}"
export NEXT_PUBLIC_DUST_APP_URL="${NEXT_PUBLIC_DUST_APP_URL:-http://localhost:3011}"
export NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL="${NEXT_PUBLIC_DUST_STATIC_WEBSITE_URL:-http://localhost:3000}"

export NODE_ENV="${NODE_ENV:-development}"
export SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-/tmp/dust-dev-sa.json}"
export BASH_ENV="${BASH_ENV:-/tmp/dust-shell-env.sh}"

# front-api/esbuild.dev.ts binds the dev proxy to $HOSTNAME. Docker sets HOSTNAME to the
# container id, so health checks against localhost:3000 never reach front-api.
export HOSTNAME="${DUST_DEV_BIND_HOST:-0.0.0.0}"

export SHELL="${SHELL:-/bin/bash}"
export LANG="${LANG:-C.UTF-8}"
export LC_ALL="${LC_ALL:-C.UTF-8}"
export TERM="${TERM:-xterm-256color}"
export COLORTERM="${COLORTERM:-truecolor}"
export FORCE_COLOR="${FORCE_COLOR:-1}"
export CLICOLOR="${CLICOLOR:-1}"
export CLICOLOR_FORCE="${CLICOLOR_FORCE:-1}"
export CARGO_TERM_COLOR="${CARGO_TERM_COLOR:-always}"

# Force local infra after a 1Password Environment is sourced (cloud URIs must lose).
apply_local_overrides() {
  export DUST_REPO_ROOT="${DUST_REPO_ROOT:-/workspace}"
  export NODE_ENV="development"
  export SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-/tmp/dust-dev-sa.json}"

  export POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
  export POSTGRES_PORT="${POSTGRES_PORT:-5432}"
  export REDIS_HOST="${REDIS_HOST:-localhost}"
  export REDIS_PORT="${REDIS_PORT:-6379}"

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
}
