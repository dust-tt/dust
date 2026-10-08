#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mountpoint -q runtime/data
run=runtime/data/network
mkdir -p "$run/credentials"
if ! test -f "$run/credentials/credentials.json"; then target/release/dfsctl provision --directory "$run/credentials" --tenants 2; fi
chmod 600 runtime/server.key
exec env RUST_LOG=info target/release/dfsd --db "$run/db" --credentials "$run/credentials/credentials.json" --listen 0.0.0.0:7443 --tls-cert runtime/server.crt --tls-key runtime/server.key
