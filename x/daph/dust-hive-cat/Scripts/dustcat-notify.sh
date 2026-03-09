#!/bin/bash
# DustHiveCat notify script for Claude Code hooks.
# Finds the tmux pane by walking up the process tree, checks if the user
# is already focused, and skips the notification if so.

# Find tmux pane by walking up process tree and matching pane PID
find_tmux_pane() {
    local pid=$$

    # Get all tmux pane PIDs into an associative array (pane_pid -> pane_id)
    declare -A pane_map
    while read -r pane_id pane_pid; do
        pane_map["$pane_pid"]="$pane_id"
    done < <(tmux list-panes -a -F '#{session_name}:#{window_index}.#{pane_index} #{pane_pid}' 2>/dev/null)

    # Walk up process tree, checking if any ancestor IS a tmux pane's shell
    while [ "$pid" != "1" ] && [ -n "$pid" ]; do
        if [ -n "${pane_map[$pid]}" ]; then
            echo "${pane_map[$pid]}"
            return 0
        fi
        pid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
    done
    return 1
}

# Check if tmux server is running
if tmux list-sessions &>/dev/null; then
    TARGET=$(find_tmux_pane)
    if [ -n "$TARGET" ]; then
        # Check if this pane's window is the active one in its session
        ACTIVE_WINDOW=$(tmux display-message -t "${TARGET}" -p '#{window_active}' 2>/dev/null)
        ACTIVE_PANE=$(tmux display-message -t "${TARGET}" -p '#{pane_active}' 2>/dev/null)

        # Read configured terminal app from preferences
        TERMINAL_APP=$(defaults read com.dust.dusthivecat terminalApp 2>/dev/null || echo "Alacritty")
        TERMINAL_LOWER=$(echo "$TERMINAL_APP" | tr '[:upper:]' '[:lower:]')

        # Check if the configured terminal is the frontmost app
        FRONTMOST=$(osascript -e 'tell application "System Events" to get name of first process whose frontmost is true' 2>/dev/null)
        FRONTMOST_LOWER=$(echo "$FRONTMOST" | tr '[:upper:]' '[:lower:]')

        # If pane is active AND terminal is focused, user is already looking — skip
        if [ "$ACTIVE_WINDOW" = "1" ] && [ "$ACTIVE_PANE" = "1" ] && [ "$FRONTMOST_LOWER" = "$TERMINAL_LOWER" ]; then
            exit 0
        fi
    else
        TARGET="default"
    fi
else
    TARGET="default"
fi

# URL encode the target (basic)
TARGET_ENCODED=$(echo "$TARGET" | sed 's/:/%3A/g; s/\./%2E/g')

# Only notify if DustHiveCat is already running (don't relaunch after quit)
if pgrep -x DustHiveCat > /dev/null 2>&1; then
    open -g "dustcat://notify?target=${TARGET_ENCODED}"
fi
