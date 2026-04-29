#!/bin/bash
# Sourced by common.sh when DUST_PROFILE=anthropic.
# Dev override: DUST_TOOLS_CMD="bun run $SCRIPT_DIR/src/index.ts"

read_file()   { run_dust_tool --profile anthropic read_file "$@"; }
write_file()  { run_dust_tool --profile anthropic write_file "$@"; }
edit_file()   { run_dust_tool --profile anthropic edit_file "$@"; }
grep_files()  { run_dust_tool --profile anthropic grep_files "$@"; }
glob()        { run_dust_tool --profile anthropic glob "$@"; }
list_dir()    { run_dust_tool --profile anthropic list_dir "$@"; }
export -f read_file write_file edit_file grep_files glob list_dir
