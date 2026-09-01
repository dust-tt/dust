#!/usr/bin/env bash
# Bound the persistent core/target volume. Cargo leaves old deps and incremental
# files behind on rebuilds; this keeps recent artifacts (so the volume still
# speeds up bacon / rust-analyzer) and drops the rest.
set -euo pipefail

DUST_DEV_SCRIPT_NAME=sweep-cargo-target
# shellcheck source=dev/scripts/common.sh
source "$(dirname "$0")/common.sh"
# shellcheck source=dev/scripts/env.sh
source "$(dirname "$0")/env.sh"

TARGET_DIR="${DUST_REPO_ROOT}/core/target"
CORE_DIR="${DUST_REPO_ROOT}/core"
DAYS="${DUST_CARGO_SWEEP_DAYS:-14}"
MAXSIZE="${DUST_CARGO_SWEEP_MAXSIZE:-12GiB}"

if [ ! -d "$TARGET_DIR" ]; then
  log "No ${TARGET_DIR}; skipping"
  exit 0
fi

if ! command -v cargo-sweep >/dev/null 2>&1; then
  log "cargo-sweep not installed; rebuild the dev image"
  exit 0
fi

if pgrep -x cargo >/dev/null 2>&1 || pgrep -x rustc >/dev/null 2>&1 || pgrep -x bacon >/dev/null 2>&1; then
  log "Cargo is compiling; skipping sweep so we don't delete in-flight artifacts"
  exit 0
fi

size_before="$(du -sh "$TARGET_DIR" 2>/dev/null | awk '{print $1}')"
log "Sweeping ${TARGET_DIR} (${size_before:-?}) — unused >${DAYS}d, cap ${MAXSIZE}, current toolchain only"

run_sweep() {
  (
    cd "$CORE_DIR"
    cargo-sweep sweep "$@"
  )
}

# Criteria are mutually exclusive; run them in order from "keep current
# toolchain" to "drop old unused files" to "hard size cap".
run_sweep --installed
run_sweep --time "$DAYS"
run_sweep --maxsize "$MAXSIZE"

size_after="$(du -sh "$TARGET_DIR" 2>/dev/null | awk '{print $1}')"
log "Cargo target after sweep: ${size_after:-?}"
