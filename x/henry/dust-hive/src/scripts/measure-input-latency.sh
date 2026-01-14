#!/usr/bin/env bash
# Measure keyboard input latency
# Run this inside a Zellij pane to test responsiveness
# Usage: ./measure-input-latency.sh

echo "=== Input Latency Test ==="
echo ""
echo "This test measures how long it takes for keystrokes to register."
echo "Press ENTER 5 times. The time between press and echo is measured."
echo ""
echo "Tips:"
echo "  - If latency > 100ms, there's noticeable lag"
echo "  - If latency > 500ms, the session is severely impacted"
echo "  - Compare results in a fresh session vs a long-running one"
echo ""
echo "Press ENTER when ready to start..."
read -r

echo ""
echo "Press ENTER 5 times (quickly or slowly, your choice):"
echo "---"

TOTAL_LATENCY=0

for i in {1..5}; do
    START=$(date +%s%N)
    read -r
    END=$(date +%s%N)

    # Calculate latency in milliseconds
    LATENCY_NS=$((END - START))
    LATENCY_MS=$((LATENCY_NS / 1000000))

    echo "Test $i: ${LATENCY_MS}ms"
    TOTAL_LATENCY=$((TOTAL_LATENCY + LATENCY_MS))
done

AVG_LATENCY=$((TOTAL_LATENCY / 5))

echo "---"
echo ""
echo "Average latency: ${AVG_LATENCY}ms"
echo ""

if [ "$AVG_LATENCY" -lt 50 ]; then
    echo "✓ Input latency is excellent (<50ms)"
elif [ "$AVG_LATENCY" -lt 100 ]; then
    echo "✓ Input latency is good (50-100ms)"
elif [ "$AVG_LATENCY" -lt 200 ]; then
    echo "⚠️  Input latency is noticeable (100-200ms)"
    echo "   Consider: dust-hive reload <env>"
elif [ "$AVG_LATENCY" -lt 500 ]; then
    echo "⚠️  Input latency is poor (200-500ms)"
    echo "   Recommended: dust-hive reload <env>"
else
    echo "⚠️  Input latency is severe (>500ms)"
    echo "   Urgent: dust-hive reload <env>"
fi

echo ""
echo "Note: This measures read() latency, not actual display latency."
echo "True input lag includes terminal rendering time."
