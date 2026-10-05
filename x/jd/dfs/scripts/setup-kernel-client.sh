#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
nfs_ip=$1
sudo apt-get update -qq
sudo apt-get install -y -qq nfs-common fuse3 ripgrep python3 time
sudo mount --make-rprivate /
if ! rg -q '^user_allow_other$' /etc/fuse.conf; then
  printf 'user_allow_other\n' | sudo tee -a /etc/fuse.conf > /dev/null
fi
run=runtime/kernel-cache-client
mkdir -p "$run"/{native,nfs} results/kernel-cache
device=/dev/disk/by-id/google-dfs-data
if ! test -b "$device"; then device=/dev/disk/by-id/scsi-0Google_PersistentDisk_dfs-data; fi
test -b "$device"
if ! mountpoint -q "$run/native"; then
  if ! sudo blkid "$device" > /dev/null; then sudo mkfs.ext4 -F "$device"; fi
  sudo mount "$device" "$run/native"
  sudo chown "$(id -u):$(id -g)" "$run/native"
fi
python3 vendor/generate.py "$run/corpus" --seed 42 > results/kernel-cache/generate.txt
python3 vendor/generate.py "$run/large" --seed 42 --filler-lines 4096 > results/kernel-cache/generate-large.txt
sudo mount -t nfs -o vers=3,proto=tcp "$nfs_ip:/bench" "$run/nfs"
sudo chown "$(id -u):$(id -g)" "$run/nfs"
for corpus in corpus large; do
  cp -a "$run/$corpus" "$run/native/$corpus"
  cp -a "$run/$corpus" "$run/nfs/$corpus"
done
sync
sha256sum "$run"/{corpus,large}/manifest.json "$run"/{native,nfs}/{corpus,large}/manifest.json > results/kernel-cache/manifests.sha256
sudo umount "$run/nfs"
uname -a > results/kernel-cache/kernel.txt
lscpu > results/kernel-cache/cpu.txt
rg --version > results/kernel-cache/rg-version.txt
printf 'ready\n' > results/kernel-cache/client-ready.txt
