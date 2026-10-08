#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
run=runtime/network
test ! -e "$run/power-attempts.jsonl"
common=(--endpoint https://10.128.0.4:7443 --ca "$run/server.crt" --token-file "$run/admin.token")
for attempt in $(seq 1 600); do
  if target/release/dfsctl "${common[@]}" metrics > "$run/power-before-metrics.json" 2>/dev/null; then break; fi
  sleep 0.1
done
target/release/dfs-recovery "${common[@]}" --log "$run/power-attempts.jsonl" > "$run/power-writer.txt" 2>&1
python3 - <<'PY' > "$run/power-failure-time.json"
import json, time
print(json.dumps({'writer_stopped_ms':time.time_ns()//1000000}))
PY
for attempt in $(seq 1 600); do
  if target/release/dfsctl "${common[@]}" metrics > "$run/power-recovered-metrics.json" 2>/dev/null; then break; fi
  sleep 0.1
done
python3 - <<'PY' > "$run/power-ready-time.json"
import json, time
print(json.dumps({'ready_ms':time.time_ns()//1000000}))
PY
target/release/dfs-recovery "${common[@]}" --log "$run/power-attempts.jsonl" --verify > "$run/power-verification.json"
python3 - <<'CHECK'
import json
from pathlib import Path
root = Path('runtime/network')
with (root / 'power-attempts.jsonl').open() as source:
    old = json.loads(source.readline())['request']['incarnation']
new = json.loads((root / 'power-verification.json').read_text())['incarnation']
assert old != new, 'recovery verification requires a new server incarnation'
(root / 'power-incarnations.json').write_text(json.dumps({'before': old, 'after': new, 'changed': True}) + '\n')
CHECK
gzip -c "$run/power-attempts.jsonl" > "$run/power-attempts.jsonl.gz"
echo success > "$run/power-completed.txt"
