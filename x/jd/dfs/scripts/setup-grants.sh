#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
role=$1
server_ip=$2
sudo apt-get update -qq
sudo apt-get install -y -qq nfs-common fuse3 ripgrep python3 openssl acl
sudo mount --make-rprivate /
if ! rg -q '^user_allow_other$' /etc/fuse.conf; then
  printf 'user_allow_other\n' | sudo tee -a /etc/fuse.conf > /dev/null
fi
mkdir -p runtime/grants/bin runtime/grants/nfs results/grants
mkdir -p runtime/grants/storage
device=/dev/disk/by-id/google-dfs-data
if ! test -b "$device"; then device=/dev/disk/by-id/scsi-0Google_PersistentDisk_dfs-data; fi
if ! mountpoint -q runtime/grants/storage; then
  if ! sudo blkid "$device" > /dev/null; then sudo mkfs.ext4 -F "$device"; fi
  sudo mount "$device" runtime/grants/storage
  sudo chown "$(id -u):$(id -g)" runtime/grants/storage
fi
tar -xzf grants-binaries.tar.gz -C runtime/grants/bin
sha256sum runtime/grants/bin/* > results/grants/binaries.sha256
python3 scripts/fingerprint.py > results/grants/source.json
uname -a > results/grants/kernel.txt
rg --version > results/grants/rg-version.txt
if test "$role" = server; then
  runtime/grants/bin/dfsctl provision --directory runtime/grants/credentials
  python3 - <<'PY'
import hashlib,json,pathlib,secrets,uuid
run=pathlib.Path('runtime/grants')
path=run/'credentials/credentials.json'
credentials=json.loads(path.read_text())
token=secrets.token_hex(32)
carol={**credentials[-1],'subject':'carol','principal':uuid.uuid4().hex,'token_hash':hashlib.sha256(token.encode()).hexdigest()}
credentials.append(carol)
path.write_text(json.dumps(credentials,indent=2)+'\n')
(run/'credentials/carol.token').write_text(token)
(run/'control.token').write_text(secrets.token_hex(32))
for path in [run/'credentials/carol.token',run/'control.token']:
    path.chmod(0o600)
(run/'principals.json').write_text(json.dumps({c['subject']:c['principal'] for c in credentials},indent=2)+'\n')
PY
  openssl req -x509 -newkey rsa:2048 -nodes -days 2 -keyout runtime/grants/server.key -out runtime/grants/server.crt -subj /CN=dfs-grants -addext "subjectAltName=IP:$server_ip,IP:127.0.0.1,DNS:localhost" -addext 'basicConstraints=critical,CA:FALSE' > runtime/grants/tls.log 2>&1
  chmod 600 runtime/grants/server.key
  sudo systemd-run --unit=dfs-grants-server --uid=dfs --working-directory="$PWD" "$PWD/runtime/grants/bin/dfsd" --db runtime/grants/storage/db --credentials runtime/grants/credentials/credentials.json --listen 0.0.0.0:7443 --tls-cert runtime/grants/server.crt --tls-key runtime/grants/server.key
  for attempt in $(seq 1 100); do
    if runtime/grants/bin/dfsctl --endpoint https://127.0.0.1:7443 --ca runtime/grants/server.crt --token-file runtime/grants/credentials/admin.token metrics > results/grants/initial-metrics.json 2>/dev/null; then break; fi
    sleep 0.1
  done
  python3 vendor/generate.py runtime/grants/corpus --seed 42 > results/grants/generate.txt
  runtime/grants/bin/dfsctl --endpoint https://127.0.0.1:7443 --ca runtime/grants/server.crt --token-file runtime/grants/credentials/admin.token import --source runtime/grants/corpus --name corpus > results/grants/import.json
  tar -czf runtime/grants-client-bundle.tar.gz runtime/grants/credentials/*.token runtime/grants/control.token runtime/grants/principals.json runtime/grants/server.crt
fi
printf 'ready\n' > "results/grants/$role-ready.txt"
