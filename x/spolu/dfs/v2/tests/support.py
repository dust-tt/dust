"""Local Linux fixtures using the unchanged v1 client and mount helpers."""
import json
import os
from pathlib import Path
import re
import secrets
import signal
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / 'v1/tests'))
import support as v1

mounted, rpc, secret_file, session, syncfs = v1.mounted, v1.rpc, v1.secret_file, v1.session, v1.syncfs


def identity(work, kind='test'):
    prefix = f'dfs-v2-{kind}-' + uuid.uuid4().hex
    key = secrets.token_hex(32)
    key_path = secret_file(work / 'server.key', key)
    return prefix, key, key_path


def start(work, phase, prefix, key_path, es_url=None):
    path = work / f'{phase}-server.log'
    with path.open('w') as log:
        process = subprocess.Popen(['/target/release/dfs-server-v2', '--listen', '127.0.0.1:0',
            '--server-key-file', str(key_path), '--fdb-prefix', prefix, '--es-index', prefix,
            *(['--es-url', es_url] if es_url else [])],
            stdout=log, stderr=log)
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        for line in path.read_text().splitlines():
            try:
                fields = json.loads(line).get('fields', {})
            except json.JSONDecodeError:
                continue
            if fields.get('message') == 'dfs server listening':
                return process, 'http://' + fields['address']
        if process.poll() is not None:
            raise RuntimeError(f'server exited; inspect {path}')
        time.sleep(.05)
    process.kill()
    process.wait(timeout=10)
    raise RuntimeError(f'server startup timeout; inspect {path}')


def stop(process):
    started = time.monotonic()
    process.send_signal(signal.SIGTERM)
    process.wait(timeout=30)
    if process.returncode:
        raise RuntimeError('server shutdown failed')
    return time.monotonic() - started


def cleanup(prefix):
    """Delete only a generated fixture subspace/index after its server has stopped."""
    if not re.fullmatch(r'dfs-v2-(test|bench)-[0-9a-f]{32}', prefix):
        raise ValueError('not an isolated fixture')
    key = b'\x02' + len(prefix).to_bytes(2, 'big') + prefix.encode()
    end = key[:-1] + bytes([key[-1] + 1])
    encode = lambda value: ''.join(f'\\x{byte:02x}' for byte in value)
    subprocess.run(['fdbcli', '--timeout', '10', '--exec',
                    f'writemode on; clearrange {encode(key)} {encode(end)}'],
                   check=True, capture_output=True)
    import urllib.error
    import urllib.request
    try:
        with urllib.request.urlopen(urllib.request.Request(
                os.environ['DFS_ES_URL'].rstrip('/') + '/' + prefix, method='DELETE'), timeout=15):
            pass
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
