import json
from pathlib import Path
import subprocess

base = Path('/home/dfs/dfs-fdb')
address = json.loads((base / 'runtime/deployment.json').read_text())['nodes']['a']
root = base / 'runtime/tls'
root.mkdir(mode=0o700, parents=True, exist_ok=True)
assert not (root / 'server.pem').exists()
(root / 'server.ext').write_text(f'subjectAltName=IP:{address},IP:127.0.0.1,DNS:localhost\nextendedKeyUsage=serverAuth\n')
for command in [
    ['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.pem', '-days', '7', '-subj', '/CN=DFS isolated benchmark CA'],
    ['openssl', 'req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'server.key', '-out', 'server.csr', '-subj', '/CN=DFS isolated benchmark'],
    ['openssl', 'x509', '-req', '-in', 'server.csr', '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'server.pem', '-days', '7', '-extfile', 'server.ext'],
]:
    subprocess.run(command, cwd=root, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for name in ['ca.key', 'server.key']:
    (root / name).chmod(0o600)
