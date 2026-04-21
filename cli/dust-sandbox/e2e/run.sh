#!/usr/bin/env bash
# Build the e2e image and run a test command against the live egress-proxy.
#
# Usage:
#   EGRESS_PROXY_JWT_SECRET=... DUST_API_KEY=... DUST_WORKSPACE_ID=... \
#     ./cli/dust-sandbox/e2e/run.sh [matrix|streaming|all]
#
# Fetch the JWT secret from GCP Secret Manager (for the EU proxy):
#   gcloud secrets versions access latest --project=<proj> --secret=egress-proxy-jwt-secret
#
# All `EGRESS_PROXY_*` and `DUST_*` env vars are forwarded into the container.
# Must be run from the monorepo root (this script chdirs there to pick up the
# build context).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
cd "${REPO_ROOT}"

IMAGE="${DSBX_E2E_IMAGE:-dsbx-forward-e2e:local}"
COMMAND="${1:-all}"

docker build \
  -f cli/dust-sandbox/e2e/Dockerfile \
  -t "${IMAGE}" \
  .

ENV_ARGS=()
for var in \
  EGRESS_PROXY_JWT_SECRET \
  EGRESS_PROXY_HOST \
  EGRESS_PROXY_PORT \
  EGRESS_PROXY_TLS_NAME \
  EGRESS_PROXY_ALLOWED_DOMAIN \
  EGRESS_PROXY_DENIED_DOMAIN \
  EGRESS_PROXY_SB_ID \
  EGRESS_PROXY_JWT_TTL_SECONDS \
  DUST_API_KEY \
  DUST_WORKSPACE_ID \
  DUST_AGENT_ID \
  DUST_AGENT_PROMPT \
  DUST_API_BASE_URL \
  RUST_LOG; do
  if [ -n "${!var:-}" ]; then
    ENV_ARGS+=("-e" "${var}=${!var}")
  fi
done

exec docker run \
  --rm \
  --cap-add=NET_ADMIN \
  "${ENV_ARGS[@]}" \
  "${IMAGE}" \
  "${COMMAND}"
