#!/bin/sh

drain_duration_seconds="${PRESTOP_DRAIN_DURATION_SECONDS:-120}"
case "$drain_duration_seconds" in
  ''|*[!0-9]*|0)
    drain_duration_seconds=120
    ;;
esac

start_seconds=$(date +%s)

# If the API call fails, sleep for the remainder so the hook still observes
# the configured minimum drain duration.
if ! curl \
  --fail \
  --silent \
  --show-error \
  --max-time "$drain_duration_seconds" \
  -X POST \
  "http://$(hostname -i):3000/api/$PRESTOP_SECRET/prestop"; then
  elapsed_seconds=$(($(date +%s) - start_seconds))
  remaining_seconds=$((drain_duration_seconds - elapsed_seconds))

  if [ "$remaining_seconds" -gt 0 ]; then
    sleep "$remaining_seconds"
  fi
fi
