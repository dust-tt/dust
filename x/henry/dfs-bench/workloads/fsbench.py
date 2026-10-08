#!/usr/bin/env python3
"""Filesystem workloads run inside a sandbox against a mounted path. Standard library only.
Each subcommand prints one JSON object on stdout."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import random
import subprocess
import sys
import tarfile
import time

TAR = '/usr/bin/tar'


def corpus(args):
    """Deterministic source-like tree: mostly small files, a few large ones, nested directories."""
    rng = random.Random(args.seed)
    total_bytes = 0
    with tarfile.open(args.out, 'w') as archive:
        for index in range(args.files):
            depth = rng.randint(1, 4)
            parts = [f'd{rng.randint(0, 15)}' for _ in range(depth)]
            roll = rng.random()
            size = rng.randint(0, 1024) if roll < 0.7 else rng.randint(1024, 16384) if roll < 0.95 else rng.randint(16384, 262144)
            data = rng.randbytes(size)
            info = tarfile.TarInfo('/'.join([*parts, f'f{index}.txt']))
            info.size = size
            info.mtime = 0
            archive.addfile(info, fileobj=io.BytesIO(data))
            total_bytes += size
    return {'archive': args.out, 'files': args.files, 'bytes': total_bytes, 'seed': args.seed}


def extract(archive, target):
    target.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    subprocess.run([TAR, '--no-same-owner', '-xf', archive, '-C', str(target)], check=True)
    return time.monotonic() - started


def drain(directory):
    """fsync of a directory is dfs-mount's barrier for background commits."""
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        started = time.monotonic()
        os.fsync(fd)
        return time.monotonic() - started
    finally:
        os.close(fd)


def tree_digest(root):
    started = time.monotonic()
    digest = hashlib.sha256()
    files = 0
    for directory, subdirs, names in os.walk(root):
        subdirs.sort()
        for name in sorted(names):
            path = Path(directory) / name
            digest.update(str(path.relative_to(root)).encode())
            digest.update(hashlib.sha256(path.read_bytes()).digest())
            files += 1
    return {'digest': digest.hexdigest(), 'files': files, 'seconds': time.monotonic() - started}


def untar(args):
    native = Path('/tmp/native')
    native_seconds = extract(args.archive, native)
    target = Path(args.target)
    untar_seconds = extract(args.archive, target)
    drain_seconds = drain(target)
    return {'native_seconds': native_seconds, 'untar_seconds': untar_seconds, 'drain_seconds': drain_seconds,
            'native_digest': tree_digest(native)['digest']}


def digest(args):
    return tree_digest(Path(args.root))


def fresh_write(args):
    """Creates `count` files; `<name>.ack` holds the wall-clock time at which its close returned."""
    directory = Path(args.dir)
    directory.mkdir(parents=True, exist_ok=True)
    for index in range(args.count):
        path = directory / f'{index:05d}'
        with open(path, 'w') as file:
            file.write('0' * 32)
        acknowledged = time.time()
        (directory / f'{index:05d}.ack').write_text(repr(acknowledged))
        time.sleep(args.interval_ms / 1000)
    return {'written': args.count}


def fresh_read(args):
    """Polls for the writer's files; latency = first time visible here - writer's ack time.
    Assumes sandbox clocks agree within a few ms (both NTP-synced VMs). Prints `ready` on stderr
    once polling: the writer must start after it, or latencies are overstated."""
    directory = Path(args.dir)
    seen = {}
    print('ready', file=sys.stderr, flush=True)
    deadline = time.time() + args.timeout_seconds
    while len(seen) < args.count and time.time() < deadline:
        try:
            names = os.listdir(directory)
        except FileNotFoundError:
            names = []
        now = time.time()
        for name in names:
            if not name.endswith('.ack') and name not in seen:
                seen[name] = now
        time.sleep(args.poll_ms / 1000)
    latencies = []
    for name, visible in seen.items():
        try:
            acknowledged = float((directory / f'{name}.ack').read_text())
        except (FileNotFoundError, ValueError):
            continue
        latencies.append(visible - acknowledged)
    latencies.sort()
    pick = lambda q: latencies[min(len(latencies) - 1, int(q * len(latencies)))] if latencies else None
    return {'expected': args.count, 'seen': len(seen), 'measured': len(latencies), 'p50_seconds': pick(0.5),
            'p95_seconds': pick(0.95), 'max_seconds': latencies[-1] if latencies else None}


def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest='command', required=True)
    command = commands.add_parser('corpus')
    command.add_argument('--out', required=True)
    command.add_argument('--files', type=int, default=10000)
    command.add_argument('--seed', type=int, default=42)
    command = commands.add_parser('untar')
    command.add_argument('--archive', required=True)
    command.add_argument('--target', required=True)
    command = commands.add_parser('digest')
    command.add_argument('--root', required=True)
    command = commands.add_parser('fresh-write')
    command.add_argument('--dir', required=True)
    command.add_argument('--count', type=int, default=50)
    command.add_argument('--interval-ms', type=int, default=100)
    command = commands.add_parser('fresh-read')
    command.add_argument('--dir', required=True)
    command.add_argument('--count', type=int, default=50)
    command.add_argument('--poll-ms', type=int, default=5)
    command.add_argument('--timeout-seconds', type=float, default=60)
    args = parser.parse_args()
    handlers = {'corpus': corpus, 'untar': untar, 'digest': digest, 'fresh-write': fresh_write,
                'fresh-read': fresh_read}
    print(json.dumps(handlers[args.command](args)))


if __name__ == '__main__':
    main()
