#!/usr/bin/env python3
import hashlib
import json
import pathlib
import tarfile

root = pathlib.Path(__file__).resolve().parents[1]
base = root / 'results/selective'
server = base / 'server'
client = base / 'client'
before = json.loads((server / 'cloud-build/source-before.json').read_text())['files']
after = json.loads((server / 'cloud-build/source-after.json').read_text())['files']
server_final = json.loads((server / 'source-final.json').read_text())['files']
client_final = json.loads((client / 'source-final.json').read_text())['files']
baseline = json.loads((root / 'results/kernel-cache/source-check.json').read_text())['files']
assert before == after
with tarfile.open(base / 'cloud-measured-source.tar.gz') as archive:
    archived = {member.name: hashlib.sha256(archive.extractfile(member).read()).hexdigest() for member in archive if member.isfile()}
assert all(archived.get(name) == expected for name, expected in before.items())
core = [name for name in before if name.startswith(('src/', 'tests/', 'proto/', 'vendor/')) or name in ['Cargo.toml', 'Cargo.lock', 'build.rs', 'CONTRACTS']]
for name in core:
    actual = hashlib.sha256((root / name).read_bytes()).hexdigest()
    assert actual == before[name] == server_final[name] == client_final[name], name
changes = [name for name in core if name.startswith('src/') and before[name] != baseline[name]]
assert set(changes) == {'src/model.rs', 'src/cache.rs', 'src/mount.rs', 'src/bin/dfs-mount.rs'}, changes
for name in ['grant-scenarios.py', 'grant-worker.py', 'selective-cache-scenarios.py', 'selective-scan.py', 'selective-scan-matrix.py', 'selective-full-matrix.py', 'kernel-cache-run.py', 'run-selective-cloud.sh']:
    name = 'scripts/' + name
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == client_final[name], name
assert hashlib.sha256((root / 'scripts/grant-agent.py').read_bytes()).hexdigest() == server_final['scripts/grant-agent.py']
assert hashlib.sha256((root / 'scripts/export-selective-server.py').read_bytes()).hexdigest() == server_final['scripts/export-selective-server.py']


def binaries(path):
    return {pathlib.Path(line.split()[1]).name: line.split()[0] for line in path.read_text().splitlines()}


current = binaries(server / 'cloud-build/binaries.sha256')
assert binaries(server / 'setup/binaries.sha256') == current
assert binaries(client / 'setup/binaries.sha256') == current
assert (server / 'running-server.sha256').read_text().split()[0] == current['dfsd']
old = binaries(root / 'results/grants/client/binaries.sha256')
assert binaries(client / 'old-binaries.sha256') == old
roles = json.loads((server / 'credential-roles.json').read_text())
assert {role['subject']: role['admin'] for role in roles} == {'admin': True, 'alice': False, 'bob': False, 'carol': False}
manifest = (server / 'corpus-manifest.json').read_bytes()
manifest_hash = hashlib.sha256(manifest).hexdigest()
assert manifest == (base / 'local-server/corpus-manifest.json').read_bytes()
assert all(line.split()[0] == manifest_hash for line in (server / 'corpus-manifests.sha256').read_text().splitlines())
assert all(json.loads((server / 'corpus-check.json').read_text()).values())
assert (client / 'reference-manifest.sha256').read_text().split()[0] == manifest_hash
result = {'passed': True, 'core_source_inputs': len(core), 'production_changes': changes, 'new_binary_sha256': current, 'old_binary_sha256': old, 'corpus_manifest_sha256': manifest_hash, 'checks': ['source_unchanged_during_cloud_build', 'all_build_inputs_match_archived_source', 'measured_sources_match_current_core', 'measured_runners_match_delivered_scripts', 'server_and_clients_use_verified_new_binaries', 'old_binaries_match_previous_measured_build', 'source_and_nfs_corpus_hashes_match_oracle', 'client_oracle_manifest_matches', 'three_non_admin_credentials']}
(base / 'cloud-source-check.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
