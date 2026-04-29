#!/bin/bash
# Sourced by common.sh when DUST_PROFILE=gemini.
# Dev override: DUST_TOOLS_CMD="bun run $SCRIPT_DIR/src/index.ts"

read_file()   { run_dust_tool --profile gemini read_file "$@"; }
write_file()  { run_dust_tool --profile gemini write_file "$@"; }
edit_file()   { run_dust_tool --profile gemini edit_file "$@"; }
grep_files()  { run_dust_tool --profile gemini grep_files "$@"; }
glob()        { run_dust_tool --profile gemini glob "$@"; }
list_dir()    { run_dust_tool --profile gemini list_dir "$@"; }
export -f read_file write_file edit_file grep_files glob list_dir
