#!/usr/bin/env python3
"""Kills a mount (SIGKILL) in the middle of an untar, then checks through a new mount and fsck that
durable storage is object-consistent: every file that exists holds a prefix of its source (all of
it, none of it, or what was sealed before the crash), and no record is orphaned."""
import os
from pathlib import Path
import random
import signal
import subprocess
import sys
import tarfile
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'bench'))
from harness import Stack  # noqa: E402


def main():
    work = Path(tempfile.mkdtemp(prefix='dfs-crash-'))
    source = work / 'src'
    rng = random.Random(7)
    for i in range(3000):
        path = source / f'dir-{i % 37}' / f'sub-{i % 5}' / f'file-{i}'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(rng.randbytes(rng.choice([10, 3000, 70_000, 300_000])))
    with tarfile.open(work / 'src.tar', 'w') as archive:
        archive.add(source, arcname='src')
    stack = Stack(work, port=7405)
    mount = work / 'mnt'
    ok = True
    try:
        token = stack.provision(['owner:write'], ['owner'])['owner']
        stack.start('crash')
        stack.mount(mount, token)
        tar = subprocess.Popen(['/usr/bin/tar', '--no-same-owner', '-xf', str(work / 'src.tar'), '-C', str(mount)],
                               stderr=subprocess.DEVNULL)
        time.sleep(float(os.environ.get('CRASH_AFTER', '2')))
        process = stack.mounts.pop(mount)
        process.send_signal(signal.SIGKILL)
        process.wait()
        tar.wait()
        subprocess.run(['fusermount3', '-u', '-z', str(mount)], check=False)
        stack.mount(mount, token)
        present = prefixes = missing = 0
        for path in sorted(source.rglob('*')):
            if not path.is_file():
                continue
            got = mount / 'src' / path.relative_to(source)
            if not got.exists():
                missing += 1
                continue
            data, want = got.read_bytes(), path.read_bytes()
            if data == want:
                present += 1
            elif want.startswith(data):
                prefixes += 1
            else:
                print(f'FAIL {got}: {len(data)} bytes, not a prefix of its source')
                ok = False
        print(f'after crash: {present} complete, {prefixes} prefixes, {missing} missing')
        stack.unmount(mount)
        fsck = subprocess.run([str(Path(os.environ.get('DFS_BIN', '/target/release')) / 'dfs-server'), '--prefix',
                               stack.prefix, 'fsck'], capture_output=True, text=True)
        print(fsck.stdout.strip())
        ok &= fsck.returncode == 0
    finally:
        stack.stop()
        stack.wipe()
    print('crash ok' if ok else 'crash FAILED')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
