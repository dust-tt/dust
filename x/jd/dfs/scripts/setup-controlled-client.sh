#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
sudo cloud-init status --wait || test "$?" -eq 2
sudo apt-get update -qq
sudo apt-get install -y -qq nfs-common fuse3 ripgrep python3 curl lsb-release strace linux-tools-common
curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo tee /usr/share/keyrings/cloud.google.asc > /dev/null
printf 'deb [signed-by=/usr/share/keyrings/cloud.google.asc] https://packages.cloud.google.com/apt gcsfuse-%s main\n' "$(lsb_release -c -s)" | sudo tee /etc/apt/sources.list.d/gcsfuse.list > /dev/null
printf 'deb [signed-by=/usr/share/keyrings/cloud.google.asc] https://packages.cloud.google.com/apt cloud-sdk main\n' | sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list > /dev/null
sudo apt-get update -qq
sudo apt-get install -y -qq gcsfuse google-cloud-cli
mkdir -p runtime/controlled/{nfs,gcs,dfs,dfs-before,gcs-cache} results/optimization
python3 vendor/generate.py runtime/controlled/corpus --seed 42 > results/optimization/generate.txt
gcloud storage rsync runtime/controlled/corpus gs://dust-dev-dfs-opt-corpus-jd-20260930/corpus --recursive --project=dust-dev > results/optimization/gcs-upload.log 2>&1
gcsfuse --version > results/optimization/gcsfuse-version.txt
dpkg-query -W > results/optimization/client-packages.txt
uname -a > results/optimization/client-kernel.txt
lscpu > results/optimization/client-cpu.txt
