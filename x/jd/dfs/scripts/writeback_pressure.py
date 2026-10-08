import hashlib
import json
import os
import subprocess
import time


def run_pressure(args, bench, snapshot, mounted, execute):
    assert args.backend == 'kernel' and args.experimental_kernel_writeback
    block_bytes = 1 << 20
    files = 32
    assert args.pressure_bytes >= args.memory_bytes * 2
    assert args.pressure_bytes % (files * block_bytes) == 0
    blocks_per_file = args.pressure_bytes // (files * block_bytes)
    directory = bench / f'writeback-pressure-{args.round}-{os.getpid()}'
    directory.mkdir()
    result = {'bytes': args.pressure_bytes, 'files': files, 'block_bytes': block_bytes,
              'payload': 'deterministic SHAKE-256 bytes unique to each file/block',
              'phases': [], 'write_samples_ms': [], 'digests': {}, 'server_samples': []}

    def server_metrics():
        command = [args.bin / 'dfsctl', '--endpoint', args.endpoint, '--token-file', args.token_file]
        if args.ca:
            command += ['--ca', args.ca]
        return json.loads(execute(command + ['metrics'], capture_output=True).stdout)['Metrics']

    def phase(name, started):
        elapsed_ms = (time.perf_counter() - started) * 1000
        observation = snapshot()
        result['phases'].append({'name': name, 'elapsed_ms': elapsed_ms,
                                 'client': observation, 'server': server_metrics()})
        return observation

    handles = []
    peer = None
    peer_mount = args.output.resolve() / 'verification-mount'
    peer_mount.mkdir()
    try:
        result['before'] = {'client': snapshot(), 'server': server_metrics()}
        started = time.perf_counter()
        next_server_sample = time.monotonic()
        for index in range(files):
            name = f'file-{index:02d}'
            fd = os.open(directory / name, os.O_CREAT | os.O_EXCL | os.O_RDWR, 0o600)
            handles.append(fd)
            digest = hashlib.sha256()
            for block in range(blocks_per_file):
                payload = hashlib.shake_256(f'{index}:{block}'.encode()).digest(block_bytes)
                digest.update(payload)
                copied = 0
                writing = time.perf_counter()
                while copied < len(payload):
                    copied += os.write(fd, memoryview(payload)[copied:])
                result['write_samples_ms'].append((time.perf_counter() - writing) * 1000)
                if time.monotonic() >= next_server_sample:
                    result['server_samples'].append({'elapsed_ms': (time.perf_counter() - started) * 1000,
                                                     'metrics': server_metrics()})
                    next_server_sample = time.monotonic() + 1
            result['digests'][name] = digest.hexdigest()
        copied = phase('copied_before_explicit_fsync', started)
        published = copied['dfs']['fuse_operations']['writeback_published_batches']
        result['published_batches_before_explicit_fsync'] = published
        assert published > 0, 'no background publication before explicit synchronization'
        assert copied['dfs']['fuse_operations']['writeback_failed_inodes'] == 0
        assert copied['dfs']['fuse_operations']['peak_retained_write_bytes'] <= 9 * block_bytes
        started = time.perf_counter()
        for fd in handles:
            os.fsync(fd)
        directory_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
        phase('fsync_all_files_and_directory', started)
        synchronized = result['phases'][-1]['server']
        assert synchronized['persisted'] >= result['phases'][0]['server']['published']
        assert synchronized['pending_bytes'] == 0 and synchronized['storage_error'] is None
        started = time.perf_counter()
        while handles:
            os.close(handles.pop())
        phase('close_all_files', started)
        command = [args.bin / 'dfs-mount', '--endpoint', args.endpoint,
                   '--token-file', args.token_file, '--mountpoint', peer_mount,
                   '--cache-bytes', '0', '--read-ahead-bytes', '0', '--daemon-prefetch']
        if args.ca:
            command += ['--ca', args.ca]
        with (args.output / 'verification-mount.log').open('w') as log:
            peer = subprocess.Popen([str(item) for item in command], stdout=log, stderr=subprocess.STDOUT,
                                    env={**os.environ, 'RUST_LOG': 'info'})
        deadline = time.monotonic() + 30
        while not mounted(peer_mount):
            assert peer.poll() is None and time.monotonic() < deadline, 'verification mount failed'
            time.sleep(0.01)
        started = time.perf_counter()
        verified = peer_mount / 'files' / args.corpus / directory.name
        for name, expected in result['digests'].items():
            digest = hashlib.sha256()
            count = 0
            with (verified / name).open('rb', buffering=0) as file:
                while payload := file.read(block_bytes):
                    digest.update(payload)
                    count += len(payload)
            assert count == blocks_per_file * block_bytes, (name, count)
            assert digest.hexdigest() == expected, name
        phase('independent_mount_sha256_verification', started)
        started = time.perf_counter()
        for name in result['digests']:
            (directory / name).unlink()
        directory.rmdir()
        phase('unlink', started)
        settled = 0
        deadline = time.monotonic() + 60
        while settled < 3:
            metrics = server_metrics()
            result.setdefault('settlement_samples', []).append(metrics)
            settled = settled + 1 if (metrics['pending_bytes'] == 0 and
                                       metrics['published'] == metrics['persisted'] and
                                       metrics['pending_compaction_bytes'] == 0) else 0
            assert time.monotonic() < deadline, 'server publication/persistence/compaction did not settle'
            assert metrics['storage_error'] is None
            time.sleep(1)
        result['passed'] = True
        return result
    finally:
        for fd in handles:
            try:
                os.close(fd)
            except OSError:
                pass
        if peer is not None:
            peer.terminate()
            try:
                peer.wait(timeout=20)
            except subprocess.TimeoutExpired:
                peer.kill()
                peer.wait()
                execute(['fusermount3', '-uz', peer_mount])
        assert not mounted(peer_mount)
        (args.output / 'pressure.json').write_text(json.dumps(result, indent=2) + '\n')
