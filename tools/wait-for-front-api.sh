#!/usr/bin/env bash
# Wait for front-api (Hono dev proxy) then start Temporal workers.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bash "${ROOT}/tools/wait-for-temporal.sh"
bash "${ROOT}/tools/wait-for-front-api-ready.sh"

echo "Starting front-workers."
cd "${ROOT}/front"
exec ./admin/dev_worker.sh
