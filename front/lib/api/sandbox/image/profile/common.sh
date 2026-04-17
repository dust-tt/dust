#!/bin/bash
# Dust Sandbox Profile - Shared Infrastructure
# Sourced by each provider profile (anthropic.sh, openai.sh, gemini.sh).

set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export SCRIPT_DIR
DUST_TOOLS_CMD="${DUST_TOOLS_CMD:-$SCRIPT_DIR/dust-tools}"
export DUST_TOOLS_CMD

source "$SCRIPT_DIR/_truncate.sh"
source "$SCRIPT_DIR/shell.sh"

run_dust_tool() {
  # shellcheck disable=SC2206
  local dust_tools_cmd=( $DUST_TOOLS_CMD )
  "${dust_tools_cmd[@]}" "$@"
}
export -f run_dust_tool

ls() {
  command ls -al "$@"
}
export -f ls
