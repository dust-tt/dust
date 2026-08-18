#!/usr/bin/env bash
# Runs the acceptance script that ships with the sandbox against a local mount.
set -uo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

harness_start
echo "mounted at $MOUNTPOINT against the stand-in Front on port $FRONT_PORT"

MOUNTPOINT="$MOUNTPOINT" bash "$ACCEPTANCE_SCRIPT"
