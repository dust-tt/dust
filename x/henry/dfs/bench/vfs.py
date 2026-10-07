#!/usr/bin/env python3
"""Spolu's vfs.py procedure against dfs-server/dfs-mount: same corpus, tar command, and jd workloads,
with a new server and mount before every `first` row."""
import argparse
import json
import os
from pathlib import Path
import random
import subprocess
import sys
import tarfile
import tempfile
import time

from harness import Stack, corpus, metadata, syncfs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path)
    parser.add_argument('--files', type=int, choices=[10000, 100000], default=10000)
    parser.add_argument('--skip-local', action='store_true', help='Skip the local-disk reference rows')
    parser.add_argument('--keep', action='store_true', help='Keep the tenant data in FDB')
    args = parser.parse_args()
    work = args.work or Path(tempfile.mkdtemp(prefix='dfs-henry-vfs-'))
    work.mkdir(parents=True, exist_ok=True)
    data = corpus(work, args.files)
    run = metadata() | {'files': args.files, 'warm_runs': 1, 'server_restarted_per_first_case': True,
                        'cold_scope': 'new dfs-server/session/mount; backend caches retained'}
    sys.path.insert(0, '/benchmark')
    import benchmark as jd
    jd.DOCUMENTS = args.files
    jd.SAMPLE_INDICES = frozenset(random.Random(42).sample(range(args.files), 256))
    original = jd.Benchmark

    stack = Stack(work)
    mount_path = work / 'mount'
    current = ['local']
    resets = [0]

    def reset():
        stack.stop()
        resets[0] += 1
        stack.start(f'case-{resets[0]}')
        stack.mount(mount_path, token)

    class Measured(original):
        def measure(self, feature, workload, phase, *a, **kw):
            if current[0] == 'dfs' and phase == 'first':
                reset()
            result = super().measure(feature, workload, phase, *a, **kw)
            (work / (current[0] + '.json')).write_text(json.dumps(self.rows, indent=2) + '\n')
            print(f'{current[0]}: ' + ' | '.join(self.rows[-1]), flush=True)
            return result

    jd.Benchmark = Measured

    def measure(path):
        sys.argv = ['benchmark.py', str(path), '--warm-runs', '1']
        if jd.main() != 0:
            raise RuntimeError('benchmark validation failed')

    print(f'Report: {work}', flush=True)
    try:
        if not args.skip_local:
            measure(data)
        current[0] = 'dfs'
        token = stack.provision(['owner:write'], ['owner'])['owner']
        with tarfile.open(work / 'corpus.tar', 'w') as archive:
            archive.add(data / 'docs', arcname='docs')
            archive.add(data / 'manifest.json', arcname='manifest.json')
        stack.start('populate')
        stack.mount(mount_path, token)
        os.mkdir(mount_path / 'work', 0o755)
        fd = os.open(mount_path / 'work', os.O_RDONLY | os.O_DIRECTORY)
        try:
            started = time.monotonic()
            subprocess.run(['/usr/bin/tar', '--no-same-owner', '-xf', str(work / 'corpus.tar'),
                            '-C', str(mount_path / 'work')], check=True)
            run['untar_seconds'] = time.monotonic() - started
            started = time.monotonic()
            syncfs(fd)
            run['population_client_writeback_seconds'] = time.monotonic() - started
        finally:
            os.close(fd)
        print(f"Untar: {run['untar_seconds']:.3f}s", flush=True)
        stack.stop()
        run['population_shutdown_seconds'] = stack.lifetimes[-1]['shutdown_seconds']
        reset()
        measure(mount_path / 'work')
        stack.stop()
        run['results'] = json.loads((work / 'dfs.json').read_text())
        run['resets'] = resets[0]
        run['server_lifetimes'] = stack.lifetimes
    finally:
        stack.stop()
        if not args.keep:
            stack.wipe()
        (work / 'run.json').write_text(json.dumps(run, indent=2) + '\n')
    print(f'Validated report: {work}', flush=True)


if __name__ == '__main__':
    main()
