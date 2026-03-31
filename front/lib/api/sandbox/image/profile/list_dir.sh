#!/bin/bash
# List directory contents
# Usage: list_dir [path] [depth]

list_dir() {
  if [[ "$1" == "--help" ]] || [[ "$1" == "-h" ]]; then
    cat <<'EOF'
list_dir - List directory contents

Usage: list_dir [path] [depth]

Arguments:
  path   Directory to list, default: . (optional)
  depth  Max depth to recurse, default: 2, max: 5 (optional)

Output: File and directory paths, one per line. Limited to 200 entries.

Examples:
  list_dir                    # List current dir, depth 2
  list_dir /home/agent        # List specific directory
  list_dir . 1                # List current dir, no recursion
  list_dir src/ 3             # List src/ with depth 3
EOF
    return 0
  fi

  local path="${1:-.}"
  local depth="${2:-2}"

  # Cap depth at 5
  if [[ "$depth" -gt 5 ]]; then
    depth=5
  fi

  if [[ ! -d "$path" ]]; then
    echo "Error: directory not found: $path" >&2
    return 1
  fi

  find "$path" -maxdepth "$depth" -type f -o -type d 2>/dev/null | head -n 200
}
export -f list_dir
