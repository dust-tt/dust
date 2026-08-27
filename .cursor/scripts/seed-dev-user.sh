#!/usr/bin/env bash
# Idempotent dev-user seed, mirroring dust-hive's dust_hive_seed.sql flow.
set -euo pipefail

DUST_DEV_SCRIPT_NAME=seed-dev-user
# shellcheck source=.cursor/scripts/common.sh
source "$(dirname "$0")/common.sh"
# shellcheck source=.cursor/scripts/env.defaults.sh
source "$(dirname "$0")/env.defaults.sh"

SEED_LOG="${DUST_INFRA_LOG_DIR}/seed-dev-user.log"
touch "$SEED_LOG"
log() {
  echo "[seed-dev-user] $*" | tee -a "$SEED_LOG"
}

on_seed_error() {
  local exit_code=$?
  log "Seed failed (exit ${exit_code}). Full log: ${SEED_LOG}"
  for extra_log in init-plans.log upgrade-workspace.log; do
    if [ -s "${DUST_INFRA_LOG_DIR}/${extra_log}" ]; then
      log "--- tail ${extra_log} ---"
      tail -20 "${DUST_INFRA_LOG_DIR}/${extra_log}" | tee -a "$SEED_LOG"
    fi
  done
  exit "$exit_code"
}
trap on_seed_error ERR

log "Starting dev user seed..."
export_local_dev_infra
ensure_node_path
ensure_workspace_deps

for secret in DEV_WORKOS_USER_ID DEV_WORKOS_USER_EMAIL DEV_WORKOS_USER_PASSWORD; do
  eval "val=\${$secret:-}"
  if [ -n "$val" ]; then
    log "$secret is set"
  else
    log "$secret is not set"
  fi
done

if [ -z "${DEV_WORKOS_USER_ID:-}" ]; then
  log "DEV_WORKOS_USER_ID not set; skipping seed"
  exit 0
fi

if [ -z "${DEV_WORKOS_USER_EMAIL:-}" ]; then
  log "DEV_WORKOS_USER_EMAIL not set; skipping full dust-hive seed"
  exit 0
fi

SQL_FILE="${DUST_REPO_ROOT}/front/lib/dev/dust_hive_seed.sql"
STATE_FILE="/tmp/dust-dev-seed.json"
WORKSPACE_ID="DevWkSpace"

escape_sql() {
  local value="$1"
  if [ -z "$value" ]; then
    printf 'NULL'
  else
    printf "'%s'" "${value//\'/\'\'}"
  fi
}

generate_sid() {
  # Avoid `tr | head -c N` — with pipefail, head closing the pipe makes tr SIGPIPE (exit 141).
  python3 -c "import random,string; print(''.join(random.choices(string.ascii_letters+string.digits,k=10)))"
}

run_init_plans() {
  local plans_ready
  plans_ready=$(
    PGPASSWORD=dev psql "$FRONT_DATABASE_URI" -tAc \
      "SELECT 1 FROM plans WHERE code = 'FREE_UPGRADED_PLAN' LIMIT 1" \
      2>/dev/null | tr -d '[:space:]' || true
  )
  if [ "$plans_ready" = "1" ]; then
    log "FREE_UPGRADED_PLAN already present; skipping init_plans"
    return 0
  fi

  log "Ensuring subscription plans exist (init_plans.sh)..."
  log "Using FRONT_DATABASE_URI=${FRONT_DATABASE_URI}"
  (
    cd "${DUST_REPO_ROOT}/front"
    export FRONT_DATABASE_URI NODE_ENV=development
    export PATH="${DUST_REPO_ROOT}/node_modules/.bin:${PATH}"
    ./admin/init_plans.sh
  ) >"${DUST_INFRA_LOG_DIR}/init-plans.log" 2>&1 || {
    log "init_plans failed; see ${DUST_INFRA_LOG_DIR}/init-plans.log"
    tail -40 "${DUST_INFRA_LOG_DIR}/init-plans.log" | tee -a "$SEED_LOG"
    return 1
  }
  log "init_plans succeeded"
}

