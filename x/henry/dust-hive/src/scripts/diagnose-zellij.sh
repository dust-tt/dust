#!/usr/bin/env bash
# Diagnose Zellij input lag issues
# Run this when a session becomes laggy to capture diagnostic info

set -e

echo "=========================================="
echo "Zellij Session Diagnostics"
echo "=========================================="
echo "Timestamp: $(date -Iseconds)"
echo ""

# Check Zellij version
echo "=== Zellij Version ==="
zellij --version 2>/dev/null || echo "Zellij not found in PATH"
echo ""

# List sessions with their info
echo "=== Active Zellij Sessions ==="
zellij list-sessions 2>/dev/null || echo "No sessions found"
echo ""

# Find Zellij server process
echo "=== Zellij Server Process ==="
ZELLIJ_PIDS=$(pgrep -f "zellij" 2>/dev/null || echo "")
if [ -n "$ZELLIJ_PIDS" ]; then
    for pid in $ZELLIJ_PIDS; do
        echo "--- PID: $pid ---"
        # Memory usage
        ps -p "$pid" -o pid,ppid,%cpu,%mem,rss,vsz,etime,command 2>/dev/null || true
        echo ""

        # File descriptors (important for leak detection)
        FD_COUNT=$(ls /proc/"$pid"/fd 2>/dev/null | wc -l || echo "N/A")
        echo "Open file descriptors: $FD_COUNT"

        # Memory maps summary
        if [ -r /proc/"$pid"/smaps_rollup ]; then
            echo "Memory breakdown:"
            cat /proc/"$pid"/smaps_rollup 2>/dev/null | grep -E "^(Rss|Pss|Shared|Private|Swap)" || true
        fi
        echo ""
    done
else
    echo "No Zellij processes found"
fi
echo ""

# Check for watch-logs.sh processes (can accumulate)
echo "=== Watch Script Processes ==="
WATCH_PIDS=$(pgrep -f "watch-logs.sh" 2>/dev/null || echo "")
if [ -n "$WATCH_PIDS" ]; then
    echo "Active watch-logs.sh instances: $(echo "$WATCH_PIDS" | wc -w)"
    ps -p "$(echo "$WATCH_PIDS" | tr '\n' ',')" -o pid,ppid,%cpu,%mem,etime,command 2>/dev/null || true
else
    echo "No watch-logs.sh processes found"
fi
echo ""

# Check tail processes (one per log tab)
echo "=== Tail Processes (log following) ==="
TAIL_PIDS=$(pgrep -f "tail.*-F" 2>/dev/null || echo "")
if [ -n "$TAIL_PIDS" ]; then
    echo "Active tail -F instances: $(echo "$TAIL_PIDS" | wc -w)"
    ps -p "$(echo "$TAIL_PIDS" | tr '\n' ',')" -o pid,ppid,%cpu,%mem,etime,args 2>/dev/null | head -20 || true
else
    echo "No tail -F processes found"
fi
echo ""

# Log file sizes (large logs = more data to process)
echo "=== Log File Sizes ==="
if [ -d "$HOME/.dust-hive/envs" ]; then
    find "$HOME/.dust-hive/envs" -name "*.log" -exec ls -lh {} \; 2>/dev/null | awk '{print $5, $9}'
    echo ""
    echo "Total log size:"
    du -sh "$HOME/.dust-hive/envs"/*/*.log 2>/dev/null | awk '{sum+=$1} END {print sum " bytes"}'
else
    echo "No dust-hive envs directory found"
fi
echo ""

# Check temporal log
echo "=== Temporal Log Size ==="
if [ -f "$HOME/.dust-hive/temporal.log" ]; then
    ls -lh "$HOME/.dust-hive/temporal.log"
else
    echo "No temporal log found"
fi
echo ""

# System memory pressure
echo "=== System Memory ==="
free -h 2>/dev/null || vm_stat 2>/dev/null || echo "Memory info unavailable"
echo ""

# Docker container resource usage (if applicable)
echo "=== Docker Containers (dust-hive) ==="
if command -v docker &> /dev/null; then
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" 2>/dev/null | grep -E "(dust|NAME)" || echo "No dust containers running"
else
    echo "Docker not available"
fi
echo ""

# Terminal/PTY file descriptors
echo "=== PTY Allocation ==="
ls /dev/pts/ 2>/dev/null | wc -l || echo "N/A"
echo ""

# Zellij layout/cache files
echo "=== Zellij Cache/Layout Files ==="
if [ -d "$HOME/.dust-hive/zellij" ]; then
    ls -la "$HOME/.dust-hive/zellij/"
fi
if [ -d "$HOME/.cache/zellij" ]; then
    du -sh "$HOME/.cache/zellij" 2>/dev/null || echo "No Zellij cache"
fi
if [ -d "$HOME/.local/share/zellij" ]; then
    du -sh "$HOME/.local/share/zellij" 2>/dev/null || echo "No Zellij data dir"
fi
echo ""

echo "=========================================="
echo "Diagnostic Tips:"
echo "=========================================="
echo ""
echo "If you see high memory (RSS > 500MB) on Zellij processes:"
echo "  → Scrollback buffer accumulation - run 'dust-hive reload <env>'"
echo ""
echo "If file descriptor count is very high (> 100):"
echo "  → Possible FD leak - restart the session"
echo ""
echo "If log files are very large (> 100MB each):"
echo "  → Truncate logs: echo '' > ~/.dust-hive/envs/<env>/<service>.log"
echo ""
echo "If many tail -F processes exist:"
echo "  → Process accumulation - reload the session"
echo ""
echo "Quick fix: dust-hive reload <env-name>"
echo ""
