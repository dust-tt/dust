#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - <<'PY'
import json
import pathlib
root = pathlib.Path('results/kernel-cache')
assert json.loads((root / 'verification.json').read_text())['runs'] == 75
assert json.loads((root / 'verification.json').read_text())['passed']
assert json.loads((root / 'source-check.json').read_text())['passed']
PY
test -s cloud/kernel-client-evidence.tar.gz
test -s cloud/kernel-server-evidence.tar.gz
gcloud filestore instances delete dfs-kcache-jd-20260930-nfs --project=dust-dev --zone=us-central1-a --quiet --async
gcloud compute instances delete dfs-kcache-jd-20260930-server dfs-kcache-jd-20260930-client --project=dust-dev --zone=us-central1-a --quiet
gcloud compute disks delete dfs-kcache-jd-20260930-server-data dfs-kcache-jd-20260930-client-data --project=dust-dev --zone=us-central1-a --quiet
gcloud compute firewall-rules delete dfs-kcache-jd-20260930-rpc --project=dust-dev --quiet
gcloud compute images delete dfs-kcache-jd-20260930 --project=dust-dev --quiet
gcloud storage buckets update gs://dust-dev-dfs-kcache-jd-20260930 --clear-soft-delete --project=dust-dev
gcloud storage rm --recursive gs://dust-dev-dfs-kcache-jd-20260930 --project=dust-dev
