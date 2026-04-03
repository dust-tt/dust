#!/bin/bash
# Dust Sandbox Profile - Shared Infrastructure
# Sourced by each provider profile (anthropic.sh, openai.sh, gemini.sh).

set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export DUST_TOOLS="$SCRIPT_DIR/_dust_tools.py"

source "$SCRIPT_DIR/_truncate.sh"
source "$SCRIPT_DIR/shell.sh"

ls() {
  command ls -al "$@"
}
export -f ls
