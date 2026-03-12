#!/bin/bash
# Search files for pattern using ripgrep
# Usage: grep_files <pattern> [glob] [path] [max_results] [context_lines]

grep_files() {
  if [[ "$1" == "--help" ]] || [[ "$1" == "-h" ]]; then
    cat <<'EOF'
grep_files - Search files for regex pattern using ripgrep

Usage: grep_files <pattern> [glob] [path] [max_results] [context_lines]

Arguments:
  pattern        Regex pattern to search for (required)
  glob           File glob filter, e.g., "*.py" (optional)
  path           Directory to search, default: . (optional)
  max_results    Max lines to return, default: 200 (optional)
  context_lines  Lines before/after each match, default: 0 (optional)

Output: file:line:content format, one match per line

Examples:
  grep_files "TODO"                      # Search all files for TODO
  grep_files "import" "*.py"             # Search Python files for imports
  grep_files "error" "*.log" /var/log    # Search log files in /var/log
  grep_files "func" "" "." 100 3         # Show 3 lines context, max 100 results
EOF
    return 0
  fi

  local pattern="$1"
  local file_glob="$2"
  local search_path="${3:-.}"
  local max_results="${4:-200}"
  local context_lines="${5:-0}"

  if [[ -z "$pattern" ]]; then
    echo "Error: pattern is required" >&2
    echo "Usage: grep_files <pattern> [glob] [path] [max_results] [context_lines]" >&2
    echo "Run 'grep_files --help' for more information." >&2
    return 1
  fi

  local args=(-n --color=never)
  if [[ -n "$file_glob" ]]; then
    args+=(--glob "$file_glob")
  fi
  if [[ "$context_lines" -gt 0 ]]; then
    args+=(-C "$context_lines")
  fi

  rg "${args[@]}" "$pattern" "$search_path" 2>/dev/null | _dust_truncate "$max_results"
}
export -f grep_files
