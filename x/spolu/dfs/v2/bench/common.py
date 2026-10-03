"""Reproducible local benchmark helpers; client and workload sources remain unchanged."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('v2_support', ROOT / 'tests/support.py')
support = importlib.util.module_from_spec(spec)
spec.loader.exec_module(support)
MANIFEST_SHA256 = '67fdf87da1a1b94bc1f6482f00b912c1010d512a907846e5747ba9c893d8a3c1'
KNOBS = {
    'grv': ('DFS_FDB_GRV_BATCH_TIMEOUT_SECONDS', 'grv_batch_timeout', 0.005, 0.000001),
    'client_busy': ('DFS_FDB_CLIENT_BUSY_WAIT_SECONDS', 'busy_wait_threshold', 0.0, 0.0001),
    'commit_min': ('DFS_FDB_COMMIT_BATCH_MIN_SECONDS', 'commit_transaction_batch_interval_min', 0.001, 0.00001),
    'commit_idle': ('DFS_FDB_COMMIT_BATCH_IDLE_SECONDS', 'commit_transaction_batch_interval_from_idle', 0.0005, 0.00001),
    'server_busy': ('DFS_FDB_SERVER_BUSY_WAIT_SECONDS', 'busy_wait_threshold', 0.0, 0.0001),
}


def corpus(work):
    target = work / 'corpus'
    subprocess.run([sys.executable, '/benchmark/generate.py', str(target), '--seed', '42'], check=True)
    assert hashlib.sha256((target / 'manifest.json').read_bytes()).hexdigest() == MANIFEST_SHA256
    return target


def metadata(binary='/target/release/dfs-server-v2'):
    return {'label': 'dfs v2 [FoundationDB + Elasticsearch]', 'manifest_sha256': MANIFEST_SHA256,
            'files': 10000, 'profile': 'release',
            'linux': platform.platform(), 'cpu_count': os.cpu_count(),
            'memory': Path('/proc/meminfo').read_text().splitlines()[0],
            'server_binary_sha256': hashlib.sha256(Path(binary).read_bytes()).hexdigest(),
            'fdb_version': '7.3.69', 'es_version': '8.15.3',
            'fdb_tuning_seconds': {name: float(os.environ.get(variable,
                default if name == 'grv' else tuned))
                for name, (variable, _, default, tuned) in KNOBS.items()},
            'server_cache': 'advisory object/parent IDs only; 16384 entries / 8 MiB accounting budget',
            'backend_caches': 'FDB, ES, and OS caches retained across dfs-server restarts',
            'durability': 'normal FDB commits; no post-acknowledgement persistence drain'}


def save(work, run):
    (work / 'run.json').write_text(json.dumps(run, indent=2) + '\n')


def fields(path, message):
    rows = []
    for line in path.read_text().splitlines():
        try:
            value = json.loads(line).get('fields', {})
        except json.JSONDecodeError:
            continue
        if value.get('message') == message:
            rows.append(value)
    return rows
