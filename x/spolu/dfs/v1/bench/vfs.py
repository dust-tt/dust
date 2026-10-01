#!/usr/bin/env python3
"""Run jd's unchanged workloads with a fresh dfs v1 server and no client caches."""
import argparse
import hashlib
import json
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path('/benchmark') if ROOT == Path('/dfs') else ROOT.parents[2] / 'jd/filesystem-benchmark'
MANIFEST_SHA256 = '67fdf87da1a1b94bc1f6482f00b912c1010d512a907846e5747ba9c893d8a3c1'
sys.path.insert(0, str(ROOT / 'tests'))
from support import docker, drain, mounted, rpc, secret_file, session, start_server


def benchmark(corpus, work, label):
    """@cc [owner:spolu,label:testing;performance] unchanged-jd-workloads
    Workloads, validation, and measured intervals MUST remain unchanged from jd's benchmark.
    Progress and JSON snapshots MUST be written outside measured intervals. Validation failure MUST
    fail the run. First invocation MUST NOT be labeled a cold restart for each workload.
    """
    sys.path.insert(0, '/benchmark')
    import benchmark as original

    class Progress(original.Benchmark):
        def measure(self, *args, **kwargs):
            print(f'Starting: {args[1]} ({args[2]})', flush=True)
            result = super().measure(*args, **kwargs)
            print(' | '.join(self.rows[-1]), flush=True)
            (work / f'{label}.json').write_text(json.dumps(self.rows, indent=2) + '\n')
            return result

    original.Benchmark = Progress
    sys.argv = ['benchmark.py', str(corpus), '--warm-runs', '1']
    if original.main() != 0:
        raise RuntimeError('benchmark validation failed')


def inside(args):
    work = args.work
    if args.phase == 'local':
        with tempfile.TemporaryDirectory(prefix='dfs-v1-local-') as temporary:
            corpus = Path(temporary) / 'corpus'
            shutil.copytree(work / 'corpus', corpus)
            benchmark(corpus, work, 'local')
        return
    workspace = json.loads((work / 'workspace.json').read_text())
    owner = session(args.endpoint, workspace, ['owner'])
    with tempfile.TemporaryDirectory(prefix='dfs-v1-bench-') as temporary:
        with mounted(args.endpoint, owner['session_key'], Path(temporary) / 'dfs') as mount:
            corpus = mount / 'work'
            if args.phase == 'populate':
                started = time.monotonic()
                subprocess.run(['/usr/bin/tar', '--no-same-owner', '-xf', str(work / 'corpus.tar'),
                                '-C', str(corpus)], check=True)
                seconds = time.monotonic() - started
                (work / 'populate.json').write_text(json.dumps({'untar_seconds': seconds}, indent=2) + '\n')
                print(f'Untar: {seconds:.3f}s', flush=True)
            else:
                if hashlib.sha256((corpus / 'manifest.json').read_bytes()).hexdigest() != MANIFEST_SHA256:
                    raise RuntimeError('mounted corpus differs from reference')
                benchmark(corpus, work, 'dfs')


def gcs(work, arguments):
    token = subprocess.run(['gcloud', 'auth', 'application-default', 'print-access-token'],
                           text=True, capture_output=True, check=True).stdout.strip()
    token_path = secret_file(work / ('gcs-token-' + uuid.uuid4().hex), token)
    try:
        return subprocess.run(['gcloud', 'storage', *arguments, '--access-token-file', str(token_path)],
                              text=True, capture_output=True, check=True).stdout
    finally:
        token_path.unlink(missing_ok=True)


