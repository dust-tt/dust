set -eu
node_ip=$1
node_zone=$2
cluster_connection=${3:-dfs_fdb:jd20261006@10.128.0.35:4550,10.128.0.36:4550,10.128.0.37:4550}
base=/home/dfs/dfs-fdb/runtime/fdb
mkdir -p "$base/bin" "$base/data" "$base/log"
for binary in fdbserver fdbcli; do
  if [ ! -x "$base/bin/$binary" ]; then
    curl -fL --retry 3 "https://github.com/apple/foundationdb/releases/download/7.3.69/$binary.x86_64" -o "$base/bin/$binary"
    chmod 755 "$base/bin/$binary"
  fi
done
if [ ! -f "$base/bin/libfdb_c.so" ]; then
  curl -fL --retry 3 https://github.com/apple/foundationdb/releases/download/7.3.69/libfdb_c.x86_64.so -o "$base/bin/libfdb_c.so"
fi
printf '%s\n' "$cluster_connection" > "$base/fdb.cluster"
if ! systemctl is-active --quiet dfs-fdb-storage; then
  sudo systemctl reset-failed dfs-fdb-storage 2>/dev/null || true
  sudo systemd-run --unit dfs-fdb-storage --uid dfs --property=MemoryMax=6G --property=Restart=on-failure \
    "$base/bin/fdbserver" --cluster-file "$base/fdb.cluster" --public-address "$node_ip:4550" \
    --listen-address "$node_ip:4550" --datadir "$base/data" --logdir "$base/log" \
    --locality-zoneid "$node_zone" --locality-machineid "$node_ip" --memory 4GiB --cache-memory 512MiB
fi
"$base/bin/fdbserver" --version
sha256sum "$base/bin/"*
