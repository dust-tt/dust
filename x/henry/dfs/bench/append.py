#!/usr/bin/env python3
"""Small changes to a big file, each after its cached state expired: open + append a line + close,
then open + 4 KiB pwrite at a random offset + close. Validates the final content through the
writing mount and through a new mount."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import random
import statistics
import tempfile
import time

from harness import MAX_DELAY_MS, Stack, metadata, peak_rss_mib, syncfs

MAX = MAX_DELAY_MS / 1000
TTL = MAX - min(MAX / 4, 1.0)
CHUNK = 1 << 20


def drain(directory):
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        syncfs(fd)
    finally:
        os.close(fd)


def timed(cycles, op):
    times = []
    for i in range(cycles):
        time.sleep(TTL + 0.3)
        started = time.monotonic()
        op(i)
        times.append((time.monotonic() - started) * 1000)
    return {'median_ms': statistics.median(times), 'max_ms': max(times), 'ms': times}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path)
    parser.add_argument('--mib', type=int, default=256)
    parser.add_argument('--cycles', type=int, default=10)
    args = parser.parse_args()
    work = args.work or Path(tempfile.mkdtemp(prefix='dfs-henry-append-'))
    work.mkdir(parents=True, exist_ok=True)
    rng = random.Random(42)
    expected = bytearray(rng.randbytes(args.mib * CHUNK))
    run = metadata() | {'file_mib': args.mib, 'cycles': args.cycles, 'spacing_s': TTL + 0.3}
    stack = Stack(work, port=7411)
    a, b = work / 'a', work / 'b'
    try:
        token = stack.provision(['owner:write'], ['owner'])['owner']
        stack.start('append')
        stack.mount(a, token)
        path = a / 'log'
        started = time.monotonic()
        with open(path, 'wb') as f:
            for at in range(0, len(expected), CHUNK):
                f.write(expected[at:at + CHUNK])
        drain(a)
        run['populate_seconds'] = time.monotonic() - started

        def append(i):
            line = f'line {i}: {"x" * 90}\n'.encode()
            fd = os.open(path, os.O_WRONLY | os.O_APPEND)
            os.write(fd, line)
            os.close(fd)
            expected.extend(line)

        def overwrite(i):
            offset = rng.randrange(0, len(expected) - 4096)
            data = rng.randbytes(4096)
            fd = os.open(path, os.O_RDWR)
            os.pwrite(fd, data, offset)
            os.close(fd)
            expected[offset:offset + 4096] = data

        run['append'] = timed(args.cycles, append)
        run['pwrite'] = timed(args.cycles, overwrite)
        digest = hashlib.sha256(expected).hexdigest()
        run['writer_view_ok'] = hashlib.sha256(path.read_bytes()).hexdigest() == digest
        drain(a)
        run['mount_peak_rss_mib'] = peak_rss_mib(stack.mounts[a].pid)
        totals = stack.unmount(a)
        run['rpcs'] = {kind: row['calls'] for kind, row in totals['rpcs'].items()}
        stack.mount(b, token)
        run['new_mount_view_ok'] = hashlib.sha256((b / 'log').read_bytes()).hexdigest() == digest
        stack.stop()
    finally:
        stack.stop()
        stack.wipe()
        (work / 'run.json').write_text(json.dumps(run, indent=2) + '\n')
    for name in ('append', 'pwrite'):
        print(f"{name:7} median {run[name]['median_ms']:9.2f} ms   max {run[name]['max_ms']:9.2f} ms")
    print(f"mount peak RSS {run['mount_peak_rss_mib']:.0f} MiB; rpcs {run['rpcs']}")
    ok = run['writer_view_ok'] and run['new_mount_view_ok']
    print(f"{'Validated' if ok else 'FAILED'}: writer view {run['writer_view_ok']}, new mount "
          f"{run['new_mount_view_ok']}; report: {work}")
    return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
