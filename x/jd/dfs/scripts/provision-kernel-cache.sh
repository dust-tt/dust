#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
prefix=dfs-kcache-jd-20260930
bucket=dust-dev-$prefix
gcloud storage buckets create "gs://$bucket" --project=dust-dev --location=us-central1 --uniform-bucket-level-access
gcloud storage cp cloud/gce-image.tar.gz "gs://$bucket/gce-image.tar.gz" --project=dust-dev
gcloud compute images create "$prefix" --project=dust-dev --source-uri="gs://$bucket/gce-image.tar.gz" --guest-os-features=UEFI_COMPATIBLE
for role in server client; do
  gcloud compute instances create "$prefix-$role" --project=dust-dev --zone=us-central1-a --machine-type=n2-standard-8 --image="$prefix" --image-project=dust-dev --boot-disk-size=50GB --boot-disk-type=pd-balanced --no-service-account --no-scopes --metadata-from-file=user-data=cloud/user-data.yaml --metadata=enable-oslogin=FALSE --labels=purpose=dfs-poc,owner=jd
  gcloud compute disks create "$prefix-$role-data" --project=dust-dev --zone=us-central1-a --type=pd-ssd --size=200GB
  gcloud compute instances attach-disk "$prefix-$role" --project=dust-dev --zone=us-central1-a --disk="$prefix-$role-data" --device-name=dfs-data
done
gcloud filestore instances create "$prefix-nfs" --project=dust-dev --zone=us-central1-a --tier=ZONAL --file-share=name=bench,capacity=1TB --network=name=default,connect-mode=DIRECT_PEERING --performance=max-iops=6000 --protocol=NFS_V3 --labels=purpose=dfs-poc,owner=jd --async
gcloud compute instances list --project=dust-dev --filter="name~$prefix" --format=json > results/kernel-cache/instances.json
