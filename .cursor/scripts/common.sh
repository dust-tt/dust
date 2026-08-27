#!/usr/bin/env bash
# Shared helpers for Dust Cloud Agent dev scripts.

DUST_REPO_ROOT="${DUST_REPO_ROOT:-$(
  cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd
)}"
export DUST_REPO_ROOT

DUST_INFRA_LOG_DIR="${DUST_INFRA_LOG_DIR:-/tmp/dust-infra}"
mkdir -p "$DUST_INFRA_LOG_DIR"

log() {
  echo "[${DUST_DEV_SCRIPT_NAME:-cursor-dev}] $*"
}

install_cursor_runtime_config() {
  if [ -f "${DUST_REPO_ROOT}/.cursor/config/mprocs.yaml" ]; then
    mkdir -p "${HOME}/.config/mprocs"
    cp "${DUST_REPO_ROOT}/.cursor/config/mprocs.yaml" "${HOME}/.config/mprocs/mprocs.yaml"
  fi
}

ensure_node_path() {
  if command -v node >/dev/null 2>&1; then
    return 0
  fi
  log "node not found on PATH"
  return 1
}

resolve_temporal_bin() {
  if command -v temporal >/dev/null 2>&1; then
    command -v temporal
    return 0
  fi
  for candidate in /usr/local/bin/temporal /root/.temporalio/bin/temporal; do
    if [ -x "$candidate" ]; then
      echo "$candidate"
      return 0
    fi
  done
  log "temporal CLI not found (rebuild .cursor/Dockerfile or install to /usr/local/bin)"
  return 1
}

# Migrations and seed scripts import @dust-tt/client (main: sdks/js/dist/index.js).
ensure_workspace_deps() {
  ensure_node_path
  cd "$DUST_REPO_ROOT"

  if [ ! -f node_modules/@dust-tt/client/package.json ]; then
    log "Installing npm workspaces (required before migrations)..."
    npm install
  fi

  if [ ! -f sdks/js/dist/index.js ]; then
    log "Building @dust-tt/client (sdks/js)..."
    npm -w @dust-tt/client run build
  fi
}

write_gcp_service_account_file() {
  if [ -n "${GCP_SERVICE_ACCOUNT:-}" ]; then
    printf '%s' "$GCP_SERVICE_ACCOUNT" >"${SERVICE_ACCOUNT:-/tmp/dust-dev-sa.json}"
    export SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-/tmp/dust-dev-sa.json}"
  fi
}

# op run --environment requires 1Password CLI >= 2.33.0-beta.02 (Environments feature).
op_cli_supports_environments() {
  local current="${1:-$(op --version 2>/dev/null | head -1 | tr -d '[:space:]')}"
  local minimum="2.33.0-beta.02"

  if [ -z "$current" ]; then
    return 1
  fi

  # sort -V: if minimum sorts first, current is >= minimum.
  [ "$(printf '%s\n' "$minimum" "$current" | sort -V | head -1)" = "$minimum" ]
}

require_op_credentials() {
  if [ -z "${OP_SERVICE_ACCOUNT_TOKEN:-}" ]; then
    log "OP_SERVICE_ACCOUNT_TOKEN is not set (add it as a Cursor runtime secret)"
    return 1
  fi
  if [ -z "${OP_ENVIRONMENT_ID:-}" ]; then
    log "OP_ENVIRONMENT_ID is not set"
    return 1
  fi
  if ! op_cli_supports_environments; then
    log "op CLI is too old ($(op --version 2>/dev/null || echo unknown)); need >= 2.33.0-beta.02 with op run --environment (rebuild .cursor/Dockerfile)"
    return 1
  fi
  return 0
}

# Load 1Password Environment vars into the current shell.
# Do not wrap interactive TUIs (mprocs) in `op run` — it masks stdout/stderr and breaks ANSI control sequences.
load_op_environment() {
  local env_file

  require_op_credentials || return 1

  env_file="$(mktemp /tmp/dust-op-env.XXXXXX)"
  if ! op environment read "$OP_ENVIRONMENT_ID" >"$env_file"; then
    rm -f "$env_file"
    log "Failed to read 1Password environment $OP_ENVIRONMENT_ID"
    return 1
  fi

  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
  rm -f "$env_file"
  return 0
}

# Host-injected secrets override 1Password Environment values when set.
export_local_dev_infra() {
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

export_op_runtime_secrets() {
  export DUST_REPO_ROOT="$DUST_REPO_ROOT"
  export SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-}"
  export GCP_SERVICE_ACCOUNT="${GCP_SERVICE_ACCOUNT:-}"
  export DEV_WORKOS_USER_EMAIL="${DEV_WORKOS_USER_EMAIL:-}"
  export DEV_WORKOS_USER_PASSWORD="${DEV_WORKOS_USER_PASSWORD:-}"
  export DEV_WORKOS_USER_ID="${DEV_WORKOS_USER_ID:-}"
  # Local Cursor dev always uses in-container infra. 1Password envs often point at cloud
  # Postgres/Temporal/staging NODE_ENV which breaks init_plans, workers, and seed SQL.
  export NODE_ENV="development"
  export_local_dev_infra
}
