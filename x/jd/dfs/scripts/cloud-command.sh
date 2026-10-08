#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
vm=$1
shift
gcloud compute ssh "dfs@$vm" --project=dust-dev --zone=us-central1-a --plain --ssh-flag=-icloud/ssh-key --ssh-flag=-oUserKnownHostsFile=cloud/known_hosts --command="$*"
