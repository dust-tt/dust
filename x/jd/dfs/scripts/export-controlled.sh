#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
copy() {
  gcloud compute scp "$@" --project=dust-dev --zone=us-central1-a --plain --scp-flag=-icloud/ssh-key --scp-flag=-oUserKnownHostsFile=cloud/known_hosts
}
bash scripts/cloud-command.sh dfs-opt-client-jd-20260930 'cd /home/dfs/x/jd/dfs && test -f results/optimization/directory-cache/completed.txt && test -f results/optimization/directory-cache-correctness/completed.txt && tar -czf results/optimization/source-metadata.tar.gz Cargo.toml Cargo.lock build.rs CONTRACTS src proto tests && gzip -c runtime/controlled/corpus/manifest.json > results/optimization/corpus-manifest.json.gz && tar -czf runtime/optimization-client-export.tar.gz results/optimization'
copy dfs@dfs-opt-client-jd-20260930:/home/dfs/x/jd/dfs/runtime/optimization-client-export.tar.gz cloud/optimization-client-export.tar.gz
tar -xzf cloud/optimization-client-export.tar.gz
bash scripts/cloud-command.sh dfs-opt-jd-20260930 'cd /home/dfs/x/jd/dfs && python3 scripts/collect-run.py runtime/data/controlled results/optimization/server-runtime && python3 scripts/collect-run.py runtime/data/controlled-failures results/optimization/server-failures && tar -czf runtime/optimization-server-export.tar.gz results/optimization'
copy dfs@dfs-opt-jd-20260930:/home/dfs/x/jd/dfs/runtime/optimization-server-export.tar.gz cloud/optimization-server-export.tar.gz
tar -xzf cloud/optimization-server-export.tar.gz
python3 scripts/analyze-controlled.py > results/optimization/summary.json
