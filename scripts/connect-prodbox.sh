#!/usr/bin/env bash
set -euo pipefail

# Open a shell (or run a one-off command) in the prodbox pod of a Dust
# production cluster (eu or us).
#
# Uses an isolated kubeconfig so your local kubectl context is left untouched.
# Handles gcloud auth automatically.
#
# Usage:
#   connect-prodbox.sh <eu|us>                  # interactive shell
#   connect-prodbox.sh <eu|us> -- <command...>  # run a command, then exit

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/gcp.sh
source "${SCRIPT_DIR}/lib/gcp.sh"

ALIAS="${1:?Usage: connect-prodbox.sh <eu|us> [-- <command...>]}"
shift

# Drop the optional "--" separator before the command, if present.
if [[ "${1:-}" == "--" ]]; then
  shift
fi

require_commands gcloud kubectl

REGION="$(gcp_region_for_alias "$ALIAS")"

# Isolated kubeconfig so we never mutate the caller's active kubectl context.
TMPKUBECONFIG="$(mktemp)"
cleanup() { rm -f "$TMPKUBECONFIG"; }
trap cleanup EXIT

ensure_gcloud_auth
connect_cluster "$REGION" "$TMPKUBECONFIG"

POD_NAME="$(get_prodbox_pod "$TMPKUBECONFIG")"
echo "   Pod: ${POD_NAME}" >&2

if [[ "$#" -gt 0 ]]; then
  KUBECONFIG="$TMPKUBECONFIG" kubectl exec "$POD_NAME" -- "$@"
else
  echo "   Opening interactive shell (exit to disconnect)..." >&2
  KUBECONFIG="$TMPKUBECONFIG" kubectl exec -it "$POD_NAME" -- bash
fi
