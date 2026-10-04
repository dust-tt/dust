#!/usr/bin/env bash
set -euo pipefail
DFS_SETUP_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$DFS_SETUP_DIR/verify-host.sh"
[[ $DFS_NODE == dfs-v2-spolu-workload ]]
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq docker.io docker-compose-v2 fuse3 python3 ripgrep
systemctl enable --now docker
modprobe fuse
install -d /etc/dfs-fdb /opt/dfs /target /benchmark /var/lib/dfs-es /var/log/dfs-bench
chown 1000:0 /var/lib/dfs-es
install -m 644 "$DFS_SETUP_DIR/fdb.cluster" /etc/dfs-fdb/fdb.cluster
sysctl -w vm.max_map_count=262144
printf 'vm.max_map_count=262144\n' > /etc/sysctl.d/90-dfs-es.conf
docker --version
docker compose version
