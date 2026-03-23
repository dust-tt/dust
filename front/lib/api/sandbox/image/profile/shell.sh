#!/bin/bash
# Execute a shell command with timeout
# Usage: shell <command> [timeout_sec]

shell() {
  if [[ "$1" == "--help" ]] || [[ "$1" == "-h" ]]; then
    cat <<'EOF'
shell - Execute shell command with timeout

Usage: shell <command> [timeout_sec]

Arguments:
  command      Shell command to execute (required)
  timeout_sec  Timeout in seconds, default: 60 (optional)

Output: stdout truncated to 50000 chars; stderr preserved separately.
        When truncated, full output is saved to /tmp/shell_output_<timestamp>.txt

Examples:
  shell "ls -la"                    # Simple command
  shell "python script.py" 120     # Run with 2 minute timeout
EOF
    return 0
  fi

  local cmd="$1"
  local timeout_sec="${2:-60}"

  if [[ -z "$cmd" ]]; then
    echo "Error: command is required" >&2
    echo "Usage: shell <command> [timeout_sec]" >&2
    echo "Run 'shell --help' for more information." >&2
    return 1
  fi

  local exit_code
  # Use timeout if available (Linux), otherwise run without timeout (macOS dev)
  if command -v timeout &>/dev/null; then
    timeout "${timeout_sec}s" bash -c "$cmd" | _dust_truncate_chars
    exit_code=${PIPESTATUS[0]}
    if [[ $exit_code -eq 124 ]]; then
      echo "[Command timed out after ${timeout_sec}s]" >&2
    fi
  else
    bash -c "$cmd" | _dust_truncate_chars
    exit_code=${PIPESTATUS[0]}
  fi

  return $exit_code
}
export -f shell
