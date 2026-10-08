#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/cloud-command.sh dfs-kcache-jd-20260930-client 'cd /home/dfs/x/jd/dfs && test -s results/kernel-cache/matrix/completed.json && gzip -c runtime/kernel-cache-client/corpus/manifest.json > results/kernel-cache/corpus-manifest.json.gz && gzip -c runtime/kernel-cache-client/large/manifest.json > results/kernel-cache/large-manifest.json.gz && sha256sum target/release/dfsd target/release/dfsctl target/release/dfs-mount vendor/benchmark.py vendor/generate.py > results/kernel-cache/measured-binaries.sha256 && python3 scripts/fingerprint.py > results/kernel-cache/source-final.json && tar -czf runtime/kernel-client-evidence.tar.gz results/kernel-cache'
gcloud compute scp dfs@dfs-kcache-jd-20260930-client:/home/dfs/x/jd/dfs/runtime/kernel-client-evidence.tar.gz cloud/kernel-client-evidence.tar.gz --project=dust-dev --zone=us-central1-a --plain --scp-flag=-icloud/ssh-key --scp-flag=-oUserKnownHostsFile=cloud/known_hosts
mkdir -p results/kernel-cache/client
tar -xzf cloud/kernel-client-evidence.tar.gz --strip-components=2 -C results/kernel-cache/client
python3 scripts/report-kernel-cache.py results/kernel-cache/client/matrix --output results/kernel-cache
bash scripts/cloud-command.sh dfs-kcache-jd-20260930-server 'cd /home/dfs/x/jd/dfs && systemctl show dfs-kcache-server -p MainPID -p ActiveState -p ExecStart > results/kernel-cache/server-unit.txt && server_pid=$(systemctl show dfs-kcache-server -p MainPID --value) && test "$server_pid" -gt 0 && sudo sha256sum /proc/"$server_pid"/exe > results/kernel-cache/running-server.sha256 && python3 scripts/fingerprint.py > results/kernel-cache/source-final.json && tar -czf runtime/kernel-server-evidence.tar.gz results/kernel-cache'
gcloud compute scp dfs@dfs-kcache-jd-20260930-server:/home/dfs/x/jd/dfs/runtime/kernel-server-evidence.tar.gz cloud/kernel-server-evidence.tar.gz --project=dust-dev --zone=us-central1-a --plain --scp-flag=-icloud/ssh-key --scp-flag=-oUserKnownHostsFile=cloud/known_hosts
tar -xzf cloud/kernel-server-evidence.tar.gz --strip-components=2 -C results/kernel-cache/server
