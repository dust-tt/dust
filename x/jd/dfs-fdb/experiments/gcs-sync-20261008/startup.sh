#!/bin/bash
set -euo pipefail
exec > /var/log/gcs-dfs-setup.log 2>&1
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y build-essential clang libclang-dev pkg-config curl ca-certificates python3-venv openssl
mkdir -p /opt/gcs-dfs/fdb/bin /opt/gcs-dfs/fdb/data /opt/gcs-dfs/fdb/log
cd /opt/gcs-dfs/fdb/bin
for binary in fdbserver fdbcli; do
  curl -fL --retry 4 "https://github.com/apple/foundationdb/releases/download/7.3.69/$binary.x86_64" -o "$binary"
  chmod 755 "$binary"
done
curl -fL --retry 4 https://github.com/apple/foundationdb/releases/download/7.3.69/libfdb_c.x86_64.so -o libfdb_c.so
printf '%s\n' 'gcsdfs:jd20261008@127.0.0.1:4500' > /opt/gcs-dfs/fdb/fdb.cluster
systemd-run --unit=gcs-dfs-fdb --property=Restart=on-failure /opt/gcs-dfs/fdb/bin/fdbserver --cluster-file /opt/gcs-dfs/fdb/fdb.cluster --public-address 127.0.0.1:4500 --listen-address 127.0.0.1:4500 --datadir /opt/gcs-dfs/fdb/data --logdir /opt/gcs-dfs/fdb/log --memory 4GiB --cache-memory 1GiB
/opt/gcs-dfs/fdb/bin/fdbcli -C /opt/gcs-dfs/fdb/fdb.cluster --exec 'configure new single ssd'
curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal
curl -fL --retry 4 https://nodejs.org/dist/v24.16.0/node-v24.16.0-linux-x64.tar.xz -o /tmp/node.tar.xz
tar -xJf /tmp/node.tar.xz -C /opt/gcs-dfs
ln -sf /opt/gcs-dfs/node-v24.16.0-linux-x64/bin/node /usr/local/bin/node
ln -sf /opt/gcs-dfs/node-v24.16.0-linux-x64/bin/npm /usr/local/bin/npm
printf '%s\n' ready > /opt/gcs-dfs/setup-ready
