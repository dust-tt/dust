#!/usr/bin/env bash
set -euo pipefail

# Run database migrations across all production regions via prodbox.
# Usage: run-migrations.sh <pre-deploy|post-deploy|status> [front|connectors]
#
# pre-deploy  — apply migrations that must run before deploying new code
# post-deploy — apply migrations that must run after new code is deployed
# status      — show pending migrations in every region (continues on failure)

COMMAND="${1:?Usage: run-migrations.sh <pre-deploy|post-deploy|status> [front|connectors]}"
COMPONENT="${2:?Usage: run-migrations.sh <pre-deploy|post-deploy|status> [front|connectors]}"

# Extend this list as new regions are added.
REGIONS=("us-central1" "europe-west1")

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

# Map command to the npm script defined in package.json.
case "$COMMAND" in
  pre-deploy) NPM_SCRIPT="migration:apply:pre-deploy" ;;
  post-deploy) NPM_SCRIPT="migration:apply:post-deploy" ;;
  status) NPM_SCRIPT="migration:status" ;;
esac

# ---------------------------------------------------------------------------
# GCP authentication
# ---------------------------------------------------------------------------

echo "🔐 Checking gcloud authentication..."
if ! gcloud auth print-access-token &>/dev/null; then
  echo "   Not authenticated — running gcloud auth login..."
  gcloud auth login
fi

# ---------------------------------------------------------------------------
# Temp kubeconfig cleanup
# ---------------------------------------------------------------------------

# Each region uses an isolated kubeconfig so we never mutate the caller's
# active context or the global gcloud configuration.
TMPFILES=()
cleanup() {
  for f in "${TMPFILES[@]:-}"; do
    rm -f "$f"
  done
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Per-region runner
# ---------------------------------------------------------------------------

run_in_region() {
  local region="$1"
  local tmpkubeconfig pod_name

  tmpkubeconfig=$(mktemp)
  TMPFILES+=("$tmpkubeconfig")

  echo ""
  echo "🌍 ${region} — fetching cluster credentials..."

  # --configuration uses the named gcloud config without activating it globally,
  # keeping the caller's active configuration intact.
  if ! KUBECONFIG="$tmpkubeconfig" \
    gcloud --configuration="${region}" \
    container clusters get-credentials dust-kube \
    --region "${region}" \
    --quiet; then
    echo "❌ Failed to get credentials for ${region}." >&2
    return 1
  fi

  pod_name=$(
    KUBECONFIG="$tmpkubeconfig" kubectl get pods \
      -lapp.kubernetes.io/instance=prodbox \
      --output jsonpath='{.items[0].metadata.name}'
  ) || {
    echo "❌ Failed to list pods in ${region}." >&2
    return 1
  }

  if [[ -z "$pod_name" ]]; then
    echo "❌ No prodbox pod found in ${region}." >&2
    return 1
  fi

  echo "   Pod: ${pod_name}"

  local pod_branch
  local pod_branch
  pod_branch=$(KUBECONFIG="$tmpkubeconfig" kubectl exec "${pod_name}" -- git -C /dust branch --show-current) || {
    echo "❌ Failed to check /dust branch in ${region}." >&2
    return 1
  }
  if [[ -n "$pod_branch" && "$pod_branch" != "main" ]]; then
    echo "❌ /dust is on branch '${pod_branch}', expected 'main' or detached HEAD. Aborting." >&2
    return 1
  fi

  echo "   → npm run ${NPM_SCRIPT} in /dust/${COMPONENT}"

  if ! KUBECONFIG="$tmpkubeconfig" kubectl exec "${pod_name}" -- bash -c "
    set -euo pipefail
    git -C /dust fetch origin main --quiet
    git -C /dust checkout origin/main --quiet
    cd /dust/${COMPONENT}
    npm --no-update-notifier run ${NPM_SCRIPT}
  "; then
    echo "❌ Migration command failed in ${region}." >&2
    return 1
  fi

  return 0
}

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

echo ""
echo "📋 ${COMMAND} / ${COMPONENT} — running across ${#REGIONS[@]} region(s)..."

FAILED_REGIONS=()

for REGION in "${REGIONS[@]}"; do
  if run_in_region "${REGION}"; then
    echo "   ✅ ${REGION} done"
  else
    FAILED_REGIONS+=("${REGION}")
    # status is read-only: report all regions before deciding.
    # pre/post-deploy: fail fast to prevent partial state.
    if [[ "$COMMAND" != "status" ]]; then
      echo "" >&2
      echo "❌ Aborting: stopping after first failure to avoid partial migration state." >&2
      exit 1
    fi
  fi
done

echo ""
if [[ ${#FAILED_REGIONS[@]} -gt 0 ]]; then
  echo "❌ Completed with failures in: ${FAILED_REGIONS[*]}" >&2
  exit 1
fi

echo "✅ All regions complete."
