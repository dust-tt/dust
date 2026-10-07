"""Operator-only helpers for isolated integration and performance fixtures."""
import contextlib
import json
import os
import secrets
from pathlib import Path
import signal
import subprocess
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
BINARY = Path(os.environ.get('DFS_BINARY_DIR', '/target/release' if Path('/target').exists() else str(ROOT / 'target/release')))


def fuse_binary():
    return Path(os.environ.get('DFS_BENCH_FUSE_BINARY', str(BINARY / 'dfs-fuse')))


def server_binary():
    return Path(os.environ.get('DFS_BENCH_SERVER_BINARY', str(BINARY / 'dfs-server-v5')))


def secret_file(path, value):
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as out:
        out.write(value)
    return path


def rpc(endpoint, key, method, body=None):
    with tempfile.TemporaryDirectory(prefix='dfs-rpc-') as temporary:
        key_file = secret_file(Path(temporary) / 'key', key)
        command = [str(BINARY / 'dfs'), '--endpoint', endpoint, '--key-file', str(key_file), method]
        output = Path(temporary) / 'response'
        private = method in ('create-tenant', 'create-session')
        if private:
            command += ['--output', str(output)]
        result = subprocess.run(command, input=json.dumps(body or {}), text=True,
                                capture_output=True, check=True)
        return json.loads(output.read_text() if private else result.stdout)


def session(endpoint, tenant, grants):
    return rpc(endpoint, tenant['tenant_key'], 'create-session',
               {'tenant_id': tenant['tenant_id'], 'grants': grants})


def process_usage(process):
    """CPU since process start; sample before shutdown, excluding the remaining drain."""
    fields = Path(f'/proc/{process.pid}/stat').read_text().rsplit(')', 1)[1].split()
    ticks = os.sysconf('SC_CLK_TCK')
    status = dict(line.split(':', 1) for line in Path(f'/proc/{process.pid}/status').read_text().splitlines())
    return {'user_seconds': int(fields[11]) / ticks,
            'system_seconds': int(fields[12]) / ticks,
            'rss_bytes': int(status['VmRSS'].split()[0]) * 1024,
            'peak_rss_bytes': int(status['VmHWM'].split()[0]) * 1024}


@contextlib.contextmanager
def mounted(endpoint, key, directory, threads=8, metrics_path=None):
    directory.mkdir()
    key_file = secret_file(directory.parent / (directory.name + '.key'), key)
    log_path = directory.parent / (directory.name + '.log')
    with log_path.open('w') as log:
        process = subprocess.Popen([str(fuse_binary()), '--endpoint', endpoint,
            '--session-key-file', str(key_file), '--threads', str(threads), str(directory)], stdout=log, stderr=log)
    try:
        deadline = time.monotonic() + 30
        while not os.path.ismount(directory):
            if process.poll() is not None or time.monotonic() > deadline:
                raise RuntimeError(f'mount failed: {log_path.read_text()}')
            time.sleep(.05)
        yield directory
    finally:
        unmount_started = time.monotonic()
        usage = process_usage(process) if process.poll() is None else None
        if process.poll() is None:
            process.send_signal(signal.SIGTERM)
            try:
                process.wait(timeout=60)
            except subprocess.TimeoutExpired:
                subprocess.run(['/usr/bin/fusermount3', '-uz', str(directory)], check=False)
                process.kill()
                process.wait(timeout=10)
        key_file.unlink(missing_ok=True)
        if metrics_path is not None:
            metrics = {'process_cpu': usage, 'unmount_seconds': time.monotonic() - unmount_started}
            for line in log_path.read_text().splitlines():
                if line.startswith('{'):
                    record = json.loads(line)
                    if 'dfs_client_metrics' in record or 'client_drain_ms' in record:
                        metrics.update(record)
            metrics_path.write_text(json.dumps(metrics, indent=2) + '\n')
        if process.returncode != 0:
            raise RuntimeError(f'mount failed: {log_path.read_text()}')


def identity(work):
    prefix = 'dfs-v5-bench-' + uuid.uuid4().hex
    key = secrets.token_hex(32)
    return prefix, key, secret_file(work / 'server.key', key)


def start(work, phase, prefix, key_path):
    log_path = work / f'{phase}-server.log'
    with log_path.open('w') as log:
        process = subprocess.Popen([str(server_binary()), '--listen', '127.0.0.1:0',
            '--server-key-file', str(key_path), '--fdb-prefix', prefix], stdout=log, stderr=log)
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        for line in log_path.read_text().splitlines():
            try:
                fields = json.loads(line).get('fields', {})
            except json.JSONDecodeError:
                continue
            if fields.get('message') == 'dfs server listening':
                return process, 'http://' + fields['address']
        if process.poll() is not None:
            raise RuntimeError(f'server failed: {log_path}')
        time.sleep(.02)
    process.kill()
    process.wait(timeout=10)
    raise RuntimeError(f'server startup timed out: {log_path}')


def stop(process):
    started = time.monotonic()
    process.send_signal(signal.SIGTERM)
    process.wait(timeout=30)
    if process.returncode:
        raise RuntimeError('server shutdown failed; inspect its log')
    return time.monotonic() - started


def shutdown(path):
    for line in reversed(path.read_text().splitlines()):
        try:
            fields = json.loads(line).get('fields', {})
        except json.JSONDecodeError:
            continue
        if fields.get('message') == 'dfs server stopped':
            return fields
    raise RuntimeError(f'missing shutdown report: {path}')


def profile(path):
    for line in reversed(path.read_text().splitlines()):
        try:
            fields = json.loads(line).get('fields', {})
        except json.JSONDecodeError:
            continue
        if fields.get('message') == 'server profile':
            return json.loads(fields['profile'])
    return None
