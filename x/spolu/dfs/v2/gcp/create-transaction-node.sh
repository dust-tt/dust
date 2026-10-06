#!/usr/bin/env bash
# Run manually to create the transaction VM; FDB is installed separately after baseline timing.
set -euo pipefail
if [[ $# != 1 || $1 != --create ]]; then
  echo 'Manual use: bash v2/gcp/create-transaction-node.sh --create' >&2
  exit 2
fi

gcloud compute firewall-rules update dfs-v2-spolu-internal \
  --project=dust-dev --allow=tcp:4500-4505,icmp

gcloud compute instances create dfs-v2-spolu-tx-a \
  --project=dust-dev --zone=us-central1-a \
  --machine-type=n2-standard-8 --provisioning-model=STANDARD \
  --subnet=dfs-v2-spolu-us-central1 \
  --private-network-ip=10.84.0.21 --no-address \
  --image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud \
  --boot-disk-size=50GB --boot-disk-type=pd-balanced \
  --no-service-account --no-scopes \
  --metadata=block-project-ssh-keys=true \
  --tags=dfs-v2-spolu --labels=owner=spolu,experiment=dfs-v2,role=fdb-transaction
