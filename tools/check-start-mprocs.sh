#!/usr/bin/env bash
# Guard: mprocs must be launched via start-mprocs.sh (prep + DUST_USE_START_MPROCS).
set -euo pipefail

if [ -z "${DUST_USE_START_MPROCS:-}" ]; then
  echo ""
  echo "ERROR: Run the start-mprocs wrapper instead of invoking mprocs directly:"
  echo "       tools/start-mprocs.sh           (local Mac)"
  echo "       .cursor/scripts/start-mprocs.sh (Docker / Cursor)"
  echo "       Wrappers set up deps and export DUST_USE_START_MPROCS."
  echo ""
  exit 1
fi

echo "OK"
