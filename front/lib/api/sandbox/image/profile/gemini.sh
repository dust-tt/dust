#!/bin/bash
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

read_file()   { python3 "$DUST_TOOLS" --profile gemini read_file "$@"; }
write_file()  { python3 "$DUST_TOOLS" --profile gemini write_file "$@"; }
edit_file()   { python3 "$DUST_TOOLS" --profile gemini edit_file "$@"; }
grep_files()  { python3 "$DUST_TOOLS" --profile gemini grep_files "$@"; }
glob()        { python3 "$DUST_TOOLS" --profile gemini glob "$@"; }
list_dir()    { python3 "$DUST_TOOLS" --profile gemini list_dir "$@"; }
export -f read_file write_file edit_file grep_files glob list_dir
