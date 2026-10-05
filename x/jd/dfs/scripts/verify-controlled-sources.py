#!/usr/bin/env python3
import hashlib
import json
import pathlib
import tarfile

root = pathlib.Path(__file__).resolve().parents[1]
out = root / 'results' / 'optimization'
original_paths = json.loads((root / 'results/network-final/source-manifest.json').read_text())['files']
paths = sorted(path for path in original_paths if not any(part.startswith('._') for part in pathlib.Path(path).parts) and (path in ('Cargo.toml', 'Cargo.lock', 'build.rs') or path.startswith(('src/', 'proto/'))))


def digest(data):
    return hashlib.sha256(data).hexdigest()


def archive(name):
    with tarfile.open(out / name) as source:
        return {path: digest(source.extractfile(path).read()) for path in paths}


def manifest(path):
    data = json.loads(path.read_text())['files']
    return {path: data[path] for path in paths}


before = archive('source-before.tar.gz')
metadata = archive('source-metadata.tar.gz')
read_path = archive('source-read-path.tar.gz')
adaptive = archive('source-adaptive.tar.gz')
current = {path: digest((root / path).read_bytes()) for path in paths}
with tarfile.open(root / 'results/demand/source-before.tar.gz') as source:
    directory_cache = {path: digest(source.extractfile(path).read()) for path in paths}
checks = {
    'original_source_matches_original_cloud_run': before == manifest(root / 'results/network-final/source-manifest.json'),
    'metadata_source_matches_controlled_client': metadata == manifest(out / 'client-source-manifest.json'),
    'read_path_source_matches_candidate_build': read_path == manifest(out / 'read-path-source-manifest.json'),
    'adaptive_source_matches_candidate_build': adaptive == manifest(out / 'adaptive-source-manifest.json'),
    'archived_directory_cache_matches_final_candidate_build': directory_cache == manifest(out / 'directory-cache-source-manifest.json'),
    'final_candidate_binary_matches_measured_binary': (out / 'directory-cache-binary.sha256').read_text().split()[0] == (out / 'directory-cache/binaries-source.sha256').read_text().split()[0],
}
server_paths = ['src/bin/dfsd.rs', 'src/engine.rs', 'src/store.rs', 'src/rpc.rs', 'src/model.rs', 'proto/dfs.proto']
server = manifest(out / 'server-source-manifest.json')
checks['server_implementation_unchanged_throughout_comparison'] = all(current[path] == server[path] for path in server_paths)
original_manifest = json.loads((root / 'results/network-final/source-manifest.json').read_text())['files']
vendor = {path: digest((root / path).read_bytes()) for path in ['vendor/benchmark.py', 'vendor/generate.py']}
checks['vendor_matches_original_benchmark'] = all(original_manifest[path] == expected for path, expected in vendor.items())
for stage in ['equal-path', 'read-path', 'adaptive', 'directory-cache']:
    hashes = dict(line.split()[::-1] for line in (out / stage / 'binaries-source.sha256').read_text().splitlines())
    checks[f'{stage}_used_unchanged_vendor'] = all(hashes[path] == expected for path, expected in vendor.items())
print(json.dumps({'production_file_count': len(paths), 'checks': checks, 'files': current}, indent=2))
assert all(checks.values()), checks
