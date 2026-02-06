#!/bin/bash
# DustHiveCat notify script for OpenAI Codex CLI
# Called by Codex's `notify` config on agent-turn-complete.
#
# Problem: Codex fires agent-turn-complete on EVERY turn, including
# intermediate ones (e.g. creating a todo list). We only want to
# notify when Codex actually goes idle.
#
# Solution: Debounce. Write a timestamp to a temp file, wait 3 seconds,
# then check if we're still the latest invocation. If yes, Codex went
# idle — fire the notification. If not, a newer turn came in — skip.
#
# Usage in ~/.codex/config.toml:
#   notify = ["bash", "/path/to/codex-notify.sh"]

DEBOUNCE_FILE="/tmp/dustcat-codex-notify-$$-debounce"
# Use parent PID (the codex process) so all invocations from the same
# session share the same debounce file.
DEBOUNCE_FILE="/tmp/dustcat-codex-notify-${PPID}"

# Write current timestamp as our "claim"
STAMP=$(date +%s%N)
echo "$STAMP" > "$DEBOUNCE_FILE"

# Wait 3 seconds — if Codex starts another turn, a new invocation
# will overwrite the file with a newer stamp.
sleep 3

# Check if we're still the latest
CURRENT=$(cat "$DEBOUNCE_FILE" 2>/dev/null)
if [ "$CURRENT" != "$STAMP" ]; then
    exit 0  # A newer turn came in — Codex is still working
fi

# We're the latest — Codex has been idle for 3 seconds. Notify!
if [ -n "$TMUX" ]; then
    TARGET=$(tmux display-message -p '#S:#I.#P')
else
    TARGET='default'
fi

TARGET_ENCODED=$(echo "$TARGET" | sed 's/:/%3A/g; s/\./%2E/g')
open "dustcat://notify?target=${TARGET_ENCODED}&title=Codex+ready"
