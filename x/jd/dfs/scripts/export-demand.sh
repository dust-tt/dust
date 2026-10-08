#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
copy() {
  gcloud compute scp "$@" --project=dust-dev --zone=us-central1-a --plain --scp-flag=-icloud/ssh-key --scp-flag=-oUserKnownHostsFile=cloud/known_hosts
}
bash scripts/cloud-command.sh dfs-opt-client-jd-20260930 'cd /home/dfs/x/jd/dfs && test -s results/demand/final-corpus/completed.txt && test -s results/demand/final-large/completed.txt && test -s results/demand/correctness-cloud-final/completed.txt && gzip -c runtime/controlled/corpus/manifest.json > results/demand/corpus-manifest.json.gz && gzip -c runtime/controlled/large/manifest.json > results/demand/large-manifest.json.gz && sha256sum runtime/controlled/dfs-mount-before runtime/demand-final-bin/* vendor/benchmark.py vendor/generate.py > results/demand/measured-client-binaries.sha256 && tar -czf runtime/demand-client-export.tar.gz results/demand'
copy dfs@dfs-opt-client-jd-20260930:/home/dfs/x/jd/dfs/runtime/demand-client-export.tar.gz cloud/demand-client-export.tar.gz
mkdir -p runtime/demand-export-client
tar -xzf cloud/demand-client-export.tar.gz -C runtime/demand-export-client
python3 - <<'COPY'
import pathlib
import shutil
source = pathlib.Path('runtime/demand-export-client/results/demand')
for path in source.rglob('*'):
    destination = pathlib.Path('results/demand') / path.relative_to(source)
    if path.is_file() and not destination.exists():
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, destination)
COPY
bash scripts/cloud-command.sh dfs-opt-jd-20260930 'cd /home/dfs/x/jd/dfs && python3 scripts/collect-run.py runtime/data/demand results/demand/server-runtime && tar -czf runtime/demand-server-export.tar.gz results/demand'
copy dfs@dfs-opt-jd-20260930:/home/dfs/x/jd/dfs/runtime/demand-server-export.tar.gz cloud/demand-server-export.tar.gz
mkdir -p runtime/demand-export-server
tar -xzf cloud/demand-server-export.tar.gz -C runtime/demand-export-server
mkdir -p results/demand/server-export
cp -R runtime/demand-export-server/results/demand/. results/demand/server-export/
python3 scripts/report-demand.py
