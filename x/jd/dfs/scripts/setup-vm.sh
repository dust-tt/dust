#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
sudo cloud-init status --wait || test "$?" -eq 2
sudo apt-get update -qq
sudo apt-get install -y -qq build-essential clang libclang-dev cmake pkg-config fuse3 libfuse3-dev python3 ripgrep util-linux curl sysstat openssl
if ! rg -q '^user_allow_other$' /etc/fuse.conf; then
  printf 'user_allow_other\n' | sudo tee -a /etc/fuse.conf > /dev/null
fi
if ! test -x "$HOME/.cargo/bin/rustc"; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.96.0 --profile minimal
fi
mkdir -p runtime/data
if ! mountpoint -q runtime/data; then
  device=/dev/disk/by-id/google-dfs-data
  if ! test -b "$device"; then device=/dev/disk/by-id/scsi-0Google_PersistentDisk_dfs-data; fi
  test -b "$device"
  if ! sudo blkid "$device" > /dev/null; then sudo mkfs.ext4 -F "$device"; fi
  sudo mount "$device" runtime/data
  sudo chown "$(id -u):$(id -g)" runtime/data
fi
python3 scripts/fingerprint.py > results/source-manifest.json
"$HOME/.cargo/bin/cargo" build --locked --release
"$HOME/.cargo/bin/cargo" test --locked --release
