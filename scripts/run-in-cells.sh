#!/usr/bin/env bash
set -euo pipefail

# Run an ad-hoc command in the prodbox pod of every production cell.
#
# Each pod is checked out on origin/main before the command runs, so the
# command and any file it references must be committed and merged.
#
# Usage:
#   run-in-cells.sh [options] -- <command...>
#
# Options:
#   --component <dir>    Working directory under /dust (default: front)
#   --cells <list>       Comma-separated cells/aliases instead of all cells
#   --continue-on-error  Keep going after a cell fails (default: fail fast)
#   --yes                Skip the confirmation prompt
#
# Examples:
#   run-in-cells.sh -- npx tsx scripts/backfill_foo.ts --execute
#   run-in-cells.sh -- \
#     npx tsx scripts/execute_elasticsearch_http.ts --file scripts/es/query.http --execute
#
# Requires dust-cell on PATH (dust-infra/scripts/setup_infra.sh).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/prodbox.sh
source "${SCRIPT_DIR}/lib/prodbox.sh"

COMPONENT="front"
CONTINUE_ON_ERROR=false
ASSUME_YES=false
REQUESTED_CELLS=""

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --component)
      COMPONENT="${2:?--component requires a value}"
      shift 2
      ;;
    --cells)
      REQUESTED_CELLS="${2:?--cells requires a value}"
      shift 2
      ;;
    --continue-on-error)
      CONTINUE_ON_ERROR=true
      shift
      ;;
    --yes)
      ASSUME_YES=true
      shift
      ;;
    --)
      shift
      break
      ;;
    *)
      echo "❌ Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$#" -eq 0 ]]; then
  echo "❌ Usage: run-in-cells.sh [options] -- <command...>" >&2
  exit 1
fi

COMMAND=("$@")

require_dust_cell

# ---------------------------------------------------------------------------
# Cell list
# ---------------------------------------------------------------------------

CELLS=()
if [[ -n "$REQUESTED_CELLS" ]]; then
  IFS=',' read -r -a REQUESTED <<<"$REQUESTED_CELLS"
  for REQUEST in "${REQUESTED[@]}"; do
    [[ -n "$REQUEST" ]] || continue
    CELLS+=("$(cell_for_alias "$REQUEST")")
  done
else
  while IFS= read -r cell; do
    [[ -n "$cell" ]] && CELLS+=("$cell")
  done < <(dust-cell --complete)
fi

if [[ ${#CELLS[@]} -eq 0 ]]; then
  echo "❌ No cells to run against." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Confirmation
# ---------------------------------------------------------------------------

echo ""
echo "📋 Running in /dust/${COMPONENT} across ${#CELLS[@]} cell(s): ${CELLS[*]}"
echo "   Command: ${COMMAND[*]}"

if [[ "$ASSUME_YES" != true ]]; then
  echo ""
  read -r -p "   Continue? [y/N] " confirm
  if [[ "$(printf '%s' "$confirm" | tr '[:upper:]' '[:lower:]')" != "y" ]]; then
    echo "❌ Aborted." >&2
    exit 1
  fi
fi

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

QUOTED_COMMAND=$(printf '%q ' "${COMMAND[@]}")

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

  echo "   → ${COMMAND[*]}"

  if ! kubectl exec "${pod_name}" -- bash -c "
    set -euo pipefail
    git -C /dust fetch origin main --quiet
    git -C /dust checkout origin/main --quiet
    cd /dust/${COMPONENT}
    ${QUOTED_COMMAND}
  "; then
    echo "❌ Command failed in ${cell}." >&2
    return 1
  fi

  return 0
}

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

FAILED_CELLS=()

for CELL in "${CELLS[@]}"; do
  if run_in_cell "${CELL}"; then
    echo "   ✅ ${CELL} done"
  else
    FAILED_CELLS+=("${CELL}")
    if [[ "$CONTINUE_ON_ERROR" != true ]]; then
      echo "" >&2
      echo "❌ Aborting after first failure. Re-run with --cells for the remaining cells," >&2
      echo "   or --continue-on-error if partial completion is acceptable." >&2
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
