#!/bin/bash
# Dust Sandbox Profile - Shared Infrastructure
# Entry point sourced by the host wrapper. Sources the provider-specific
# profile (anthropic.sh, openai.sh, gemini.sh) when DUST_PROFILE is set
# and the matching file exists. Older images that ship only this file
# define the tool functions inline and ignore DUST_PROFILE.

set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export SCRIPT_DIR
DUST_TOOLS_CMD="${DUST_TOOLS_CMD:-$SCRIPT_DIR/dust-tools}"
export DUST_TOOLS_CMD

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

if [ -n "${DUST_PROFILE:-}" ] && [ -f "$SCRIPT_DIR/${DUST_PROFILE}.sh" ]; then
  source "$SCRIPT_DIR/${DUST_PROFILE}.sh"
fi
