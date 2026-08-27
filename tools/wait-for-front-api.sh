#!/usr/bin/env bash
# Wait for front-api (Hono dev proxy) then start Temporal workers.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HEALTH_URL="${DUST_FRONT_API:-http://127.0.0.1:3000}/api/healthz"

bash "${ROOT}/tools/wait-for-temporal.sh"

echo "Waiting for front-api at ${HEALTH_URL}..."
attempt=0
until curl -sf "$HEALTH_URL" >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -eq 30 ] || [ $((attempt % 30)) -eq 0 ]; then
    echo "Still waiting for front-api (${attempt}s)... check the front-api-hono proc"
  fi
  sleep 1
done

echo "front-api ready. Starting front-workers."
cd "${ROOT}/front"
exec ./admin/dev_worker.sh
