#!/usr/bin/env python3
"""Benchmark generic v5 Search over real FDB/ES files and directories."""
import argparse
import json
import math
from pathlib import Path
import statistics
import subprocess
import tempfile
import os
import platform
import time
import sys
import importlib.util
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tests'))
import support
from run import source_identity


def corpus(work):
    path = Path(__file__).resolve().parents[2] / 'v2/bench/corpus.py'
    spec = importlib.util.spec_from_file_location('corpus', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.generate(work / 'corpus', 10000)
    return work / 'corpus'


def fields(path, message):
    records = []
    for line in path.read_text().splitlines():
        try:
            record = json.loads(line).get('fields', {})
            if record.get('message') == message:
                records.append(record)
        except json.JSONDecodeError:
            pass
    return records


def save(work, report):
    (work / 'run.json').write_text(json.dumps(report, indent=2) + '\n')


def metadata():
    return {'date': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'source_sha256': source_identity(), 'platform': platform.platform(), 'cpus': os.cpu_count(),
            'es_url': os.environ['DFS_ES_URL'], 'es_index': os.environ['DFS_ES_INDEX']}



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path)
    args = parser.parse_args()
    work = args.work or Path(tempfile.mkdtemp(prefix='dfs-v5-search-bench-'))
    work.mkdir(parents=True, exist_ok=True)
    if (work / 'run.json').exists():
        raise RuntimeError('report directory already contains a run')
    data = corpus(work)
    prefix, key, key_path = support.identity(work)
    os.environ['DFS_ES_INDEX'] = prefix
    run = metadata() | {'prefix': prefix, 'warm_runs': 20, 'server_restarted_per_query': True,
                        'cold_scope': 'fresh dfs-server, session and gRPC connection; backend caches retained',
                        'results': []}
    run['corpus_bytes'] = sum(p.stat().st_size for p in (data / 'docs').rglob('*.txt'))
    save(work, run)
    server = None
    success = False
    binary = str(support.BINARY / 'examples/search_bench')
    print(f'Report: {work}', flush=True)
    try:
        server, endpoint = support.start(work, 'populate', prefix, key_path)
        result = subprocess.run([binary, '--endpoint', endpoint, '--key-file', str(key_path),
            'populate', '--corpus', str(data), '--tenant-output', str(work / 'tenant.json')],
            text=True, capture_output=True, check=True)
        run['indexing'] = json.loads(result.stdout)
        tenant = json.loads((work / 'tenant.json').read_text())
        count = run['indexing']['files'] + run['indexing']['directories']
        waited = subprocess.run([binary, '--endpoint', endpoint, '--key-file', str(key_path),
            'wait-index', '--fdb-prefix', prefix, '--tenant', tenant['tenant_id'],
            '--expected-objects', str(count)], text=True, capture_output=True, check=True)
        run['indexing'].update(json.loads(waited.stdout))
        run['indexing']['shutdown_seconds'] = support.stop(server)
        run['indexing']['batches'] = fields(work / 'populate-server.log', 'search batch indexed')
        save(work, run)
        server = None
        tenant = json.loads((work / 'tenant.json').read_text())
        rare = [f'doc_{i:05d}.txt' for i in [7, 997, 5003, 9991]]
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
        directory_ids = run['indexing']['directory_ids']
        paths = json.loads((data / 'manifest.json').read_text())['paths']
        leaf = str(Path(paths[7]).parent)
        leaf_names = sorted(Path(p).name for p in paths if str(Path(p).parent) == leaf)
        cases += [
            ('Directory metadata, top 20', {'filter': {'kind': 1}, 'limit': 20}, ['owner'], None),
            ('Name tokens, files and folders', {'query': 'doc', 'fields': [0], 'limit': 20}, ['owner'], None),
            ('Recursive directory scope', {'query': 'needle', 'scope': {'directory_id': directory_ids[leaf]}, 'limit': 100}, ['owner'], ['doc_00007.txt']),
            ('Direct children scope', {'filter': {'name_prefix': 'doc_000'}, 'scope': {'directory_id': directory_ids[leaf], 'recursive': False}, 'limit': 100}, ['owner'], [n for n in leaf_names if n.startswith('doc_000')]),
            ('Mixed metadata, top 20', {'limit': 20}, ['owner'], None),
        ]
        for index, (label, query, grants, expected) in enumerate(cases):
            server, endpoint = support.start(work, f'query-{index}', prefix, key_path)
            session = support.session(endpoint, tenant, grants)
            session_path = support.secret_file(work / 'session.key', session['session_key'])
            query_path = work / 'query.json'
            query_path.write_text(json.dumps(query))
            result = subprocess.run([binary, '--endpoint', endpoint, '--key-file', str(session_path),
                'query', '--input', str(query_path)], capture_output=True, text=True, check=True)
            samples = json.loads(result.stdout)
            session_path.unlink()
            for sample in samples:
                assert not sample['partial'], (label, sample)
                if label.startswith('Directory metadata'):
                    assert sample['directories'] == 20
                assert sorted(sample['names']) == expected if expected is not None else len(sample['names']) == 20
            warm = sorted(s['ms'] for s in samples[1:])
            row = {'label': label, 'cold_ms': samples[0]['ms'], 'warm_p50_ms': statistics.median(warm),
                   'warm_p95_ms': warm[math.ceil(.95 * len(warm)) - 1], 'hits': len(samples[0]['names']), 'runs': samples}
            support.stop(server)
            server = None
            row['server_metrics'] = fields(work / f'query-{index}-server.log', 'search completed')
            run['results'].append(row)
            save(work, run)
            print(f"{label}: server-cold {row['cold_ms']:.2f} ms; warm {row['warm_p50_ms']:.2f} ms", flush=True)
        success = True
    finally:
        if server is not None and server.poll() is None:
            support.stop(server)
        for name in ('server.key', 'tenant.json', 'session.key'):
            (work / name).unlink(missing_ok=True)
        run['fixture_retained'] = True
        save(work, run)
    print(f'Validated report: {work}', flush=True)


if __name__ == '__main__':
    main()
