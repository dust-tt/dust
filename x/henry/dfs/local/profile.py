#!/usr/bin/env python3
"""Populates jd's corpus once and times the per-file read workloads, printing the mount's op and RPC
counts per phase (for finding where per-file time goes)."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'bench'))
from harness import Stack, corpus, syncfs  # noqa: E402

WORK = Path(os.environ.get('WORK', '/tmp/dfs-profile'))


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    data = WORK / 'corpus' if (WORK / 'corpus/manifest.json').exists() else corpus(WORK)
    tar = WORK / 'corpus.tar'
    if not tar.exists():
        subprocess.run(['tar', '-cf', str(tar), '-C', str(data), 'docs'], check=True)
    paths = sorted(str(p.relative_to(data / 'docs')) for p in (data / 'docs').rglob('*') if p.is_file())
    stack = Stack(WORK, port=7406)
    mount = WORK / 'mount'
    try:
        token = stack.provision(['owner:write'], ['owner'])['owner']
        stack.start('populate')
        stack.mount(mount, token)
        subprocess.run(['tar', '--no-same-owner', '-xf', str(tar), '-C', str(mount)], check=True)
        fd = os.open(mount, os.O_RDONLY)
        syncfs(fd)
        os.close(fd)
        for phase, work in [('fstat', fstat), ('read', read)]:
            for run in ['first', 'warm']:
                if run == 'first':
                    stack.stop()
                    stack.start(phase)
                    stack.mount(mount, token)
                started = time.monotonic()
                work(mount / 'docs', paths)
                print(f'{phase} {run}: {(time.monotonic() - started) * 1000:.0f} ms', flush=True)
            totals = stack.unmount(mount)
            print(json.dumps({'local': totals['local'], 'rpcs': totals['rpcs']}))
            stack.mount(mount, token)
    finally:
        stack.stop()
        stack.wipe()


def fstat(docs, paths):
    for path in paths:
        fd = os.open(docs / path, os.O_RDONLY)
        os.fstat(fd)
        os.close(fd)


def read(docs, paths):
    for path in paths:
        hashlib.sha256((docs / path).read_bytes())


if __name__ == '__main__':
    main()
