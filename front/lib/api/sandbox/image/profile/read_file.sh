#!/bin/bash
# Read a file with line numbers
# Usage: read_file <path> [start_line] [end_line]

read_file() {
  if [[ "$1" == "--help" ]] || [[ "$1" == "-h" ]]; then
    cat <<'EOF'
read_file - Read file with line numbers

Usage: read_file <path> [start_line] [end_line]

Arguments:
  path        File to read (required)
  start_line  First line to read, 1-indexed, default: 1 (optional)
  end_line    Last line to read, default: EOF (optional)

Output: Numbered lines in format: '  N\tcontent'

Examples:
  read_file file.txt              # Read entire file
  read_file file.txt 10           # Read from line 10 to EOF
  read_file file.txt 10 20        # Read lines 10-20
  read_file /etc/hosts 1 5        # Read first 5 lines
EOF
    return 0
  fi

  local path="$1"
  local start="${2:-1}"
  local end="$3"

  if [[ -z "$path" ]]; then
    echo "Error: path is required" >&2
    echo "Usage: read_file <path> [start_line] [end_line]" >&2
    echo "Run 'read_file --help' for more information." >&2
    return 1
  fi

  if [[ ! -f "$path" ]]; then
    echo "Error: file not found: $path" >&2
    return 1
  fi

  if [[ -n "$end" ]]; then
    sed -n "${start},${end}p" "$path" | nl -ba -v "$start"
  else
    tail -n "+${start}" "$path" | nl -ba -v "$start"
  fi
}
export -f read_file
