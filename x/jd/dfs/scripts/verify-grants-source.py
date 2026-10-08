#!/usr/bin/env python3
import hashlib
import json
import pathlib

root = pathlib.Path(__file__).resolve().parents[1]
base = root / 'results/grants'
server = json.loads((base / 'server/source-final.json').read_text())['files']
client = json.loads((base / 'client/source-final.json').read_text())['files']
previous = json.loads((root / 'results/kernel-cache/source-check.json').read_text())['files']
core = [path for path in previous if path.startswith(('src/', 'proto/', 'tests/', 'vendor/')) or path in ['Cargo.toml', 'Cargo.lock', 'build.rs', 'CONTRACTS']]
for path in core:
    actual = hashlib.sha256((root / path).read_bytes()).hexdigest()
    assert actual == previous[path] == server[path] == client[path], path
for path in ['scripts/grant-scenarios.py', 'scripts/grant-worker.py', 'scripts/grant-scan.py', 'scripts/grant-scan-matrix.py']:
    assert hashlib.sha256((root / path).read_bytes()).hexdigest() == client[path], path
assert hashlib.sha256((root / 'scripts/grant-agent.py').read_bytes()).hexdigest() == server['scripts/grant-agent.py']


def binaries(path):
    return {pathlib.Path(line.split()[1]).name: line.split()[0] for line in path.read_text().splitlines()}


expected = binaries(root / 'results/kernel-cache/server/binaries.sha256')
assert binaries(base / 'server/binaries.sha256') == expected
assert binaries(base / 'client/binaries.sha256') == expected
assert (base / 'server/running-server.sha256').read_text().split()[0] == expected['dfsd']
assert all(json.loads((base / 'server/corpus-check.json').read_text()).values())
manifest = (base / 'server/corpus-manifest.json').read_bytes()
manifest_hash = hashlib.sha256(manifest).hexdigest()
assert all(line.split()[0] == manifest_hash for line in (base / 'server/corpus-manifests.sha256').read_text().splitlines())
roles = json.loads((base / 'server/credential-roles.json').read_text())
assert {r['subject']: r['admin'] for r in roles} == {'admin': True, 'alice': False, 'bob': False, 'carol': False}
result = {'passed': True, 'unchanged_core_files': len(core), 'binary_sha256': expected, 'corpus_manifest_sha256': manifest_hash, 'checked': ['source_matches_prior_measured_build', 'client_and_server_binaries_match_prior_build', 'running_server_binary_matches', 'measured_runners_match_delivered_scripts', 'nfs_and_source_corpus_all_document_hashes_match_oracle', 'three_non_admin_credentials']}
(base / 'source-check.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
