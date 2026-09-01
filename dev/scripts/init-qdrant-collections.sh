#!/usr/bin/env bash
# Idempotent local Qdrant collection bootstrap (mirrors dust-hive initQdrant).
set -euo pipefail

DUST_DEV_SCRIPT_NAME=init-qdrant
# shellcheck source=dev/scripts/common.sh
source "$(dirname "$0")/common.sh"
# shellcheck source=dev/scripts/env.sh
source "$(dirname "$0")/env.sh"

export_local_dev_infra

ensure_qdrant_create_collection_built

QDRANT_HTTP_URL="http://${QDRANT_HTTP_HOST}:${QDRANT_HTTP_PORT}"

wait_for_qdrant() {
  log "Waiting for Qdrant at ${QDRANT_HTTP_URL}..."
  for _ in $(seq 1 60); do
    if curl -sf "${QDRANT_HTTP_URL}/readyz" >/dev/null 2>&1; then
      log "Qdrant is ready"
      return 0
    fi
    sleep 1
  done
  log "Qdrant did not become ready in time"
  return 1
}

collection_exists() {
  curl -sf -H "api-key: ${QDRANT_CLUSTER_0_API_KEY:-}" \
    "${QDRANT_HTTP_URL}/collections/$1" >/dev/null 2>&1
}

ensure_collection() {
  local provider="$1"
  local model="$2"
  # DustQdrantClient::collection_prefix() is hardcoded to "c" in core.
  local name="c_${provider}_${model}"
  local output_file status

  if collection_exists "$name"; then
    log "${name} already exists"
    return 0
  fi

  log "Creating ${name}..."
  output_file="$(mktemp)"
  trap 'rm -f "$output_file"' RETURN

  # create_collection.rs prompts through utils::confirm and has no
  # --skip-confirmation flag like elasticsearch_create_index does.
  status=0
  (
    cd "${DUST_REPO_ROOT}/core"
    set -o pipefail
    printf 'y\n' | "$(qdrant_create_collection_bin)" \
      --cluster cluster-0 \
      --provider "$provider" \
      --model "$model" 2>&1 | tee "$output_file"
  ) || status=$?

  if [ "$status" -eq 0 ]; then
    return 0
  fi
  if grep -qi 'already exists' "$output_file"; then
    log "${name} already exists"
    return 0
  fi
  log "Failed to create ${name}"
  return 1
}

wait_for_qdrant

# Keep in sync with x/henry/dust-hive/src/lib/init.ts (initQdrant).
ensure_collection openai text-embedding-3-large-1536

log "Qdrant collections ready"
