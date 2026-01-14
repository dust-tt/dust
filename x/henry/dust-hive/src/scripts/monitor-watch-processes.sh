#!/usr/bin/env bash
# Monitor watch-logs.sh processes over time to detect accumulation
# Run this in a separate terminal while using dust-hive
# Usage: ./monitor-watch-processes.sh [interval_seconds] [count]

INTERVAL="${1:-10}"
COUNT="${2:-60}"  # Default: 10 minutes at 10s intervals

echo "Monitoring watch-logs.sh and tail processes..."
echo "Interval: ${INTERVAL}s, Count: ${COUNT} samples"
echo "---"
printf "%-25s %10s %10s %10s %10s %10s\n" "Timestamp" "Watch" "Tail" "Bash" "Zellij_RSS" "Total_PTY"
echo "---"

for ((i=1; i<=COUNT; i++)); do
    TS=$(date +%H:%M:%S)

    # Count watch-logs.sh processes
    WATCH_COUNT=$(pgrep -cf "watch-logs.sh" 2>/dev/null || echo 0)

    # Count tail -F processes
    TAIL_COUNT=$(pgrep -cf "tail.*-F" 2>/dev/null || echo 0)

    # Count all bash processes (to detect accumulation)
    BASH_COUNT=$(pgrep -c "bash" 2>/dev/null || echo 0)

    # Get Zellij RSS memory (in KB)
    ZELLIJ_PID=$(pgrep -f "^zellij" 2>/dev/null | head -1)
    if [ -n "$ZELLIJ_PID" ]; then
        ZELLIJ_RSS=$(ps -p "$ZELLIJ_PID" -o rss= 2>/dev/null || echo 0)
        ZELLIJ_RSS_MB=$((ZELLIJ_RSS / 1024))
    else
        ZELLIJ_RSS_MB="N/A"
    fi

    # Count PTYs
    PTY_COUNT=$(ls /dev/pts/ 2>/dev/null | wc -l || echo 0)

    printf "%-25s %10s %10s %10s %8sMB %10s\n" "$TS" "$WATCH_COUNT" "$TAIL_COUNT" "$BASH_COUNT" "$ZELLIJ_RSS_MB" "$PTY_COUNT"

    sleep "$INTERVAL"
done

echo "---"
echo "If Watch/Tail/Bash counts increase over time = process accumulation"
echo "If Zellij_RSS increases over time = memory accumulation"
echo "If PTY count increases = PTY leak"
