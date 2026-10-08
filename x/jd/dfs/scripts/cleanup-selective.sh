#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - <<'PY'
import json,pathlib
root=pathlib.Path('results/selective')
assert json.loads((root/'cloud-verification.json').read_text())['passed']
assert json.loads((root/'cloud-source-check.json').read_text())['passed']
PY
test -s cloud/selective-client-evidence.tar.gz
test -s cloud/selective-server-evidence.tar.gz
gcloud filestore instances delete dfs-selective-jd-20260930-nfs --project=dust-dev --zone=us-central1-a --quiet --async
gcloud compute instances delete dfs-selective-jd-20260930-server dfs-selective-jd-20260930-client --project=dust-dev --zone=us-central1-a --quiet
gcloud compute disks delete dfs-selective-jd-20260930-server-data dfs-selective-jd-20260930-client-data --project=dust-dev --zone=us-central1-a --quiet
gcloud compute firewall-rules delete dfs-selective-jd-20260930-rpc --project=dust-dev --quiet
gcloud compute images delete dfs-selective-jd-20260930 --project=dust-dev --quiet
gcloud storage buckets update gs://dust-dev-dfs-selective-jd-20260930 --clear-soft-delete --project=dust-dev
gcloud storage rm --recursive gs://dust-dev-dfs-selective-jd-20260930 --project=dust-dev
