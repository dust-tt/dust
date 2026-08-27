#!/usr/bin/env bash
# Launch mprocs with 1Password + host runtime secrets.
# Secrets are loaded into this shell first — mprocs must not run under `op run`
# (op masks stdout/stderr and corrupts the TUI).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=.cursor/scripts/common.sh
source "${SCRIPT_DIR}/common.sh"
# shellcheck source=.cursor/scripts/env.defaults.sh
source "${SCRIPT_DIR}/env.defaults.sh"

if ! command -v mprocs >/dev/null 2>&1; then
  echo "mprocs not found; rebuild the .cursor/Dockerfile image" >&2
  exit 1
fi

if ! command -v bacon >/dev/null 2>&1; then
  echo "bacon not found; rebuild the .cursor/Dockerfile image" >&2
  exit 1
fi

write_gcp_service_account_file
load_op_environment || log "1Password env not loaded; using defaults + host secrets only"
export_op_runtime_secrets

bash "${SCRIPT_DIR}/wait-for-infra.sh" || {
  log "Infra is not ready; fix start-infra first (see ${DUST_INFRA_LOG_DIR}/)"
  exit 1
}

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

# DEV_WORKOS_* are Cursor runtime secrets — only guaranteed in this terminal, not start-infra.
if [ -n "${DEV_WORKOS_USER_ID:-}" ] && [ -n "${DEV_WORKOS_USER_EMAIL:-}" ]; then
  bash "${SCRIPT_DIR}/seed-dev-user.sh" || {
    log "Dev user seed failed"
    print_seed_failure_logs
    exit 1
  }
else
  log "DEV_WORKOS_USER_ID/EMAIL not set — skipping seed (add Cursor runtime secrets, then restart mprocs)"
fi

exec bash "${SCRIPT_DIR}/start-mprocs-inner.sh"
