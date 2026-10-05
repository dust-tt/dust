#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
run=runtime/controlled
out=results/optimization/baselines
address=${1:?Filestore IPv4 address required}
mkdir -p "$out" "$run/nfs"
sudo mount -t nfs -o vers=3,proto=tcp,hard,timeo=600,retrans=2 "$address:/bench" "$run/nfs"
sudo mkdir "$run/nfs/corpus"
sudo chown "$(id -u):$(id -g)" "$run/nfs/corpus"
cp -a "$run/corpus/." "$run/nfs/corpus/"
sync -f "$run/nfs/corpus"
findmnt "$run/nfs" > "$out/nfs-mount.txt"
nfsstat -m > "$out/nfs-options.txt"
cat /proc/self/mountstats > "$out/nfs-mountstats-before.txt"
python3 vendor/benchmark.py "$run/nfs/corpus" --warm-runs 3 > "$out/nfs.txt"
cat /proc/self/mountstats > "$out/nfs-mountstats-after.txt"
echo success > "$out/nfs-completed.txt"
