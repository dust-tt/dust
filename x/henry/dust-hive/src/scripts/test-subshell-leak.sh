#!/usr/bin/env bash
# Test if watch-logs.sh subshells accumulate when Ctrl+C is pressed
# This simulates what happens in the watch-logs.sh script
# Usage: ./test-subshell-leak.sh

echo "Testing subshell accumulation pattern used in watch-logs.sh..."
echo ""

# The pattern from watch-logs.sh:
# (trap - SIGINT; exec tail -n 500 -F "$LOG_FILE") || true
#
# Issue: If SIGINT doesn't cleanly kill tail, subshells might accumulate

LOG_FILE="/tmp/test-subshell-leak-$$.log"
touch "$LOG_FILE"

echo "Test log file: $LOG_FILE"
echo "Initial process count: $(pgrep -c "tail.*$LOG_FILE" 2>/dev/null || echo 0)"
echo ""

# Simulate the watch-logs pattern multiple times
echo "Simulating 10 iterations of the watch-logs pattern..."

for i in {1..10}; do
    # Start subshell with tail
    (trap - SIGINT; exec tail -n 500 -F "$LOG_FILE") &
    PID=$!
    sleep 0.2

    # Kill it (simulating Ctrl+C)
    kill -INT "$PID" 2>/dev/null || true
    sleep 0.1

    # Count remaining tail processes for this file
    TAIL_COUNT=$(pgrep -cf "tail.*$LOG_FILE" 2>/dev/null || echo 0)
    echo "Iteration $i: $TAIL_COUNT tail processes for test file"
done

echo ""
echo "Final process count: $(pgrep -c "tail.*$LOG_FILE" 2>/dev/null || echo 0)"
echo ""

# Cleanup
rm -f "$LOG_FILE"

# Check for orphaned tail processes system-wide
echo "System-wide tail -F processes: $(pgrep -c "tail.*-F" 2>/dev/null || echo 0)"
echo ""

# Analysis
SYSTEM_TAIL=$(pgrep -c "tail.*-F" 2>/dev/null || echo 0)
EXPECTED_TAIL=6  # 6 service tabs in a typical dust-hive env

if [ "$SYSTEM_TAIL" -gt "$((EXPECTED_TAIL * 3))" ]; then
    echo "⚠️  Many tail processes detected ($SYSTEM_TAIL)"
    echo "   Expected ~$EXPECTED_TAIL per environment"
    echo "   This suggests process accumulation"
else
    echo "✓ Tail process count looks normal ($SYSTEM_TAIL)"
fi
