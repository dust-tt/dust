#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -s results/network-final/power-verification.json
test -s results/resource-followup-server/analysis.json
gcloud compute instances delete dfs-poc-jd-20260930 dfs-poc-client-jd-20260930 --project=dust-dev --zone=us-central1-a --quiet
gcloud compute disks delete dfs-poc-jd-20260930-data --project=dust-dev --zone=us-central1-a --quiet
gcloud compute firewall-rules delete dfs-poc-jd-allow-client dfs-poc-jd-deny-other --project=dust-dev --quiet
gcloud compute images delete dfs-poc-ubuntu-20260926 --project=dust-dev --quiet
gcloud storage rm gs://dust-dev-dfs-poc-jd-20260930/gce-image.tar.gz --project=dust-dev
gcloud storage buckets delete gs://dust-dev-dfs-poc-jd-20260930 --project=dust-dev --quiet