ensure_dev_super_user() {
  PGPASSWORD=dev psql "$FRONT_DATABASE_URI" -q -c \
    "UPDATE users SET \"isDustSuperUser\" = true, \"updatedAt\" = NOW()
     WHERE \"workOSUserId\" = $(escape_sql "$DEV_WORKOS_USER_ID")" \
    >/dev/null 2>&1 || true
}

ensure_free_upgraded_subscription() {
  local workspace_sid="${1:-$WORKSPACE_ID}"
  log "Ensuring workspace $workspace_sid is on FREE_UPGRADED_PLAN..."
  (
    cd "${DUST_REPO_ROOT}/front"
    export PATH="${DUST_REPO_ROOT}/node_modules/.bin:${PATH}"
    NODE_ENV=development npx tsx admin/cli.ts workspace upgrade --wId "$workspace_sid"
  ) >"${DUST_INFRA_LOG_DIR}/upgrade-workspace.log" 2>&1 || {
    if grep -q "already subscribed" "${DUST_INFRA_LOG_DIR}/upgrade-workspace.log"; then
      log "Workspace already on FREE_UPGRADED_PLAN"
      return 0
    fi
    log "Workspace upgrade failed; see ${DUST_INFRA_LOG_DIR}/upgrade-workspace.log"
    tail -30 "${DUST_INFRA_LOG_DIR}/upgrade-workspace.log"
    return 1
  }
}

find_user_workspace_sid() {
  PGPASSWORD=dev psql "$FRONT_DATABASE_URI" -tAc \
    "SELECT w.\"sId\" FROM users u
     JOIN memberships m ON m.\"userId\" = u.id AND m.\"endAt\" IS NULL
     JOIN workspaces w ON w.id = m.\"workspaceId\"
     WHERE u.\"workOSUserId\" = $(escape_sql "$DEV_WORKOS_USER_ID")
       AND w.\"sId\" <> $(escape_sql "$WORKSPACE_ID")
     ORDER BY CASE WHEN m.role = 'admin' THEN 0 ELSE 1 END, m.\"createdAt\" ASC
     LIMIT 1" \
    2>/dev/null | tr -d '[:space:]'
}

dev_workspace_ready=$(
  PGPASSWORD=dev psql "$FRONT_DATABASE_URI" -tAc \
    "SELECT 1 FROM users u
     JOIN memberships m ON m.\"userId\" = u.id AND m.\"endAt\" IS NULL
     JOIN workspaces w ON w.id = m.\"workspaceId\" AND w.\"sId\" = $(escape_sql "$WORKSPACE_ID")
     JOIN subscriptions s ON s.\"workspaceId\" = w.id AND s.status = 'active'
     JOIN plans p ON p.id = s.\"planId\" AND p.code = 'FREE_UPGRADED_PLAN'
     WHERE u.\"workOSUserId\" = $(escape_sql "$DEV_WORKOS_USER_ID")
     LIMIT 1" \
    2>/dev/null | tr -d '[:space:]' || true
)
if [ "$dev_workspace_ready" = "1" ]; then
  log "Dev workspace $WORKSPACE_ID is ready (FREE_UPGRADED_PLAN + membership)"
  trap - ERR
  exit 0
fi

run_init_plans

dev_workspace_exists=$(
  PGPASSWORD=dev psql "$FRONT_DATABASE_URI" -tAc \
    "SELECT 1 FROM workspaces WHERE \"sId\" = $(escape_sql "$WORKSPACE_ID") LIMIT 1" \
    2>/dev/null | tr -d '[:space:]' || true
)
if [ "$dev_workspace_exists" = "1" ]; then
  log "Workspace $WORKSPACE_ID exists but is not fully ready; repairing subscription"
  ensure_dev_super_user
  ensure_free_upgraded_subscription "$WORKSPACE_ID"
  log "Subscription repair succeeded for workspace $WORKSPACE_ID"
  trap - ERR
  exit 0
