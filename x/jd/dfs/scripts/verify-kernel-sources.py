#!/usr/bin/env python3
import gzip
import hashlib
import json
import pathlib
import tarfile

root = pathlib.Path(__file__).resolve().parents[1]
out = root / 'results/kernel-cache'
selected = json.loads((out / 'production-source-check.json').read_text())['files']
current = {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in selected}
server = json.loads((out / 'server/source.json').read_text())['files']
server_final = json.loads((out / 'server/source-final.json').read_text())['files']
client = json.loads((out / 'client/source-final.json').read_text())['files']


def digests(path):
    return {line.split()[1]: line.split()[0] for line in path.read_text().splitlines()}


built = {pathlib.Path(name).name: value for name, value in digests(out / 'server/binaries.sha256').items()}
measured = {pathlib.Path(name).name: value for name, value in digests(out / 'client/measured-binaries.sha256').items()}
original = json.loads((root / 'results/network-final/source-manifest.json').read_text())['files']
manifests = {}
for corpus in ('corpus', 'large'):
    manifests[corpus] = hashlib.sha256(gzip.decompress((out / f'client/{corpus}-manifest.json.gz').read_bytes())).hexdigest()
manifest_checks = {}
for side, path in [('server', out / 'server/server-manifests.sha256'), ('client', out / 'client/manifests.sha256')]:
    values = digests(path)
    assert len(values) == (2 if side == 'server' else 6)
    manifest_checks[side] = all(value == manifests[pathlib.Path(name).parent.name] for name, value in values.items())
checks = {
    'delivered_source_matches_build': all(current[name] == server[name] for name in current),
    'measured_client_source_matches_build': all(client[name] == server[name] for name in current),
    'server_source_unchanged_during_matrix': all(server_final[name] == server[name] for name in current),
    'production_unchanged_during_matrix': current == selected,
    'measured_binaries_match_build': all(measured[name] == value for name, value in built.items()),
    'running_server_matches_build': (out / 'server/running-server.sha256').read_text().split()[0] == built['dfsd'],
    'vendor_unchanged': all(current[name] == original[name] == measured[pathlib.Path(name).name] for name in ('vendor/benchmark.py', 'vendor/generate.py')),
    'server_client_native_nfs_manifests_agree': all(manifest_checks.values()),
}
runs = [json.loads(path.read_text()) for path in (out / 'client/matrix').glob('*/result.json')]
checks['all_runs_use_matching_oracles'] = len(runs) == 75 and all(run['manifest_sha256'] == manifests[run['corpus']] for run in runs)
assert all(checks.values()), checks
with tarfile.open(out / 'measured-source.tar.gz', 'w:gz') as archive:
    for name in sorted(current):
        archive.add(root / name, arcname=name)
(out / 'source-check.json').write_text(json.dumps({'passed': True, 'checks': checks, 'files': current, 'binaries': built, 'manifests': manifests}, indent=2) + '\n')
print(json.dumps(checks, indent=2))
