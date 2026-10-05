#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test "$(hostname -s)" = dfs-tantivy-jd-20261002-server
while test "$(cat results/tantivy-scale/bytes-large/phase)" != lance_measured; do
  sleep 2
done
python3 lexical/scale-server.py --dataset bytes-large --action stop > results/tantivy-scale/bytes-large-stop.log 2>&1
python3 lexical/scale-summarize.py results/tantivy-scale/bytes-large
gzip results/tantivy-scale/bytes-large/memory.jsonl
sudo journalctl -u dfs-scale-source -u dfs-scale-lance --no-pager -o cat | gzip > results/tantivy-scale/services.log.gz
lscpu --json > results/tantivy-scale/cpu.json
free -b > results/tantivy-scale/host-memory.txt
uname -a > results/tantivy-scale/kernel.txt
du -s -B1 /home/dfs/x/jd/dfs/runtime/scale/{count100k,bytes-large}/{db,tantivy-index,lance-index} > results/tantivy-scale/disk-allocated.txt
du -sb /home/dfs/x/jd/dfs/runtime/scale/{count100k,bytes-large}/{db,tantivy-index,lance-index} > results/tantivy-scale/disk-apparent.txt
sha256sum /home/dfs/x/jd/dfs/runtime/scale/bin/{dfsd,dfsctl,dfs-search} > results/tantivy-scale/deployed-binaries.sha256
export PATH="$HOME/.cargo/bin:$PATH"
export CARGO_TARGET_DIR=/home/dfs/x/jd/dfs/runtime/data/tantivy-target
export CARGO_BUILD_JOBS=8
export CARGO_PROFILE_RELEASE_DEBUG=1
cargo fmt --all
cargo fmt --all -- --check > results/tantivy-scale/format.log 2>&1
cargo test --release --locked --features lexical-search > results/tantivy-scale/dfs-tests.log 2>&1
cargo clippy --release --locked --features lexical-search --all-targets -- -D warnings > results/tantivy-scale/dfs-clippy.log 2>&1
python3 -m py_compile lexical/scale-*.py
sudo systemctl start dfs-search-tantivy
sudo systemctl start dfs-search-tantivy-lance
