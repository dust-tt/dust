#!/usr/bin/env bash
set -euo pipefail

# Point kubectl at a Dust production cell.
#
# Switches gcloud and kubectl via dust-cell. Requires setup_infra.sh.
#
# Usage: connect-cluster.sh <eu|us|cell-*>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/prodbox.sh
source "${SCRIPT_DIR}/lib/prodbox.sh"

ALIAS="${1:?Usage: connect-cluster.sh <eu|us|cell-*>}"

require_dust_cell

CELL="$(cell_for_alias "$ALIAS")"
dust-cell "$CELL"

echo "✅ kubectl is now pointed at ${CELL}."
