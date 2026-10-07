#!/usr/bin/env python3
"""One FUSE thread serves cached requests inline and defers blocking ones (`serve-inline-or-defer`):
a client stat-ing a cached path must not wait behind another client's slow uncached reads."""
import os
from pathlib import Path
import sys
import tempfile
import threading
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'bench'))
from harness import MAX_DELAY_MS, Stack, syncfs  # noqa: E402

LIMIT_MS = 20


def main():
    work = Path(tempfile.mkdtemp(prefix='dfs-stall-'))
    stack = Stack(work, port=7409)
    a, b = work / 'a', work / 'b'
    ok = True
    try:
        token = stack.provision(['owner:write'], ['owner'])['owner']
        stack.start('stall')
        stack.mount(a, token)
        (a / 'big').mkdir()
        for i in range(8):
            (a / 'big' / f'f{i}').write_bytes(os.urandom(16 << 20))
        (a / 'small').write_bytes(b'x')
        fd = os.open(a, os.O_RDONLY)
        syncfs(fd)
        os.close(fd)
        stack.mount(b, token)
        done = threading.Event()

        def reader():
            for i in range(8):
                with open(b / 'big' / f'f{i}', 'rb') as f:
                    while f.read(1 << 20):
                        pass
            done.set()

        os.stat(b / 'small')
        times, started = [], time.monotonic()
        thread = threading.Thread(target=reader)
        thread.start()
        while not done.is_set():
            t = time.monotonic()
            os.stat(b / 'small')
            times.append(time.monotonic() - t)
        thread.join()
        took = time.monotonic() - started
        # The stat's own refetches when the TTL lapses are not stalls: allow one per lapse.
        slow = sorted(times)[-5:]
        allowed = 2 * (int(took / (MAX_DELAY_MS / 1000 * 0.75)) + 1)
        ok = sum(t * 1000 >= LIMIT_MS for t in times) <= allowed
        print(f"{'ok' if ok else 'FAIL'}   128 MiB uncached read took {took * 1000:.0f} ms; slowest concurrent cached "
              f"stats {[round(t * 1000, 1) for t in slow]} ms over {len(times)} polls (limit {LIMIT_MS} ms, "
              f"{allowed} refetches allowed)")
    finally:
        stack.stop()
        stack.wipe()
    print('stall ok' if ok else 'stall FAILED')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
