#!/usr/bin/env bash
# One-shot front + connectors migrations for mprocs. Must exit when finished.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# run-migrate.cjs falls back to `tsx` when dist/migrate.js is missing; npm scripts
# add node_modules/.bin to PATH, but this script runs node directly.
export PATH="${ROOT}/node_modules/.bin:${PATH}"

READY_FILE="${READY_FILE:-sdks/js/dist/client.esm.js.map}"
if [[ "$READY_FILE" != /* ]]; then
  READY_FILE="${ROOT}/${READY_FILE}"
fi

echo "Waiting for sdks-js to compile..."
echo "Expecting file: $READY_FILE"
while [ ! -f "$READY_FILE" ]; do
  sleep 1
done
echo "sdks-js ready. Starting migrations."

apply_workspace_migrations() {
  local workspace="$1"
  echo "Applying ${workspace} migrations..."
  (
    cd "${ROOT}/${workspace}"
    node ../scripts/db/run-migrate.cjs --command pre-deploy --execute
    node ../scripts/db/run-migrate.cjs --command post-deploy --execute
  )
}

apply_workspace_migrations front
apply_workspace_migrations connectors

echo "Migrations complete."
