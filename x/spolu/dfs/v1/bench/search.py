#!/usr/bin/env python3
"""Measure embedded LanceDB searches over jd's unchanged 10,000-file corpus."""
import argparse
from datetime import date
import hashlib
import json
from pathlib import Path
import secrets
import statistics
import platform
import subprocess
import sys
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tests'))
from support import drain, rpc, secret_file, session, start_server
from vfs import SOURCE, MANIFEST_SHA256, gcs


def log_fields(path, message=None, kind=None):
    values = []
    for line in path.read_text().splitlines():
        try:
            fields = json.loads(line).get('fields', {})
        except json.JSONDecodeError:
            continue
        if (message is not None and fields.get('message') == message or
                kind is not None and fields.get('type') == kind):
            values.append(fields)
    return values


def main():
    """@cc [owner:spolu,label:testing;performance] cold-search-measurement
    Every cold query MUST start a new server recovering from the remote store with discarded local
    caches. Warm repetitions MUST reuse that server and client connection. Verify every result, retain
    raw timings without credentials, and delete only this successful run's generated GCS prefix.
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path)
    parser.add_argument('--bucket', default='dust-dev-dfs-poc-spolu-20260930')
    parser.add_argument('--local-store', action='store_true')
    args = parser.parse_args()
    work = args.work or Path(tempfile.mkdtemp(prefix='dfs-v1-search-'))
    work.mkdir(exist_ok=True, parents=True)
    if (work / 'run.json').exists():
        raise RuntimeError('report directory already has a run')
    corpus = work / 'corpus'
    subprocess.run([sys.executable, str(SOURCE / 'generate.py'), str(corpus)], check=True)
    manifest_hash = hashlib.sha256((corpus / 'manifest.json').read_bytes()).hexdigest()
    if manifest_hash != MANIFEST_SHA256:
        raise RuntimeError('corpus differs from jd reference')
    prefix = 'dfs-v1/tests/search-' + uuid.uuid4().hex
    key = secret_file(work / 'server.key', secrets.token_hex(32))
    backend = ['--local-store', str(work / 'remote')] if args.local_store else ['--bucket', args.bucket]
    arguments = [*backend, '--prefix', prefix]
    binary = ROOT / 'target/release/examples/search_bench'
    run = {'prefix': prefix, 'bucket': None if args.local_store else args.bucket,
           'manifest_sha256': manifest_hash, 'profile': 'release', 'warm_runs': 10,
           'server_restarted_per_query': True, 'slatedb_memory_mib': 1024,
           'slatedb_disk_gib': 16, 'lance_shared_cache_mib': 256,
           'lance_object_memory_mib': 128, 'lance_object_disk_gib': 16,
           'lance_object_cache_enabled': not args.local_store, 'index_batch_files': 1024,
           'rpc': 'loopback gRPC; persistent connection; no client result cache', 'results': []}
    run['date'] = date.today().isoformat()
    run['host'] = platform.platform()
    run['corpus_bytes'] = sum(p.stat().st_size for p in corpus.rglob('*.txt'))
    run['revision'] = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    (work / 'run.json').write_text(json.dumps(run, indent=2) + '\n')
    process = None
    try:
        process, endpoint, _ = start_server(work, 'populate', arguments, key)
        result = subprocess.run([str(binary), '--endpoint', endpoint, '--key-file', str(key),
            'populate', '--corpus', str(corpus), '--workspace-output', str(work / 'workspace.json')],
            capture_output=True, text=True, check=True)
        run['indexing'] = json.loads(result.stdout)
        run['indexing']['shutdown_drain_seconds'] = drain(process)
        batches = log_fields(work / 'populate-server.log', message='search batch indexed')
        run['indexing']['batches'] = batches
        run['indexing']['file_versions_processed'] = sum(b['files'] for b in batches)
        (work / 'run.json').write_text(json.dumps(run, indent=2) + '\n')
        process = None
        workspace = json.loads((work / 'workspace.json').read_text())
        rare = sorted(f'doc_{i:05d}.txt' for i in [7, 997, 5003, 9991])
        cases = [
            ('Rare keyword', {'query': 'needle', 'limit': 100}, ['owner'], rare),
            ('Case-insensitive keyword', {'query': 'sentinel', 'limit': 100}, ['owner'],
             [f'doc_{i:05d}.txt' for i in range(0, 10000, 101)]),
            ('Broad keyword, top 20', {'query': 'common', 'limit': 20}, ['owner'], None),
            ('Metadata + MIME + size', {'filter': {'name_prefix': 'doc_000', 'mime_types': ['text/plain'],
                'min_size': 1000, 'max_size': 100000}, 'limit': 100}, ['owner'],
             [f'doc_{i:05d}.txt' for i in range(100)]),
            ('Keyword + xattr equality', {'query': 'needle', 'filter': {'xattrs': [
                {'name': 'group', 'value': [55]}]}, 'limit': 100}, ['owner'], rare[:2]),
            ('Binary xattr equality', {'filter': {'xattrs': [{'name': 'binary', 'value': [0, 255]}]},
                'limit': 100}, ['owner'], ['doc_00007.txt']),
            ('Rare keyword, selective grant', {'query': 'needle', 'limit': 100}, ['reader'], ['doc_00007.txt']),
            ('Rare keyword, 512 grants', {'query': 'needle', 'limit': 100},
             ['reader'] + [f'unattached:{i}' for i in range(511)], ['doc_00007.txt']),
        ]
        for index, (label, query, grants, expected) in enumerate(cases):
            process, endpoint, _ = start_server(work, f'query-{index}', arguments, key)
            fresh = session(endpoint, workspace, grants)
            session_key = secret_file(work / 'session.key', fresh['session_key'])
            query_path = work / 'query.json'
            query_path.write_text(json.dumps(query))
            output = subprocess.run([str(binary), '--endpoint', endpoint, '--key-file', str(session_key),
                'query', '--input', str(query_path)], capture_output=True, text=True, check=True)
            measured = json.loads(output.stdout)
            for sample in measured:
                if sample['partial'] or (expected is not None and sorted(sample['names']) != expected):
                    raise RuntimeError(f'{label}: unexpected hits or partial result: {sample}')
                if expected is None and len(sample['names']) != 20:
                    raise RuntimeError(f'{label}: wrong count')
            session_key.unlink()
            warm = sorted(sample['ms'] for sample in measured[1:])
            row = {'label': label, 'cold_ms': measured[0]['ms'], 'warm_p50_ms': statistics.median(warm),
                   'warm_p95_ms': warm[-1], 'hits': len(measured[0]['names']), 'runs': measured}
            run['results'].append(row)
            print(f"{label}: cold {row['cold_ms']:.2f} ms, warm p50 {row['warm_p50_ms']:.2f} ms", flush=True)
            drain(process)
            row['server_search_metrics'] = log_fields(work / f'query-{index}-server.log', message='search completed')
            plans = log_fields(work / f'query-{index}-server.log', kind='plan_run')
            if plans:
                row['last_completed_plan_io'] = plans[-1]
            process = None
            (work / 'run.json').write_text(json.dumps(run, indent=2) + '\n')
        if not args.local_store:
            run['retained_gcs_bytes'] = gcs(work, ['du', '--summarize', f'gs://{args.bucket}/{prefix}/']).strip()
            gcs(work, ['rm', '--recursive', f'gs://{args.bucket}/{prefix}/'])
            run['remote_cleaned'] = True
        (work / 'run.json').write_text(json.dumps(run, indent=2) + '\n')
        print(f'Report: {work}', flush=True)
    finally:
        if process is not None and process.poll() is None:
            drain(process)
        for name in ['server.key', 'workspace.json', 'session.key']:
            (work / name).unlink(missing_ok=True)


if __name__ == '__main__':
    main()
