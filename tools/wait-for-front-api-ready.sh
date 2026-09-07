#!/usr/bin/env bash
# Block until the Hono front-api health endpoint is ready.
set -euo pipefail

HEALTH_URL="${DUST_FRONT_API:-http://127.0.0.1:3000}/api/healthz"

echo "Waiting for front-api at ${HEALTH_URL}..."
attempt=0
until curl -sf "$HEALTH_URL" >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -eq 30 ] || [ $((attempt % 30)) -eq 0 ]; then
    echo "Still waiting for front-api (${attempt}s)... check the front-api-hono proc"
  fi
  sleep 1
done

echo "front-api ready."
