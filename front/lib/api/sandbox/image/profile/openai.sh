#!/bin/bash
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

read_file()   { python3 "$DUST_TOOLS" --profile openai read_file "$@"; }
write_file()  { python3 "$DUST_TOOLS" --profile openai write_file "$@"; }
edit_file()   { python3 "$DUST_TOOLS" --profile openai edit_file "$@"; }
grep_files()  { python3 "$DUST_TOOLS" --profile openai grep_files "$@"; }
glob()        { python3 "$DUST_TOOLS" --profile openai glob "$@"; }
list_dir()    { python3 "$DUST_TOOLS" --profile openai list_dir "$@"; }
export -f read_file write_file edit_file grep_files glob list_dir
