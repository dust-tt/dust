#!/bin/sh
set -e 
echo "Waiting for main container to be ready..."
while ! wget "http://$(hostname -i):3000/api/healthz" 2>/dev/null; do
  sleep 2
done
echo "Main container ready, starting profiler warmup"

ITERATION_COUNT="${1:-1}"
for i in $(seq 1 $ITERATION_COUNT); do
  echo "Triggering profiler warmup $i/$ITERATION_COUNT"
  wget -q -O /dev/null "http://$(hostname -i):3000/api/debug/profiler?secret=$DEBUG_PROFILER_SECRET"
done
echo "Profiler warmup complete"
