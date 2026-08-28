#!/usr/bin/env bash
# Install phase — npm workspaces + git hooks. Run once before infra/apps (or via up.sh --install).
set -euo pipefail

DUST_DEV_SCRIPT_NAME=install
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=dev/scripts/common.sh
source "${SCRIPT_DIR}/common.sh"
# shellcheck source=dev/scripts/env.sh
source "${SCRIPT_DIR}/env.sh"

export CI=true
export LEFTHOOK_EXCLUDE="${LEFTHOOK_EXCLUDE:-front-lint-test-filenames,front-typecheck,front-circular,front-docs-check,connectors-lint-test-filenames,connectors-typecheck,lint-staged}"

ensure_node_path
cd "$DUST_REPO_ROOT"

log "Running npm install..."
npm install

log "Installing lefthook git hooks..."
npx lefthook install -f

log "Install complete"
