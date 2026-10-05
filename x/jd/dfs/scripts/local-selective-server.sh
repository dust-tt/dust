#!/usr/bin/env bash
set -euo pipefail
cd /dfs
run=runtime/selective-local
mkdir -p "$run"/{bin,bin-old,nfs} results/selective/local-server
cp runtime/selective-linux-current/bin/* "$run/bin/"
cp runtime/selective-linux-old/bin/* "$run/bin-old/"
"$run/bin/dfsctl" provision --directory "$run/credentials"
python3 - <<'PY'
import hashlib,json,pathlib,secrets,uuid
run=pathlib.Path('runtime/selective-local')
path=run/'credentials/credentials.json'
credentials=json.loads(path.read_text())
token=secrets.token_hex(32)
credentials.append({**credentials[-1],'subject':'carol','principal':uuid.uuid4().hex,'token_hash':hashlib.sha256(token.encode()).hexdigest()})
path.write_text(json.dumps(credentials,indent=2)+'\n')
(run/'credentials/carol.token').write_text(token)
(run/'control.token').write_text(secrets.token_hex(32))
for path in [run/'credentials/carol.token',run/'control.token']:
    path.chmod(0o600)
(run/'principals.json').write_text(json.dumps({c['subject']:c['principal'] for c in credentials},indent=2)+'\n')
pathlib.Path('results/selective/local-server/credential-roles.json').write_text(json.dumps([{k:v for k,v in c.items() if k!='token_hash'} for c in credentials],indent=2)+'\n')
PY
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -keyout "$run/server.key" -out "$run/server.crt" -subj /CN=dfs-selective-local -addext 'subjectAltName=DNS:dfs-selective-local-server,IP:127.0.0.1' -addext 'basicConstraints=critical,CA:FALSE' > "$run/tls.log" 2>&1
chmod 600 "$run/server.key"
"$run/bin/dfsd" --db /var/lib/dfs/db --credentials "$run/credentials/credentials.json" --listen 0.0.0.0:7443 --tls-cert "$run/server.crt" --tls-key "$run/server.key" > results/selective/local-server/server.log 2>&1 &
server_pid=$!
trap 'kill -TERM "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true' EXIT
for attempt in $(seq 1 100); do
  if "$run/bin/dfsctl" --endpoint https://127.0.0.1:7443 --ca "$run/server.crt" --token-file "$run/credentials/admin.token" metrics > results/selective/local-server/initial-metrics.json 2>/dev/null; then break; fi
  sleep 0.1
done
python3 vendor/generate.py /var/lib/dfs/corpus --seed 42 > results/selective/local-server/generate.txt
"$run/bin/dfsctl" --endpoint https://127.0.0.1:7443 --ca "$run/server.crt" --token-file "$run/credentials/admin.token" import --source /var/lib/dfs/corpus --name corpus > results/selective/local-server/import.json
cp /var/lib/dfs/corpus/manifest.json results/selective/local-server/corpus-manifest.json
sha256sum "$run/bin/"* > results/selective/local-server/binaries.sha256
sha256sum "$run/bin-old/"* > results/selective/local-server/old-binaries.sha256
printf 'ready\n' > results/selective/local-server/ready.txt
python3 scripts/grant-agent.py --run "$run" --bin "$run/bin"
