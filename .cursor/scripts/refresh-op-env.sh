#!/usr/bin/env bash
# Re-fetch the 1Password Environment into /tmp so new secrets are visible in all shells.
# Usage: bash .cursor/scripts/refresh-op-env.sh
set -euo pipefail

DUST_DEV_SCRIPT_NAME=refresh-op-env
# shellcheck source=.cursor/scripts/common.sh
source "$(dirname "$0")/common.sh"
# shellcheck source=.cursor/scripts/env.defaults.sh
source "$(dirname "$0")/env.defaults.sh"

materialize_dev_environment
log "Done. New shells (and BASH_ENV-backed commands) pick up the refreshed env automatically."
log "Already-running processes keep their old environment until restarted."
