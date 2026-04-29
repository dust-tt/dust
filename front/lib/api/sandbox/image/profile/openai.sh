#!/bin/bash
# Sourced by common.sh when DUST_PROFILE=openai.
# Dev override: DUST_TOOLS_CMD="bun run $SCRIPT_DIR/src/index.ts"

read_file()   { run_dust_tool --profile openai read_file "$@"; }
write_file()  { run_dust_tool --profile openai write_file "$@"; }
grep_files()  { run_dust_tool --profile openai grep_files "$@"; }
glob()        { run_dust_tool --profile openai glob "$@"; }
list_dir()    { run_dust_tool --profile openai list_dir "$@"; }
export -f read_file write_file grep_files glob list_dir
