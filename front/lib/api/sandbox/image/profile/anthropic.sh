#!/bin/bash
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

read_file()   { python3 "$DUST_TOOLS" --profile anthropic read_file "$@"; }
write_file()  { python3 "$DUST_TOOLS" --profile anthropic write_file "$@"; }
edit_file()   { python3 "$DUST_TOOLS" --profile anthropic edit_file "$@"; }
grep_files()  { python3 "$DUST_TOOLS" --profile anthropic grep_files "$@"; }
glob()        { python3 "$DUST_TOOLS" --profile anthropic glob "$@"; }
list_dir()    { python3 "$DUST_TOOLS" --profile anthropic list_dir "$@"; }
export -f read_file write_file edit_file grep_files glob list_dir
