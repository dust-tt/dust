#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
run=runtime/data/controlled
mkdir -p "$run/credentials" results/optimization
mountpoint -q runtime/data
if ! test -f "$run/credentials/credentials.json"; then target/release/dfsctl provision --directory "$run/credentials" --tenants 2; fi
openssl req -x509 -newkey rsa:2048 -nodes -days 3 -keyout "$run/server.key" -out "$run/server.crt" -subj /CN=dfs-opt -addext 'subjectAltName=IP:10.128.0.6,IP:127.0.0.1,DNS:localhost' -addext 'basicConstraints=critical,CA:FALSE'
chmod 600 "$run/server.key"
if ! test -d "$run/corpus"; then python3 vendor/generate.py "$run/corpus" --seed 42 > "$run/generate.txt"; fi
RUST_LOG=info nohup target/release/dfsd --db "$run/db" --credentials "$run/credentials/credentials.json" --listen 0.0.0.0:7443 --tls-cert "$run/server.crt" --tls-key "$run/server.key" > "$run/server.log" 2>&1 < /dev/null &
echo "$!" > "$run/server.pid"
common=(--endpoint https://127.0.0.1:7443 --ca "$run/server.crt" --token-file "$run/credentials/admin.token")
for attempt in $(seq 1 100); do
  if target/release/dfsctl "${common[@]}" metrics > "$run/metrics-start.json" 2>/dev/null; then break; fi
  sleep 0.1
done
target/release/dfsctl "${common[@]}" import --source "$run/corpus" --name corpus > "$run/import.json"
tar -czf runtime/controlled-client-bundle.tar.gz target/release/dfsd target/release/dfsctl target/release/dfs-mount target/release/dfs-load target/release/dfs-recovery "$run/server.crt" "$run/credentials/admin.token" "$run/credentials/admin-1.token"
python3 scripts/fingerprint.py > results/optimization/server-source-manifest.json
sha256sum target/release/dfsd target/release/dfs-mount > results/optimization/server-binaries.sha256
echo success > results/optimization/server-ready.txt
