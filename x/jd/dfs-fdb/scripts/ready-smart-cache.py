import json
from pathlib import Path
import subprocess
import time
import urllib.request

base = Path(__file__).resolve().parents[1]
deployment = json.loads((base / 'runtime/deployment.json').read_text())
address = deployment['nodes']['a']
deadline = time.monotonic() + 900
while True:
    evidence = {}
    try:
        for backend, port in [('rawkv', 2379), ('txnkv', 2479)]:
            prefix = f'http://{address}:{port}/pd/api/v1'
            state = {name: json.load(urllib.request.urlopen(prefix + path, timeout=5)) for name, path in [('stores', '/stores'), ('replication', '/config/replicate'), ('regions', '/regions')]}
            state['ready'] = (state['stores']['count'] == 3
                and all(store['store']['state_name'] == 'Up' for store in state['stores']['stores'])
                and state['replication']['max-replicas'] == 3
                and bool(state['regions']['regions'])
                and all(len(region['peers']) == 3 and region.get('leader', {}).get('store_id') for region in state['regions']['regions']))
            evidence[backend] = state
        fdb = json.loads(subprocess.check_output([str(base / 'runtime/fdb/bin/fdbcli'), '-C', str(base / 'runtime/fdb/fdb.cluster'), '--exec', 'status json', '--timeout', '15'], text=True))
        evidence['fdb'] = fdb
        if all(evidence[name]['ready'] for name in ['rawkv', 'txnkv']) and fdb['client']['database_status']['available'] and fdb['client']['database_status']['healthy'] and fdb['cluster']['configuration']['redundancy_mode'] == 'triple':
            break
    except (OSError, subprocess.CalledProcessError) as error:
        print(str(error), flush=True)
    if time.monotonic() >= deadline:
        raise RuntimeError('three-host cluster readiness expired')
    time.sleep(5)
(base / 'results/smart-cache/cluster-readiness.json').write_text(json.dumps(dict(passed=True, checked_at_ms=int(time.time() * 1000), deployment=deployment, observations=evidence), indent=2) + '\n')
print('All three distributed clusters are healthy and replicated across three stores', flush=True)
