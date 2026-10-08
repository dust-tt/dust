from concurrent.futures import ThreadPoolExecutor
import io
import json
from pathlib import Path
import tarfile
from fleet import ROOT, ssh

hosts = json.loads((ROOT / 'results/hosts.json').read_text())


def collect(role):
    result = ssh(role, 'python3 -', input=(ROOT / 'scripts/snapshot.py').read_bytes(), capture_output=True)
    assert result.returncode == 0, (role, result.stderr.decode())
    paths = ['evidence'] + (['control'] if role.endswith('-client') else [])
    result = ssh(role, 'tar -czf - -C /srv/dfs ' + ' '.join(paths), capture_output=True)
    assert result.returncode == 0, (role, result.stderr.decode())
    destination = ROOT / 'results/hosts' / role
    destination.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(result.stdout), mode='r:gz') as archive:
        for member in archive.getmembers():
            assert member.isfile() or member.isdir()
            assert not Path(member.name).is_absolute() and '..' not in Path(member.name).parts
        archive.extractall(destination)
    print(role, 'collected', flush=True)


for backend in ('rocks', 'fdb', 'tikv'):
    result = ssh(backend + '-client', 'cat /srv/dfs/control/finished.json', capture_output=True)
    assert result.returncode == 0 and json.loads(result.stdout)['passed'], backend
with ThreadPoolExecutor(max_workers=8) as pool:
    list(pool.map(collect, hosts))
