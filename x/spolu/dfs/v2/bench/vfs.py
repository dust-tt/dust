#!/usr/bin/env python3
"""Run jd's unchanged workloads with a new server/mount before each first read case."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import random
import subprocess
import sys
import tarfile
import tempfile
import time
from common import corpus, metadata, save, support


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path)
    parser.add_argument('--files', type=int, choices=[10000, 100000], default=10000)
    args = parser.parse_args()
    work = args.work or Path(tempfile.mkdtemp(prefix='dfs-v2-vfs-bench-'))
    work.mkdir(parents=True, exist_ok=True)
    if (work / 'run.json').exists():
        raise RuntimeError('report directory already contains a run')
    data = corpus(work, args.files)
    prefix, key, key_path = support.identity(work, 'bench')
    run = metadata() | {'prefix': prefix, 'warm_runs': 1, 'server_restarted_per_first_case': True,
                       'cold_scope': 'new dfs-server/session/mount; backend caches retained',
                       'fuse_threads': 8, 'kernel_writeback': True, 'client_data_cache': 'kernel',
                       'kernel_metadata_ttl_seconds': 4294967295, 'max_background': 32,
                       'read_ahead_requested_kib': 1024, 'results': []}
    run['corpus_bytes'] = sum(p.stat().st_size for p in (data / 'docs').rglob('*.txt'))
    run['files'] = args.files
    run['manifest_sha256'] = hashlib.sha256((data / 'manifest.json').read_bytes()).hexdigest()
    run['corpus_directories'] = 100
    run['fuse_binary_sha256'] = hashlib.sha256(Path('/target/release/dfs-fuse').read_bytes()).hexdigest()
    save(work, run)
    sys.path.insert(0, '/benchmark')
    import benchmark as jd
    jd.DOCUMENTS = args.files
    jd.SAMPLE_INDICES = frozenset(random.Random(42).sample(range(args.files), 256))
    original = jd.Benchmark
    class Measured(original):
        """@cc [owner:spolu,label:testing;performance] unchanged-measurements
        Corpus size and matching sample indices MAY change during setup. jd's actions, validation,
        and timed intervals MUST remain unchanged; server/mount resets MUST precede timing.
        Retain and validate every result, recording the actual file count and manifest hash.
        """
        def measure(self, feature, workload, phase, *args, **kwargs):
            if current[0] == 'dfs' and phase == 'first':
                reset()
            print(f'{current[0]}: {workload} ({phase})', flush=True)
            result = super().measure(feature, workload, phase, *args, **kwargs)
            (work / (current[0] + '.json')).write_text(json.dumps(self.rows, indent=2) + '\n')
            print(' | '.join(self.rows[-1]), flush=True)
            return result
    jd.Benchmark = Measured
    current = ['local']
    server = None
    mount_context = None
    mount_path = work / 'mount'
    resets = 0
    success = False
    workspace = None
    def unmount():
        nonlocal mount_context
        if mount_context is not None:
            mount_context.__exit__(None, None, None)
            mount_context = None
            mount_path.rmdir()
    def mount():
        nonlocal mount_context
        owner = support.session(endpoint, workspace, ['owner'])
        mount_context = support.mounted(endpoint, owner['session_key'], mount_path,
            metrics_path=work / f'case-{resets}-client-metrics.json')
        mount_context.__enter__()
    def reset():
        nonlocal server, endpoint, resets
        unmount()
        support.stop(server)
        resets += 1
        server, endpoint = support.start(work, f'case-{resets}', prefix, key_path)
        mount()
    def measure(path):
        sys.argv = ['benchmark.py', str(path), '--warm-runs', '1']
        if jd.main() != 0:
            raise RuntimeError('benchmark validation failed')
    print(f'Report: {work}', flush=True)
    try:
        measure(data)
        current[0] = 'dfs'
        with tarfile.open(work / 'corpus.tar', 'w') as archive:
            archive.add(data / 'docs', arcname='docs')
            archive.add(data / 'manifest.json', arcname='manifest.json')
        server, endpoint = support.start(work, 'populate', prefix, key_path)
        workspace = support.rpc(endpoint, key, 'create-workspace',
            {'workspace_id': 'jd-vfs', 'root_grants': ['owner']})
        owner = support.session(endpoint, workspace, ['owner'])
        support.rpc(endpoint, owner['session_key'], 'create', {'parent_id': workspace['root_id'],
            'expected_parent_version': 1, 'name': 'work', 'directory': True, 'mode': 493})
        mount()
        fd = os.open(mount_path / 'work', os.O_RDONLY | os.O_DIRECTORY)
        try:
            started = time.monotonic()
            subprocess.run(['/usr/bin/tar', '--no-same-owner', '-xf', str(work / 'corpus.tar'),
                '-C', str(mount_path / 'work')], check=True)
            run['untar_seconds'] = time.monotonic() - started
            started = time.monotonic()
            support.syncfs(fd)
            run['population_client_writeback_seconds'] = time.monotonic() - started
        finally:
            os.close(fd)
        print(f"Untar: {run['untar_seconds']:.3f}s", flush=True)
        save(work, run)
        measure(mount_path / 'work')
        fd = os.open(mount_path / 'work', os.O_RDONLY | os.O_DIRECTORY)
        try:
            started = time.monotonic()
            support.syncfs(fd)
            run['final_client_writeback_seconds'] = time.monotonic() - started
        finally:
            os.close(fd)
        unmount()
        run['shutdown_seconds'] = support.stop(server)
        server = None
        run['results'] = json.loads((work / 'dfs.json').read_text())
        run['resets'] = resets
        success = True
    finally:
        unmount()
        if server is not None and server.poll() is None:
            support.stop(server)
        key_path.unlink(missing_ok=True)
        if success:
            support.cleanup(prefix)
            run['fixture_cleaned'] = True
            save(work, run)
    print(f'Validated report: {work}', flush=True)


if __name__ == '__main__':
    main()
