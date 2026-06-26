#!/usr/bin/env bash
set -euo pipefail

# Point kubectl at a Dust production cluster (eu or us).
#
# Updates your default kubeconfig (KUBECONFIG, or ~/.kube/config) and switches
# the current context to the chosen cluster, so subsequent `kubectl` commands
# target it. Handles gcloud auth automatically.
#
# Usage: connect-cluster.sh <eu|us>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/gcp.sh
source "${SCRIPT_DIR}/lib/gcp.sh"

ALIAS="${1:?Usage: connect-cluster.sh <eu|us>}"

require_commands gcloud kubectl

REGION="$(gcp_region_for_alias "$ALIAS")"

ensure_gcloud_auth
connect_cluster "$REGION" "${KUBECONFIG:-$HOME/.kube/config}"

echo "✅ kubectl is now pointed at ${REGION} (dust-kube)."
