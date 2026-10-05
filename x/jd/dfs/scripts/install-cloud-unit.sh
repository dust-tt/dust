#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
root=$PWD
mountpoint -q runtime/data
device=$(findmnt -no SOURCE --target "$root/runtime/data")
uuid=$(sudo blkid -s UUID -o value "$device")
test -n "$uuid"
if ! rg -q "UUID=$uuid " /etc/fstab; then
  printf 'UUID=%s %s/runtime/data ext4 defaults 0 2\n' "$uuid" "$root" | sudo tee -a /etc/fstab > /dev/null
fi
if test -f runtime/network-sampler.pid; then kill -TERM "$(cat runtime/network-sampler.pid)" 2>/dev/null || true; fi
if test -f runtime/network-server.pid; then
  pid=$(cat runtime/network-server.pid)
  kill -TERM "$pid" 2>/dev/null || true
  for attempt in $(seq 1 300); do if ! kill -0 "$pid" 2>/dev/null || test "$(ps -o stat= -p "$pid" | cut -c1)" = Z; then break; fi; sleep 0.1; done
fi
sudo ln -sf "$root/deploy/dfsd-poc.service" /etc/systemd/system/dfsd-poc.service
sudo systemctl daemon-reload
sudo systemctl enable --now dfsd-poc
sudo systemctl status dfsd-poc --no-pager
