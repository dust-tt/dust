#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
vm=${1:-dfs-poc-jd-20260930}
mkdir -p runtime
source_files=(Cargo.toml Cargo.lock build.rs CONTRACTS src tests proto scripts deploy vendor lexical)
for document in README.md DESIGN.md DEPLOYMENT.md; do
  if test -f "$document"; then source_files+=("$document"); fi
done
COPYFILE_DISABLE=1 tar --no-xattrs --exclude='__pycache__' --exclude='._*' -czf runtime/source.tar.gz "${source_files[@]}"
gcloud compute ssh "dfs@$vm" --project=dust-dev --zone=us-central1-a --plain --ssh-flag=-icloud/ssh-key --ssh-flag=-oUserKnownHostsFile=cloud/known_hosts --command='mkdir -p ~/x/jd/dfs/results'
gcloud compute scp runtime/source.tar.gz "dfs@$vm:~/x/jd/dfs/source.tar.gz" --project=dust-dev --zone=us-central1-a --plain --scp-flag=-icloud/ssh-key --scp-flag=-oUserKnownHostsFile=cloud/known_hosts
gcloud compute ssh "dfs@$vm" --project=dust-dev --zone=us-central1-a --plain --ssh-flag=-icloud/ssh-key --ssh-flag=-oUserKnownHostsFile=cloud/known_hosts --command='cd ~/x/jd/dfs && tar -xzf source.tar.gz'
