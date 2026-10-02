"""Operator-only helpers for isolated integration and performance fixtures."""
import contextlib
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
BINARY = Path('/target/release') if Path('/target/release/dfs').exists() else ROOT / 'target/release'


def secret_file(path, value):
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as out:
        out.write(value)
    return path


def rpc(endpoint, key, method, body=None):
    with tempfile.TemporaryDirectory(prefix='dfs-rpc-') as temporary:
        key_file = secret_file(Path(temporary) / 'key', key)
        command = [str(BINARY / 'dfs'), '--endpoint', endpoint, '--key-file', str(key_file), method]
        output = Path(temporary) / 'response'
        private = method in ('create-workspace', 'create-session')
        if private:
            command += ['--output', str(output)]
        result = subprocess.run(command, input=json.dumps(body or {}), text=True,
                                capture_output=True, check=True)
        return json.loads(output.read_text() if private else result.stdout)


def session(endpoint, workspace, grants):
    return rpc(endpoint, workspace['workspace_key'], 'create-session',
               {'workspace_id': workspace['workspace_id'], 'grants': grants})


def start_server(work, phase, arguments, key_path):
    log_path = work / f'{phase}-server.log'
    with log_path.open('w') as log:
        process = subprocess.Popen([str(ROOT / 'target/release/dfs-server'),
            '--listen', '0.0.0.0:0', '--allow-insecure', '--server-key-file', str(key_path),
            '--cache-dir', str(work / 'cache'), *arguments], stdout=log, stderr=log,
            env={name: value for name, value in os.environ.items() if not name.startswith('DFS_')})
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        for line in log_path.read_text().splitlines():
            if not line.endswith('}'):
                continue
            record = json.loads(line).get('fields', {})
            if record.get('message') == 'dfs server listening':
                port = record['address'].rsplit(':', 1)[1]
                return process, f'http://127.0.0.1:{port}', f'http://host.docker.internal:{port}'
        if process.poll() is not None:
            raise RuntimeError(f'server exited; see {log_path}')
        time.sleep(.05)
    process.kill()
    process.wait(timeout=10)
    raise RuntimeError(f'server startup timeout; see {log_path}')


def drain(process):
    started = time.monotonic()
    process.send_signal(signal.SIGTERM)
    process.wait(timeout=320)
    if process.returncode != 0:
        raise RuntimeError('persistence drain failed')
    return time.monotonic() - started


@contextlib.contextmanager
def mounted(endpoint, key, directory, threads=8, metrics_path=None):
    directory.mkdir()
    key_file = secret_file(directory.parent / (directory.name + '.key'), key)
    log_path = directory.parent / (directory.name + '.log')
    with log_path.open('w') as log:
        process = subprocess.Popen([str(BINARY / 'dfs-fuse'), '--endpoint', endpoint,
            '--session-key-file', str(key_file), '--threads', str(threads), str(directory)], stdout=log, stderr=log)
    try:
        deadline = time.monotonic() + 30
        while not os.path.ismount(directory):
            if process.poll() is not None or time.monotonic() > deadline:
                raise RuntimeError(f'mount failed: {log_path.read_text()}')
            time.sleep(.05)
        yield directory
    finally:
        if process.poll() is None:
            process.send_signal(signal.SIGTERM)
            try:
                process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                subprocess.run(['/usr/bin/fusermount3', '-uz', str(directory)], check=False)
                process.kill()
                process.wait(timeout=10)
        key_file.unlink(missing_ok=True)
        if metrics_path is not None:
            for line in log_path.read_text().splitlines():
                if line.startswith('{'):
                    record = json.loads(line)
                    if 'dfs_client_metrics' in record:
                        metrics_path.write_text(json.dumps(record, indent=2) + '\n')
        if process.returncode != 0:
            raise RuntimeError(f'mount failed: {log_path.read_text()}')


def docker(work, script, arguments, extra_mounts=()):
    name = 'dfs-v1-' + uuid.uuid4().hex
    command = ['docker', 'run', '--rm', '--name', name, '--device', '/dev/fuse',
        '--cap-add', 'SYS_ADMIN', '--security-opt', 'apparmor=unconfined',
        '--mount', f'type=bind,src={ROOT},dst=/dfs,readonly',
        '--mount', 'type=volume,src=dfs-v1-linux-target,dst=/target,readonly',
        '--mount', f'type=bind,src={work},dst=/run/dfs']
    for source, target in extra_mounts:
        command += ['--mount', f'type=bind,src={source},dst={target},readonly']
    try:
        subprocess.run([*command, 'dfs-v1-fuse-dev', '/usr/bin/python3', '-u',
                        '/dfs/' + script, *arguments], check=True, timeout=3600)
    finally:
        subprocess.run(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL, check=False)
