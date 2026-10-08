#!/usr/bin/env python3
import pathlib
import subprocess

root = pathlib.Path(__file__).resolve().parents[1] / 'runtime/controlled'
subprocess.run(['sudo', 'mount', '--make-rprivate', '/'], check=True)
for name in ['bench', 'corpus', 'large', 'demand-mount']:
    path = str(root / name)
    for _ in range(256):
        entries = [line for line in pathlib.Path('/proc/self/mountinfo').read_text().splitlines() if line.split()[4] == path]
        if not entries:
            break
        subprocess.run(['sudo', 'umount', path], check=True)
    else:
        raise RuntimeError(f'mount stack not cleared: {path}')
print('Owned benchmark mount stacks cleared; propagation private')
