#!/usr/bin/env bash
set -euo pipefail
test "$(hostname -s)" = dfs-tantivy-jd-20261002-server
server_ip=${1:?server private IP required}
experiment=/home/dfs/x/jd/dfs
run="$experiment/runtime/search-cloud"
source="$experiment/runtime/tantivy-source"
binary="$experiment/runtime/data/tantivy-target/release/dfsd"
test -s "$source/results/search-cloud/tantivy/binary.sha256"
mkdir -p "$run/tantivy-bin" "$run/bin" "$run/credentials" "$experiment/runtime/tantivy-corpus"
chmod 700 "$run/credentials"
install -m 755 "$experiment/runtime/data/tantivy-target/release/dfsctl" "$run/bin/dfsctl"
if ! test -f "$run/credentials/credentials.json"; then
  "$run/bin/dfsctl" provision --directory "$run/credentials" --tenants 2
fi
if ! test -f "$run/server.crt"; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 7 -keyout "$run/server.key" -out "$run/server.crt" -subj /CN=dfs-tantivy-poc -addext "subjectAltName=IP:$server_ip,IP:127.0.0.1,DNS:localhost" -addext 'basicConstraints=critical,CA:FALSE' > "$run/tls.log" 2>&1
  chmod 600 "$run/server.key"
fi
install -m 755 "$binary" "$run/tantivy-bin/dfsd"
sudo tee /etc/systemd/system/dfs-search-tantivy.service >/dev/null <<UNIT
[Unit]
Description=Isolated embedded Tantivy DFS experiment
After=network-online.target
RequiresMountsFor=$experiment/runtime/data
[Service]
User=dfs
WorkingDirectory=$source
Environment=RUST_LOG=info,tantivy=warn
ExecStart=$run/tantivy-bin/dfsd --db $experiment/runtime/data/tantivy-dfs --credentials $run/credentials/credentials.json --listen 127.0.0.1:7453 --search-index $experiment/runtime/data/tantivy-index --search-token-file $run/credentials/admin.token --search-listen 127.0.0.1:7447
Restart=on-failure
RestartSec=2
MemoryMax=8G
TimeoutStopSec=90
[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now dfs-search-tantivy
sudo tee /etc/nginx/sites-available/dfs-search >/dev/null <<NGINX
server {
    listen $server_ip:7444 ssl;
    server_name _;
    ssl_certificate $run/server.crt;
    ssl_certificate_key $run/server.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 16k;
    location ~ ^/(lexical/|v1/workspaces/[^/]+/lexical/) {
        proxy_pass http://127.0.0.1:7447;
        proxy_set_header Authorization \$http_authorization;
        proxy_set_header Host \$host;
        proxy_read_timeout 15s;
    }
    location / {
        return 404;
    }
}
NGINX
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sfn /etc/nginx/sites-available/dfs-search /etc/nginx/sites-enabled/dfs-search
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
python3 - <<'PYTHON'
import json
from pathlib import Path
run = Path('/home/dfs/x/jd/dfs/runtime/search-cloud')
credentials = json.loads((run / 'credentials/credentials.json').read_text())
public = [{k: v for k, v in row.items() if k != 'token_hash'} for row in credentials]
(run / 'identities.json').write_text(json.dumps(public, indent=2) + '\n')
PYTHON
umask 077
tar -czf "$run/client-bundle.tar.gz" -C "$run" server.crt identities.json credentials/admin.token credentials/alice.token credentials/bob.token credentials/admin-1.token
chmod 600 "$run/client-bundle.tar.gz"
