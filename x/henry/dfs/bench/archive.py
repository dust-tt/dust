#!/usr/bin/env python3
"""Extract an arbitrary archive with `tar -xf` (gzip detected by tar) natively and into a new mount
root, then validate every file through a new server and mount against the native extraction."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

from harness import Stack, metadata, syncfs


def extract(archive, target):
    started = time.monotonic()
    subprocess.run(['/usr/bin/tar', '--no-same-owner', '-xf', str(archive), '-C', str(target)], check=True)
    return time.monotonic() - started


def drain(directory):
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        started = time.monotonic()
        syncfs(fd)
        return time.monotonic() - started
    finally:
        os.close(fd)


def digests(root):
    return {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(root.rglob('*')) if path.is_file()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--work', type=Path)
    args = parser.parse_args()
    work = args.work or Path(tempfile.mkdtemp(prefix='dfs-henry-archive-'))
    work.mkdir(parents=True, exist_ok=True)
    run = metadata() | {'archive': str(args.archive), 'archive_bytes': args.archive.stat().st_size}
    native = work / 'native'
    shutil.rmtree(native, ignore_errors=True)
    native.mkdir()
    run['native_seconds'] = extract(args.archive, native)
    run['native_sync_seconds'] = drain(native)
    expected = digests(native)
    run['files'] = len(expected)
    stack = Stack(work)
    mount = work / 'mount'
    try:
        token = stack.provision(['owner:write'], ['owner'])['owner']
        stack.start('extract')
        stack.mount(mount, token)
        target = mount / 'work'
        target.mkdir()
        run['untar_seconds'] = extract(args.archive, target)
        run['remaining_client_writeback_seconds'] = drain(target)
        run['mount'] = stack.unmount(mount)
        run['server'] = stack.stop()
        stack.start('validate')
        stack.mount(mount, token)
        run['validated'] = digests(target) == expected
        stack.stop()
    finally:
        stack.stop()
        stack.wipe()
        shutil.rmtree(native, ignore_errors=True)
        (work / 'run.json').write_text(json.dumps(run, indent=2) + '\n')
    print(f"{'Validated' if run['validated'] else 'FAILED'} {run['files']} files; native "
          f"{run['native_seconds']:.3f}s (+{run['native_sync_seconds']:.3f}s sync); untar "
          f"{run['untar_seconds']:.3f}s (+{run['remaining_client_writeback_seconds']:.3f}s drain); "
          f"report: {work}")
    return 0 if run['validated'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
