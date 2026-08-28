#!/usr/bin/env bash
# Compatibility wrapper: load materialized 1Password + local-dev env, then run a command.
# Prefer relying on BASH_ENV / .cursor/bashrc (populated by start-infra) so plain
# terminals and scripts already see these variables without this wrapper.
set -euo pipefail

DUST_DEV_SCRIPT_NAME=with-op-run
# shellcheck source=.cursor/scripts/common.sh
source "$(dirname "$0")/common.sh"
# shellcheck source=.cursor/scripts/env.defaults.sh
source "$(dirname "$0")/env.defaults.sh"

materialize_dev_environment || log "Dev env materialize incomplete; continuing with what is available"
# shellcheck disable=SC1090
source "$DUST_SHELL_ENV_FILE"
write_gcp_service_account_file

exec "$@"
