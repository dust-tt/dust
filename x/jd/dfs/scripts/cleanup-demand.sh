#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -s results/demand/final-corpus-summary.json
test -s results/demand/final-large-summary.json
test -s results/demand/correctness-cloud-final/completed.txt
test -s cloud/demand-client-export.tar.gz
test -s cloud/demand-server-export.tar.gz
gcloud compute instances delete dfs-opt-jd-20260930 dfs-opt-client-jd-20260930 --project=dust-dev --zone=us-central1-a --quiet
gcloud compute disks delete dfs-opt-jd-20260930-data dfs-opt-client-jd-20260930-data --project=dust-dev --zone=us-central1-a --quiet
gcloud filestore instances delete dfs-opt-zonal-jd-20260930 --project=dust-dev --zone=us-central1-a --quiet
gcloud compute firewall-rules delete dfs-opt-jd-allow-client dfs-opt-jd-deny-other --project=dust-dev --quiet
gcloud compute images delete dfs-opt-ubuntu-20260926 --project=dust-dev --quiet
gcloud storage buckets update gs://dust-dev-dfs-opt-corpus-jd-20260930 gs://dust-dev-dfs-opt-image-jd-20260930 --clear-soft-delete --project=dust-dev
gcloud storage rm --recursive gs://dust-dev-dfs-opt-corpus-jd-20260930 gs://dust-dev-dfs-opt-image-jd-20260930 --project=dust-dev
gcloud iam service-accounts delete dfs-opt-jd-20260930@dust-dev.iam.gserviceaccount.com --project=dust-dev --quiet
