#!/usr/bin/env python3
import argparse
import json
import os
import pathlib
import signal
import socket
import subprocess
import tempfile
import time
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--bin', type=pathlib.Path, required=True)
parser.add_argument('--output', type=pathlib.Path, required=True)
args = parser.parse_args()
request = urllib.request.Request('http://metadata.google.internal/computeMetadata/v1/project/project-id',
                                 headers={'Metadata-Flavor': 'Google'})
assert urllib.request.urlopen(request, timeout=5).read() == b'dust-dev'
args.bin = args.bin.resolve()
args.output = args.output.resolve()
args.output.mkdir(parents=True, exist_ok=False)
run = pathlib.Path(tempfile.mkdtemp(prefix='metadata-limits-', dir='runtime')).resolve()
subprocess.run([args.bin / 'dfsctl', 'provision', '--directory', run / 'credentials'], check=True)
token = run / 'credentials/admin.token'
records = []


def wait_for(predicate):
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.02)
    raise AssertionError('metadata reconciliation deadline')


for mode in ('delta-nodes', 'snapshot-nodes', 'delta-bytes'):
    processes = []
    paths = []
    try:
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
        endpoint = f'http://127.0.0.1:{port}'
        with (args.output / f'{mode}-server.log').open('w') as log:
            server = subprocess.Popen([args.bin / 'dfsd', '--db', run / f'{mode}-db',
                                       '--credentials', run / 'credentials/credentials.json',
                                       '--listen', f'127.0.0.1:{port}'], stdout=log, stderr=subprocess.STDOUT)
        processes.append(server)

        def ready():
            assert server.poll() is None
            return subprocess.run([args.bin / 'dfsctl', '--endpoint', endpoint, '--token-file', token, 'metrics'],
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0

        wait_for(ready)

        def mount(label, limits):
            path = run / f'{mode}-{label}'
            path.mkdir()
            paths.append(path)
            metrics = args.output / f'{mode}-{label}-metrics.json'
            with (args.output / f'{mode}-{label}.log').open('w') as log:
                process = subprocess.Popen([args.bin / 'dfs-mount', '--endpoint', endpoint, '--token-file', token,
                                            '--mountpoint', path, '--metrics-file', metrics, '--reconcile-ms', '50',
                                            '--cache-bytes', '0', '--read-ahead-bytes', '0', *limits],
                                           stdout=log, stderr=subprocess.STDOUT)
            processes.append(process)
            wait_for(lambda: process.poll() is not None or metrics.exists())
            assert process.poll() is None
            return process, path, metrics

        writer, write_path, writer_metrics = mount('writer', [])
        (write_path / 'files/known').write_bytes(b'known data')
        wait_for(lambda: json.loads(writer_metrics.read_text())['nodes'] == 2)
        charged = json.loads(writer_metrics.read_text())['namespace_charged_bytes']
        limits = ['--metadata-bytes', str(charged + 128)] if mode == 'delta-bytes' else ['--metadata-nodes', '2']
        observer, read_path, metrics = mount('observer', limits)
        assert (read_path / 'files/known').read_bytes() == b'known data'
        observer.send_signal(signal.SIGSTOP)
        count = 129 if mode == 'snapshot-nodes' else 1
        for index in range(count):
            (write_path / 'files' / f'added-{index:03d}').write_bytes(b'remote data')
        observer.send_signal(signal.SIGCONT)
        wait_for(lambda: observer.poll() is not None)
        assert observer.returncode != 0
        expected_error = 'client metadata capacity' if mode == 'snapshot-nodes' else 'namespace capacity'
        assert expected_error in (args.output / f'{mode}-observer.log').read_text()
        assert not os.path.ismount(read_path)
        fresh, fresh_path, _ = mount('fresh', [])
        assert (fresh_path / 'files/known').read_bytes() == b'known data'
        assert (fresh_path / 'files' / f'added-{count - 1:03d}').read_bytes() == b'remote data'
        records.append({'mode': mode, 'remote_files': count, 'observer_exit': observer.returncode,
                        'initial_namespace_charge': charged, 'limits': limits, 'expected_error': expected_error,
                        'fresh_mount_verified': True})
    finally:
        for process in reversed(processes):
            if process.poll() is None:
                process.send_signal(signal.SIGCONT)
                process.terminate()
                try:
                    process.wait(timeout=20)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
        for path in paths:
            subprocess.run(['fusermount3', '-uz', path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        (args.output / 'results.json').write_text(json.dumps(records, indent=2) + '\n')
print(json.dumps(records))
