# shellcheck shell=bash
#
# Shared helpers for connecting to Dust production GKE clusters.
#
# Source this file from a script; do not execute it directly. All log/status
# output goes to stderr so that helpers which "return" a value via stdout
# (e.g. gcp_region_for_alias, get_prodbox_pod) stay safe inside $(...).

# Map the short region alias used on the command line to the GCP region, which
# is also the name of the gcloud configuration to use. Keep in sync with the
# REGIONS list in run-migrations.sh as new regions are added.
gcp_region_for_alias() {
  local alias="$1"
  case "$alias" in
    us | us-central1) echo "us-central1" ;;
    eu | europe-west1) echo "europe-west1" ;;
    *)
      echo "❌ Unknown region '${alias}'. Use 'eu' or 'us'." >&2
      return 1
      ;;
  esac
}

# Verify required CLI tools are available before doing anything.
require_commands() {
  local missing=()
  local cmd
  for cmd in "$@"; do
    if ! command -v "$cmd" &>/dev/null; then
      missing+=("$cmd")
    fi
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "❌ Missing required command(s): ${missing[*]}" >&2
    return 1
  fi
}

# Ensure the caller has a valid gcloud access token, triggering an interactive
# login only when needed.
ensure_gcloud_auth() {
  echo "🔐 Checking gcloud authentication..." >&2
  if ! gcloud auth print-access-token &>/dev/null; then
    echo "   Not authenticated — running gcloud auth login..." >&2
    gcloud auth login
  fi
}

# Fetch cluster credentials for a region into the given KUBECONFIG path.
# --configuration uses the region-named gcloud config without activating it
# globally, keeping the caller's active configuration intact.
connect_cluster() {
  local region="$1"
  local kubeconfig="$2"

  echo "🌍 ${region} — fetching cluster credentials..." >&2
  if ! KUBECONFIG="$kubeconfig" \
    gcloud --configuration="${region}" \
    container clusters get-credentials dust-kube \
    --region "${region}" \
    --quiet; then
    echo "❌ Failed to get credentials for ${region}." >&2
    return 1
  fi
}

# Print the name of the prodbox pod in the cluster referenced by the given
# KUBECONFIG path. Fails if the cluster is unreachable or no pod is found.
get_prodbox_pod() {
  local kubeconfig="$1"
  local pod_name

  pod_name=$(
    KUBECONFIG="$kubeconfig" kubectl get pods \
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
