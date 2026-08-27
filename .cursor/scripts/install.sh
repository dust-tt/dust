#!/usr/bin/env bash
# Cursor Cloud Agent install phase — runs once at image build / snapshot time.
# Must finish before start-infra (migrations, ES init) or start-mprocs need node_modules.
set -euo pipefail

DUST_DEV_SCRIPT_NAME=install
# shellcheck source=.cursor/scripts/common.sh
source "$(dirname "$0")/common.sh"
# shellcheck source=.cursor/scripts/env.defaults.sh
source "$(dirname "$0")/env.defaults.sh"

export CI=true
export LEFTHOOK_EXCLUDE="${LEFTHOOK_EXCLUDE:-front-lint-test-filenames,front-typecheck,front-circular,front-docs-check,connectors-lint-test-filenames,connectors-typecheck,lint-staged}"
export OP_ENVIRONMENT_ID="${OP_ENVIRONMENT_ID:-r6iqd3y67zqlbsxnotrj6bm25q}"

ensure_node_path
cd "$DUST_REPO_ROOT"

log "Running npm install..."
npm install

log "Installing lefthook git hooks..."
npx lefthook install -f

log "Install complete"
