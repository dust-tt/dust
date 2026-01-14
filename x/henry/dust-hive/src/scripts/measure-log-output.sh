#!/usr/bin/env bash
# Measure log output rate to identify high-volume services
# Run this to find services that might be overwhelming Zellij
# Usage: ./measure-log-output.sh [env_name]

ENV_NAME="${1:-}"
ENVS_DIR="$HOME/.dust-hive/envs"

if [ -n "$ENV_NAME" ]; then
    LOG_DIR="$ENVS_DIR/$ENV_NAME"
    if [ ! -d "$LOG_DIR" ]; then
        echo "Environment '$ENV_NAME' not found"
        exit 1
    fi
    LOG_DIRS=("$LOG_DIR")
else
    LOG_DIRS=("$ENVS_DIR"/*)
fi

echo "Measuring log output rate (10 second sample)..."
echo "---"

# Get initial sizes
declare -A INITIAL_SIZES
for dir in "${LOG_DIRS[@]}"; do
    [ -d "$dir" ] || continue
    for log in "$dir"/*.log; do
        [ -f "$log" ] || continue
        INITIAL_SIZES["$log"]=$(stat --format="%s" "$log" 2>/dev/null || stat -f "%z" "$log" 2>/dev/null || echo 0)
    done
done

# Also check temporal log
TEMPORAL_LOG="$HOME/.dust-hive/temporal.log"
if [ -f "$TEMPORAL_LOG" ]; then
    INITIAL_SIZES["$TEMPORAL_LOG"]=$(stat --format="%s" "$TEMPORAL_LOG" 2>/dev/null || stat -f "%z" "$TEMPORAL_LOG" 2>/dev/null || echo 0)
fi

sleep 10

# Calculate rates
echo ""
printf "%-40s %15s %15s\n" "Log File" "KB/sec" "Lines/sec (est)"
echo "---"

HIGH_RATE_FOUND=false
for log in "${!INITIAL_SIZES[@]}"; do
    [ -f "$log" ] || continue
    INITIAL=${INITIAL_SIZES["$log"]}
    FINAL=$(stat --format="%s" "$log" 2>/dev/null || stat -f "%z" "$log" 2>/dev/null || echo 0)

    BYTES_DIFF=$((FINAL - INITIAL))
    BYTES_PER_SEC=$((BYTES_DIFF / 10))
    KB_PER_SEC=$(echo "scale=2; $BYTES_PER_SEC / 1024" | bc 2>/dev/null || echo "0")

    # Estimate lines (assuming ~100 bytes per line)
    LINES_PER_SEC=$((BYTES_PER_SEC / 100))

    # Only show if there's activity
    if [ "$BYTES_DIFF" -gt 0 ]; then
        # Get short name
        SHORT_NAME=$(basename "$(dirname "$log")")/$(basename "$log")
        printf "%-40s %12s KB %12s\n" "$SHORT_NAME" "$KB_PER_SEC" "$LINES_PER_SEC"

        if [ "$BYTES_PER_SEC" -gt 50000 ]; then  # > 50KB/s
            HIGH_RATE_FOUND=true
        fi
    fi
done

echo "---"
echo ""

if [ "$HIGH_RATE_FOUND" = true ]; then
    echo "⚠️  HIGH OUTPUT DETECTED (>50 KB/s)"
    echo ""
    echo "High log output can cause input lag because:"
    echo "  1. tail -F reads data continuously"
    echo "  2. Zellij must render each line"
    echo "  3. Terminal emulator must display updates"
    echo ""
    echo "Potential fixes:"
    echo "  - Reduce log verbosity in the noisy service"
    echo "  - Restart the service: dust-hive restart <env> <service>"
    echo "  - Truncate the log: echo '' > <logfile>"
    echo "  - Use 'dust-hive cool <env>' to stop services when not needed"
else
    echo "Log output rate is within normal range."
    echo "Input lag is likely caused by something else (memory, process accumulation, etc.)"
fi
