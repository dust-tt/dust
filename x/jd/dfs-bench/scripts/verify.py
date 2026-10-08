import hashlib
import json
from pathlib import Path
import socket

root = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads(path.read_text())


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


source = read(root / 'results/source.json')
checked = 0
for package, files in source['source'].items():
    for relative, expected in files.items():
        assert digest(root.parent / package / relative) == expected, (package, relative)
        checked += 1
hosts = read(root / 'results/hosts.json')
assert len(hosts) == 16
versions = {}
for role, host in hosts.items():
    assert host['machineType'].endswith('/c4-standard-8-lssd'), role
    assert host['zone'].rsplit('/', 1)[1] in ['us-east4-a', 'us-east4-b', 'us-east4-c']
    assert len([disk for disk in host['disks'] if disk['type'] == 'SCRATCH' and disk['interface'] == 'NVME']) == 1
    evidence = root / 'results/hosts' / role / 'evidence'
    mount = read(evidence / 'mount.json')['filesystems'][0]
    assert mount['target'] == '/srv/dfs' and mount['source'] == '/dev/nvme0n1', (role, mount)
    initial = read(evidence / 'identity.json')
    final = read(evidence / 'final/identity.json')
    for binary, expected in initial['binaries'].items():
        assert final['files']['bin/' + binary] == expected, (role, binary)
    assert 'NTPSynchronized=yes' in read(evidence / 'final/clock.json')['stdout'], role
    versions[role] = final['files']
    if '-es-' in role:
        health = read(evidence / 'final/es-health.json')
        assert health['status'] == 'green' and health['number_of_nodes'] == 3, role
        settings = read(evidence / 'final/es-settings.json')
        assert settings, role
        for index in settings.values():
            assert index['settings']['index']['number_of_shards'] == '3'
            assert index['settings']['index']['number_of_replicas'] == '1'
    elif role in ['tikv-a', 'tikv-b', 'tikv-c']:
        assert read(evidence / 'final/pd-stores.json')['count'] == 3
        assert read(evidence / 'final/pd-replication.json')['max-replicas'] == 3
    elif role in ['fdb-a', 'fdb-b', 'fdb-c']:
        status = json.loads(read(evidence / 'final/fdb-status.json')['stdout'])
        assert status['cluster']['database_status']['available']
        assert status['cluster']['configuration']['redundancy_mode'] == 'triple'
        assert status['cluster']['configuration']['storage_engine'] == 'ssd-2'
        assert len(status['cluster']['machines']) == 3

original = digest(root / 'results/harness/untar-client.py')
resumed = digest(root / 'scripts/client.py')
for backend in ('rocks', 'fdb', 'tikv'):
    role = backend + '-client'
    result = read(root / 'results/hosts' / role / 'evidence/client/result.json')
    assert result['passed'] and result['untar']['all_hashes_verified'], role
    assert result['settings']['content_cache_bytes'] == 256 << 20
    assert result['settings']['metadata_cache_bytes'] == 128 << 20
    assert result['resources']['memory.max'].strip() == str(6 << 30)
    assert result['resources']['memory.swap.max'].strip() == '0'
    expected = resumed if 'resumed_after_untar' in result else original
    assert versions[role]['scripts/client.py'] == expected, role
    for name in ('generate.py', 'benchmark.py'):
        assert versions[role]['vendor/' + name] == digest(root.parent / 'dfs/vendor' / name)
    assert versions[role]['scripts/workloads.py'] == digest(root / 'scripts/workloads.py')
    assert result['untar_unmount']['unmounted'] and result['filesystem_unmount']['unmounted']
record = {'passed': True, 'host': socket.getfqdn(), 'application_source_files': checked, 'hosts': len(hosts), 'original_untar_driver_sha256': original, 'resumed_driver_sha256': resumed, 'deployed_files': versions}
(root / 'results/evidence-validation.json').write_text(json.dumps(record, indent=2) + '\n')
print('Verified source, binary, harness, SSD, replication and client configuration evidence')
