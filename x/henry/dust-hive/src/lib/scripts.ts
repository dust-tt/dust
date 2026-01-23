import { mkdir } from "node:fs/promises";
import { DUST_HIVE_SCRIPTS, getServiceLogsTuiPath } from "./paths";
import { ALL_SERVICES } from "./services";

/**
 * Generates the service logs TUI bash script content.
 *
 * This script provides an interactive viewer that cycles through all services
 * with keyboard navigation, restart/stop functionality, and adjustable line count.
 *
 * Usage: service-logs-tui.sh <env-name> [service]
 *
 * Hotkeys:
 *   n/j - next service
 *   p/k - previous service
 *   r   - restart current service
 *   q   - stop current service
 *   c   - clear/refresh
 *   +/- - adjust line count
 *   x   - exit
 */
export function getServiceLogsTuiContent(): string {
  const services = ALL_SERVICES.join(" ");

  // Script header and argument parsing
  const header = `#!/usr/bin/env bash
# Unified service logs viewer - cycle through services with hotkeys
# Usage: service-logs-tui.sh <env-name> [service]

ENV_NAME="$1"
INITIAL_SERVICE="$2"
if [[ -z "$ENV_NAME" ]]; then
  echo "Usage: service-logs-tui.sh <env-name> [service]"
  exit 1
fi

SERVICES=(${services})
NUM_SERVICES=\${#SERVICES[@]}
CURRENT_INDEX=0
TAIL_PID=""
TAIL_LINES=500

# If initial service is specified, find its index
if [[ -n "$INITIAL_SERVICE" ]]; then
  for i in "\${!SERVICES[@]}"; do
    if [[ "\${SERVICES[$i]}" == "$INITIAL_SERVICE" ]]; then
      CURRENT_INDEX=$i
      break
    fi
  done
fi`;

  // Utility functions
  const utilityFunctions = `
get_log_file() {
  local service="$1"
  echo "$HOME/.dust-hive/envs/$ENV_NAME/$service.log"
}

cleanup() {
  # Reset scroll region
  printf "\\033[r"
  if [[ -n "$TAIL_PID" ]] && kill -0 "$TAIL_PID" 2>/dev/null; then
    kill "$TAIL_PID" 2>/dev/null
    wait "$TAIL_PID" 2>/dev/null
  fi
}

# Handle terminal resize - redraw with new dimensions
handle_resize() {
  # Redraw scroll region and footer with new terminal size
  setup_scroll_region
  draw_footer
}

trap cleanup EXIT
trap handle_resize WINCH

# Get terminal dimensions - try multiple methods for reliability
get_term_height() {
  local height
  # Try stty first (most reliable for actual terminal)
  height=$(stty size 2>/dev/null | cut -d' ' -f1)
  if [[ -n "$height" && "$height" -gt 0 ]]; then
    echo "$height"
    return
  fi
  # Try LINES env var (set by bash)
  if [[ -n "$LINES" && "$LINES" -gt 0 ]]; then
    echo "$LINES"
    return
  fi
  # Fall back to tput
  tput lines 2>/dev/null || echo 24
}`;

  // UI rendering functions
  const uiFunctions = `
# Draw sticky footer at bottom of screen
draw_footer() {
  local service="\${SERVICES[$CURRENT_INDEX]}"
  local num=$((CURRENT_INDEX + 1))
  local term_height=$(get_term_height)

  # Save cursor, move to bottom, draw footer, restore cursor
  printf "\\033[s"                    # Save cursor position
  printf "\\033[\${term_height};1H"   # Move to last row, col 1
  printf "\\033[2K"                   # Clear the line
  # Service name: bold + inverse (works across themes)
  printf "\\033[1;7m  %s  \\033[0m" "$service"
  printf "  \\033[2m(%d/%d) [%d lines] n/p=switch +/-=lines r=restart q=stop x=exit\\033[0m" "$num" "$NUM_SERVICES" "$TAIL_LINES"
  printf "\\033[u"                    # Restore cursor position
}

# Set up scroll region (leave bottom line for footer)
setup_scroll_region() {
  local term_height=$(get_term_height)
  local scroll_end=$((term_height - 1))
  printf "\\033[1;\${scroll_end}r"    # Set scroll region from line 1 to bottom-1
  printf "\\033[1;1H"                 # Move cursor to line 1
}

# Reset scroll region to full screen
reset_scroll_region() {
  printf "\\033[r"                    # Reset scroll region
}`;

  // Tail management functions
  const tailFunctions = `
start_tail() {
  local service="\${SERVICES[$CURRENT_INDEX]}"
  local log_file="$(get_log_file "$service")"

  mkdir -p "$(dirname "$log_file")"
  touch "$log_file"

  # Start tail in background with current line count
  tail -n "$TAIL_LINES" -F "$log_file" &
  TAIL_PID=$!
}

stop_tail() {
  if [[ -n "$TAIL_PID" ]] && kill -0 "$TAIL_PID" 2>/dev/null; then
    kill "$TAIL_PID" 2>/dev/null
    wait "$TAIL_PID" 2>/dev/null
  fi
  TAIL_PID=""
}`;

  // Service navigation and control functions
  const serviceFunctions = `
switch_service() {
  stop_tail
  # Reset scroll region, clear screen properly, then set up footer
  printf "\\033[r"                    # Reset scroll region to full screen
  printf "\\033[2J\\033[H"            # Clear screen and move cursor to home
  setup_scroll_region                 # Set scroll region (lines 1 to bottom-1)
  draw_footer                         # Draw footer at last line (outside scroll region)
  printf "\\033[1;1H"                 # Move cursor to line 1 for tail output
  start_tail
}

next_service() {
  CURRENT_INDEX=$(( (CURRENT_INDEX + 1) % NUM_SERVICES ))
  switch_service
}

prev_service() {
  CURRENT_INDEX=$(( (CURRENT_INDEX - 1 + NUM_SERVICES) % NUM_SERVICES ))
  switch_service
}

restart_service() {
  local service="\${SERVICES[$CURRENT_INDEX]}"
  stop_tail
  echo ""
  echo -e "\\033[33m[Restarting $service...]\\033[0m"
  dust-hive restart "$ENV_NAME" "$service"
  echo -e "\\033[32m[$service restarted]\\033[0m"
  sleep 1
  switch_service
}

quit_service() {
  local service="\${SERVICES[$CURRENT_INDEX]}"
  stop_tail
  echo ""
  echo -e "\\033[33m[Stopping $service...]\\033[0m"
  dust-hive stop "$ENV_NAME" "$service"
  sleep 1
  switch_service
}

increase_lines() {
  if [[ $TAIL_LINES -lt 10000 ]]; then
    TAIL_LINES=$((TAIL_LINES + 500))
  fi
  switch_service
}

decrease_lines() {
  if [[ $TAIL_LINES -gt 100 ]]; then
    TAIL_LINES=$((TAIL_LINES - 500))
  fi
  switch_service
}`;

  // Main loop
  const mainLoop = `
# Initial draw - set scroll region to protect footer line
printf "\\033[2J\\033[H"            # Clear screen and move cursor to home
setup_scroll_region                 # Set scroll region (lines 1 to bottom-1)
draw_footer                         # Draw footer at last line (protected)
printf "\\033[1;1H"                 # Move cursor to line 1 for tail output
start_tail

# Main input loop - read single chars
while true; do
  # Read with timeout so we can check if tail died
  if read -r -s -n 1 -t 1 key 2>/dev/null; then
    case "$key" in
      n|N|j) next_service ;;
      p|P|k) prev_service ;;
      r|R) restart_service ;;
      q|Q) quit_service ;;
      x|X) exit 0 ;;
      c|C) switch_service ;;  # clear/refresh
      +|=) increase_lines ;;
      -|_) decrease_lines ;;
    esac
  fi

  # Restart tail if it died
  if [[ -n "$TAIL_PID" ]] && ! kill -0 "$TAIL_PID" 2>/dev/null; then
    start_tail
  fi
done`;

  return [header, utilityFunctions, uiFunctions, tailFunctions, serviceFunctions, mainLoop].join(
    "\n"
  );
}

/**
 * Ensures the service logs TUI script exists at ~/.dust-hive/scripts/service-logs-tui.sh
 * and returns its path.
 */
export async function ensureServiceLogsTui(): Promise<string> {
  await mkdir(DUST_HIVE_SCRIPTS, { recursive: true });
  const scriptPath = getServiceLogsTuiPath();
  await Bun.write(scriptPath, getServiceLogsTuiContent());
  // Make executable
  const proc = Bun.spawn(["chmod", "+x", scriptPath], { stdout: "ignore", stderr: "ignore" });
  await proc.exited;
  return scriptPath;
}
