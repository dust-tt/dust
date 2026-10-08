import hashlib
import json
from pathlib import Path
import subprocess
import tarfile
import time
import urllib.request

base = Path('/srv/dfs')
out = base / 'evidence/final'
out.mkdir(exist_ok=True)
role = subprocess.check_output(['hostname'], text=True).strip().split('.')[0].removeprefix('dfs-clean-jd-20261006-')
hosts = json.loads((base / 'config/hosts.json').read_text())
ip = hosts[role]['networkInterfaces'][0]['networkIP']
secrets = [(base / 'config/admin.token').read_text().strip()] if (base / 'config/admin.token').exists() else []


def command(name, args):
    reply = subprocess.run(args, capture_output=True, text=True, timeout=120)
    record = {'command': args, 'exit_code': reply.returncode, 'stdout': reply.stdout, 'stderr': reply.stderr}
    serialized = json.dumps(record, indent=2)
    for secret in secrets:
        if secret:
            serialized = serialized.replace(secret, '[REDACTED]')
    (out / name).write_text(serialized + '\n')
    return reply


def get(name, port, route):
    with urllib.request.urlopen('http://' + ip + ':' + str(port) + route, timeout=60) as response:
        payload = response.read()
        json.loads(payload)
        (out / name).write_bytes(payload)


command('services.json', ['systemctl', 'show', 'dfs-frontend', 'dfs-storage', 'dfs-search-proxy', 'dfs-benchmark', '--property=ActiveState,SubState,ExecStart,MemoryMax,MemorySwapMax,MemoryPeak,CPUUsageNSec,ControlGroup'])
command('service-definitions.json', ['systemctl', 'cat', 'dfs-frontend', 'dfs-storage', 'dfs-search-proxy', 'dfs-benchmark'])
command('frontend-log.json', ['sudo', 'journalctl', '-u', 'dfs-frontend', '-n', '2000', '--no-pager'])
command('mounts.json', ['findmnt', '-J', '-T', '/srv/dfs'])
command('disk-usage.json', ['df', '-B1', '/srv/dfs'])
command('clock.json', ['timedatectl', 'show', '--property=NTPSynchronized'])
containers = subprocess.check_output(['sudo', 'docker', 'ps', '-aq'], text=True).split()
if containers:
    rows = json.loads(subprocess.check_output(['sudo', 'docker', 'inspect', *containers]))
    safe = [{k: row[k] for k in ('Id', 'Name', 'Image', 'State', 'Mounts', 'Path', 'Args')} | {'Memory': row['HostConfig']['Memory'], 'MemorySwap': row['HostConfig']['MemorySwap'], 'ImageName': row['Config']['Image']} for row in rows]
    (out / 'containers.json').write_text(json.dumps(safe, indent=2) + '\n')
    command('container-stats.json', ['sudo', 'docker', 'stats', '--no-stream', '--format', '{{json .}}'])
if '-es-' in role:
    for name, route in [('es-health.json', '/_cluster/health'), ('es-nodes.json', '/_nodes/settings'), ('es-indices.json', '/_cat/indices?format=json'), ('es-shards.json', '/_cat/shards?format=json'), ('es-settings.json', '/_settings')]:
        get(name, 9200, route)
elif role in ('tikv-a', 'tikv-b', 'tikv-c'):
    for name, route in [('pd-stores.json', '/pd/api/v1/stores'), ('pd-replication.json', '/pd/api/v1/config/replicate'), ('pd-members.json', '/pd/api/v1/members')]:
        get(name, 2379, route)
elif role in ('fdb-a', 'fdb-b', 'fdb-c'):
    command('fdb-status.json', ['/srv/dfs/bin/fdbcli', '-C', '/srv/dfs/config/fdb.cluster', '--exec', 'status json'])
identity = {'time': time.time(), 'role': role, 'files': {}}
if role.endswith('-client'):
    with tarfile.open(base / 'corpus.tar', mode='r:') as archive:
        members = archive.getmembers()
    archive_identity = {'bytes': (base / 'corpus.tar').stat().st_size, 'members': len(members), 'ordered_names_sha256': hashlib.sha256('\n'.join(member.name for member in members).encode()).hexdigest()}
    (out / 'archive-identity.json').write_text(json.dumps(archive_identity, indent=2) + '\n')
for directory in ('bin', 'lib', 'scripts', 'vendor'):
    for path in sorted((base / directory).glob('*')):
        if path.is_file():
            identity['files'][str(path.relative_to(base))] = hashlib.file_digest(path.open('rb'), 'sha256').hexdigest()
(out / 'identity.json').write_text(json.dumps(identity, indent=2) + '\n')
