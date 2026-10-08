#!/usr/bin/env python3
import hashlib
import json
import pathlib
import tarfile

root = pathlib.Path(__file__).resolve().parents[1]
out = root / 'results/demand'
paths = ['Cargo.toml', 'Cargo.lock', 'build.rs']
paths += [str(p.relative_to(root)) for directory in ('src', 'proto') for p in sorted((root / directory).rglob('*')) if p.is_file() and not p.name.startswith('._')]
current = {p: hashlib.sha256((root / p).read_bytes()).hexdigest() for p in paths}
cloud = json.loads((out / 'server-export/final-source.json').read_text())['files']
with tarfile.open(out / 'source-final.tar.gz') as source:
    archived = {p: hashlib.sha256(source.extractfile(p).read()).hexdigest() for p in paths}
def binaries(path):
    return {pathlib.Path(line.split()[1]).name: line.split()[0] for line in path.read_text().splitlines()}
built = binaries(out / 'server-export/final-binaries.sha256')
measured = binaries(out / 'measured-client-binaries.sha256')
original = json.loads((root / 'results/network-final/source-manifest.json').read_text())['files']
checks = {
    'delivered_production_matches_measured_build': all(current[p] == cloud[p] for p in paths),
    'archived_production_matches_measured_build': archived == current,
    'built_binaries_match_measured_binaries': all(measured[name] == digest for name, digest in built.items()),
    'baseline_binary_matches_archived_measurement': measured['dfs-mount-before'] == (root / 'results/optimization/directory-cache-binary.sha256').read_text().split()[0],
    'measured_vendor_matches_original': all(measured[pathlib.Path(p).name] == original[p] for p in ('vendor/benchmark.py', 'vendor/generate.py')),
    'unchanged_vendor': all(hashlib.sha256((root / p).read_bytes()).hexdigest() == original[p] for p in ('vendor/benchmark.py', 'vendor/generate.py')),
}
print(json.dumps({'checks': checks, 'production_files': current}, indent=2))
assert all(checks.values()), checks
