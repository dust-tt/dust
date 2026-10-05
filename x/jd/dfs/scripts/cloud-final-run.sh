#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
server=dfs-poc-jd-20260930
client=dfs-poc-client-jd-20260930
remote() { bash scripts/cloud-command.sh "$@"; }
copy() {
  gcloud compute scp "$@" --project=dust-dev --zone=us-central1-a --plain \
    --scp-flag=-icloud/ssh-key --scp-flag=-oUserKnownHostsFile=cloud/known_hosts
}
remote "$server" 'cd ~/x/jd/dfs && for attempt in $(seq 1 300); do if test -f results/network-ready.txt; then exit 0; fi; sleep 1; done; exit 1'
if test "${DFS_SKIP_COLOCATED:-0}" != 1; then
  remote "$server" 'cd ~/x/jd/dfs && bash scripts/colocated-experiment.sh > results/colocated-final.log 2>&1'
fi
if test "${DFS_SKIP_BUNDLE:-0}" != 1; then
  copy "dfs@$server:~/x/jd/dfs/runtime/client-bundle.tar.gz" cloud/client-bundle.tar.gz
  copy cloud/client-bundle.tar.gz "dfs@$client:~/x/jd/dfs/runtime-client-bundle.tar.gz"
  remote "$client" 'cd ~/x/jd/dfs && tar -xzf runtime-client-bundle.tar.gz'
fi
copy scripts/benchmark-observed.py "dfs@$client:~/x/jd/dfs/scripts/benchmark-observed.py"
remote "$client" 'cd ~/x/jd/dfs && mkdir -p runtime/network && cp runtime/server.crt runtime/network/server.crt && cp runtime/data/network/credentials/admin*.token runtime/network/ && bash scripts/network-experiment.sh > results/network-experiment.log 2>&1'
remote "$server" 'cd ~/x/jd/dfs && cp runtime/data/network/db/LOG runtime/data/network/rocksdb-after-load.log && du -sb runtime/data/network/db > runtime/data/network/storage-after-load.txt && bash scripts/large-tenant.sh > results/large-tenant.log 2>&1 && bash scripts/install-cloud-unit.sh > results/systemd-install.log 2>&1'
remote "$client" 'cd ~/x/jd/dfs; nohup bash scripts/power-client.sh > results/power-client.log 2>&1 < /dev/null &'
remote "$client" 'cd ~/x/jd/dfs && for attempt in $(seq 1 180); do if test -f runtime/network/power-attempts.jsonl && test "$(stat -c%s runtime/network/power-attempts.jsonl)" -gt 2000000; then exit 0; fi; sleep 1; done; exit 1'
python3 - <<'PY'
import json, time
from pathlib import Path
Path('results/power-reset-request.json').write_text(json.dumps({'reset_requested_ms': time.time_ns()//1000000, 'project':'dust-dev', 'instance':'dfs-poc-jd-20260930', 'mechanism':'gcloud compute instances reset'},indent=2)+'\n')
PY
gcloud compute instances reset "$server" --project=dust-dev --zone=us-central1-a > results/power-reset-command.log 2>&1
remote "$client" 'cd ~/x/jd/dfs && for attempt in $(seq 1 600); do if test -f runtime/network/power-completed.txt; then cat runtime/network/power-verification.json; exit 0; fi; sleep 1; done; cat results/power-client.log; exit 1'
echo success > results/cloud-final-completed.txt
