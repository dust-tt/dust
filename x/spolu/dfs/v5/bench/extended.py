#!/usr/bin/env python3
"""Supplemental Git, large-directory, sparse-file and independent-client measurements."""
import argparse
import concurrent.futures
import contextlib
import hashlib
import json
import os
from pathlib import Path
import random
import shutil
import subprocess
import sys
import tempfile
import threading
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tests'))
import support


def fsync(path):
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def git(*args):
    environment = dict(os.environ, GIT_CONFIG_GLOBAL='/dev/null', GIT_CONFIG_SYSTEM='/dev/null',
                       GIT_TERMINAL_PROMPT='0')
    return subprocess.run(['git', '-c', 'user.name=DFS Benchmark', '-c',
                           'user.email=benchmark@example.invalid', *map(str, args)],
                          env=environment, capture_output=True, check=True).stdout


def main():
    """@cc [owner:spolu,label:testing] supplemental-mount-measurements
    Measurements MUST identify their cases and include explicit durability timings for buffered
    writes. Independent-client cases MUST use distinct sessions, servers and FUSE mounts sharing
    one tenant. Every payload and directory member MUST be verified before claiming completion.
    These synthetic diagnostic workloads MUST NOT be presented as the unchanged jd benchmark.
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path)
    args = parser.parse_args()
    work = args.work or Path(tempfile.mkdtemp(prefix='dfs-v5-extended-'))
    work.mkdir(parents=True, exist_ok=True)
    prefix, key, key_path = support.identity(work)
    report = {'cases': [], 'complete': False, 'independent_servers': 2,
              'server_sha256': hashlib.sha256(support.server_binary().read_bytes()).hexdigest(),
              'fuse_sha256': hashlib.sha256(support.fuse_binary().read_bytes()).hexdigest()}
    print(f'Report directory: {work}', flush=True)

    def save():
        (work / 'run.json').write_text(json.dumps(report, indent=2) + '\n')

    def measure(name, operation, **details):
        started = time.monotonic()
        value = operation()
        row = {'name': name, 'seconds': time.monotonic() - started, **details}
        report['cases'].append(row)
        save()
        print(json.dumps(row), flush=True)
        return value

    source = work / 'source'
    source.mkdir()
    random_bytes = random.Random(42)
    contents = {}
    for index in range(512):
        name = Path(f'dir-{index % 16}') / f'file-{index:04}.bin'
        data = random_bytes.randbytes(8192)
        contents[str(name)] = data
        (source / name).parent.mkdir(exist_ok=True)
        (source / name).write_bytes(data)
    git('init', '-b', 'main', source)
    git('-C', source, 'add', '.')
    git('-C', source, 'commit', '-m', 'Deterministic benchmark fixture')
    commit = git('-C', source, 'rev-parse', 'HEAD')
    server = peer = None
    try:
        server, endpoint = support.start(work, 'primary', prefix, key_path)
        tenant = support.rpc(endpoint, key, 'create-tenant',
                             {'tenant_id': 'extended', 'root_grants': ['owner']})
        owner = support.session(endpoint, tenant, ['owner'])
        support.rpc(endpoint, owner['session_key'], 'create',
                    {'parent_id': tenant['root_id'], 'name': 'work', 'directory': True, 'mode': 493})
        peer, peer_endpoint = support.start(work, 'peer', prefix, key_path)
        other = support.session(peer_endpoint, tenant, ['owner'])
        with contextlib.ExitStack() as stack:
            stack.enter_context(support.mounted(endpoint, owner['session_key'], work / 'mount-a',
                                                metrics_path=work / 'a-metrics.json'))
            stack.enter_context(support.mounted(peer_endpoint, other['session_key'], work / 'mount-b',
                                                metrics_path=work / 'b-metrics.json'))
            a, b = work / 'mount-a/work', work / 'mount-b/work'
            repository = a / 'repository'
            measure('git clone', lambda: git('clone', '--no-local', '--no-hardlinks', source, repository),
                    files=512, document_bytes=512 * 8192)

            def drain_repository():
                for directory, _, files in os.walk(repository):
                    for name in files:
                        fsync(Path(directory) / name)
                    fsync(directory)
                fsync(a)

            measure('git durable drain', drain_repository)
            assert not measure('git status', lambda: git('-C', repository, 'status', '--porcelain'))
            time.sleep(.85)
            assert git('-C', b / 'repository', 'rev-parse', 'HEAD') == commit
            git('-C', b / 'repository', 'fsck', '--full')
            assert all((b / 'repository' / name).read_bytes() == data for name, data in contents.items())

            large = a / 'large'
            large.mkdir()

            def populate_large():
                for index in range(5000):
                    (large / f'file-{index:05}').touch()

            measure('create 5000 entries in one directory', populate_large, files=5000)
            measure('large-directory durable drain', lambda: fsync(large))
            time.sleep(.85)

            def list_large():
                with os.scandir(b / 'large') as entries:
                    return sorted((entry.name, entry.stat().st_size) for entry in entries)

            listed = measure('independent-client scandir and stat', list_large, files=5000)
            assert listed == [(f'file-{index:05}', 0) for index in range(5000)]

            offsets = random.Random(42).sample(range(16384), 128)
            blocks = {index * 65536: random_bytes.randbytes(4096) for index in offsets}
            sparse = a / 'sparse'
            with sparse.open('w+b', buffering=0) as file:
                def sparse_write():
                    file.truncate(1024 ** 3)
                    for offset, data in blocks.items():
                        file.seek(offset)
                        assert file.write(data) == len(data)

                measure('sparse random writes', sparse_write, logical_bytes=1024 ** 3,
                        written_bytes=128 * 4096, writes=128)
                measure('sparse durable fsync', lambda: os.fsync(file.fileno()))
            time.sleep(.85)

            def sparse_read():
                with (b / 'sparse').open('rb', buffering=0) as file:
                    assert os.fstat(file.fileno()).st_size == 1024 ** 3
                    for offset, data in blocks.items():
                        file.seek(offset)
                        assert file.read(4096) == data
                        file.seek(offset + 4096)
                        assert file.read(4096) == bytes(4096)

            measure('independent-client sparse reads and holes', sparse_read, reads=256)
            shared = a / 'concurrent'
            shared.mkdir()
            fsync(a)
            time.sleep(.85)
            barrier = threading.Barrier(2)

            def payload(writer, index):
                return hashlib.sha256(f'{writer}:{index}'.encode()).digest() * 128

            def writer(number):
                parent = (a if number == 0 else b) / 'concurrent'
                barrier.wait()
                for index in range(256):
                    with (parent / f'{number}-{index:03}').open('wb', buffering=0) as file:
                        assert file.write(payload(number, index)) == 4096
                        os.fsync(file.fileno())

            def concurrent_writes():
                with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                    list(pool.map(writer, (0, 1)))

            measure('two independent clients, shared parent, durable writes', concurrent_writes,
                    files=512, document_bytes=512 * 4096)
            time.sleep(.85)
            assert len(list((b / 'concurrent').iterdir())) == 512
            assert all((b / 'concurrent' / f'{writer}-{index:03}').read_bytes() == payload(writer, index)
                       for writer in range(2) for index in range(256))
            shutil.rmtree(repository)
            shutil.rmtree(large)
            shutil.rmtree(shared)
            sparse.unlink()
            fsync(a)
            assert not list(a.iterdir())
        report['clients'] = [json.loads((work / f'{name}-metrics.json').read_text()) for name in ('a', 'b')]
        for client in report['clients']:
            memory = client['dfs_memory_metrics']
            assert memory['accounted_peak_bytes'] <= memory['limit_bytes'] <= 512 * 1024 ** 2
            assert memory['temporary_peak_bytes'] <= memory['temporary_limit_bytes']
            assert client['dfs_client_metrics'].get('inline.wait_after_effect', {}).get('calls', 0) == 0
        support.stop(peer)
        peer = None
        support.stop(server)
        server = None
        report['complete'] = True
        save()
        print('All supplemental checks and cleanup passed.', flush=True)
    finally:
        for process in (peer, server):
            if process is not None and process.poll() is None:
                support.stop(process)


if __name__ == '__main__':
    main()
