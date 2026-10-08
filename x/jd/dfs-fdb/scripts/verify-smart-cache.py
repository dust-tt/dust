import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('backend', choices=['fdb', 'rawkv', 'txnkv'])
parser.add_argument('--attempt', default='accepted')
args = parser.parse_args()
base = Path(__file__).resolve().parents[1]
project = subprocess.check_output(['curl', '-fsS', '-H', 'Metadata-Flavor: Google', 'http://metadata.google.internal/computeMetadata/v1/project/project-id'], text=True).strip()
assert project == 'dust-dev'
root = base if args.backend == 'fdb' else base.parent / 'dfs-tikv'
output = base / 'results/smart-cache' / args.attempt / args.backend
output.mkdir(parents=True, exist_ok=False)
environment = os.environ | {'CARGO_BUILD_JOBS': '3', 'FDB_CLIENT_LIB_PATH': str(base / 'runtime/fdb/bin'), 'LD_LIBRARY_PATH': str(base / 'runtime/fdb/bin'), 'DFS_FDB_TEST_CLUSTER_FILE': str(base / 'runtime/fdb/fdb.cluster'), 'DFS_FDB_TEST_ES': 'http://127.0.0.1:9200', 'DFS_TIKV_TEST_BACKEND': args.backend, 'DFS_TIKV_TEST_ES': 'http://127.0.0.1:9200'}
deployment = json.loads((base / 'runtime/deployment.json').read_text())
port = 2479 if args.backend == 'txnkv' else 2379
environment['DFS_TIKV_TEST_PD'] = ','.join(f'{deployment["nodes"][node]}:{port}' for node in ['a', 'b', 'f'])
info = dict(passed=False, backend=args.backend, project=project, host=os.uname().nodename, steps=[], source_sha256={str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest() for directory in ['src', 'tests'] for path in (root / directory).rglob('*.rs') if not path.name.startswith('._')})

def save():
    (output / 'exit.json').write_text(json.dumps(info, indent=2) + '\n')

if args.backend == 'fdb':
    cases = [None]
else:
    cases = ['daemon_cache_expires_on_demand_and_keeps_file_generations_coherent', 'mounted_metadata_expires_without_stacking_kernel_and_daemon_ttls', 'mounted_files_follow_live_generations_and_fence_competing_writers', 'mounted_live_authority_expires_even_when_path_metadata_remains_visible', 'delayed_read_is_revalidated_after_remote_truncate', 'live_cache_shares_validation_and_uses_local_read_handles', 'mounted_live_descriptors_refresh_contents_and_preserve_identity', 'optimistic_local_writes_reuse_metadata_and_fence_a_cached_conflict']
for case in cases:
    command = ['/home/dfs/.cargo/bin/cargo', 'test', '--locked', '--release']
    command += ['--tests'] if case is None else ['--test', 'frontend', case]
    command += ['--', '--include-ignored', '--nocapture', '--test-threads=1']
    if case:
        command += ['--exact']
    path = output / ((case or 'all-tests') + '.log')
    started = time.monotonic()
    print(args.backend + ' ' + (case or 'all-tests') + ' started', flush=True)
    with path.open('w') as log:
        result = subprocess.run(command, cwd=root, env=environment, stdout=log, stderr=subprocess.STDOUT, timeout=7200)
    counts = [int(value) for value in re.findall(r'test result: ok\. (\d+) passed', path.read_text())]
    info['steps'].append(dict(command=command, observed_exit_code=result.returncode, elapsed_s=time.monotonic() - started, passed=sum(counts), suite_counts=counts))
    save()
    assert result.returncode == 0, str(path)
    assert sum(counts) == (31 if case is None else 1), counts
    print(args.backend + ' ' + (case or 'all-tests') + ' passed', flush=True)
artifact_root = root / ('results/txnkv' if args.backend == 'txnkv' else 'results')
artifacts = output / 'artifacts'
artifacts.mkdir()
for path in artifact_root.glob('*.json'):
    shutil.copy(path, artifacts / path.name)
if (artifact_root / 'cache-rework').exists():
    shutil.copytree(artifact_root / 'cache-rework', artifacts / 'cache-rework')
info['passed'] = True
info['test_count'] = sum(step['passed'] for step in info['steps'])
save()
