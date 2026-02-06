#!/bin/bash
if [ -n "$TMUX" ]; then
  TARGET=$(tmux display-message -p '#S:#I.#P')
else
  TARGET='default'
fi
TARGET_ENCODED=$(echo "$TARGET" | sed 's/:/%3A/g; s/\./%2E/g')
open "dustcat://notify?target=${TARGET_ENCODED}"
