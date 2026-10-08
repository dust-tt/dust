#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import pathlib
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--bin', type=pathlib.Path, required=True)
parser.add_argument('--baseline-bin', type=pathlib.Path, required=True)
parser.add_argument('--reference', type=pathlib.Path, required=True)
parser.add_argument('--output', type=pathlib.Path, required=True)
parser.add_argument('--rounds', type=int, default=3)
parser.add_argument('--memory-mib', type=int, default=512)
parser.add_argument('--phase-metrics', action='store_true')
parser.add_argument('--durable-sync', action='store_true')
parser.add_argument('--clients', type=int, nargs='+', default=[1, 2])
parser.add_argument('--variants', nargs='+', default=['baseline', 'daemon', 'kernel', 'kernel-small', 'kernel-zero', 'direct', 'direct-zero', 'writeback', 'writeback-zero'])
args = parser.parse_args()
request = urllib.request.Request('http://metadata.google.internal/computeMetadata/v1/project/project-id',
                                 headers={'Metadata-Flavor': 'Google'})
assert urllib.request.urlopen(request, timeout=5).read() == b'dust-dev'
assert args.rounds > 0 and all(count in (1, 2) for count in args.clients)
assert args.memory_mib > 0
assert set(args.variants) <= {'baseline', 'daemon', 'kernel', 'kernel-small', 'kernel-zero', 'direct', 'direct-zero', 'writeback', 'writeback-zero'}
root = pathlib.Path(__file__).resolve().parents[1]
os.chdir(root)
for key in ('bin', 'baseline_bin', 'reference', 'output'):
    setattr(args, key, getattr(args, key).resolve())
args.output.mkdir(parents=True, exist_ok=False)
run = pathlib.Path(tempfile.mkdtemp(prefix='client-cache-comparison-', dir='runtime')).resolve()
subprocess.run([args.bin / 'dfsctl', 'provision', '--directory', run / 'credentials'], check=True, stdout=subprocess.DEVNULL)
token = run / 'credentials/admin.token'
with socket.socket() as listener:
    listener.bind(('127.0.0.1', 0))
    port = listener.getsockname()[1]
endpoint = f'http://127.0.0.1:{port}'
records = []
server = None
clients = []
units = []


def ctl(command, *options):
    return json.loads(subprocess.check_output([args.bin / 'dfsctl', '--endpoint', endpoint, '--token-file', token, command, *options], stderr=subprocess.DEVNULL))


def start_server(db, label):
    with (args.output / f'{label}-server.log').open('w') as log:
        process = subprocess.Popen([args.bin / 'dfsd', '--db', db, '--credentials', run / 'credentials/credentials.json',
                                    '--listen', f'127.0.0.1:{port}'], stdout=log, stderr=subprocess.STDOUT)
    deadline = time.monotonic() + 120
    try:
        while True:
            assert process.poll() is None and time.monotonic() < deadline, 'server readiness'
            try:
                ctl('metrics')
                return process
            except subprocess.CalledProcessError:
                time.sleep(0.1)
    except BaseException:
        process.terminate()
        process.wait(timeout=30)
        raise


def stop_server():
    global server
    if server is not None:
        if server.poll() is None:
            server.terminate()
        assert server.wait(timeout=60) == 0
        server = None


def digest(path):
    with path.open('rb') as file:
        return hashlib.file_digest(file, 'sha256').hexdigest()


provenance = {'arguments': vars(args), 'runtime': run, 'endpoint': endpoint, 'project': 'dust-dev',
              'memory_bytes_per_client': args.memory_mib << 20, 'swap_bytes': 0,
              'cache_state': 'fresh daemon and FUSE superblock per run; fresh copy of persisted seed database per cell; host page cache uncontrolled',
              'authorization': 'tenant administrator; regular-principal correctness is tested separately',
              'synchronization': 'baseline mount fsync publication-only; current mounts fsync ' + ('server persistence' if args.durable_sync else 'publication only'),
              'sampling': 'fresh phase counters outside timing introduce idle gaps' if args.phase_metrics else 'no blocking counter reads between rows; concurrent clients rendezvous around each measured row',
              'manifest_sha256': digest(args.reference / 'manifest.json'),
              'binary_sha256': {str(path): digest(path) for path in [args.bin / 'dfsd', args.bin / 'dfsctl', args.bin / 'dfs-mount', args.baseline_bin / 'dfs-mount']}}
