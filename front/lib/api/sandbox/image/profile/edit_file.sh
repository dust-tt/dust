#!/bin/bash
# Edit files by replacing exact text
# Usage: edit_file <old_text> <new_text> <path1> [path2]...
# Errors per file if old_text matches 0 or 2+ times

edit_file() {
  if [[ "$1" == "--help" ]] || [[ "$1" == "-h" ]]; then
    cat <<'EOF'
edit_file - Replace exact text in files

Usage: edit_file <old_text> <new_text> <path1> [path2]...

Arguments:
  old_text    Text to find and replace (required)
  new_text    Replacement text (can be empty)
  path1...    One or more files to edit (required)

Output: "Edited <path>" for each successful edit

Errors: Fails per-file if old_text not found or matches multiple times

Examples:
  edit_file "hello" "world" file.txt           # Replace in one file
  edit_file "foo" "bar" a.txt b.txt c.txt      # Replace in multiple files
  edit_file "old" "new" src/*.py               # Replace in all Python files
  edit_file "debug" "" config.js               # Remove text
EOF
    return 0
  fi

  local old_text="$1"
  local new_text="$2"
  shift 2
  local paths=("$@")

  if [[ -z "$old_text" ]] || [[ ${#paths[@]} -eq 0 ]]; then
    echo "Error: old_text and at least one path are required" >&2
    echo "Usage: edit_file <old_text> <new_text> <path1> [path2]..." >&2
    echo "Run 'edit_file --help' for more information." >&2
    return 1
  fi

  local failed=0
  for path in "${paths[@]}"; do
    if [[ ! -f "$path" ]]; then
      echo "Error: file not found: $path" >&2
      failed=1
      continue
    fi

    # Count occurrences using grep -F for literal matching
    local count
    count=$(grep -Fc "$old_text" "$path" 2>/dev/null)
    count=${count:-0}

    if [[ "$count" -eq 0 ]]; then
      echo "Error: old_text not found in $path" >&2
      failed=1
      continue
    fi

    if [[ "$count" -gt 1 ]]; then
      echo "Error: old_text matches $count times in $path, must be unique" >&2
      failed=1
      continue
    fi

    # Use sd for replacement (handles special characters well)
    sd --fixed-strings "$old_text" "$new_text" "$path"
    echo "Edited $path"
  done

  return $failed
}
export -f edit_file
