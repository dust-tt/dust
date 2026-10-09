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
import socket
import subprocess
import sys
import tarfile
import threading
import time

TAR = '/usr/bin/tar'


# jd's corpus (x/jd/filesystem-benchmark/generate.py, seed 42): the corpus behind the numbers in
# x/henry/dfs/DESIGN.md and spolu's RESULTS.md. Same manifest hash as x/henry/dfs/bench/harness.py.
JD_GENERATE = '/opt/jd_generate.py'
JD_MANIFEST_SHA256 = '67fdf87da1a1b94bc1f6482f00b912c1010d512a907846e5747ba9c893d8a3c1'


def corpus(args):
    if args.kind == 'jd':
        return jd_corpus(args)
    return scatter_corpus(args)


def jd_corpus(args):
    """jd's 10k files in 100 directories, tarred like x/henry/dfs/bench/untar.py: directories first
    (shallowest first), then files in manifest order."""
    source = Path('/tmp/jd-corpus')
    subprocess.run([sys.executable, '-I', JD_GENERATE, str(source), '--seed', '42'], check=True,
                   stdout=subprocess.DEVNULL)
    manifest_bytes = (source / 'manifest.json').read_bytes()
    manifest_sha256 = hashlib.sha256(manifest_bytes).hexdigest()
    if manifest_sha256 != JD_MANIFEST_SHA256:
        raise SystemExit(f'jd corpus manifest {manifest_sha256} != {JD_MANIFEST_SHA256}')
    files = json.loads(manifest_bytes)['paths']
    with tarfile.open(args.out, 'w') as archive:
        directories = {parent for file in files for parent in Path(file).parents if parent != Path('.')}
        for directory in sorted(directories, key=lambda path: (len(path.parts), str(path))):
            archive.add(source / 'docs' / directory, arcname=str(Path('docs') / directory), recursive=False)
        for file in files:
            archive.add(source / 'docs' / file, arcname=str(Path('docs') / file))
    return {'kind': 'jd', 'archive': args.out, 'files': len(files), 'directories': len(directories) + 1,
            'bytes': sum(json.loads(manifest_bytes)['sizes']), 'seed': 42, 'manifest_sha256': manifest_sha256}


def scatter_corpus(args):
    """Metadata stress, not comparable with other benches: ~1.8 files per directory over ~5.5k
    directories, in random order, so the archive keeps jumping between directories."""
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
    return {'kind': 'scatter', 'archive': args.out, 'files': args.files, 'bytes': total_bytes, 'seed': args.seed}


def rtt(args):
    """Round trips over one TCP connection to an echo server: the network floor of an RPC from this
    sandbox. Connect time is not reported: E2B's egress layer accepts connections locally."""
    host, port = args.addr.rsplit(':', 1)
    with socket.create_connection((host, int(port)), timeout=10) as connection:
        connection.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        payload = b'x' * 64
        samples = []
        for index in range(args.count + 5):
            started = time.monotonic()
            connection.sendall(payload)
            received = 0
            while received < len(payload):
                chunk = connection.recv(len(payload) - received)
                if not chunk:
                    raise SystemExit('echo server closed the connection')
                received += len(chunk)
            if index >= 5:
                samples.append(time.monotonic() - started)
    samples.sort()
    pick = lambda q: samples[min(len(samples) - 1, int(q * len(samples)))]
    return {'addr': args.addr, 'count': len(samples), 'min_ms': samples[0] * 1000, 'p50_ms': pick(0.5) * 1000,
            'p95_ms': pick(0.95) * 1000, 'max_ms': samples[-1] * 1000,
            'echo_mb_per_second': echo_throughput(host, int(port), args.bulk_mb)}


def echo_throughput(host, port, megabytes):
    """Streams `megabytes` through the echo server on one connection; bounded by the slower of
    upload and download."""
    total = megabytes << 20
    chunk = b'x' * (256 << 10)
    with socket.create_connection((host, port), timeout=30) as connection:
        started = time.monotonic()
        sender = threading.Thread(target=lambda: [connection.sendall(chunk) for _ in range(total // len(chunk))])
        sender.start()
        received = 0
        while received < total:
            data = connection.recv(1 << 20)
            if not data:
                raise SystemExit('echo server closed the connection')
            received += len(data)
        sender.join()
        return total / (1 << 20) / (time.monotonic() - started)


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


DUST_REPO = 'https://github.com/dust-tt/dust'


def run_git(repo, *command):
    """`git` as root on a tree another uid may own, timed."""
    started = time.monotonic()
    out = subprocess.run(['git', '-c', 'safe.directory=*', *command], cwd=repo, check=True, capture_output=True,
                         text=True).stdout
    return time.monotonic() - started, out


def git_status(repo):
    first, out = run_git(repo, 'status', '--porcelain')
    repeated, _ = run_git(repo, 'status', '--porcelain')
    head = run_git(repo, 'rev-parse', 'HEAD')[1].strip()
    return {'status_first_seconds': first, 'status_repeated_seconds': repeated, 'clean': out == '', 'head': head,
            'dirty_paths': len(out.splitlines())}


def git_clone(args):
    """x/henry/dfs/bench/git.py: clone from GitHub (network included), drain, `git status` twice."""
    target = Path(args.target)
    target.parent.mkdir(parents=True, exist_ok=True)
    clone_seconds, _ = run_git(target.parent, 'clone', '-q', args.url, target.name)
    return {'clone_seconds': clone_seconds, 'drain_seconds': drain(target), **git_status(target),
            'files': len(run_git(target, 'ls-files', '-z')[1].split('\0')) - 1}


def git_validate(args):
    """`git status` twice on a clone made through another mount, then every tracked regular file,
    read back and hashed, must match the blob its index entry names."""
    repo = Path(args.repo)
    result = git_status(repo)
    started = time.monotonic()
    staged = [line.split(None, 3) for line in run_git(repo, 'ls-files', '-s', '-z')[1].split('\0') if line]
    files = [(path, blob) for mode, blob, _, path in staged if mode in ('100644', '100755')]
    hashed = subprocess.run(['git', '-c', 'safe.directory=*', 'hash-object', '--no-filters', '--stdin-paths'],
                            cwd=repo, check=True, capture_output=True, text=True,
                            input='\n'.join(path for path, _ in files)).stdout.split()
    return {**result, 'blobs_checked': len(files), 'validate_seconds': time.monotonic() - started,
            'blobs_match': len(files) > 0 and hashed == [blob for _, blob in files]}


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
    command.add_argument('--kind', choices=['jd', 'scatter'], default='jd')
    command.add_argument('--files', type=int, default=10000, help='scatter only')
    command.add_argument('--seed', type=int, default=42, help='scatter only')
    command = commands.add_parser('untar')
    command.add_argument('--archive', required=True)
    command.add_argument('--target', required=True)
    command = commands.add_parser('rtt')
    command.add_argument('--addr', required=True)
    command.add_argument('--count', type=int, default=200)
    command.add_argument('--bulk-mb', type=int, default=64)
    command = commands.add_parser('git-clone')
    command.add_argument('--target', required=True)
    command.add_argument('--url', default=DUST_REPO)
    command = commands.add_parser('git-validate')
    command.add_argument('--repo', required=True)
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
                'fresh-read': fresh_read, 'rtt': rtt,
                'git-clone': git_clone, 'git-validate': git_validate}
    print(json.dumps(handlers[args.command](args)))


if __name__ == '__main__':
    main()
