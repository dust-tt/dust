#!/usr/bin/env bash
# Run only after the baseline benchmark: starting FDB can trigger transaction-role recruitment.
set -euo pipefail
DFS_SETUP_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$DFS_SETUP_DIR/verify-host.sh"
[[ $DFS_NODE == dfs-v2-spolu-tx-a ]]

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl

DFS_DATA=/var/lib/dfs-fdb-tx
id foundationdb >/dev/null 2>&1 || useradd --system --home-dir "$DFS_DATA" --shell /usr/sbin/nologin foundationdb
install -d -o foundationdb -g foundationdb /etc/dfs-fdb /var/log/dfs-fdb "$DFS_DATA/data"
install -d /usr/local/libexec/dfs-fdb /var/cache/dfs-fdb
for dfs_asset in fdbserver.x86_64 fdbmonitor.x86_64 fdbcli.x86_64; do
  dfs_url="https://github.com/apple/foundationdb/releases/download/7.3.69/$dfs_asset"
  curl -fLsS --retry 3 "$dfs_url" -o "/var/cache/dfs-fdb/$dfs_asset"
  curl -fLsS --retry 3 "$dfs_url.sha256" -o "/var/cache/dfs-fdb/$dfs_asset.sha256"
  dfs_hash=$(awk '{print $1}' "/var/cache/dfs-fdb/$dfs_asset.sha256")
  [[ $dfs_hash =~ ^[0-9a-f]{64}$ ]]
  printf '%s  %s\n' "$dfs_hash" "/var/cache/dfs-fdb/$dfs_asset" | sha256sum --check
  dfs_binary="/usr/local/libexec/dfs-fdb/${dfs_asset%.x86_64}"
  install -m 755 "/var/cache/dfs-fdb/$dfs_asset" "$dfs_binary.new"
  mv "$dfs_binary.new" "$dfs_binary"
done
ln -sfn /usr/local/libexec/dfs-fdb/fdbcli /usr/local/bin/fdbcli
if [[ -e /etc/dfs-fdb/fdb.cluster ]]; then
  cmp "$DFS_SETUP_DIR/fdb.cluster" /etc/dfs-fdb/fdb.cluster
else
  install -o foundationdb -g foundationdb -m 644 "$DFS_SETUP_DIR/fdb.cluster" /etc/dfs-fdb/fdb.cluster
fi

cat > /etc/dfs-fdb/foundationdb.conf.new <<EOF
[fdbmonitor]
user = foundationdb
group = foundationdb

[general]
cluster-file = /etc/dfs-fdb/fdb.cluster
restart-delay = 5

[fdbserver]
command = /usr/local/libexec/dfs-fdb/fdbserver
public-address = $DFS_IP:\$ID
listen-address = public
datadir = $DFS_DATA/data/\$ID
logdir = /var/log/dfs-fdb
logsize = 10MiB
maxlogssize = 100MiB
memory = 8GiB
locality-machineid = $DFS_NODE
locality-zoneid = $DFS_ZONE
locality-dcid = us-central1

[fdbserver.4500]
class = grv_proxy

[fdbserver.4501]
class = commit_proxy

[fdbserver.4502]
class = commit_proxy

[fdbserver.4503]
class = commit_proxy

[fdbserver.4504]
class = master

[fdbserver.4505]
class = resolution
EOF
chown foundationdb:foundationdb /etc/dfs-fdb/foundationdb.conf.new
mv /etc/dfs-fdb/foundationdb.conf.new /etc/dfs-fdb/foundationdb.conf

cat > /etc/systemd/system/dfs-fdb.service <<'EOF'
[Unit]
Description=dfs v2 FoundationDB preferred transaction roles
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=foundationdb
Group=foundationdb
RuntimeDirectory=dfs-fdb
ExecStart=/usr/local/libexec/dfs-fdb/fdbmonitor --conffile /etc/dfs-fdb/foundationdb.conf --lockfile /run/dfs-fdb/fdbmonitor.pid
Restart=on-failure
RestartSec=3
LimitNOFILE=65536
KillMode=control-group

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now dfs-fdb
fdbcli --version