(args.output / 'provenance.json').write_text(json.dumps(provenance, default=str, indent=2) + '\n')
try:
    seed = run / 'seed-db'
    server = start_server(seed, 'seed')
    imported = ctl('import', '--source', args.reference, '--name', 'corpus')
    (args.output / 'import.json').write_text(json.dumps(imported, indent=2) + '\n')
    stop_server()
    for round_number in range(1, args.rounds + 1):
        variants = args.variants if round_number % 2 else list(reversed(args.variants))
        for client_count in args.clients:
            for variant in variants:
                label = f'round-{round_number}-clients-{client_count}-{variant}'
                cell = args.output / label
                cell.mkdir()
                db = run / f'{label}-db'
                shutil.copytree(seed, db)
                server = start_server(db, label)
                before = ctl('metrics')['Metrics']
                clients = []
                units = []
                for index in range(client_count):
                    unit = f'dfs-comparison-{os.getpid()}-{index}'
                    units.append(unit)
                    output = cell / f'client-{index}'
                    binary = args.baseline_bin if variant == 'baseline' else args.bin
                    cache_bytes = 0 if variant.endswith('-zero') else (4 << 20) if variant == 'kernel-small' else (32 << 20)
                    command = ['sudo', 'systemd-run', '--quiet', '--wait', '--pipe', '--collect', f'--unit={unit}',
                               f'--working-directory={root}', f'--property=MemoryMax={args.memory_mib}M', '--property=MemorySwapMax=0',
                               '--property=MemoryAccounting=yes', 'python3', 'scripts/kernel-cache-run.py',
                               '--backend', 'direct' if variant.startswith('direct') else 'kernel', '--workload', 'full',
                               '--memory-bytes', str(args.memory_mib << 20), '--cache-bytes', str(cache_bytes),
                               '--bin', str(binary), '--endpoint', endpoint, '--token-file', str(token), '--reference', str(args.reference),
                               '--output', str(output), '--run-directory', str(run / f'{label}-client-{index}'),
                               '--round', str(round_number), '--clients', str(client_count), '--client-index', str(index),
                               '--phase-barrier', str(run / f'{label}-barrier')]
                    if args.phase_metrics:
                        command.append('--phase-metrics')
                    if args.durable_sync and variant != 'baseline':
                        command.append('--durable-sync')
                    if variant == 'daemon':
                        command.append('--daemon-prefetch')
                    if variant.startswith('writeback'):
                        command.append('--experimental-kernel-writeback')
                    with (cell / f'client-{index}.log').open('w') as log:
                        clients.append(subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT))
                codes = [process.wait(timeout=300) for process in clients]
                assert codes == [0] * client_count, (label, codes)
                for index in range(client_count):
                    result = json.loads((cell / f'client-{index}/result.json').read_text())
                    assert result['passed'] and len(result['rows']) == 24
                    assert all(row['result'] == 'OK' for row in result['rows'])
                    assert result['after']['memory']['memory.events']['oom'] == 0
                    assert result['after']['memory']['memory.events']['oom_kill'] == 0
                after = ctl('metrics')['Metrics']
                assert after['storage_error'] is None
                record = {'label': label, 'round': round_number, 'clients': client_count, 'variant': variant,
                          'before': before, 'after': after, 'passed': True}
                records.append(record)
                (args.output / 'cells.json').write_text(json.dumps(records, indent=2) + '\n')
                stop_server()
                shutil.rmtree(db)
    (args.output / 'completed.json').write_text(json.dumps({'cells': len(records), 'passed': True}) + '\n')
finally:
    for unit in units:
        subprocess.run(['sudo', 'systemctl', 'stop', unit], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for process in clients:
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=20)
    stop_server()
