#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
copy() {
  gcloud compute scp "$@" --project=dust-dev --zone=us-central1-a --plain --scp-flag=-icloud/ssh-key --scp-flag=-oUserKnownHostsFile=cloud/known_hosts
}
bash scripts/cloud-command.sh dfs-opt-jd-20260930 'cd ~/x/jd/dfs && for attempt in $(seq 1 300); do if test -f results/optimization/server-ready.txt; then exit 0; fi; sleep 1; done; exit 1'
copy dfs@dfs-opt-jd-20260930:~/x/jd/dfs/runtime/controlled-client-bundle.tar.gz cloud/controlled-client-bundle.tar.gz
copy cloud/controlled-client-bundle.tar.gz dfs@dfs-opt-client-jd-20260930:~/x/jd/dfs/runtime/controlled-client-bundle.tar.gz
bash scripts/cloud-command.sh dfs-opt-client-jd-20260930 'cd ~/x/jd/dfs && tar -xzf runtime/controlled-client-bundle.tar.gz && for attempt in $(seq 1 180); do if test -s results/optimization/baselines/ext4-metadata-profile.txt; then bash scripts/controlled-nfs.sh 10.8.16.2 && bash scripts/controlled-dfs.sh; exit $?; fi; sleep 5; done; exit 1'
