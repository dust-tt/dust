#!/usr/bin/env python3
"""Verify the persistent scale fixture through authenticated filesystem RPCs."""
import argparse
import hashlib
import json
from pathlib import Path
import time

from serve_scale import DEV, SERVER, client, private, run, selected_fixtures, session


def object_id(manifest, directory, index):
    if directory and index == 0:
        return manifest['tenant']['root_id']
    value = bytearray(hashlib.sha256(bytes(manifest['seed']) + bytes([directory])
                                   + index.to_bytes(8, 'big')).digest()[:16])
    value[6] = value[6] & 15 | 64
    value[8] = value[8] & 63 | 128
    return value.hex()


def parent_index(manifest, directory, index):
    if directory:
        return 0 if index <= 16 else 1 + (index - 17) // 4
    return 1 + int(object_id(manifest, False, index)[:16], 16) % manifest['directories']


def grants_for(manifest, directory, index):
    grants = {'owner'}
    while index:
        if (directory and index % 16 == 1) or (not directory and index % 1000 == 7):
            grants.add(f'team-{index % 64:02}')
        index = parent_index(manifest, directory, index)
        directory = True
    return grants


def payload(index):
    text = (f'Fixture document {index}: engineering project notes, permissions and filesystem '
            'search.\n').encode()
    size = 4096 if index % 1000 == 0 else 128
    return (text * (size // len(text) + 1))[:size]


def verify_tenant(manifest, call):
    """@cc [owner:spolu,label:testing;security] live-scale-fixture-verification
    Verification MUST read seeded objects through the public RPCs, compare exact bytes and namespace
    links, and check inherited and explicit grants against the deterministic fixture. It MUST NOT
    modify fixture objects or infer complete tree residency from successful filesystem fallback.
    """
    files = manifest['files']
    indices = sorted({i for i in (1, 7, 1000, files // 2 + 1, files) if i <= files})
    for index in range(1, min(files, 10_000) + 1):
        if 'team-01' in grants_for(manifest, False, index):
            indices = sorted(set(indices) | {index})
            break
    else:
        raise RuntimeError('no inherited team-grant sample found')
    samples = [(True, 0), (True, 1), (True, manifest['directories'])]
    samples += [(False, index) for index in indices]
    ids = [object_id(manifest, directory, index) for directory, index in samples]
    checks = []
    for grants in [('owner',), (), ('team-01',), ('team-07',)]:
        response = call(grants, 'stat', {'object_ids': ids})
        rows = response['results']
        if len(rows) != len(samples):
            raise RuntimeError('stat omitted a sample')
        allowed = 0
        for expected_id, (directory, index), row in zip(ids, samples, rows):
            if row['object_id'] != expected_id:
                raise RuntimeError('stat returned an unexpected identity')
            authorized = bool(set(grants) & grants_for(manifest, directory, index))
            if authorized:
                obj = row.get('object') or {}
                if (row.get('error') or obj.get('id') != expected_id
                        or obj.get('directory') != directory):
                    raise RuntimeError('authorized stat failed')
                allowed += 1
            elif row.get('object') or (row.get('error') or {}).get('code') not in (2, 3):
                raise RuntimeError('unauthorized sample was not denied')
        checks.append({'grants': list(grants), 'allowed': allowed, 'denied': len(rows) - allowed})
    file_ids = [object_id(manifest, False, index) for index in indices]
    response = call(('owner',), 'read-files', {'object_ids': file_ids})
    if response['omitted_ids'] or len(response['results']) != len(indices):
        raise RuntimeError('read-files omitted a sample')
    for index, expected_id, row in zip(indices, file_ids, response['results']):
        expected = payload(index)
        if (row['object_id'] != expected_id or row.get('error')
                or row.get('data') is None or bytes(row['data']) != expected
                or (row.get('object') or {}).get('size') != len(expected)):
            raise RuntimeError('seeded content mismatch')
        parent = object_id(manifest, True, parent_index(manifest, False, index))
        found = call(('owner',), 'lookup',
                     {'parent_id': parent, 'name': f'document-{index:012}.txt'})
        if found['id'] != expected_id:
            raise RuntimeError('seeded namespace link mismatch')
        metadata = call(('owner',), 'get-metadata', {'object_id': expected_id})
        if metadata['mime_type'] != 'text/plain':
            raise RuntimeError('seeded MIME metadata mismatch')
    return {'tenant': manifest['tenant']['tenant_id'], 'file_indices': indices,
            'bytes_verified': sum(len(payload(index)) for index in indices),
            'authorization': checks}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path, required=True)
    args = parser.parse_args()
    run('bash', '/opt/dfs/v2/gcp/verify-host.sh')
    work = args.work.resolve()
    if not work.is_relative_to('/var/log/dfs-bench/v5'):
        raise ValueError('isolated v5 report directory required')
    scale = json.loads((work / 'run.json').read_text())
    if not scale.get('complete') or not scale.get('fdb_configuration_unchanged'):
        raise RuntimeError('complete verified scale measurements required')
    selected = selected_fixtures(scale)
    manifests = {label: json.loads((work / label / 'tenant.json').read_text()) for label in selected}
    for label, manifest in manifests.items():
        if (manifest['prefix'] != scale['prefix'] or manifest['files'] != selected[label]
                or manifest['tenant']['tenant_id'] != 'scale-' + label):
            raise RuntimeError('manifest does not match the measured fixture')
    info = json.loads(run('docker', 'inspect', SERVER, capture_output=True, text=True).stdout)[0]
    if not info['State']['Running'] or info['Config']['Labels'].get('dfs.scale.prefix') != scale['prefix']:
        raise RuntimeError('expected scale server is not running')
    results = []
    for label, manifest in manifests.items():
        owner = session(work, label)
        directory = Path(owner['session_key_file']).parent
        keys = {('owner',): Path(owner['session_key_file'])}

        def call(grants, method, request):
            if grants not in keys:
                number = len(keys)
                output = directory / f'check-{number}.json'
                client(work, directory / 'tenant.key', 'create-session',
                       {'tenant_id': manifest['tenant']['tenant_id'], 'grants': list(grants)}, output)
                key = directory / f'check-{number}.key'
                private(key, json.loads(output.read_text())['session_key'] + '\n')
                keys[grants] = key
            return client(work, keys[grants], method, request)

        try:
            result = verify_tenant(manifest, call)
            foreign = [object_id(other, False, 1) for other_label, other in manifests.items()
                       if other_label != label]
            response = call(('owner',), 'stat', {'object_ids': foreign})
            if len(response['results']) != len(foreign):
                raise RuntimeError('cross-tenant stat omitted results')
            for expected_id, row in zip(foreign, response['results']):
                if (row['object_id'] != expected_id or row.get('object')
                        or (row.get('error') or {}).get('code') not in (2, 3)):
                    raise RuntimeError('cross-tenant object access was not denied')
            result.update(foreign_objects_denied=len(foreign), owner_session=owner)
            results.append(result)
        finally:
            for grants, key in keys.items():
                if grants != ('owner',):
                    client(work, key, 'close-session', {})
    status = json.loads(run('docker', 'exec', DEV, 'fdbcli', '--timeout', '20', '--exec',
                            'status json', capture_output=True, text=True).stdout)
    before = json.loads((work / 'fdb-before.json').read_text())
    if (not status['client']['database_status']['available']
            or status['cluster']['configuration'] != before['cluster']['configuration']):
        raise RuntimeError('FDB unavailable or its configuration changed')
    report = {'complete': True, 'tenants': results, 'server_started_at': info['State']['StartedAt'],
              'fdb_available': True, 'fdb_configuration_unchanged': True,
              'scope': 'sampled public RPC contents, metadata, namespace, grants and tenant isolation'}
    output = work / f'verification-{time.time_ns()}.json'
    private(output, json.dumps(report, indent=2) + '\n')
    print(json.dumps({'report': str(output), 'complete': True,
                      'tenants': [row['tenant'] for row in results]}))


if __name__ == '__main__':
    main()
