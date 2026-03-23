#!/bin/bash
# Internal helpers: truncate output (keeps tail)

_dust_truncate() {
  local max_lines="${1:-500}"
  local input
  input=$(cat)
  local line_count
  line_count=$(echo "$input" | wc -l)

  if [[ $line_count -gt $max_lines ]]; then
    local skipped=$((line_count - max_lines))
    echo "[... $skipped lines truncated ...]"
    echo "$input" | tail -n "$max_lines"
  else
    echo "$input"
  fi
}
export -f _dust_truncate

_dust_truncate_chars() {
  local max_chars=50000
  local input
  input=$(cat)
  local char_count=${#input}

  if [[ $char_count -gt $max_chars ]]; then
    local output_file="/tmp/shell_output_$(date +%s%N).txt"
    echo "$input" > "$output_file"
    echo "[Output too long ($char_count chars). Showing last $max_chars chars only. Full output: $output_file]"
    echo "[BEGIN TAIL]"
    echo "${input: -$max_chars}"
    echo "[END TAIL]"
  else
    echo "$input"
  fi
}
export -f _dust_truncate_chars
