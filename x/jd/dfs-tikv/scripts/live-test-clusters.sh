#!/usr/bin/env bash
set -euo pipefail
root=/home/dfs/dfs-tikv/runtime/live-test-clusters
mkdir -p "$root" results/live-cache
sudo apt-get install -y -qq docker.io > "$root/docker-install.log" 2>&1
sudo docker pull pingcap/pd:v8.5.3 > "$root/pd-pull.log" 2>&1
sudo docker pull pingcap/tikv:v8.5.3 > "$root/tikv-pull.log" 2>&1
for backend in txnkv; do
    pd_port=2479
    peer_port=2480
    kv_port=21160
    status_port=21180
    mkdir -p "$root/$backend/pd" "$root/$backend/tikv"
    cat > "$root/$backend/config.toml" <<'CONFIG'
[storage]
reserve-space = "256MB"
[storage.block-cache]
capacity = "512MB"
[raftstore]
sync-log = true
CONFIG
    if ! sudo docker inspect "live-$backend-pd" >/dev/null 2>&1; then
    sudo docker run -d --name "live-$backend-pd" --network host --memory 1g -v "$root/$backend/pd:/data" pingcap/pd:v8.5.3 --name="$backend" --data-dir=/data --client-urls="http://127.0.0.1:$pd_port" --advertise-client-urls="http://127.0.0.1:$pd_port" --peer-urls="http://127.0.0.1:$peer_port" --advertise-peer-urls="http://127.0.0.1:$peer_port" --initial-cluster="$backend=http://127.0.0.1:$peer_port"
    else
        sudo docker start "live-$backend-pd"
    fi
    for attempt in $(seq 1 60); do
        if curl -fsS "http://127.0.0.1:$pd_port/health" > "$root/$backend/health.json"; then break; fi
        sleep 1
    done
    if ! sudo docker inspect "live-$backend-tikv" >/dev/null 2>&1; then
    sudo docker run -d --name "live-$backend-tikv" --network host --memory 3g -v "$root/$backend/tikv:/data" -v "$root/$backend/config.toml:/config.toml:ro" pingcap/tikv:v8.5.3 --config=/config.toml --addr="127.0.0.1:$kv_port" --advertise-addr="127.0.0.1:$kv_port" --status-addr="127.0.0.1:$status_port" --pd="127.0.0.1:$pd_port" --data-dir=/data
    else
        sudo docker start "live-$backend-tikv"
    fi
done
python3 - <<'PY'
import json,time,urllib.request
from pathlib import Path
states={}
for backend,port in [('txnkv',2479)]:
    deadline=time.monotonic()+90
    while True:
        try:
            data=json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/pd/api/v1/regions',timeout=3))
            if data['regions'] and all(region.get('leader',{}).get('store_id') for region in data['regions']):
                request=urllib.request.Request(f'http://127.0.0.1:{port}/pd/api/v1/config/replicate', data=b'{"max-replicas":1}', headers={'Content-Type':'application/json'},method='POST')
                urllib.request.urlopen(request,timeout=3).read()
                states[backend]=data
                break
        except Exception:
            pass
        assert time.monotonic()<deadline, backend+' readiness expired'
        time.sleep(1)
Path('results/live-cache/test-cluster-readiness.json').write_text(json.dumps(dict(passed=True,replicas=1,purpose='isolated functional tests, not durability or performance evidence',clusters=states),indent=2)+'\n')
PY
