#!/bin/bash
# Dust Sandbox Profile - Main Entry Point
# Sources all command files for sandbox operations

set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "$SCRIPT_DIR/_truncate.sh"
source "$SCRIPT_DIR/read_file.sh"
source "$SCRIPT_DIR/edit_file.sh"
source "$SCRIPT_DIR/write_file.sh"
source "$SCRIPT_DIR/grep_files.sh"
source "$SCRIPT_DIR/glob.sh"
source "$SCRIPT_DIR/list_dir.sh"
source "$SCRIPT_DIR/shell.sh"