fi

existing_user_sid=$(
  PGPASSWORD=dev psql "$FRONT_DATABASE_URI" -tAc \
    "SELECT \"sId\" FROM users WHERE \"workOSUserId\" = $(escape_sql "$DEV_WORKOS_USER_ID") LIMIT 1" \
    2>/dev/null | tr -d '[:space:]' || true
)
if [ -n "$existing_user_sid" ]; then
  login_workspace_sid="$(find_user_workspace_sid)"
  if [ -n "$login_workspace_sid" ]; then
    log "User exists from login (sId=$existing_user_sid, workspace=$login_workspace_sid); creating $WORKSPACE_ID"
  else
    log "User exists from login (sId=$existing_user_sid); creating $WORKSPACE_ID"
  fi
fi

if [ ! -f "$SQL_FILE" ]; then
  log "Missing seed SQL at $SQL_FILE"
  exit 1
fi

if [ -n "$existing_user_sid" ]; then
  user_id="$existing_user_sid"
elif [ -f "$STATE_FILE" ]; then
  user_id=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["userId"])' "$STATE_FILE")
else
  user_id=$(generate_sid)
fi

if [ -f "$STATE_FILE" ]; then
  subscription_id=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["subscriptionId"])' "$STATE_FILE")
else
  subscription_id=$(generate_sid)
fi
printf '{"userId":"%s","subscriptionId":"%s"}\n' "$user_id" "$subscription_id" >"$STATE_FILE"

email="${DEV_WORKOS_USER_EMAIL,,}"
username="${email%%@*}"
first_name="${username%%+*}"
first_name="${first_name%%.*}"
first_name="${first_name:-Dev}"
display_name="$first_name"
workspace_name="${first_name}'s Dev Workspace"

log "Seeding dev user $email into workspace $WORKSPACE_ID..."

final_sql=$(
  sed \
    -e "s/:userId/$(escape_sql "$user_id")/g" \
    -e "s/:workspaceId/$(escape_sql "$WORKSPACE_ID")/g" \
    -e "s/:subscriptionId/$(escape_sql "$subscription_id")/g" \
    -e "s/:email/$(escape_sql "$email")/g" \
    -e "s/:username/$(escape_sql "$username")/g" \
    -e "s/:name/$(escape_sql "$display_name")/g" \
    -e "s/:firstName/$(escape_sql "$first_name")/g" \
    -e "s/:lastName/NULL/g" \
    -e "s/:workspaceName/$(escape_sql "$workspace_name")/g" \
    -e "s/:workOSUserId/$(escape_sql "$DEV_WORKOS_USER_ID")/g" \
    -e "s/:providerId/NULL/g" \
    -e "s/:provider/NULL/g" \
    -e "s/:imageUrl/NULL/g" \
    -e "s/'org_01KEF5MMN72N50JA89BDD5TQ4T'/NULL/g" \
    "$SQL_FILE"
)

seed_output=$(PGPASSWORD=dev psql "$FRONT_DATABASE_URI" -c "$final_sql" 2>&1) || {
  log "Seed SQL failed:"
  echo "$seed_output" | tee -a "$SEED_LOG"
  exit 1
}
echo "$seed_output" >>"$SEED_LOG"

if ! grep -qE '[[:space:]]+[0-9]+[[:space:]]+\|[[:space:]]+[0-9]+[[:space:]]+\|[[:space:]]+[0-9]+' <<<"$seed_output"; then
  log "Seed SQL ran but subscription row is missing; repairing via upgrade..."
  ensure_dev_super_user
  ensure_free_upgraded_subscription "$WORKSPACE_ID"
  log "Subscription repair succeeded for workspace $WORKSPACE_ID"
  trap - ERR
  exit 0
fi

ensure_dev_super_user
log "Seed succeeded for workspace $WORKSPACE_ID"
trap - ERR
exit 0
