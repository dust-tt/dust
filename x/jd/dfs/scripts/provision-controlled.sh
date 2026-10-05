#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p results/optimization
gcloud storage buckets create gs://dust-dev-dfs-opt-image-jd-20260930 --project=dust-dev --location=us-central1 --uniform-bucket-level-access
gcloud storage cp cloud/gce-image.tar.gz gs://dust-dev-dfs-opt-image-jd-20260930/gce-image.tar.gz --project=dust-dev
gcloud compute images create dfs-opt-ubuntu-20260926 --project=dust-dev --source-uri=gs://dust-dev-dfs-opt-image-jd-20260930/gce-image.tar.gz --guest-os-features=UEFI_COMPATIBLE
gcloud compute instances create dfs-opt-jd-20260930 --project=dust-dev --zone=us-central1-a --machine-type=n2-standard-8 --image=dfs-opt-ubuntu-20260926 --image-project=dust-dev --boot-disk-size=50GB --boot-disk-type=pd-balanced --no-service-account --no-scopes --metadata-from-file=user-data=cloud/user-data.yaml --metadata=enable-oslogin=FALSE --labels=purpose=dfs-poc,owner=jd
gcloud compute disks create dfs-opt-jd-20260930-data --project=dust-dev --zone=us-central1-a --type=pd-ssd --size=200GB
gcloud compute instances attach-disk dfs-opt-jd-20260930 --project=dust-dev --zone=us-central1-a --disk=dfs-opt-jd-20260930-data --device-name=dfs-data
gcloud iam service-accounts create dfs-opt-jd-20260930 --project=dust-dev --display-name='Disposable DFS controlled benchmark'
gcloud storage buckets create gs://dust-dev-dfs-opt-corpus-jd-20260930 --project=dust-dev --location=us-central1 --uniform-bucket-level-access
gcloud storage buckets add-iam-policy-binding gs://dust-dev-dfs-opt-corpus-jd-20260930 --project=dust-dev --member=serviceAccount:dfs-opt-jd-20260930@dust-dev.iam.gserviceaccount.com --role=roles/storage.objectAdmin
gcloud compute instances create dfs-opt-client-jd-20260930 --project=dust-dev --zone=us-central1-a --machine-type=n2-standard-8 --image=dfs-opt-ubuntu-20260926 --image-project=dust-dev --boot-disk-size=50GB --boot-disk-type=pd-balanced --service-account=dfs-opt-jd-20260930@dust-dev.iam.gserviceaccount.com --scopes=cloud-platform --metadata-from-file=user-data=cloud/user-data.yaml --metadata=enable-oslogin=FALSE --labels=purpose=dfs-poc,owner=jd
gcloud filestore instances create dfs-opt-zonal-jd-20260930 --project=dust-dev --zone=us-central1-a --tier=ZONAL --file-share=name=bench,capacity=1TB --network=name=default,connect-mode=DIRECT_PEERING --performance=max-iops=6000 --protocol=NFS_V3 --labels=purpose=dfs-poc,owner=jd --async
