#!/usr/bin/env bash
set -euo pipefail

# Run database migrations across all production cells via prodbox.
# Usage: run-migrations.sh <pre-deploy|post-deploy|status> [front|connectors]
#
# pre-deploy  — apply migrations that must run before deploying new code
# post-deploy — apply migrations that must run after new code is deployed
# status      — show pending migrations in every cell (continues on failure)
#
# Requires dust-cell on PATH (dust-infra/scripts/setup_infra.sh).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/prodbox.sh
source "${SCRIPT_DIR}/lib/prodbox.sh"

COMMAND="${1:?Usage: run-migrations.sh <pre-deploy|post-deploy|status> [front|connectors]}"
COMPONENT="${2:?Usage: run-migrations.sh <pre-deploy|post-deploy|status> [front|connectors]}"

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

case "$COMMAND" in
  pre-deploy | post-deploy | status) ;;
  *)
    echo "❌ Unknown command: ${COMMAND}. Use pre-deploy, post-deploy, or status." >&2
    exit 1
    ;;
esac

case "$COMPONENT" in
  front | connectors) ;;
  *)
    echo "❌ Unknown component: ${COMPONENT}. Use front or connectors." >&2
    exit 1
    ;;
esac

# ---------------------------------------------------------------------------
# Post-deploy confirmation
# ---------------------------------------------------------------------------

if [[ "$COMMAND" == "post-deploy" ]]; then
  echo ""
  echo "⚠️  Post-deploy migrations share DB models with front services."
  echo "   Make sure the following are deployed with the latest code before continuing:"
  echo "     • front"
  echo "     • front-sse"
  echo ""
  read -r -p "   Have you deployed front and front-sse? [y/N] " confirm
  if [[ "$(printf '%s' "$confirm" | tr '[:upper:]' '[:lower:]')" != "y" ]]; then
    echo "❌ Aborted. Deploy front and front-sse first." >&2
    exit 1
  fi
  echo ""
fi

# Map command to the npm script defined in package.json.
case "$COMMAND" in
  pre-deploy) NPM_SCRIPT="migration:apply:pre-deploy" ;;
  post-deploy) NPM_SCRIPT="migration:apply:post-deploy" ;;
  status) NPM_SCRIPT="migration:status" ;;
esac

require_dust_cell

ORIGINAL_CELL="$(current_dust_cell || true)"
restore_cell() {
  if [[ -n "${ORIGINAL_CELL:-}" ]]; then
    dust-cell "${ORIGINAL_CELL}" >/dev/null || true
  fi
}
trap restore_cell EXIT

# ---------------------------------------------------------------------------
# Per-cell runner
# ---------------------------------------------------------------------------

run_in_cell() {
  local cell="$1"
  local pod_name

  echo ""
  dust-cell "${cell}" || return 1

  pod_name=$(get_prodbox_pod) || return 1

  echo "   Pod: ${pod_name}"

  local pod_branch
  pod_branch=$(kubectl exec "${pod_name}" -- git -C /dust branch --show-current) || {
    echo "❌ Failed to check /dust branch in ${cell}." >&2
    return 1
  }
  if [[ -n "$pod_branch" && "$pod_branch" != "main" ]]; then
    echo "❌ /dust is on branch '${pod_branch}', expected 'main' or detached HEAD. Aborting." >&2
    return 1
  fi

  echo "   → npm run ${NPM_SCRIPT} in /dust/${COMPONENT}"

  if ! kubectl exec "${pod_name}" -- bash -c "
    set -euo pipefail
    git -C /dust fetch origin main --quiet
    git -C /dust checkout origin/main --quiet
    cd /dust/${COMPONENT}
    npm --no-update-notifier run ${NPM_SCRIPT}
  "; then
    echo "❌ Migration command failed in ${cell}." >&2
    return 1
  fi

  return 0
}

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

CELLS=()
while IFS= read -r cell; do
  [[ -n "$cell" ]] && CELLS+=("$cell")
done < <(dust-cell --complete)
if [[ ${#CELLS[@]} -eq 0 ]]; then
  echo "❌ dust-cell --complete returned no cells." >&2
  exit 1
fi

echo ""
echo "📋 ${COMMAND} / ${COMPONENT} — running across ${#CELLS[@]} cell(s)..."

FAILED_CELLS=()

for CELL in "${CELLS[@]}"; do
  if run_in_cell "${CELL}"; then
    echo "   ✅ ${CELL} done"
  else
    FAILED_CELLS+=("${CELL}")
    # status is read-only: report all cells before deciding.
    # pre/post-deploy: fail fast to prevent partial state.
    if [[ "$COMMAND" != "status" ]]; then
      echo "" >&2
      echo "❌ Aborting: stopping after first failure to avoid partial migration state." >&2
      exit 1
    fi
  fi
done

echo ""
if [[ ${#FAILED_CELLS[@]} -gt 0 ]]; then
  echo "❌ Completed with failures in: ${FAILED_CELLS[*]}" >&2
  exit 1
fi

echo "✅ All cells complete."
