# Shared settings and helpers for bin/*. Sourced, not executed.
set -euo pipefail

BENCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="$BENCH_DIR/.state"
PROJECT="dust-dev"
REGION="us-central1"
BUCKET="dust-dev-dfs-bench"
REGISTRY="$REGION-docker.pkg.dev/$PROJECT/dfs-bench"
FDB_OPERATOR_VERSION="v2.37.0"
# Must match the FDB cluster version in k8s/fdb-cluster.yaml.
FDB_VERSION="7.3.69"
# Clusters older than this are torn down by bin/sweep.
MAX_RUN_AGE_HOURS=6
# E2B sandboxes are not reaped by our infra: short timeout, renewed by the orchestrator, hard cap.
SANDBOX_TIMEOUT_SECONDS=900
SANDBOX_MAX_AGE_HOURS=3

mkdir -p "$STATE_DIR"

# gcloud, Terraform and kubectl run as the dust-dev service account from an isolated gcloud
# config, whatever the user's active login is (often prod).
SA_KEY="${DFS_BENCH_SA_KEY:-$HOME/.config/dust-dev/sa-key.json}"
export CLOUDSDK_CONFIG="$STATE_DIR/gcloud"
export CLOUDSDK_CORE_PROJECT="$PROJECT"
export GOOGLE_APPLICATION_CREDENTIALS="$SA_KEY"

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

cluster_name() { echo "dfsb-$1"; }

# Activates the dust-dev service account in the isolated config; refuses any other identity.
require_dust_dev() {
  [[ -f "$SA_KEY" ]] || die "missing service account key $SA_KEY"
  local account
  account="$(jq -r .client_email "$SA_KEY")"
  [[ "$account" == *"@$PROJECT.iam.gserviceaccount.com" ]] || die "$SA_KEY is not a $PROJECT service account"
  if [[ "$(gcloud config get-value account 2>/dev/null)" != "$account" ]]; then
    gcloud auth activate-service-account --key-file="$SA_KEY" --quiet >/dev/null 2>&1
  fi
}

current_run() {
  [[ -f "$STATE_DIR/current-run" ]] || die "no current run; pass a run id"
  cat "$STATE_DIR/current-run"
}

# Each run gets its own kubeconfig so kubectl never touches other contexts (prod included).
use_kubeconfig() {
  local run_id="$1"
  export KUBECONFIG="$STATE_DIR/kubeconfig-$run_id"
}

cluster_exists() {
  gcloud container clusters describe "$(cluster_name "$1")" \
    --region "$REGION" --project "$PROJECT" --format="value(name)" >/dev/null 2>&1
}

fetch_credentials() {
  local run_id="$1"
  use_kubeconfig "$run_id"
  gcloud container clusters get-credentials "$(cluster_name "$run_id")" \
    --region "$REGION" --project "$PROJECT" >/dev/null
}

# Docker with its own config dir, authenticated to the registry as the dust-dev service account.
# Credentials are written to that config directly: `docker login` would put them in the macOS
# keychain, shared with the user's Docker. Plugins and contexts are shared.
use_docker() {
  export DOCKER_CONFIG="$STATE_DIR/docker"
  mkdir -p "$DOCKER_CONFIG"
  [[ -e "$DOCKER_CONFIG/cli-plugins" ]] || ln -s "$HOME/.docker/cli-plugins" "$DOCKER_CONFIG/cli-plugins"
  [[ -e "$DOCKER_CONFIG/contexts" ]] || ln -s "$HOME/.docker/contexts" "$DOCKER_CONFIG/contexts"
  local auth
  auth="$(printf '_json_key:%s' "$(cat "$SA_KEY")" | base64 | tr -d '\n')"
  (umask 077 && jq -n --arg host "$REGION-docker.pkg.dev" --arg auth "$auth" \
    '{auths: {($host): {auth: $auth}}}' >"$DOCKER_CONFIG/config.json")
}

tf() {
  terraform -chdir="$BENCH_DIR/terraform" "$@"
}

tf_init() {
  local run_id="$1"
  tf init -reconfigure -input=false \
    -backend-config="bucket=$BUCKET" \
    -backend-config="prefix=runs/$run_id/tfstate" >/dev/null
}

# --- E2B (e2b.dev, us-central1). Credentials from .state/e2b.env, else the environment. ---

load_e2b_env() {
  if [[ -f "$STATE_DIR/e2b.env" ]]; then
    set -a
    source "$STATE_DIR/e2b.env"
    set +a
  fi
  [[ -n "${E2B_API_KEY:-}" && -n "${E2B_DOMAIN:-}" ]] || die "set E2B_API_KEY and E2B_DOMAIN in $STATE_DIR/e2b.env"
  export E2B_API_KEY E2B_DOMAIN
}

# Prints "<sandboxID> <startedAt> <run_id>" for running bench sandboxes (all runs if no arg).
e2b_list_bench_sandboxes() {
  local filter="dfs-bench%3Dtrue"
  [[ -n "${1:-}" ]] && filter="dfs-bench-run%3D$1"
  local next="" page
  while :; do
    page="$(curl -sfS -D "$STATE_DIR/e2b-headers" -H "X-API-Key: $E2B_API_KEY" \
      "https://api.$E2B_DOMAIN/v2/sandboxes?state=running&limit=100&metadata=$filter${next:+&nextToken=$next}")"
    jq -r '.[] | "\(.sandboxID) \(.startedAt) \(.metadata["dfs-bench-run"] // "-")"' <<<"$page"
    next="$(grep -i '^x-next-token:' "$STATE_DIR/e2b-headers" | cut -d' ' -f2 | tr -d '\r' || true)"
    [[ -n "$next" ]] || break
  done
}

e2b_kill() {
  curl -sfS -o /dev/null -X DELETE -H "X-API-Key: $E2B_API_KEY" "https://api.$E2B_DOMAIN/sandboxes/$1"
}

# --- FDB (needs the run's kubeconfig) ---

create_fdb() {
  kubectl apply -f "$BENCH_DIR/k8s/fdb-cluster.yaml"
  kubectl -n fdb wait foundationdbcluster/fdb --for=jsonpath='{.status.health.available}'=true --timeout=30m
  kubectl -n fdb wait foundationdbcluster/fdb --for=jsonpath='{.status.health.fullReplication}'=true --timeout=15m
}

# Deletes the FDB cluster and its volumes; the operator stays.
delete_fdb() {
  kubectl -n fdb delete foundationdbcluster fdb --ignore-not-found --timeout=10m
  kubectl -n fdb delete pvc -l foundationdb.org/fdb-cluster-name=fdb --ignore-not-found --timeout=10m
}
