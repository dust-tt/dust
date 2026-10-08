#!/usr/bin/env bash
set -euo pipefail
sudo cloud-init status --wait || test -f /var/lib/cloud/instance/boot-finished
sudo apt-get update -qq
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker.io fio
test -b /dev/disk/by-id/google-local-nvme-ssd-0
test ! -e /dev/disk/by-id/google-local-nvme-ssd-1
device=$(readlink -f /dev/disk/by-id/google-local-nvme-ssd-0)
sudo mkdir -p /srv/dfs
if ! mountpoint -q /srv/dfs; then
    test -z "$(sudo blkid -o value -s TYPE "$device" || true)"
    sudo mkfs.ext4 -F -E lazy_itable_init=0,lazy_journal_init=0 "$device"
    sudo mount -o noatime "$device" /srv/dfs
fi
sudo chown dfs:dfs /srv/dfs
mkdir -p /srv/dfs/{bin,lib,config,evidence,data,log}
sudo sysctl -w vm.max_map_count=1048576
sudo systemctl enable --now docker
lsblk -J -o NAME,SIZE,MODEL,MOUNTPOINTS > /srv/dfs/evidence/disks.json
findmnt -J -T /srv/dfs > /srv/dfs/evidence/mount.json
lscpu -J > /srv/dfs/evidence/cpu.json
uname -a > /srv/dfs/evidence/kernel.txt
fio --name=durable-write --filename=/srv/dfs/probe.bin --size=256m --rw=write --bs=4k --ioengine=psync --fdatasync=1 --time_based --runtime=10 --direct=1 --output-format=json --output=/srv/dfs/evidence/fio-durable-write.json
rm /srv/dfs/probe.bin
date -u +%FT%TZ > /srv/dfs/evidence/bootstrap-complete.txt
