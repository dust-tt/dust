#!/bin/bash
set -euo pipefail

# Compute the list from the registry.
WORKERS="$(npx tsx ./admin/print_workers_except_agent_loop.ts)"

NODE_ENV=development npx concurrently \
  --names "workers,agent-loop" \
  --prefix-colors "blue,green" \
  "tsx ./start_worker.ts --workers $WORKERS" \
  "nodemon --exec 'tsx ./start_worker.ts --workers agent_loop' \
    --watch 'temporal/agent_loop' \
    --watch 'lib/api/assistant' \
    --watch 'lib/actions' \
    --watch 'lib/api/mcp' \
    --ext 'ts,js' \
    --signal 'SIGTERM' \
    --delay 5" # 5 seconds delay to avoid restarting the agent loop worker too often.
