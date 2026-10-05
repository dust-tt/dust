#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
nfs_ip=$1
mkdir -p runtime/controlled/nfs results/demand
if ! mountpoint -q runtime/controlled/nfs; then sudo mount -t nfs -o vers=3,proto=tcp "$nfs_ip:/bench" runtime/controlled/nfs; fi
sudo chown "$(id -u):$(id -g)" runtime/controlled/nfs
if ! test -d runtime/controlled/nfs/corpus; then cp -a runtime/controlled/corpus runtime/controlled/nfs/corpus; fi
if ! test -d runtime/controlled/large; then python3 vendor/generate.py runtime/controlled/large --seed 42 --filler-lines 4096 > results/demand/generate-large.txt; fi
if ! test -d runtime/controlled/nfs/large; then cp -a runtime/controlled/large runtime/controlled/nfs/large; fi
sync
sha256sum runtime/controlled/{corpus,large}/manifest.json runtime/controlled/nfs/{corpus,large}/manifest.json > results/demand/manifest-hashes.txt
echo success > results/demand/data-ready.txt
