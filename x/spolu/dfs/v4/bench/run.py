#!/usr/bin/env python3
"""Local deep-subtree untar followed by jd's unchanged filesystem workloads."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import random
import resource
import subprocess
import sys
import tarfile
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tests'))
import support


def main():
    """@cc [owner:spolu,label:testing] comparable-local-workloads
    Timed actions and validation MUST remain jd's. Each first read MUST start a new server/session/
    mount, retaining FDB/OS backend caches. Untar and subsequent client drain MUST be separate.
    The client MUST finish draining before the server stops. Server shutdown is not a persistence drain.
    Focused runs MUST record their workload selection and MUST NOT claim full-suite coverage.
    Credentials and raw execution reports MUST remain outside the repository.
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path)
    parser.add_argument('--files', type=int, choices=[10000, 100000], default=10000)
    parser.add_argument('--untar-only', action='store_true', help='Stop after population and drain.')
    parser.add_argument('--workload-prefix', action='append', default=[],
                        help='Select read workloads by name prefix; omit scratch writes. Repeatable.')
    args = parser.parse_args()
    if args.untar_only and args.workload_prefix:
        parser.error('--untar-only cannot be combined with --workload-prefix')
    work = args.work or Path(tempfile.mkdtemp(prefix='dfs-v4-benchmark-'))
    work.mkdir(exist_ok=True, parents=True)
    print(f'Report directory: {work}', flush=True)
    corpus_module = Path(__file__).resolve().parents[2] / 'v2/bench/corpus.py'
    spec = importlib.util.spec_from_file_location('corpus', corpus_module)
    corpus = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(corpus)
    data = work / 'corpus'
    corpus.generate(data, args.files)
    prefix, key, key_path = support.identity(work)
    report = {'files': args.files, 'prefix': prefix, 'warm_runs': 1,
        'untar_only': args.untar_only, 'profile': os.environ.get('DFS_PROFILE') == '1',
        'workload_prefixes': args.workload_prefix,
        'revision': os.environ.get('DFS_BENCH_REVISION', 'uncommitted'),
        'date': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'platform': platform.platform(), 'cpus': os.cpu_count(),
        'client_cache_ttl_ms': int(os.environ.get('DFS_CLIENT_CACHE_TTL_MS', '1000')),
        'client_write_delay_ms': int(os.environ.get('DFS_CLIENT_WRITE_DELAY_MS', '25')),
        'client_write_concurrency': int(os.environ.get('DFS_CLIENT_WRITE_CONCURRENCY', '64')),
        'client_cache_mib': int(os.environ.get('DFS_CLIENT_CACHE_MIB', '1024')),
        'client_memory_budget': 'shared clean/dirty/bookkeeping; includes 96 MiB transient reserve',
        'client_budget_ms': 2000,
        'manifest_sha256': hashlib.sha256((data / 'manifest.json').read_bytes()).hexdigest(),
        'document_bytes': sum(p.stat().st_size for p in (data / 'docs').rglob('*.txt')),
        'cold_scope': 'new server/session/mount for each first case; FDB/OS caches retained',
        'kernel_data_cache': False, 'kernel_writeback': False, 'metadata_ttl_ms': 0,
        'server_binary_sha256': hashlib.sha256(support.server_binary().read_bytes()).hexdigest(),
        'fuse_binary_sha256': hashlib.sha256(support.fuse_binary().read_bytes()).hexdigest(),
        'server_lifetimes': [], 'rows': []}
    def save():
        (work / 'run.json').write_text(json.dumps(report, indent=2) + '\n')
    save()
    with tarfile.open(work / 'corpus.tar', 'w') as archive:
        archive.add(data / 'docs', arcname='docs')
        archive.add(data / 'manifest.json', arcname='manifest.json')
    server = None
    context = None
    phase = 'populate'
    mount_path = work / 'mount'
    resets = 0
    def mount():
        nonlocal context
        user = support.session(endpoint, tenant, ['bench'])
        context = support.mounted(endpoint, user['session_key'], mount_path,
            metrics_path=work / f'{phase}-client-metrics.json')
        context.__enter__()
    def unmount():
        nonlocal context
        if context is not None:
            previous = context
            context = None
            previous.__exit__(None, None, None)
            mount_path.rmdir()
    def stop():
        nonlocal server
        usage = support.process_usage(server)
        support.stop(server)
        server = None
        summary = support.shutdown(work / f'{phase}-server.log')
        report['server_lifetimes'].append({'phase': phase, **summary, 'process_cpu': usage,
            'profile': support.profile(work / f'{phase}-server.log')})
        save()
    def reset():
        nonlocal phase, server, endpoint, resets
        unmount()
        if server is not None:
            stop()
        resets += 1
        phase = f'case-{resets}'
        server, endpoint = support.start(work, phase, prefix, key_path)
        mount()
    try:
        server, endpoint = support.start(work, phase, prefix, key_path)
        tenant = support.rpc(endpoint, key, 'create-tenant', {'tenant_id': 'bench', 'root_grants': ['owner']})
        support.secret_file(work / 'tenant.json', json.dumps(tenant))
        owner = support.session(endpoint, tenant, ['owner'])
        parent = tenant['root_id']
        for depth in range(13):
            obj = support.rpc(endpoint, owner['session_key'], 'create',
                {'parent_id': parent, 'name': f'dir{depth}', 'directory': True, 'mode': 493})['object']
            parent = obj['id']
            if depth == 6:
                grant_root = parent
                support.rpc(endpoint, tenant['tenant_key'], 'update-grants', {
                    'tenant_id': tenant['tenant_id'], 'object_id': parent,
                    'changes': [{'grant': 'bench', 'attached': True}]})
        mount()
        path = mount_path / 'shared' / f'dir6--{grant_root}'
        for depth in range(7, 13):
            path /= f'dir{depth}'
        usage_before = resource.getrusage(resource.RUSAGE_CHILDREN)
        started = time.monotonic()
        subprocess.run(['/usr/bin/tar', '--no-same-owner', '-xf', str(work / 'corpus.tar'), '-C', str(path)], check=True)
        report['untar_seconds'] = time.monotonic() - started
        usage_after = resource.getrusage(resource.RUSAGE_CHILDREN)
        report['untar_process_usage'] = {
            'user_seconds': usage_after.ru_utime - usage_before.ru_utime,
            'system_seconds': usage_after.ru_stime - usage_before.ru_stime,
            'voluntary_context_switches': usage_after.ru_nvcsw - usage_before.ru_nvcsw,
            'involuntary_context_switches': usage_after.ru_nivcsw - usage_before.ru_nivcsw,
        }
        # Unmount drains client writeback through durable server responses before stopping the server.
        unmount()
        population = json.loads((work / 'populate-client-metrics.json').read_text())
        report['untar_client_drain_ms'] = population['client_drain_ms']
        report['untar_unmount_seconds'] = population['unmount_seconds']
        stop()
        print(f"Untar: {report['untar_seconds']:.3f}s; client drain: {report['untar_client_drain_ms']}ms; "
              f"unmount including drain: {report['untar_unmount_seconds']:.3f}s", flush=True)
        if args.untar_only:
            report['complete'] = True
            save()
            return
        reset()
        sys.path.insert(0, '/benchmark')
        import benchmark as jd
        jd.DOCUMENTS = args.files
        jd.SAMPLE_INDICES = frozenset(random.Random(42).sample(range(args.files), 256))
        original = jd.Benchmark
        matched = set()
        class Measured(original):
            def pair(self, feature, workload, *a, **kw):
                selected = {prefix for prefix in args.workload_prefix if workload.startswith(prefix)}
                if args.workload_prefix and not selected:
                    return
                matched.update(selected)
                return super().pair(feature, workload, *a, **kw)

            def measure(self, feature, workload, phase, *a, **kw):
                if phase == 'first':
                    reset()
                print(f'{workload} ({phase})', flush=True)
                result = super().measure(feature, workload, phase, *a, **kw)
                report['rows'] = self.rows
                save()
                print(' | '.join(self.rows[-1]), flush=True)
                return result
        jd.Benchmark = Measured
        sys.argv = ['benchmark.py', str(path), '--warm-runs', '1']
        if args.workload_prefix:
            sys.argv.append('--skip-writes')
        if jd.main() != 0:
            raise RuntimeError('Benchmark validation failed')
        if matched != set(args.workload_prefix):
            raise RuntimeError(f'Unmatched workload prefixes: {set(args.workload_prefix) - matched}')
        unmount()
        stop()
        report['complete'] = True
        save()
        print(f'Validated report: {work}', flush=True)
    finally:
        try:
            unmount()
        finally:
            if server is not None and server.poll() is None:
                support.stop(server)


if __name__ == '__main__':
    main()
