from concurrent.futures import ThreadPoolExecutor
import json
import time
from fleet import ROOT, ssh

hosts = json.loads((ROOT / 'results/hosts.json').read_text())
ips = {name: row['networkInterfaces'][0]['networkIP'] for name, row in hosts.items()}


def command(role, text):
    p = ssh(role, text, capture_output=True)
    if p.returncode:
        raise RuntimeError(role + ': ' + p.stderr.decode() + p.stdout.decode())
    return p.stdout


result = command('fdb-a', '/srv/dfs/bin/fdbcli -C /srv/dfs/config/fdb.cluster --exec "configure new triple ssd" --timeout 30')
(ROOT / 'results/fdb-configure.log').write_bytes(result)


def health(backend):
    if backend == 'tikv':
        role = 'tikv-a'
        url = 'http://' + ips[role] + ':2379/pd/api/v1/stores'
    else:
        role = ('tikv' if backend == 'tikv-es' else backend) + '-es-a'
        url = 'http://' + ips[role] + ':9200/_cluster/health?wait_for_nodes=3&wait_for_status=green&timeout=5s'
    for attempt in range(120):
        p = ssh(role, "curl -fsS --max-time 10 '" + url + "'", capture_output=True)
        if p.returncode == 0:
            data = json.loads(p.stdout)
            valid = len(data.get('stores', [])) == 3 and all(s['store']['state_name'] == 'Up' for s in data['stores']) if backend == 'tikv' else data.get('status') == 'green' and data.get('number_of_nodes') == 3
            if valid:
                (ROOT / ('results/health-' + backend + '.json')).write_bytes(p.stdout)
                return
        time.sleep(2)
    raise RuntimeError('cluster readiness: ' + backend)


with ThreadPoolExecutor(max_workers=3) as pool:
    list(pool.map(health, ['tikv', 'fdb', 'tikv-es']))


def frontend(backend):
    role = backend if backend == 'rocks' else backend + '-a'
    text = 'python3 /srv/dfs/scripts/node.py ' + role + ' frontend'
    (ROOT / ('results/frontend-' + backend + '.log')).write_bytes(command(role, text))
    ctl = '/srv/dfs/bin/dfsctl --endpoint https://' + ips[role] + ':7443 --token-file /srv/dfs/config/admin.token --ca /srv/dfs/config/ca.crt metrics'
    for attempt in range(120):
        p = ssh(role, 'LD_LIBRARY_PATH=/srv/dfs/lib ' + ctl, capture_output=True)
        if p.returncode == 0:
            (ROOT / ('results/ready-' + backend + '.json')).write_bytes(p.stdout)
            return
        time.sleep(1)
    raise RuntimeError('frontend readiness: ' + backend)


with ThreadPoolExecutor(max_workers=3) as pool:
    list(pool.map(frontend, ['rocks', 'fdb', 'tikv']))
print('All three frontends ready with indexing enabled', flush=True)
