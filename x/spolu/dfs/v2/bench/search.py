#!/usr/bin/env python3
"""Run v1's 10,000-file search corpus and query matrix against local FDB/ES."""
import argparse
import json
from pathlib import Path
import statistics
import subprocess
import tempfile
from common import corpus, metadata, fields, save, support


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path)
    args = parser.parse_args()
    work = args.work or Path(tempfile.mkdtemp(prefix='dfs-v2-search-bench-'))
    work.mkdir(parents=True, exist_ok=True)
    if (work / 'run.json').exists():
        raise RuntimeError('report directory already contains a run')
    data = corpus(work)
    prefix, key, key_path = support.identity(work, 'bench')
    run = metadata() | {'prefix': prefix, 'warm_runs': 10, 'server_restarted_per_query': True,
                        'cold_scope': 'fresh dfs-server, session and gRPC connection; backend caches retained',
                        'results': []}
    run['corpus_bytes'] = sum(p.stat().st_size for p in (data / 'docs').rglob('*.txt'))
    save(work, run)
    server = None
    success = False
    binary = '/target/release/examples/search_bench'
    print(f'Report: {work}', flush=True)
    try:
        server, endpoint = support.start(work, 'populate', prefix, key_path)
        result = subprocess.run([binary, '--endpoint', endpoint, '--key-file', str(key_path),
            'populate', '--corpus', str(data), '--workspace-output', str(work / 'workspace.json')],
            text=True, capture_output=True, check=True)
        run['indexing'] = json.loads(result.stdout)
        run['indexing']['shutdown_seconds'] = support.stop(server)
        run['indexing']['batches'] = fields(work / 'populate-server.log', 'search batch indexed')
        save(work, run)
        server = None
        workspace = json.loads((work / 'workspace.json').read_text())
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
        for index, (label, query, grants, expected) in enumerate(cases):
            server, endpoint = support.start(work, f'query-{index}', prefix, key_path)
            session = support.session(endpoint, workspace, grants)
            session_path = support.secret_file(work / 'session.key', session['session_key'])
            query_path = work / 'query.json'
            query_path.write_text(json.dumps(query))
            result = subprocess.run([binary, '--endpoint', endpoint, '--key-file', str(session_path),
                'query', '--input', str(query_path)], capture_output=True, text=True, check=True)
            samples = json.loads(result.stdout)
            session_path.unlink()
            for sample in samples:
                assert not sample['partial'], (label, sample)
                assert sorted(sample['names']) == expected if expected is not None else len(sample['names']) == 20
            warm = sorted(s['ms'] for s in samples[1:])
            row = {'label': label, 'cold_ms': samples[0]['ms'], 'warm_p50_ms': statistics.median(warm),
                   'warm_p95_ms': warm[-1], 'hits': len(samples[0]['names']), 'runs': samples}
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
        for name in ('server.key', 'workspace.json', 'session.key'):
            (work / name).unlink(missing_ok=True)
        if success:
            support.cleanup(prefix)
            run['fixture_cleaned'] = True
            save(work, run)
    print(f'Validated report: {work}', flush=True)


if __name__ == '__main__':
    main()
