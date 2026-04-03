#!/bin/bash
# Find files matching a glob pattern
# Usage: glob <pattern> [path]

glob() {
  if [[ "$1" == "--help" ]] || [[ "$1" == "-h" ]]; then
    cat <<'EOF'
glob - Find files by glob pattern

Usage: glob <pattern> [path]

Arguments:
  pattern  Glob pattern, e.g., "*.py", "**/*.ts" (required)
  path     Directory to search, default: . (optional)

Output: File paths, one per line. Truncated to 200 results.

Examples:
  glob "*.txt"                # Find .txt files in current dir
  glob "**/*.py"              # Find all Python files recursively
  glob "*.{js,ts}" src/       # Find JS/TS files in src/
  glob "test_*.py" tests/     # Find test files in tests/
EOF
    return 0
  fi

  local pattern="$1"
  local search_path="${2:-.}"

  if [[ -z "$pattern" ]]; then
    echo "Error: pattern is required" >&2
    echo "Usage: glob <pattern> [path]" >&2
    echo "Run 'glob --help' for more information." >&2
    return 1
  fi

  # fdfind on Debian/Ubuntu, fd on macOS/other systems
  local fd_cmd
  if command -v fdfind &>/dev/null; then
    fd_cmd="fdfind"
  elif command -v fd &>/dev/null; then
    fd_cmd="fd"
  else
    echo "Error: fd-find not installed" >&2
    return 1
  fi

  $fd_cmd --glob "$pattern" "$search_path" 2>/dev/null | _dust_truncate 200
}
export -f glob
