#!/usr/bin/env bash
set -euo pipefail

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

if [ -z "${FRONT_DATABASE_URI:-}" ]; then
  echo "Error: FRONT_DATABASE_URI must be set."
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

# The current FRONT_DATABASE_URI is the baseline (already at production schema).
# We only need one shadow DB to materialize the current branch's models.
BASE_DSN="${FRONT_DATABASE_URI%/*}"
ADMIN_DSN="${BASE_DSN}/postgres"

SHADOW_TO="dust_front_shadow_to_$$"
TO_DSN="${BASE_DSN}/${SHADOW_TO}"

cleanup() {
  set +e
  psql "${ADMIN_DSN}" -c "DROP DATABASE IF EXISTS \"${SHADOW_TO}\"" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo "Building target schema from current branch..."
psql "${ADMIN_DSN}" -c "CREATE DATABASE \"${SHADOW_TO}\"" >/dev/null
FRONT_DATABASE_URI="${TO_DSN}" npx tsx ../front/admin/db.ts

echo "Computing diff..."
pg-schema-diff plan \
  --from-dsn "${FRONT_DATABASE_URI}" \
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
