#!/usr/bin/env bash
# Guard: mprocs must be launched via a start wrapper (prep + DUST_USE_START_MPROCS).
set -euo pipefail

if [ -z "${DUST_USE_START_MPROCS:-}" ]; then
  echo ""
  echo "ERROR: Run a start-mprocs wrapper instead of invoking mprocs directly:"
  echo "       tools/start-mprocs.sh      (local Mac + Docker Compose)"
  echo "       bash dev/scripts/apps.sh   (shared container / cloud agents)"
  echo "       bash dev/scripts/up.sh     (install + infra + apps)"
  echo "       Wrappers set up deps and export DUST_USE_START_MPROCS."
  echo ""
  exit 1
fi

echo "OK"
