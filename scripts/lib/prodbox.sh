# shellcheck shell=bash
#
# Shared helpers for talking to prodbox via dust-cell + kubectl.
#
# Source this file from a script; do not execute it directly. All log/status
# output goes to stderr so that helpers which "return" a value via stdout
# (e.g. cell_for_alias, current_dust_cell, get_prodbox_pod) stay safe inside $(...).

require_dust_cell() {
  if ! command -v dust-cell &>/dev/null; then
    echo "❌ dust-cell not found. Run dust-infra/scripts/setup_infra.sh and open a new shell." >&2
    return 1
  fi
  if ! command -v kubectl &>/dev/null; then
    echo "❌ Missing required command: kubectl" >&2
    return 1
  fi
}

# Map eu/us (and legacy region names) to cell ids. cell-* is passed through.
cell_for_alias() {
  local alias="$1"
  case "$alias" in
    us | us-central1 | cell-00000) echo "cell-00000" ;;
    eu | europe-west1 | cell-00001) echo "cell-00001" ;;
    cell-*) echo "$alias" ;;
    *)
      echo "❌ Unknown cell '${alias}'. Use a cell id (cell-00000) or 'eu' / 'us'." >&2
      return 1
      ;;
  esac
}

# Cell marked current by `dust-cell` (non-tty listing). Empty if none.
current_dust_cell() {
  dust-cell | awk '$1 == "*" { print $2; exit }'
}

# Print the prodbox pod name in the current kubectl context.
get_prodbox_pod() {
  local pod_name

  pod_name=$(
    kubectl get pods \
      -lapp.kubernetes.io/instance=prodbox \
      --output jsonpath='{.items[0].metadata.name}'
  ) || {
    echo "❌ Failed to list prodbox pods." >&2
    return 1
  }

  if [[ -z "$pod_name" ]]; then
    echo "❌ No prodbox pod found." >&2
    return 1
  fi

  echo "$pod_name"
}
