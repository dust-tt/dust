#!/usr/bin/env python3
"""A lookup miss lists the whole directory only up to `LIST_ON_MISS` entries; past that it falls
back to per-name lookups. Checks both answer correctly (hits and misses) through a second mount."""
import os
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'bench'))
from harness import Stack, syncfs  # noqa: E402

FILES = 6000


def main():
    work = Path(tempfile.mkdtemp(prefix='dfs-bigdir-'))
    stack = Stack(work, port=7407)
    a, b = work / 'a', work / 'b'
    ok = True
    try:
        token = stack.provision(['owner:write'], ['owner'])['owner']
        stack.start('bigdir')
        stack.mount(a, token)
        for parent, count in [('big', FILES), ('small', 100)]:
            (a / parent).mkdir()
            for i in range(count):
                (a / parent / f'f{i}').write_bytes(b'x')
        fd = os.open(a, os.O_RDONLY)
        syncfs(fd)
        os.close(fd)
        stack.mount(b, token)
        for parent, count in [('big', FILES), ('small', 100)]:
            found = all((b / parent / f'f{i}').exists() for i in range(0, count, 7))
            missing = not (b / parent / 'nope').exists()
            listed = len(os.listdir(b / parent)) == count
            print(f"{'ok' if found and missing and listed else 'FAIL':4} {parent}: hits {found}, miss {missing}, "
                  f"listing {listed}")
            ok &= found and missing and listed
        rpcs = stack.unmount(b)['rpcs']
        # The large directory is answered by per-name lookups after one capped listing page.
        ok &= rpcs.get('lookup', {}).get('calls', 0) > 0
        print({kind: row['calls'] for kind, row in rpcs.items()})
    finally:
        stack.stop()
        stack.wipe()
    print('bigdir ok' if ok else 'bigdir FAILED')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