def host(args):
    """@cc [owner:spolu,label:testing;security] isolated-cold-benchmark
    Every run MUST own a fresh storage prefix. Restart the server and discard disk caches before
    measuring DFS. Record foreground population and remaining shutdown drain separately. Cleanup MUST
    target only this successful run's generated prefix and remove credentials from retained reports.
    """
    work = args.work or Path(tempfile.mkdtemp(prefix='dfs-v1-vfs-'))
    work.mkdir(parents=True, exist_ok=True)
    if (work / 'run.json').exists():
        raise RuntimeError('report directory already contains a run')
    corpus = work / 'corpus'
    if not corpus.exists():
        subprocess.run([sys.executable, str(SOURCE / 'generate.py'), str(corpus), '--seed', '42'], check=True)
    if hashlib.sha256((corpus / 'manifest.json').read_bytes()).hexdigest() != MANIFEST_SHA256:
        raise RuntimeError('manifest differs from reference')
    with tarfile.open(work / 'corpus.tar', 'w') as archive:
        archive.add(corpus / 'docs', arcname='docs')
        archive.add(corpus / 'manifest.json', arcname='manifest.json')
    prefix = 'dfs-v1/tests/jd-vfs-' + uuid.uuid4().hex
    server_key = secrets.token_hex(32)
    key_path = secret_file(work / 'server.key', server_key)
    backend = ['--local-store', str(work / 'remote')] if args.local_store else ['--bucket', args.bucket]
    arguments = [*backend, '--prefix', prefix]
    run = {'bucket': None if args.local_store else args.bucket, 'prefix': prefix,
           'manifest_sha256': MANIFEST_SHA256, 'profile': 'release', 'warm_runs': 1,
           'cache_memory_mib': 1024, 'cache_disk_gib': 16, 'max_unflushed_mib': 512,
           'fuse_threads': 8, 'client_data_cache': False, 'kernel_metadata_ttl_seconds': 0,
           'server_restarted_before_suite': True, 'server_restarted_before_each_row': False,
           'old_disk_cache_reused': False}
    def save():
        (work / 'run.json').write_text(json.dumps(run, indent=2) + '\n')
    def phase(name, endpoint=None):
        arguments = ['--phase', name, '--work', '/run/dfs']
        if endpoint:
            arguments += ['--endpoint', endpoint]
        docker(work, 'bench/vfs.py', arguments, extra_mounts=[(SOURCE, '/benchmark')])
    save()
    print(f'Reports: {work}\nStorage prefix: {prefix}', flush=True)
    server = None
    success = False
    try:
        phase('local')
        server, endpoint, docker_endpoint = start_server(work, 'populate', arguments, key_path)
        workspace = rpc(endpoint, server_key, 'create-workspace', {'workspace_id': 'jd-vfs', 'root_grants': ['owner']})
        owner = session(endpoint, workspace, ['owner'])
        rpc(endpoint, owner['session_key'], 'create', {'parent_id': workspace['root_id'],
            'expected_parent_version': 1, 'name': 'work', 'directory': True, 'mode': 493})
        secret_file(work / 'workspace.json', json.dumps(workspace))
        phase('populate', docker_endpoint)
        run['populate_drain_seconds'] = drain(server)
        save()
        server, endpoint, docker_endpoint = start_server(work, 'benchmark', arguments, key_path)
        phase('benchmark', docker_endpoint)
        run['benchmark_drain_seconds'] = drain(server)
        if args.local_store:
            run['retained_remote_bytes'] = sum(p.stat().st_size for p in (work / 'remote').rglob('*') if p.is_file())
        else:
            run['retained_remote_bytes'] = int(gcs(work, ['du', '--summarize', f'gs://{args.bucket}/{prefix}/']).split()[0])
        # Retained object bytes exclude deleted versions and are not total uploaded/write-amplification bytes.
        save()
        success = True
    finally:
        if server is not None and server.poll() is None:
            server.kill()
            server.wait(timeout=10)
        key_path.unlink(missing_ok=True)
        (work / 'workspace.json').unlink(missing_ok=True)
        if success and not args.local_store:
            gcs(work, ['rm', '--recursive', f'gs://{args.bucket}/{prefix}/'])
        print(f'Run {"passed" if success else "failed; remote fixture retained"}: {work}', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path)
    parser.add_argument('--bucket', default='dust-dev-dfs-poc-spolu-20260930')
    parser.add_argument('--local-store', action='store_true')
    parser.add_argument('--phase', choices=['local', 'populate', 'benchmark'])
    parser.add_argument('--endpoint')
    args = parser.parse_args()
    inside(args) if args.phase else host(args)
