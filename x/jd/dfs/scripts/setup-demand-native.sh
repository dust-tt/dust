#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
run=runtime/controlled
sudo mount --make-rprivate /
if ! rg -q "^user_allow_other$" /etc/fuse.conf; then
  printf "user_allow_other\n" | sudo tee -a /etc/fuse.conf > /dev/null
fi
mkdir -p "$run/native"
device=/dev/disk/by-id/google-dfs-native-data
test -b "$device"
if ! mountpoint -q "$run/native"; then
  if ! sudo blkid "$device" > /dev/null; then sudo mkfs.ext4 -F "$device"; fi
  sudo mount "$device" "$run/native"
  sudo chown "$(id -u):$(id -g)" "$run/native"
fi
while ! test -s results/demand/data-ready.txt; do sleep 2; done
for corpus in corpus large; do
  if ! test -d "$run/native/$corpus"; then cp -a "$run/$corpus" "$run/native/$corpus"; fi
done
sync
findmnt "$run/native" > results/demand/native-device.txt
sha256sum "$run/native"/{corpus,large}/manifest.json > results/demand/native-manifest-hashes.txt
echo success > results/demand/native-ready.txt
