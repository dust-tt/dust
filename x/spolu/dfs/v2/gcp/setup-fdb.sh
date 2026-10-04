#!/usr/bin/env bash
set -euo pipefail
DFS_SETUP_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$DFS_SETUP_DIR/verify-host.sh"
[[ $DFS_NODE == dfs-v2-spolu-fdb-* ]]

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl e2fsprogs

DFS_DISK=/dev/disk/by-id/google-local-nvme-ssd-0
DFS_MOUNT=/var/lib/dfs-fdb
[[ -b $DFS_DISK ]]
[[ $(blockdev --getsize64 "$DFS_DISK") == 402653184000 ]]
[[ $(lsblk -ndo TYPE "$DFS_DISK") == disk ]]
if [[ -z $(wipefs --no-act --noheadings --output TYPE "$DFS_DISK") ]]; then
  ! mountpoint -q "$DFS_MOUNT"
  [[ -z $(lsblk -nro MOUNTPOINTS "$DFS_DISK" | tr -d '[:space:]') ]]
  mkfs.ext4 -q -L dfs-fdb "$DFS_DISK"
  mkdir -p "$DFS_MOUNT"
  mount -o noatime,discard "$DFS_DISK" "$DFS_MOUNT"
  touch "$DFS_MOUNT/.dfs-fdb-managed"
else
  [[ $(blkid -s TYPE -o value "$DFS_DISK") == ext4 ]]
  mkdir -p "$DFS_MOUNT"
  if ! mountpoint -q "$DFS_MOUNT"; then
    mount -o ro,noload "$DFS_DISK" "$DFS_MOUNT"
    if [[ ! -f $DFS_MOUNT/.dfs-fdb-managed ]]; then
      umount "$DFS_MOUNT"
      echo 'Refusing an unmanaged existing filesystem.' >&2
      exit 1
    fi
    umount "$DFS_MOUNT"
    mount -o noatime,discard "$DFS_DISK" "$DFS_MOUNT"
  fi
  [[ -f $DFS_MOUNT/.dfs-fdb-managed ]]
fi
[[ $(readlink -f "$(findmnt -n -o SOURCE --target "$DFS_MOUNT")") == $(readlink -f "$DFS_DISK") ]]
DFS_UUID=$(blkid -s UUID -o value "$DFS_DISK")
if ! grep -q "^UUID=$DFS_UUID $DFS_MOUNT " /etc/fstab; then
  if grep -Eq "[[:space:]]$DFS_MOUNT[[:space:]]" /etc/fstab; then
    echo 'Refusing to replace an unexpected existing FDB mount.' >&2
    exit 1
  fi
  printf 'UUID=%s %s ext4 defaults,noatime,discard,nofail 0 2\n' "$DFS_UUID" "$DFS_MOUNT" >> /etc/fstab
fi

id foundationdb >/dev/null 2>&1 || useradd --system --home-dir "$DFS_MOUNT" --shell /usr/sbin/nologin foundationdb
install -d -o foundationdb -g foundationdb /etc/dfs-fdb /var/log/dfs-fdb "$DFS_MOUNT/data"
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
datadir = $DFS_MOUNT/data/\$ID
logdir = /var/log/dfs-fdb
logsize = 10MiB
maxlogssize = 100MiB
memory = 8GiB
cache-memory = 2GiB
locality-machineid = $DFS_NODE
locality-zoneid = $DFS_ZONE
locality-dcid = us-central1
knob-commit_transaction_batch_interval_min = 0.00001
knob-commit_transaction_batch_interval_from_idle = 0.00001
knob-busy_wait_threshold = 0.0001

[fdbserver.4500]
class = storage

[fdbserver.4501]
class = transaction

[fdbserver.4502]
class = stateless

[fdbserver.4503]
class = stateless
EOF
chown foundationdb:foundationdb /etc/dfs-fdb/foundationdb.conf.new
mv /etc/dfs-fdb/foundationdb.conf.new /etc/dfs-fdb/foundationdb.conf

cat > /etc/systemd/system/dfs-fdb.service <<'EOF'
[Unit]
Description=dfs v2 FoundationDB experiment
After=network-online.target
Wants=network-online.target
RequiresMountsFor=/var/lib/dfs-fdb
ConditionPathIsMountPoint=/var/lib/dfs-fdb

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
findmnt "$DFS_MOUNT"
