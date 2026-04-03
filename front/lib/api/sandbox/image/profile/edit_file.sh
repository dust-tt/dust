#!/bin/bash
# Thin wrapper: delegates to Python implementation

export EDIT_FILE_CORE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_edit_file_core.py"

edit_file() {
  python3 "$EDIT_FILE_CORE" "$@"
}
export -f edit_file
