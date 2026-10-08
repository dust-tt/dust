#!/usr/bin/env python3
import gzip
import io
import pathlib
import tarfile

root = pathlib.Path(__file__).resolve().parents[1]
secrets = set()
for directory in ('runtime', 'cloud'):
    for path in (root / directory).rglob('*.token'):
        if path.is_file():
            value = path.read_bytes().strip()
            if len(value) >= 32:
                secrets.add(value)
for path in (root / 'cloud').glob('*client*.tar.gz'):
    with tarfile.open(path) as archive:
        for member in archive:
            if member.isfile() and member.name.endswith('.token'):
                value = archive.extractfile(member).read().strip()
                if len(value) >= 32:
                    secrets.add(value)
assert secrets, 'no known credentials found for the scan'
hits = []
count = 0
marker = b'-----BEGIN ' + b'PRIVATE KEY-----'

def inspect(name, data):
    global count
    count += 1
    if any(secret in data for secret in secrets) or marker in data:
        hits.append(name)
    if name.endswith(('.tar.gz', '.tgz')):
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
            for member in archive:
                if member.isfile():
                    inspect(name + ':' + member.name, archive.extractfile(member).read())
    elif name.endswith('.gz'):
        inspect(name[:-3], gzip.decompress(data))

for path in root.rglob('*'):
    if path.is_file() and not {'runtime', 'cloud', 'target', '__pycache__'}.intersection(path.relative_to(root).parts) and not path.name.startswith('._'):
        inspect(str(path.relative_to(root)), path.read_bytes())
assert not hits, hits
print(f'Checked {count} files/archive members against {len(secrets)} known credentials; no credential or private-key matches')
