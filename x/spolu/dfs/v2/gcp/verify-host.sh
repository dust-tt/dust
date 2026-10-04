#!/usr/bin/env bash
# Source this file before changing one of the explicitly provisioned experiment VMs.
set -euo pipefail

dfs_metadata() {
  curl --fail --silent --show-error --connect-timeout 3 --max-time 10 \
    -H 'Metadata-Flavor: Google' "http://metadata.google.internal/computeMetadata/v1/$1"
}

[[ $(dfs_metadata project/project-id) == dust-dev ]]
DFS_NODE=$(dfs_metadata instance/name)
DFS_ZONE=$(basename "$(dfs_metadata instance/zone)")
DFS_IP=$(dfs_metadata instance/network-interfaces/0/ip)
case "$DFS_NODE:$DFS_ZONE:$DFS_IP" in
  dfs-v2-spolu-fdb-a:us-central1-a:10.84.0.11 | \
  dfs-v2-spolu-fdb-b:us-central1-b:10.84.0.12 | \
  dfs-v2-spolu-fdb-f:us-central1-f:10.84.0.13 | \
  dfs-v2-spolu-workload:us-central1-a:10.84.0.20) ;;
  *) echo 'Refusing setup outside the provisioned dust-dev fixture.' >&2; exit 1 ;;
esac
[[ $(uname -m) == x86_64 ]]
[[ $EUID == 0 ]]
