#!/usr/bin/env bash
# Single entry for laptop docker-run and non-Cursor agents:
#   secrets materialize → infra → seed → mprocs
#
# Usage:
#   bash dev/scripts/up.sh              # full stack (assumes install already ran)
#   bash dev/scripts/up.sh --install    # run install.sh first if needed
#   bash dev/scripts/up.sh --infra-only # stop after infra (no mprocs)
#   bash dev/scripts/up.sh --apps-only  # wait for infra, then seed + mprocs
set -euo pipefail

DUST_DEV_SCRIPT_NAME=up
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

DO_INSTALL=0
INFRA_ONLY=0
APPS_ONLY=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --install) DO_INSTALL=1; shift ;;
    --infra-only) INFRA_ONLY=1; shift ;;
    --apps-only) APPS_ONLY=1; shift ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [ "$APPS_ONLY" = 1 ] && [ "$INFRA_ONLY" = 1 ]; then
  echo "Use only one of --apps-only / --infra-only" >&2
  exit 1
fi

if [ "$DO_INSTALL" = 1 ] || [ ! -f "${SCRIPT_DIR}/../../node_modules/@dust-tt/client/package.json" ]; then
  bash "${SCRIPT_DIR}/install.sh"
fi

if [ "$APPS_ONLY" = 1 ]; then
  exec bash "${SCRIPT_DIR}/apps.sh"
fi

bash "${SCRIPT_DIR}/infra.sh"

if [ "$INFRA_ONLY" = 1 ]; then
  exit 0
fi

exec bash "${SCRIPT_DIR}/apps.sh"
