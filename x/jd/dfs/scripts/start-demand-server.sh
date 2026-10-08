#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
server_ip=$1
run=runtime/data/demand
mkdir -p "$run/credentials" results/demand
mountpoint -q runtime/data
test ! -f "$run/server.pid"
target/release/dfsctl provision --directory "$run/credentials" --tenants 2
openssl req -x509 -newkey rsa:2048 -nodes -days 3 -keyout "$run/server.key" -out "$run/server.crt" -subj /CN=dfs-demand -addext "subjectAltName=IP:$server_ip,IP:127.0.0.1,DNS:localhost" -addext 'basicConstraints=critical,CA:FALSE' > "$run/tls.log" 2>&1
chmod 600 "$run/server.key"
RUST_LOG=info nohup target/release/dfsd --db "$run/db" --credentials "$run/credentials/credentials.json" --listen 0.0.0.0:7443 --tls-cert "$run/server.crt" --tls-key "$run/server.key" > "$run/server.log" 2>&1 < /dev/null &
echo "$!" > "$run/server.pid"
common=(--endpoint https://127.0.0.1:7443 --ca "$run/server.crt")
for attempt in $(seq 1 100); do
  if target/release/dfsctl "${common[@]}" --token-file "$run/credentials/admin.token" metrics > "$run/metrics-start.json" 2>/dev/null; then break; fi
  sleep 0.1
done
python3 vendor/generate.py "$run/corpus" --seed 42 > "$run/generate.txt"
target/release/dfsctl "${common[@]}" --token-file "$run/credentials/admin.token" import --source "$run/corpus" --name corpus > "$run/import.json"
printf 'small ready\n' > results/demand/server-small-ready.txt
python3 vendor/generate.py "$run/large" --seed 42 --filler-lines 4096 > "$run/generate-large.txt"
target/release/dfsctl "${common[@]}" --token-file "$run/credentials/admin-1.token" import --source "$run/large" --name large > "$run/import-large.json"
printf 'large ready\n' > results/demand/server-large-ready.txt
