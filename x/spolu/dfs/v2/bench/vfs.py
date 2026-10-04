#!/usr/bin/env python3
"""Run jd's unchanged workloads with a new server/mount before each first read case."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import random
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import uuid
from common import corpus, metadata, persistence, save, support


def main():
    """@cc [owner:spolu,label:testing;security] retained-benchmark-fixture
    Keeping a fixture MUST preserve FDB/ES data and private credentials outside Git. Resuming MUST
    preserve original reports/import timings and verify the corpus and binary identities before
    repeating read/write checks; it MUST NOT import or silently recreate the existing corpus.
    Reusing a backend MUST create a distinct workspace and MUST require retention of both corpora.
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path)
    parser.add_argument('--files', type=int, choices=[10000, 100000], default=10000)
    parser.add_argument('--keep-fixture', action='store_true',
                        help='Keep this corpus in FDB/ES and retain private fixture credentials')
    parser.add_argument('--resume', action='store_true',
                        help='Repeat checks on the retained corpus in --work, without another untar')
    parser.add_argument('--backend-from', type=Path,
                        help='Create a new workspace in a retained run\'s shared FDB prefix/ES index')
    args = parser.parse_args()
    work = args.work or Path(tempfile.mkdtemp(prefix='dfs-v2-vfs-bench-'))
    work.mkdir(parents=True, exist_ok=True)
    if args.resume and not args.work:
        raise ValueError('--resume requires --work')
    if args.backend_from and (args.resume or not args.keep_fixture):
        raise ValueError('--backend-from requires --keep-fixture and cannot be combined with --resume')
    if (work / 'run.json').exists() and not args.resume:
        raise RuntimeError('report directory already contains a run')
    configuration = metadata()
    if args.resume:
        run = json.loads((work / 'run.json').read_text())
        data = work / 'corpus'
        key_path = work / 'server.key'
        key = key_path.read_text()
        prefix = run['prefix']
        if not re.fullmatch(r'dfs-v2-bench-[0-9a-f]{32}', prefix):
            raise ValueError('resume requires an isolated benchmark prefix')
        workspace = json.loads((work / 'workspace.json').read_text())
        if (run['files'] != args.files or 'untar_seconds' not in run
                or run['server_binary_sha256'] != configuration['server_binary_sha256']
                or run['fuse_binary_sha256'] != configuration['fuse_binary_sha256']
                or run.get('xattr_cache_mib', 'binary default') != configuration['xattr_cache_mib']
                or run.get('writeback', {'DFS_WRITEBACK_MIB': 0}) != configuration['writeback']
                or run['manifest_sha256'] != hashlib.sha256((data / 'manifest.json').read_bytes()).hexdigest()):
            raise ValueError('resume corpus or binary identity mismatch')
        previous = Path(tempfile.mkdtemp(prefix='previous-', dir=work))
        for pattern in ('*.json', '*.log'):
            for path in work.glob(pattern):
                shutil.copy2(path, previous / path.name)
        run['resumed_checks'] = True
        run['previous_reports'] = str(previous)
        run['results'] = []
    else:
        data = corpus(work, args.files)
        if args.backend_from:
            previous_run = json.loads((args.backend_from / 'run.json').read_text())
            prefix = previous_run['prefix']
            if (not re.fullmatch(r'dfs-v2-bench-[0-9a-f]{32}', prefix)
                    or not previous_run.get('fixture_retained')):
                raise ValueError('--backend-from requires a retained benchmark fixture')
            key = (args.backend_from / 'server.key').read_text()
            key_path = support.secret_file(work / 'server.key', key)
        else:
            prefix, key, key_path = support.identity(work, 'bench')
        workspace = None
        run = configuration | {'prefix': prefix, 'warm_runs': 1, 'server_restarted_per_first_case': True,
                       'cold_scope': 'new dfs-server/session/mount; backend caches retained',
                       'fuse_threads': 8, 'kernel_writeback': True, 'client_data_cache': 'kernel',
                       'kernel_metadata_ttl_seconds': 4294967295, 'max_background': 32,
                       'read_ahead_requested_kib': 1024, 'results': []}
    run['corpus_bytes'] = sum(p.stat().st_size for p in (data / 'docs').rglob('*.txt'))
    run['files'] = args.files
    run['manifest_sha256'] = hashlib.sha256((data / 'manifest.json').read_bytes()).hexdigest()
    run['corpus_directories'] = 100
    if args.backend_from:
        run['existing_fixture'] = str(args.backend_from)
        run['existing_files'] = previous_run['files']
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
    phase = 'resume' if args.resume else 'populate'
    run['server_lifetimes'] = []
    success = False
    def unmount():
        nonlocal mount_context
        if mount_context is not None:
            context = mount_context
            mount_context = None
            context.__exit__(None, None, None)
            mount_path.rmdir()
    def mount():
        nonlocal mount_context
        owner = support.session(endpoint, workspace, ['owner'])
        mount_context = support.mounted(endpoint, owner['session_key'], mount_path,
            metrics_path=work / f'case-{resets}-client-metrics.json')
        mount_context.__enter__()
    def reset():
        nonlocal server, endpoint, resets, phase
        unmount()
        if server is not None:
            stop_server()
        resets += 1
        phase = f'case-{resets}'
        server, endpoint = support.start(work, phase, prefix, key_path)
        mount()
    def stop_server():
        nonlocal server
        shutdown_seconds = support.stop(server)
        server = None
        summary = persistence(work / f'{phase}-server.log')
        run['server_lifetimes'].append({'phase': phase, 'shutdown_seconds': shutdown_seconds,
                                        **summary})
        return shutdown_seconds
    def measure(path):
        sys.argv = ['benchmark.py', str(path), '--warm-runs', '1']
        if jd.main() != 0:
            raise RuntimeError('benchmark validation failed')
    print(f'Report: {work}', flush=True)
    try:
        measure(data)
        current[0] = 'dfs'
        server, endpoint = support.start(work, phase, prefix, key_path)
        if not args.resume:
            with tarfile.open(work / 'corpus.tar', 'w') as archive:
                archive.add(data / 'docs', arcname='docs')
                archive.add(data / 'manifest.json', arcname='manifest.json')
            workspace = support.rpc(endpoint, key, 'create-workspace',
                {'workspace_id': 'jd-vfs-' + uuid.uuid4().hex if args.backend_from else 'jd-vfs',
                 'root_grants': ['owner']})
            support.secret_file(work / 'workspace.json', json.dumps(workspace))
            owner = support.session(endpoint, workspace, ['owner'])
            support.rpc(endpoint, owner['session_key'], 'create', {'parent_id': workspace['root_id'],
                'expected_parent_version': 1, 'name': 'work', 'directory': True, 'mode': 493})
        mount()
        if not args.resume:
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
            # Stop before unmount/validation so the drain measures remaining server work immediately.
            run['population_shutdown_seconds'] = stop_server()
            drain = run['server_lifetimes'][-1]['writeback_drain']
            run['population_server_drain_seconds'] = drain['drain_us'] / 1e6 if drain else None
            reset()
            run['population_drain_restart'] = True
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
        run['shutdown_seconds'] = stop_server()
        run['results'] = json.loads((work / 'dfs.json').read_text())
        run['resets'] = resets
        success = True
    finally:
        try:
            unmount()
        finally:
            if server is not None and server.poll() is None:
                support.stop(server)
        if success:
            run['fixture_cleaned'] = False
            run['fixture_retained'] = args.keep_fixture
            save(work, run)
            if not args.keep_fixture:
                support.cleanup(prefix)
                run['fixture_cleaned'] = True
                key_path.unlink(missing_ok=True)
                (work / 'workspace.json').unlink(missing_ok=True)
            save(work, run)
    print(f'Validated report: {work}', flush=True)


if __name__ == '__main__':
    main()
