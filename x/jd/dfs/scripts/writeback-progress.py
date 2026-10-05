#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import pathlib
import socket
import subprocess
import tempfile
import threading
import time
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--bin', type=pathlib.Path, required=True)
parser.add_argument('--server-bin', type=pathlib.Path)
parser.add_argument('--output', type=pathlib.Path, required=True)
parser.add_argument('--duration', type=float, default=35)
parser.add_argument('--worker', action='store_true')
parser.add_argument('--endpoint')
parser.add_argument('--token-file', type=pathlib.Path)
parser.add_argument('--run', type=pathlib.Path)
args = parser.parse_args()
assert args.duration > 0
request = urllib.request.Request('http://metadata.google.internal/computeMetadata/v1/project/project-id',
                                 headers={'Metadata-Flavor': 'Google'})
assert urllib.request.urlopen(request, timeout=5).read() == b'dust-dev'
args.bin = args.bin.resolve()
args.output = args.output.resolve()


def wait_for(predicate, seconds=30):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.02)
    raise AssertionError('progress observation deadline')


def payload(generation, index):
    marker = f'PROGRESS{generation:08d}FILE{index:03d}'
    line = (marker + ' bounded client writeback progress\n').encode()
    return marker, (line * ((131072 + len(line) - 1) // len(line)))[:131072]


def worker():
    args.output.mkdir()
    mountpoint = args.run / 'mount'
    mountpoint.mkdir()
    metrics = args.output / 'mount-metrics.json'
    group_name = next(line.split(':', 2)[2] for line in pathlib.Path('/proc/self/cgroup').read_text().splitlines()
                      if line.startswith('0::'))
    cgroup = pathlib.Path('/sys/fs/cgroup') / group_name.lstrip('/')
    assert int((cgroup / 'memory.max').read_text()) == 256 << 20
    assert (cgroup / 'memory.swap.max').read_text().strip() == '0'
    finished = threading.Event()
    errors = []

    def sample():
        try:
            with (args.output / 'memory.jsonl').open('w') as output:
                while not finished.wait(0.05):
                    value = {'monotonic_ns': time.monotonic_ns(), 'current': int((cgroup / 'memory.current').read_text()),
                             'stat': {k: int(v) for k, v in (line.split() for line in (cgroup / 'memory.stat').read_text().splitlines())},
                             'events': {k: int(v) for k, v in (line.split() for line in (cgroup / 'memory.events').read_text().splitlines())}}
                    if metrics.exists():
                        value['mount'] = json.loads(metrics.read_text())
                    output.write(json.dumps(value) + '\n')
                    output.flush()
        except Exception as error:
            errors.append(repr(error))

    with (args.output / 'mount.log').open('w') as log:
        daemon = subprocess.Popen([args.bin / 'dfs-mount', '--endpoint', args.endpoint,
                                   '--token-file', args.token_file, '--mountpoint', mountpoint,
                                   '--experimental-kernel-writeback', '--durable-sync', '--cache-bytes', '0',
                                   '--read-ahead-bytes', '0', '--reconcile-ms', '100', '--metrics-file', metrics],
                                  stdout=log, stderr=subprocess.STDOUT)
    thread = threading.Thread(target=sample)
    thread.start()
    handles = []
    result = {'passed': False, 'cgroup': group_name, 'files': {}, 'fsync_completed_ns': {}}
    try:
        wait_for(lambda: daemon.poll() is not None or metrics.exists())
        assert daemon.poll() is None
        for index in range(32):
            fd = os.open(mountpoint / 'files' / f'file-{index:03d}', os.O_CREAT | os.O_EXCL | os.O_RDWR, 0o600)
            handles.append(fd)
            _, data = payload(0, index)
            assert os.write(fd, data) == len(data)
            os.fsync(fd)
        directory = os.open(mountpoint / 'files', os.O_RDONLY | os.O_DIRECTORY)
        os.fsync(directory)
        os.close(directory)
        started = time.monotonic()
        result['started_ns'] = time.monotonic_ns()
        generation = 0
        with (args.output / 'accepted.jsonl').open('w') as output:
            while time.monotonic() - started < args.duration:
                index = generation % len(handles)
                generation += 1
                marker, data = payload(generation, index)
                began = time.monotonic_ns()
                assert os.pwrite(handles[index], data, 0) == len(data)
                accepted = time.monotonic_ns()
                observation = {'generation': generation, 'index': index, 'accepted_ns': accepted,
                               'write_ms': (accepted - began) / 1e6, 'marker': marker}
                result['files'][str(index)] = {**observation, 'sha256': hashlib.sha256(data).hexdigest()}
                output.write(json.dumps(observation) + '\n')
                output.flush()
                time.sleep(0.005)
        result['copy_finished_ns'] = time.monotonic_ns()
        result['accepted_bytes'] = generation * 131072
        for index, fd in enumerate(handles):
            os.fsync(fd)
            result['fsync_completed_ns'][str(index)] = time.monotonic_ns()
        for fd in handles:
            os.close(fd)
        handles.clear()
        result['finished_ns'] = time.monotonic_ns()
        result['mount'] = json.loads(metrics.read_text())
        assert result['mount']['fuse_operations']['writeback_failed_inodes'] == 0
        result['passed'] = True
    finally:
        for fd in handles:
            try:
                os.close(fd)
            except OSError:
                pass
        finished.set()
        thread.join()
        result['sampling_errors'] = errors
        daemon.terminate()
        daemon.wait(timeout=20)
        assert not os.path.ismount(mountpoint)
        (args.output / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
    assert not errors


def controller():
    args.output.mkdir(parents=True, exist_ok=False)
    run = pathlib.Path(tempfile.mkdtemp(prefix='writeback-progress-', dir='runtime')).resolve()
    subprocess.run([args.bin / 'dfsctl', 'provision', '--directory', run / 'credentials'], check=True, stdout=subprocess.DEVNULL)
    token_file = run / 'credentials/admin.token'
    token = token_file.read_text().strip()
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        rpc_port = listener.getsockname()[1]
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        search_port = listener.getsockname()[1]
    endpoint = f'http://127.0.0.1:{rpc_port}'
    search = f'http://127.0.0.1:{search_port}'
    binary = args.server_bin.resolve() if args.server_bin else args.bin / 'dfsd'
    unit = f'dfs-writeback-progress-{os.getpid()}'
    record = {'passed': False, 'duration_seconds': args.duration,
              'scope': 'paced overwrites of 32 UTF-8 files, 128 KiB each; marker age is a sampled application-to-publication upper bound, not exact kernel dirty-page age; observed pending-prefix ages are lower bounds from first observation; persistence_age_ms measures time since last synchronization',
              'server_binary_sha256': hashlib.sha256(binary.read_bytes()).hexdigest(), 'run': str(run)}

    def ctl(command, value=None):
        argv = [args.bin / 'dfsctl', '--endpoint', endpoint, '--token-file', token_file, command]
        if value is not None:
            path = run / 'call.json'
            path.write_text(json.dumps(value))
            argv += ['--json', path]
        return json.loads(subprocess.check_output(argv, stderr=subprocess.DEVNULL))

    def http(path, value=None):
        request = urllib.request.Request(search + path, data=None if value is None else json.dumps(value).encode(),
                                         headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.load(response)

    with (args.output / 'server.log').open('w') as log:
        server = subprocess.Popen([binary, '--db', run / 'db', '--credentials', run / 'credentials/credentials.json',
                                   '--listen', f'127.0.0.1:{rpc_port}', '--sync-ms', '1000', '--search-index', run / 'index',
                                   '--search-token-file', token_file, '--search-listen', f'127.0.0.1:{search_port}'],
                                  stdout=log, stderr=subprocess.STDOUT, env={**os.environ, 'RUST_LOG': 'info'})
    child = None
    try:
        def ready():
            assert server.poll() is None
            try:
                return bool(ctl('metrics')) and bool(http('/lexical/status'))
            except (subprocess.CalledProcessError, OSError):
                return False

        wait_for(ready)
        with (args.output / 'worker.log').open('w') as log:
            child = subprocess.Popen(['sudo', 'systemd-run', '--quiet', '--wait', '--pipe', '--collect', f'--unit={unit}',
                                      f'--working-directory={pathlib.Path.cwd()}', '--property=MemoryMax=256M', '--property=MemorySwapMax=0',
                                      'python3', 'scripts/writeback-progress.py', '--worker', '--bin', str(args.bin),
                                      '--output', str(args.output / 'worker'), '--run', str(run), '--endpoint', endpoint,
                                      '--token-file', str(token_file), '--duration', str(args.duration)], stdout=log, stderr=subprocess.STDOUT)
        accepted = {}
        observed = set()
        cursor = 0
        nodes = {}
        unpersisted = []
        unindexed = []
        with (args.output / 'progress.jsonl').open('w') as output:
            while child.poll() is None:
                status = http('/lexical/status')
                assert not status['indexing_failed']
                point = {'observed_ns': time.monotonic_ns(), 'server': ctl('metrics')['Metrics'], 'index': status}
                stamp = point['observed_ns']
                published = point['server']['published']
                persisted = point['server']['persisted']
                if published > persisted and (not unpersisted or unpersisted[-1][0] != published):
                    unpersisted.append((published, stamp))
                unpersisted = [(head, seen) for head, seen in unpersisted if head > persisted]
                point['observed_unpersisted_prefix_age_ms'] = (stamp - unpersisted[0][1]) / 1e6 if unpersisted else 0
                source = status['source']['Head']
                indexed = status['indexed_through']
                index_head = indexed['head'] if indexed is not None else 0
                assert indexed is None or indexed['incarnation'] == source['incarnation']
                if source['head'] > index_head and (not unindexed or unindexed[-1][0] != source['head']):
                    unindexed.append((source['head'], stamp))
                unindexed = [(head, seen) for head, seen in unindexed if head > index_head]
                point['observed_unindexed_prefix_age_ms'] = (stamp - unindexed[0][1]) / 1e6 if unindexed else 0
                point['index_head_lag'] = max(0, source['head'] - index_head)
                events = args.output / 'worker/accepted.jsonl'
                if events.exists():
                    with events.open() as file:
                        file.seek(cursor)
                        while True:
                            position = file.tell()
                            line = file.readline()
                            if not line or not line.endswith('\n'):
                                file.seek(position)
                                break
                            item = json.loads(line)
                            accepted[item['generation']] = item
                        cursor = file.tell()
                if accepted:
                    latest = accepted[max(accepted)]
                    name = f"file-{latest['index']:03d}"
                    if name not in nodes:
                        nodes = {item['visible_name']: item['node']['id'] for item in ctl('view')['nodes']}
                    data = ctl('call', {'Read': {'node': nodes[name], 'version': None, 'offset': 0, 'size': 32, 'handle': None}})
                    marker = bytes(data['Data']).decode().split()[0]
                    generation = int(marker[8:16])
                    point['latest_accepted_generation'] = latest['generation']
                    point['published_marker_generation'] = generation
                    if generation in accepted and generation not in observed:
                        observed.add(generation)
                        point['marker_publication_upper_ms'] = (time.monotonic_ns() - accepted[generation]['accepted_ns']) / 1e6
                output.write(json.dumps(point) + '\n')
                output.flush()
                time.sleep(0.25)
        assert child.wait(timeout=10) == 0
        worker_result = json.loads((args.output / 'worker/result.json').read_text())
        assert worker_result['passed'] and not worker_result['sampling_errors']
        assert len(worker_result['files']) == 32
        record['peak_dirty_bytes'] = 0
        record['peak_kernel_writeback_bytes'] = 0
        with (args.output / 'worker/memory.jsonl').open() as file:
            for line in file:
                sample = json.loads(line)
                assert sample['events']['oom'] == 0 and sample['events']['oom_kill'] == 0
                record['peak_dirty_bytes'] = max(record['peak_dirty_bytes'], sample['stat'].get('file_dirty', 0))
                record['peak_kernel_writeback_bytes'] = max(record['peak_kernel_writeback_bytes'], sample['stat'].get('file_writeback', 0))
        record['after_fsync'] = {'observed_ns': time.monotonic_ns(), 'server': ctl('metrics')['Metrics'], 'index': http('/lexical/status')}
        target = record['after_fsync']['index']['source']['Head']
        nodes = {item['visible_name']: item['node']['id'] for item in ctl('view')['nodes']}
        for index, expected in worker_result['files'].items():
            data = ctl('call', {'Read': {'node': nodes[f'file-{int(index):03d}'], 'version': None, 'offset': 0, 'size': 131072, 'handle': None}})
            assert hashlib.sha256(bytes(data['Data'])).hexdigest() == expected['sha256']
        def indexed():
            status = http('/lexical/status')
            assert not status['indexing_failed']
            record['last_index_observation'] = {'observed_ns': time.monotonic_ns(), 'status': status}
            indexed = status['indexed_through']
            return indexed is not None and indexed['incarnation'] == target['incarnation'] and indexed['head'] >= target['head']

        wait_for(indexed, 300)
        status = record['last_index_observation']['status']
        for index, expected in worker_result['files'].items():
            response = http(f"/v1/workspaces/{status['workspace']}/lexical/documents/query",
                            {'query': {'type': 'substring', 'value': expected['marker']}, 'k': 2})
            assert [row['node_id'] for row in response['rows']] == [nodes[f'file-{int(index):03d}']]
        record['accepted_bytes'] = worker_result['accepted_bytes']
        record['verified_files'] = len(worker_result['files'])
        record['finished_ns'] = time.monotonic_ns()
        record['server_after'] = ctl('metrics')['Metrics']
        assert record['server_after']['pending_bytes'] == 0 and record['server_after']['storage_error'] is None
        record['passed'] = True
    finally:
        subprocess.run(['sudo', 'systemctl', 'stop', unit], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if child is not None:
            child.wait(timeout=20)
        server.terminate()
        server.wait(timeout=30)
        (args.output / 'result.json').write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps(record))


if args.worker:
    worker()
else:
    controller()
