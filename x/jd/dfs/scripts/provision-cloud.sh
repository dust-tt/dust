#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
project=dust-dev
zone=us-central1-a
bucket=dust-dev-dfs-poc-jd-20260930
image=dfs-poc-ubuntu-20260926
vm=dfs-poc-jd-20260930
mkdir -p cloud results
if ! gcloud storage buckets describe "gs://$bucket" --project="$project" > /dev/null 2>&1; then
  gcloud storage buckets create "gs://$bucket" --project="$project" --location=us-central1 --uniform-bucket-level-access
fi
gcloud storage cp cloud/gce-image.tar.gz "gs://$bucket/gce-image.tar.gz" --project="$project"
if ! gcloud compute images describe "$image" --project="$project" > /dev/null 2>&1; then
  gcloud compute images create "$image" --project="$project" --source-uri="gs://$bucket/gce-image.tar.gz" --guest-os-features=UEFI_COMPATIBLE --description='DFS PoC Ubuntu 24.04 official 20260926 QCOW2 SHA256 6a81c37564db9b1ee84e141922625e1d7c5b389b99bb3c572e0243607d5bb4d2 converted to raw'
fi
if ! test -f cloud/ssh-key; then ssh-keygen -q -t ed25519 -N '' -f cloud/ssh-key; fi
python3 - <<'PY'
from pathlib import Path
key=Path('cloud/ssh-key.pub').read_text().strip()
Path('cloud/user-data.yaml').write_text('''#cloud-config
users:
  - name: dfs
    sudo: ALL=(ALL) NOPASSWD:ALL
    shell: /bin/bash
    ssh_authorized_keys:
      - '''+key+'''
package_update: true
packages:
  - google-guest-agent
  - google-compute-engine
  - build-essential
  - clang
  - libclang-dev
  - cmake
  - pkg-config
  - fuse3
  - libfuse3-dev
  - python3
  - ripgrep
  - util-linux
  - curl
  - sysstat
  - openssl
runcmd:
  - [systemctl, enable, --now, google-guest-agent]
''')
PY
if ! gcloud compute instances describe "$vm" --project="$project" --zone="$zone" > /dev/null 2>&1; then
  gcloud compute instances create "$vm" --project="$project" --zone="$zone" --machine-type=n2-standard-8 \
    --image="$image" --image-project="$project" --boot-disk-size=50GB --boot-disk-type=pd-balanced \
    --no-service-account --no-scopes --metadata-from-file=user-data=cloud/user-data.yaml \
    --metadata=enable-oslogin=FALSE --labels=purpose=dfs-poc,owner=jd
fi
if ! gcloud compute disks describe "$vm-data" --project="$project" --zone="$zone" > /dev/null 2>&1; then
  gcloud compute disks create "$vm-data" --project="$project" --zone="$zone" --type=pd-ssd --size=200GB
  gcloud compute instances attach-disk "$vm" --project="$project" --zone="$zone" --disk="$vm-data" --device-name=dfs-data
fi
gcloud compute instances describe "$vm" --project="$project" --zone="$zone" --format='json(name,zone,machineType,disks,networkInterfaces.networkIP,networkInterfaces.accessConfigs.natIP,status)' > results/cloud-vm.json
gcloud compute disks describe "$vm-data" --project="$project" --zone="$zone" --format='json(name,type,sizeGb,provisionedIops,provisionedThroughput)' > results/cloud-disk.json
