#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source "$HOME/.cargo/env"
rm -f results/network-ready.txt
while pgrep -x dfsd > /dev/null; do sleep 1; done
cargo build --locked --release
cargo test --locked --release
cargo clippy --locked --release --all-targets -- -D warnings
bash scripts/smoke.sh
bash scripts/policy-mount.sh
failure_run="runtime/final-failures-$(date -u +%Y%m%dT%H%M%SZ)"
python3 scripts/failure-scenarios.py --bin target/release --run "$failure_run"
printf "%s\n" "$failure_run" > results/latest-failures.txt
nohup bash scripts/network-server.sh > results/network-server.log 2>&1 < /dev/null &
server=$!
echo "$server" > runtime/network-server.pid
run=runtime/data/network
mkdir -p "$run"
for attempt in $(seq 1 300); do
  if target/release/dfsctl --endpoint https://127.0.0.1:7443 --ca runtime/server.crt --token-file "$run/credentials/admin.token" metrics > "$run/metrics-initial.json" 2>/dev/null; then break; fi
  sleep 0.1
done
corpus=$(cat results/latest-benchmark.txt)/corpus
target/release/dfsctl --endpoint https://127.0.0.1:7443 --ca runtime/server.crt --token-file "$run/credentials/admin.token" import --source "$corpus" --name corpus > "$run/import.json"
python3 scripts/sample-metrics.py --bin target/release --endpoint https://127.0.0.1:7443 --ca runtime/server.crt --token-file "$run/credentials/admin.token" --db "$run/db" --pids "$server" --output "$run/resources.jsonl" > "$run/sampler.log" 2>&1 &
echo $! > runtime/network-sampler.pid
mkdir -p runtime/client-export/target/release
for binary in dfs-mount dfs-load dfsctl dfsd dfs-recovery; do
  cp "target/release/$binary" "runtime/client-export/target/release/$binary"
  strip --strip-debug "runtime/client-export/target/release/$binary"
done
tar -czf runtime/client-bundle.tar.gz -C "$PWD/runtime/client-export" target -C "$PWD" Cargo.toml Cargo.lock build.rs src tests proto CONTRACTS DESIGN.md DEPLOYMENT.md scripts vendor runtime/server.crt "$run/credentials/admin.token" "$run/credentials/admin-1.token"
echo success > results/network-ready.txt
