#!/usr/bin/env bash
set -euo pipefail

# Required env vars (set by each workspace's package.json script):
#   MIGRATION_DB_URI_VAR    — name of the env var holding the database URI
#                             (e.g. FRONT_DATABASE_URI, CONNECTORS_DATABASE_URI)
#   MIGRATION_SHADOW_PREFIX — prefix for the shadow database name
#                             (e.g. dust_front_shadow_to, dust_connectors_shadow_to)
#   MIGRATION_ADMIN_DB_PATH — path to admin/db.ts relative to the workspace root
#                             (e.g. admin/db.ts, src/admin/db.ts, ../front/admin/db.ts)

if [ -z "${MIGRATION_DB_URI_VAR:-}" ] || \
   [ -z "${MIGRATION_SHADOW_PREFIX:-}" ] || \
   [ -z "${MIGRATION_ADMIN_DB_PATH:-}" ]; then
  echo "Error: MIGRATION_DB_URI_VAR, MIGRATION_SHADOW_PREFIX, and MIGRATION_ADMIN_DB_PATH must be set."
  exit 1
fi

# Ensure NODE_ENV is not set to production.
if [ "${NODE_ENV:-}" == "production" ]; then
  echo "Error: NODE_ENV is set to production. Aborting script."
  exit 1
fi

# Check that pg-schema-diff is installed.
if ! command -v pg-schema-diff >/dev/null 2>&1; then
  echo "Error: 'pg-schema-diff' is not installed or not in PATH."
  echo ""
  echo "Install it from https://github.com/stripe/pg-schema-diff:"
  echo "  brew install pg-schema-diff"
  exit 1
fi

# Check that psql is installed.
if ! command -v psql >/dev/null 2>&1; then
  echo "Error: 'psql' is not installed or not in PATH."
  echo "Install the PostgreSQL client tools (e.g. 'brew install postgresql')."
  exit 1
fi

# Read the actual DB URI via indirect expansion.
DB_URI="${!MIGRATION_DB_URI_VAR}"

if [ -z "${DB_URI:-}" ]; then
  echo "Error: ${MIGRATION_DB_URI_VAR} must be set."
  exit 1
fi

usage() {
  echo "Usage: $0 <pre-deploy|post-deploy> <description words...>"
  echo ""
  echo "  pre-deploy   Schema change that old code can survive (add column, add table, add index)."
  echo "  post-deploy  Schema change that requires new code to be live (drop column, tighten constraint)."
  echo ""
  echo "  Description words are joined with '_' (e.g. 'add email column' -> 'add_email_column')."
  exit 1
}

PHASE="${1:-}"
shift || true
DESC="${*:-}"
DESC="${DESC// /_}"

if [ -z "${PHASE}" ] || [ -z "${DESC}" ]; then
  usage
fi

case "${PHASE}" in
  pre-deploy|post-deploy) ;;
  *)
    echo "Error: phase must be 'pre-deploy' or 'post-deploy', got '${PHASE}'."
    usage
    ;;
esac

TIMESTAMP=$(date +%Y%m%d%H%M%S)
OUT_DIR="migrations/${PHASE}"
FILENAME="${OUT_DIR}/${TIMESTAMP}_${DESC}.sql"

mkdir -p "${OUT_DIR}"

# The current DB_URI is the baseline (already at production schema).
# We only need one shadow DB to materialize the current branch's models.
BASE_DSN="${DB_URI%/*}"
ADMIN_DSN="${BASE_DSN}/postgres"

SHADOW_TO="${MIGRATION_SHADOW_PREFIX}_$$"
TO_DSN="${BASE_DSN}/${SHADOW_TO}"

cleanup() {
  set +e
  psql "${ADMIN_DSN}" -c "DROP DATABASE IF EXISTS \"${SHADOW_TO}\"" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo "Building target schema from current branch..."
psql "${ADMIN_DSN}" -c "CREATE DATABASE \"${SHADOW_TO}\"" >/dev/null
# Export the shadow URI under the workspace-specific env var name so admin/db.ts picks it up.
export "${MIGRATION_DB_URI_VAR}=${TO_DSN}"
npx tsx "${MIGRATION_ADMIN_DB_PATH}"

echo "Computing diff..."
pg-schema-diff plan \
  --from-dsn "${DB_URI}" \
  --to-dsn "${TO_DSN}" \
  --disable-plan-validation \
  --output-format sql \
  > "${FILENAME}"

if [ ! -s "${FILENAME}" ]; then
  rm "${FILENAME}"
  echo "No schema changes detected."
  exit 0
fi

echo ""
echo "✅ Migration generated:"
echo "   ${FILENAME}"
