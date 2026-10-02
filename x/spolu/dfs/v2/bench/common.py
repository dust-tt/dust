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


def corpus(work):
    target = work / 'corpus'
    subprocess.run([sys.executable, '/benchmark/generate.py', str(target), '--seed', '42'], check=True)
    assert hashlib.sha256((target / 'manifest.json').read_bytes()).hexdigest() == MANIFEST_SHA256
    return target


def metadata():
    return {'label': 'dfs v2 [FoundationDB + Elasticsearch]', 'manifest_sha256': MANIFEST_SHA256,
            'files': 10000, 'profile': 'release',
            'linux': platform.platform(), 'cpu_count': os.cpu_count(),
            'memory': Path('/proc/meminfo').read_text().splitlines()[0],
            'server_binary_sha256': hashlib.sha256(Path('/target/release/dfs-server-v2').read_bytes()).hexdigest(),
            'fdb_version': '7.3.69', 'es_version': '8.15.3', 'server_cache': 'none',
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
