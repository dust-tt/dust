#!/usr/bin/env python3
"""Serve the completed durable scale fixture on the existing workload VM."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import time

DEV = 'dfs-v5-gcp-dev-1'
SERVER = 'dfs-v5-scale-server'
ENDPOINT = 'http://127.0.0.1:18095'
FILES = {'1m': 1_000_000, '10m': 10_000_000, '100m': 100_000_000}


def selected_fixtures(report):
    targets = report.get('targets', {'scale-' + label: files for label, files in FILES.items()})
    selected = {label: files for label, files in FILES.items() if 'scale-' + label in targets}
    if not selected or targets != {'scale-' + label: files for label, files in selected.items()}:
        raise RuntimeError('unrecognized fixture targets')
    sizes = {row['tenant']: row['seed']['files'] for row in report['tenants']
             if row['complete'] and row['tenant'] in targets
             and row['warmup']['nodes'] == row['seed']['files'] + (row['seed']['files'] + 99) // 100 + 1}
    if sizes != targets:
        raise RuntimeError('all selected fixture sizes must have verified warmups')
    return selected


def run(*command, **kwargs):
    return subprocess.run(list(command), check=True, **kwargs)


def private(path, value):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as output:
        output.write(value)


def container_path(path):
    return str(Path('/reports') / path.relative_to('/var/log/dfs-bench/v5'))


def client(work, key, method, request, output=None):
    command = ['docker', 'exec', '-i', DEV, container_path(work / 'runtime/dfs'),
               '--endpoint', ENDPOINT, '--key-file', container_path(key), method]
    if output:
        command += ['--output', container_path(output)]
    result = run(*command, input=json.dumps(request), text=True, capture_output=True)
    return None if output else json.loads(result.stdout)


def session(work, label):
    manifest = json.loads((work / label / 'tenant.json').read_text())
    if manifest['files'] != FILES[label]:
        raise RuntimeError('unexpected fixture size')
    tenant = manifest['tenant']
    directory = work / label / f'session-{time.time_ns()}'
    directory.mkdir(mode=0o700)
    key = directory / 'tenant.key'
    private(key, tenant['tenant_key'] + '\n')
    credentials = directory / 'session.json'
    client(work, key, 'create-session',
           {'tenant_id': tenant['tenant_id'], 'grants': ['owner']}, credentials)
    value = json.loads(credentials.read_text())
    session_key = directory / 'session.key'
    private(session_key, value['session_key'] + '\n')
    stat = client(work, session_key, 'stat', {'object_ids': [tenant['root_id']]})
    if len(stat['results']) != 1 or not stat['results'][0].get('object', {}).get('directory'):
        raise RuntimeError('root stat failed')
    listing = client(work, session_key, 'list',
                     {'directory_id': tenant['root_id'], 'limit': 32})
    if len(listing['entries']) != 16:
        raise RuntimeError('fixture root must contain 16 top-level directories')
    return {'tenant': tenant['tenant_id'], 'session_key_file': str(session_key),
            'container_session_key_file': container_path(session_key),
            'root_id': tenant['root_id'], 'expires_at': value['expires_at']}


def ready_nodes():
    started = run('docker', 'inspect', SERVER, '--format={{.State.StartedAt}}',
                  capture_output=True, text=True).stdout.strip()
    records = run('docker', 'logs', '--since', started, SERVER, capture_output=True, text=True)
    ready = {}
    for line in (records.stdout + records.stderr).splitlines():
        try:
            fields = json.loads(line).get('fields', {})
        except json.JSONDecodeError:
            continue
        if fields.get('message') == 'permission tree ready':
            ready[fields['nodes']] = fields
    return ready


def main():
    """@cc [owner:spolu,label:operations;security] persistent-scale-service
    Start MUST require every selected verified durable fixture and preserve other services/prefixes.
    Credentials MUST remain in private files outside Git; output MUST contain paths, not secrets.
    Serve immutable binaries on loopback, with bounded tree memory, and activate tenants in ascending
    size so resident reservations leave space for each next bootstrap. Completion MUST verify all
    selected exact tree sizes and authenticated filesystem reads.
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path, required=True)
    parser.add_argument('--session', choices=FILES)
    args = parser.parse_args()
    run('bash', '/opt/dfs/v2/gcp/verify-host.sh')
    work = args.work.resolve()
    if not work.is_relative_to('/var/log/dfs-bench/v5'):
        raise ValueError('isolated v5 report directory required')
    report = json.loads((work / 'run.json').read_text())
    if not report.get('complete') or not report['prefix'].startswith('dfs-v5-scale-'):
        raise RuntimeError('complete durable scale measurements required')
    selected = selected_fixtures(report)
    if args.session:
        if args.session not in selected:
            raise ValueError('session size was not selected for this deployment')
        print(json.dumps(session(work, args.session)))
        return
    runtime = work / 'runtime'
    runtime.mkdir(exist_ok=True, mode=0o700)
    hashes = {}
    for name in ['dfs-server-v5', 'dfs']:
        source = Path('/target/v5/release') / name
        target = runtime / name
        hashes[name] = hashlib.sha256(source.read_bytes()).hexdigest()
        if target.exists():
            if hashlib.sha256(target.read_bytes()).hexdigest() != hashes[name]:
                raise RuntimeError('immutable deployment already contains different binaries')
        else:
            shutil.copyfile(source, target)
            target.chmod(0o500)
    if not (runtime / 'server.key').exists():
        private(runtime / 'server.key', secrets.token_hex(32) + '\n')
    existing = subprocess.run(['docker', 'inspect', SERVER], capture_output=True, text=True)
    if existing.returncode == 0:
        info = json.loads(existing.stdout)[0]
        if info['Config']['Labels'].get('dfs.scale.prefix') != report['prefix']:
            raise RuntimeError('container name belongs to another deployment')
        if not info['State']['Running']:
            run('docker', 'start', SERVER, stdout=subprocess.DEVNULL)
    else:
        image = run('docker', 'inspect', DEV, '--format={{.Image}}',
                    capture_output=True, text=True).stdout.strip()
        run('docker', 'run', '-d', '--name', SERVER, '--restart=unless-stopped',
            '--network=host', '--init', '--cap-drop=ALL', '--security-opt=no-new-privileges',
            '--log-opt=max-size=20m', '--log-opt=max-file=3',
            '--label=dfs.scale.prefix=' + report['prefix'],
            '-v', str(runtime) + ':/runtime:ro', '-v', '/etc/dfs-fdb:/etc/dfs-fdb:ro', image,
            '/runtime/dfs-server-v5', '--listen', '127.0.0.1:18095',
            '--server-key-file', '/runtime/server.key',
            '--fdb-cluster-file', '/etc/dfs-fdb/fdb.cluster', '--fdb-prefix', report['prefix'],
            '--tree-memory-bytes', str(28 * 1024**3),
            '--tree-tenant-peak-bytes', str(24 * 1024**3), '--tree-base-page-nodes', '4096',
            '--es-url', 'http://127.0.0.1:9200', '--es-index', report['prefix'],
            stdout=subprocess.DEVNULL)
    started = run('docker', 'inspect', SERVER, '--format={{.State.StartedAt}}',
                  capture_output=True, text=True).stdout.strip()
    for _ in range(60):
        logs = run('docker', 'logs', '--since', started, SERVER, capture_output=True, text=True)
        if 'dfs server listening' in logs.stderr + logs.stdout:
            break
        time.sleep(1)
    else:
        raise RuntimeError('server did not become ready')
    verified = []
    for label, files in selected.items():
        credentials = session(work, label)
        nodes = files + (files + 99) // 100 + 1
        deadline = time.monotonic() + 3500
        while nodes not in ready_nodes():
            if time.monotonic() >= deadline:
                raise RuntimeError('tree bootstrap did not finish within the session lifetime')
            running = run('docker', 'inspect', SERVER, '--format={{.State.Running}}',
                          capture_output=True, text=True).stdout.strip()
            if running != 'true':
                raise RuntimeError('scale server stopped')
            time.sleep(5)
        verified.append(credentials | {'tree': ready_nodes()[nodes]})
        print(json.dumps({'tenant': credentials['tenant'], 'ready_nodes': nodes}), flush=True)
    for entry in verified:
        client(work, Path(entry['session_key_file']), 'current-session', {})
        client(work, Path(entry['session_key_file']), 'stat', {'object_ids': [entry['root_id']]})
    result = {'endpoint': ENDPOINT, 'container': SERVER, 'prefix': report['prefix'],
              'binaries': hashes, 'tenants': verified,
              'indexing': 'asynchronous; full ES drain is not claimed by tree readiness'}
    private(work / f'service-{time.time_ns()}.json', json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
