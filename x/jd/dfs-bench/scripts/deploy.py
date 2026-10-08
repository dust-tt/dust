from concurrent.futures import ThreadPoolExecutor
import io
import json
from pathlib import Path
import tarfile
from fleet import ROOT, WORKSPACE, ssh

bundle = Path('/tmp/dfs-clean-bundle')
configs = ROOT / '.runtime/config'
hosts = json.loads((ROOT / 'results/hosts.json').read_text())


def deploy(role):
    backend = role.split('-')[0]
    paths = [(ROOT / 'results/hosts.json', 'config/hosts.json'), (ROOT / 'scripts/node.py', 'scripts/node.py')]
    names = []
    if role.endswith('-client'):
        names = ['mount-' + backend, 'dfsctl']
        paths += [(WORKSPACE / 'dfs/vendor' / name, 'vendor/' + name) for name in ('generate.py', 'benchmark.py')]
        paths += [(ROOT / 'scripts/workloads.py', 'scripts/workloads.py')]
        paths += [(configs / backend / name, 'config/' + name) for name in ('admin.token', 'ca.crt', 'client.json')]
    elif role == 'rocks' or role in ('fdb-a', 'tikv-a'):
        names = ['dfsd-' + backend, 'dfsctl']
        paths += [(configs / backend / name, 'config/' + name) for name in ('admin.token', 'ca.crt', 'server.crt', 'server.key', 'credentials.json', 'client.json')]
    if role in ('fdb-a', 'fdb-b', 'fdb-c'):
        names += ['fdbserver', 'fdbcli']
        paths += [(configs / 'fdb/fdb.cluster', 'config/fdb.cluster')]
    if backend == 'fdb' and '-es-' not in role:
        paths += [(bundle / 'lib/libfdb_c.so', 'lib/libfdb_c.so')]
    paths += [(bundle / 'bin' / name, 'bin/' + name) for name in names]
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode='w:gz') as archive:
        for path, name in paths:
            archive.add(path, arcname=name)
    p = ssh(role, 'tar -xzf - -C /srv/dfs', input=stream.getvalue(), capture_output=True)
    if p.returncode:
        raise RuntimeError(role + ': ' + p.stderr.decode())
    print(role, 'deployed', flush=True)


with ThreadPoolExecutor(max_workers=16) as pool:
    list(pool.map(deploy, hosts))
