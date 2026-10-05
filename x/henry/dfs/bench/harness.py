"""Process helpers shared by the benchmarks: provision, serve, mount, stop, collect totals."""
import hashlib
import json
import os
from pathlib import Path
import platform
import signal
import subprocess
import sys
import time
import uuid

BIN = Path(os.environ.get('DFS_BIN', '/target/release'))
BASELINE = Path(__file__).resolve().parents[1] / '.baseline/x/spolu/dfs/v2'
MANIFEST_SHA256 = '67fdf87da1a1b94bc1f6482f00b912c1010d512a907846e5747ba9c893d8a3c1'
# MAX_EVENTUAL_CONSISTENCY_DELAY: commit window min(MAX/4, 1s), daemon cache TTL the rest.
MAX_DELAY_MS = int(os.environ.get('DFS_MAX_DELAY_MS', '1000'))
DURABILITY = ('every mutation is acknowledged before its commit and committed within the window; fsync of a '
              'file or directory waits for every earlier mutation to commit')
FUSE_THREADS = int(os.environ.get('DFS_FUSE_THREADS', '1'))
KNOBS = ('DFS_FDB_GRV_BATCH_TIMEOUT_SECONDS', 'DFS_FDB_CLIENT_BUSY_WAIT_SECONDS')


def corpus(work, files=10000):
    """Spolu's generator (jd's corpus, seed 42), checked against the same manifest hash."""
    target = work / 'corpus'
    subprocess.run([sys.executable, str(BASELINE / 'bench/corpus.py'), str(target), '--files', str(files)],
                   check=True)
    if files == 10000:
        assert hashlib.sha256((target / 'manifest.json').read_bytes()).hexdigest() == MANIFEST_SHA256
    return target


def metadata():
    return {'label': 'dfs henry [FoundationDB]', 'manifest_sha256': MANIFEST_SHA256, 'profile': 'release',
            'linux': platform.platform(), 'cpu_count': os.cpu_count(),
            'server_binary_sha256': hashlib.sha256((BIN / 'dfs-server').read_bytes()).hexdigest(),
            'mount_binary_sha256': hashlib.sha256((BIN / 'dfs-mount').read_bytes()).hexdigest(),
            'fdb_client_knobs': {k: os.environ[k] for k in KNOBS if k in os.environ},
            'max_delay_ms': MAX_DELAY_MS, 'durability': DURABILITY, 'fsync': 'durable (drains the mount log)',
            'kernel_caching': 'none (TTL 0, direct I/O)', 'fuse_threads': FUSE_THREADS, 'max_background': 32}


def totals(path, message):
    for line in reversed(path.read_text().splitlines()):
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if row.get('message') == message:
            return row
    return None


class Stack:
    """One tenant prefix; servers and mounts restart around it."""

    def __init__(self, work, port=7410):
        self.work = work
        self.prefix = f'bench-{uuid.uuid4().hex}/'
        self.addr = f'127.0.0.1:{port}'
        self.server = None
        self.mounts = {}
        self.lifetimes = []
        self.phase = 'setup'

    def cli(self, *args, **kwargs):
        return subprocess.run([str(BIN / 'dfs-server'), '--prefix', self.prefix, *args], check=True,
                              capture_output=True, text=True, **kwargs).stdout

    def provision(self, grants, tokens):
        out = self.cli('provision', *[f'--grant={g}' for g in grants], *[f'--token-for={t}' for t in tokens])
        created = json.loads(out)
        self.admin = created['admin']
        return created['tokens']

    def admin_op(self, *args):
        return self.cli('admin', '--addr', self.addr, '--token', self.admin, *args).strip()

    def start(self, phase):
        self.phase = phase
        log = open(self.work / f'{phase}-server.log', 'w')
        self.server = subprocess.Popen([str(BIN / 'dfs-server'), '--prefix', self.prefix, 'serve', '--listen',
                                        self.addr], stdout=subprocess.PIPE, stderr=log, text=True)
        line = self.server.stdout.readline()
        if not line.startswith('listening'):
            raise RuntimeError(f'server failed to start: {line!r}')

    def mount(self, path, token, root=None):
        path.mkdir(parents=True, exist_ok=True)
        log = open(self.work / f'{self.phase}-mount-{path.name}.log', 'w')
        command = [str(BIN / 'dfs-mount'), '--max-delay-ms', str(MAX_DELAY_MS), '--threads', str(FUSE_THREADS), '--addr',
                   self.addr, '--token', token, str(path)]
        if root is not None:
            command[1:1] = ['--root', str(root)]
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=log, text=True)
        line = process.stdout.readline()
        if not line.startswith('mounted'):
            raise RuntimeError(f'mount failed: {line!r}')
        self.mounts[path] = process

    def unmount(self, path):
        process = self.mounts.pop(path)
        process.send_signal(signal.SIGTERM)
        code = process.wait(timeout=120)
        path.rmdir()
        summary = totals(self.work / f'{self.phase}-mount-{path.name}.log', 'mount totals')
        # A run counts only if the mount drained cleanly with every op committed inside its window.
        commit = (summary or {}).get('commit', {})
        if code != 0 or commit.get('dropped_ops') != 0 or commit.get('missed_windows') != 0:
            raise RuntimeError(f'mount {path.name} exited {code} with commit stats {commit}')
        return summary

    def stop(self):
        mounts = {path.name: self.unmount(path) for path in list(self.mounts)}
        if self.server is None:
            return None
        started = time.monotonic()
        self.server.send_signal(signal.SIGTERM)
        self.server.wait(timeout=120)
        self.server = None
        summary = totals(self.work / f'{self.phase}-server.log', 'server totals')
        self.lifetimes.append({'phase': self.phase, 'shutdown_seconds': time.monotonic() - started,
                               'server': summary, 'mounts': mounts})
        return summary

    def wipe(self):
        self.cli('wipe')


def syncfs(fd):
    import ctypes
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.syncfs(fd) != 0:
        raise OSError(ctypes.get_errno(), 'syncfs')
    # fuser cannot receive FUSE_SYNCFS; fsync of a directory is dfs-mount's barrier for background
    # close commits (`fd` is always a directory here).
    os.fsync(fd)
