#!/usr/bin/env bash
# Idempotent local Elasticsearch index bootstrap (mirrors dust-hive initAllElasticsearch).
set -euo pipefail

DUST_DEV_SCRIPT_NAME=init-elasticsearch
# shellcheck source=dev/scripts/common.sh
source "$(dirname "$0")/common.sh"
# shellcheck source=dev/scripts/env.sh
source "$(dirname "$0")/env.sh"

export_local_dev_infra
export NODE_ENV=development
# Core/front index scripts use NODE_ENV=development => region "local".
export ELASTICSEARCH_USERNAME="${ELASTICSEARCH_USERNAME:-elastic}"
export ELASTICSEARCH_PASSWORD="${ELASTICSEARCH_PASSWORD:-}"

ensure_node_path
ensure_client_built

wait_for_elasticsearch() {
  log "Waiting for Elasticsearch at ${ELASTICSEARCH_URL}..."
  for _ in $(seq 1 90); do
    if curl -sf "${ELASTICSEARCH_URL}" >/dev/null 2>&1; then
      log "Elasticsearch is ready"
      return 0
    fi
    sleep 1
  done
  log "Elasticsearch did not become ready in time"
  return 1
}

output_already_exists() {
  grep -qi 'already exists' <<<"$1"
}

create_core_index() {
  local index_name="$1"
  local index_version="$2"
  local output=""

  log "Ensuring core.${index_name}_${index_version}..."
  output=$(
    cd "${DUST_REPO_ROOT}/core"
    cargo run --bin elasticsearch_create_index -- \
      --index-name "$index_name" \
      --index-version "$index_version" \
      --skip-confirmation 2>&1
  ) || {
    if output_already_exists "$output"; then
      log "core.${index_name}_${index_version} already exists"
      return 0
    fi
    log "Failed to create core.${index_name}_${index_version}:"
    echo "$output"
    return 1
  }
}

create_front_index() {
  local index_name="$1"
  local index_version="$2"
  local output=""

  log "Ensuring front.${index_name}_${index_version}..."
  output=$(
    cd "${DUST_REPO_ROOT}/front"
    export PATH="${DUST_REPO_ROOT}/node_modules/.bin:${PATH}"
    npx tsx ./scripts/create_elasticsearch_index.ts \
      --index-name "$index_name" \
      --index-version "$index_version" \
      --skip-confirmation 2>&1
  ) || {
    if output_already_exists "$output"; then
      log "front.${index_name}_${index_version} already exists"
      return 0
    fi
    log "Failed to create front.${index_name}_${index_version}:"
    echo "$output"
    return 1
  }
}

wait_for_elasticsearch

# Keep in sync with x/henry/dust-hive/src/lib/init.ts (initElasticsearchRust / initElasticsearchTS).
create_core_index data_sources_nodes 4
create_core_index data_sources 1

create_front_index agent_document_outputs 1
create_front_index agent_message_analytics 2
create_front_index agent_message_consumption_analytics 1
create_front_index user_search 1

log "Elasticsearch indices ready"
