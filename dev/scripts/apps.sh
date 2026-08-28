#!/usr/bin/env bash
# Wait for infra (when started in parallel), optional WorkOS seed, then mprocs app graph.
set -euo pipefail

DUST_DEV_SCRIPT_NAME=apps
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=dev/scripts/common.sh
source "${SCRIPT_DIR}/common.sh"
# shellcheck source=dev/scripts/env.sh
source "${SCRIPT_DIR}/env.sh"

if ! command -v mprocs >/dev/null 2>&1; then
  echo "mprocs not found; rebuild the dev/Dockerfile image" >&2
  exit 1
fi

if ! command -v bacon >/dev/null 2>&1; then
  echo "bacon not found; rebuild the dev/Dockerfile image" >&2
  exit 1
fi

# Refresh materialized 1Password env (runtime secrets are already in this process).
materialize_dev_environment || log "1Password env not loaded; using defaults + host secrets only"
# shellcheck disable=SC1090
source "${DUST_SHELL_ENV_FILE}"

bash "${SCRIPT_DIR}/wait-for-infra.sh" || {
  log "Infra is not ready; fix infra.sh first (see ${DUST_INFRA_LOG_DIR}/)"
  exit 1
}

# Temporal is started by infra.sh; only wait on the port here if needed.
bash "${SCRIPT_DIR}/ensure-temporal.sh" || {
  log "Temporal is required for front-workers and connectors; see ${DUST_INFRA_LOG_DIR}/temporal.log"
  exit 1
}

print_seed_failure_logs() {
  for log_file in seed-dev-user.log init-plans.log upgrade-workspace.log; do
    if [ -s "${DUST_INFRA_LOG_DIR}/${log_file}" ]; then
      log "--- ${log_file} ---"
      tail -40 "${DUST_INFRA_LOG_DIR}/${log_file}"
    fi
  done
}

# DEV_WORKOS_* are runtime secrets — often present in the apps terminal / agent session.
if [ -n "${DEV_WORKOS_USER_ID:-}" ] && [ -n "${DEV_WORKOS_USER_EMAIL:-}" ]; then
  bash "${SCRIPT_DIR}/seed.sh" || {
    log "Dev user seed failed"
    print_seed_failure_logs
    exit 1
  }
else
  log "DEV_WORKOS_USER_ID/EMAIL not set — skipping seed (add runtime secrets, then restart apps)"
fi

exec bash "${SCRIPT_DIR}/apps-inner.sh"
