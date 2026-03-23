#!/bin/bash
# Write content to a file (creates parent directories)
# Usage: write_file <path> <content>

write_file() {
  if [[ "$1" == "--help" ]] || [[ "$1" == "-h" ]]; then
    cat <<'EOF'
write_file - Write content to file (creates parent directories)

Usage: write_file <path> <content>

Arguments:
  path     File path to write to (required)
  content  Content to write (can be empty)

Output: "Wrote <path>" on success

Examples:
  write_file file.txt "Hello, world!"     # Write to file
  write_file nested/dir/file.txt "data"   # Creates parent dirs
  write_file config.json '{"key": "val"}' # Write JSON
EOF
    return 0
  fi

  local path="$1"
  local content="$2"

  if [[ -z "$path" ]]; then
    echo "Error: path is required" >&2
    echo "Usage: write_file <path> <content>" >&2
    echo "Run 'write_file --help' for more information." >&2
    return 1
  fi

  local dir
  dir=$(dirname "$path")
  if [[ ! -d "$dir" ]]; then
    mkdir -p "$dir"
  fi

  printf '%s' "$content" > "$path"
  echo "Wrote $path"
}
export -f write_file
