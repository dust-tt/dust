import hashlib
import json
from pathlib import Path
import secrets
import subprocess
import sys
import time

hosts = json.loads(Path(sys.argv[1]).read_text())
root = Path(sys.argv[2])
root.mkdir(parents=True, exist_ok=False)
ips = {name: row['networkInterfaces'][0]['networkIP'] for name, row in hosts.items()}


def run(*args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


run('openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(root / 'ca.key'), '-out', str(root / 'ca.crt'), '-days', '7', '-subj', '/CN=DFS clean benchmark')
for backend in ('rocks', 'fdb', 'tikv'):
    path = root / backend
    path.mkdir()
    host = backend if backend == 'rocks' else backend + '-a'
    token = secrets.token_urlsafe(32)
    (path / 'admin.token').write_text(token)
    (path / 'admin.token').chmod(0o600)
    credential = dict(token_hash=hashlib.sha256(token.encode()).hexdigest(), tenant='bench', issuer='benchmark', subject='owner', principal='owner', admin=True, scope=None, expires_ms=int(time.time() * 1000) + 86400000)
    (path / 'credentials.json').write_text(json.dumps([credential]))
    (path / 'ca.crt').write_bytes((root / 'ca.crt').read_bytes())
    run('openssl', 'req', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(path / 'server.key'), '-out', str(path / 'server.csr'), '-subj', '/CN=' + host)
    (path / 'extensions').write_text('subjectAltName=IP:' + ips[host] + ',DNS:' + host + '\n')
    run('openssl', 'x509', '-req', '-in', str(path / 'server.csr'), '-CA', str(root / 'ca.crt'), '-CAkey', str(root / 'ca.key'), '-CAcreateserial', '-out', str(path / 'server.crt'), '-days', '7', '-extfile', str(path / 'extensions'))
    (path / 'server.key').chmod(0o600)
    settings = dict(backend=backend, endpoint='https://' + ips[host] + ':7443', search_host=ips[host], search_port=7447, tenant='bench', content_cache_bytes=256 << 20, metadata_cache_bytes=128 << 20, warm_runs=3, search_repeats=10)
    (path / 'client.json').write_text(json.dumps(settings, indent=2) + '\n')
connection = 'dfs_clean:jd20261006@' + ','.join(ips['fdb-' + zone] + ':4550' for zone in 'abc')
(root / 'fdb/fdb.cluster').write_text(connection + '\n')
