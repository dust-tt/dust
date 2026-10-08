import argparse
from concurrent.futures import ThreadPoolExecutor
import io
import json
from pathlib import Path
import re
import tarfile
import time
from fleet import ROOT, ssh

parser = argparse.ArgumentParser()
parser.add_argument('iteration')
parser.add_argument('--bundle', type=Path, required=True)
parser.add_argument('--backend', action='append', choices=['rocks', 'fdb', 'tikv'])
args = parser.parse_args()
assert re.fullmatch(r'[a-z0-9-]{1,64}', args.iteration)
hosts = json.loads((ROOT / 'results/hosts.json').read_text())
ips = {name: row['networkInterfaces'][0]['networkIP'] for name, row in hosts.items()}


def command(role, text, **kwargs):
    retries = 3 if text == 'tar -xzf - -C /srv/dfs/bin' or text.endswith('.next --help') else 1
    for attempt in range(retries):
        p = ssh(role, text, capture_output=True, **kwargs)
        if p.returncode == 0:
            return p.stdout
        if p.returncode != 255 or b'Connection reset' not in p.stderr:
            break
        print(role, 'retrying interrupted staging transfer/read', attempt + 1, flush=True)
    raise RuntimeError((role, p.stderr.decode(), p.stdout.decode()))


def restart(backend):
    role = backend if backend == 'rocks' else backend + '-a'
    client = backend + '-client'
    command(client, '! mountpoint -q /srv/dfs/mount')
    for target, binary in [(role, 'dfsd-' + backend), (client, 'mount-' + backend)]:
        data = io.BytesIO()
        with tarfile.open(fileobj=data, mode='w:gz') as archive:
            archive.add(args.bundle / binary, arcname=binary + '.next')
        command(target, 'tar -xzf - -C /srv/dfs/bin', input=data.getvalue())
        command(target, 'chmod +x /srv/dfs/bin/' + binary + '.next')
        if target == role:
            help_text = command(role, 'LD_LIBRARY_PATH=/srv/dfs/lib /srv/dfs/bin/' + binary + '.next --help').decode()
            assert '--search-listen' in help_text, (role, 'server lacks required search feature')
            if backend == 'rocks':
                assert '--search-index' in help_text, (role, 'server lacks Tantivy index option')
            stopped = ssh(role, 'sudo systemctl stop dfs-frontend', capture_output=True)
            assert stopped.returncode == 0 or b'Unit dfs-frontend.service not loaded' in stopped.stderr, (role, stopped.stderr.decode())
        command(target, 'chmod +x /srv/dfs/bin/' + binary + '.next && mv /srv/dfs/bin/' + binary + '.next /srv/dfs/bin/' + binary)
    cmd = ['/srv/dfs/bin/dfsd-' + backend, '--credentials', '/srv/dfs/config/credentials.json', '--listen', ips[role] + ':7443', '--tls-cert', '/srv/dfs/config/server.crt', '--tls-key', '/srv/dfs/config/server.key', '--search-listen', '127.0.0.1:7446' if backend == 'rocks' else ips[role] + ':7447']
    if backend == 'rocks':
        directory = '/srv/dfs/data/iterations/' + args.iteration
        command(role, 'test ! -e ' + directory + ' && mkdir -p ' + directory)
        cmd += ['--db', directory + '/rocksdb', '--search-index', directory + '/tantivy', '--search-token-file', '/srv/dfs/config/admin.token']
    else:
        cmd += ['--namespace', 'rework-' + args.iteration, '--cache-bytes', str(64 << 20), '--elasticsearch', ','.join('http://' + ips[backend + '-es-' + z] + ':9200' for z in 'abc'), '--index-tokens', '/srv/dfs/config/admin.token']
        if backend == 'tikv':
            cmd += ['--pd', ','.join(ips['tikv-' + z] + ':2379' for z in 'abc')]
        else:
            cmd += ['--cluster-file', '/srv/dfs/config/fdb.cluster']
    import shlex
    command(role, 'sudo systemd-run --unit dfs-frontend --uid dfs --property=MemoryMax=4G --property=MemorySwapMax=0 --setenv=LD_LIBRARY_PATH=/srv/dfs/lib ' + shlex.join(cmd))
    for attempt in range(60):
        p = ssh(role, 'LD_LIBRARY_PATH=/srv/dfs/lib /srv/dfs/bin/dfsctl --endpoint https://' + ips[role] + ':7443 --token-file /srv/dfs/config/admin.token --ca /srv/dfs/config/ca.crt metrics', capture_output=True)
        if p.returncode == 0:
            evidence = ROOT / 'results' / (args.iteration + '-' + backend + '-frontend.json')
            evidence.write_text(json.dumps({'command': cmd, 'metrics': json.loads(p.stdout)}, indent=2) + '\n')
            print(backend, 'fresh namespace ready; indexing enabled', flush=True)
            return
        time.sleep(1)
    raise RuntimeError(backend + ' frontend did not become ready')


with ThreadPoolExecutor(max_workers=3) as pool:
    list(pool.map(restart, args.backend or ['rocks', 'fdb', 'tikv']))
