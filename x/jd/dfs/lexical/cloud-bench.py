import argparse
import concurrent.futures
import datetime
import hashlib
import http.client
import json
import math
import pathlib
import random
import socket
import ssl
import statistics
import time

parser = argparse.ArgumentParser()
parser.add_argument('--run', type=pathlib.Path, required=True)
parser.add_argument('--server', required=True)
parser.add_argument('--output', type=pathlib.Path, required=True)
parser.add_argument('--base-path', default='')
parser.add_argument('--rounds', type=int, default=50)
parser.add_argument('--load-rounds', type=int, default=500)
parser.add_argument('--engine', choices=['tantivy', 'lance'], default='tantivy')
args = parser.parse_args()
assert socket.gethostname().split('.')[0] == 'dfs-tantivy-jd-20261002-client'
context = ssl.create_default_context(cafile=str(args.run / 'server.crt'))
identities = json.loads((args.run / 'identities.json').read_text())
workspace = next(x['tenant'] for x in identities if x['subject'] == 'admin')
tokens = {name: (args.run / f'credentials/{name}.token').read_text().strip() for name in ['admin', 'alice', 'bob']}
endpoint = 'lexical' if args.engine == 'tantivy' else 'search'
status_path = '/lexical/status' if args.engine == 'tantivy' else '/status'


def request(identity, table=None, body=None, connection=None):
    started = time.monotonic()
    connection = connection or http.client.HTTPSConnection(args.server, 7444, context=context, timeout=20)
    path = f'/v1/workspaces/{workspace}/{endpoint}/{table}/query' if table else status_path
    connection.request('POST' if table else 'GET', args.base_path + path, body=json.dumps(body) if body else None, headers={'Authorization': f'Bearer {tokens[identity]}', 'Content-Type': 'application/json'})
    response = connection.getresponse()
    raw = response.read()
    value = json.loads(raw)
    elapsed_ms = (time.monotonic() - started) * 1000
    assert response.status == 200, (response.status, value)
    timings = {}
    for part in response.getheader('Server-Timing', '').split(','):
        if ';dur=' in part:
            name, duration = part.strip().split(';dur=')
            timings[name] = float(duration)
    return value, connection, {'elapsed_ms': elapsed_ms, 'response_bytes': len(raw), 'server_ms': timings}


def wait_ready():
    deadline = time.monotonic() + 900
    while time.monotonic() < deadline:
        value, connection, _ = request('admin')
        connection.close()
        cursor = value.get('indexed_through')
        source = value['source']['Head']
        if cursor and cursor['head'] == source['head'] and cursor['incarnation'] == source['incarnation'] and not value['indexing_failed']:
            return value
        time.sleep(1)
    raise AssertionError('index did not catch up')


def query(kind, value, k=20, full=False):
    if args.engine == 'tantivy':
        field = 'terms' if kind in ['phrase', 'match'] else 'value'
        return {'query': {'type': kind, field: value}, 'k': k, 'include_text': full}
    if kind == 'phrase':
        body = {'full_text_query': {'phrase': {'terms': value, 'column': 'text'}}, 'k': k}
        body['columns'] = {'column_names': ['node_id', 'source_version', 'text'] if full else ['node_id', 'source_version']}
        return body
    if kind == 'exact':
        filter_text = f"basename = '{value}'"
    elif kind == 'literal':
        filter_text = f"contains(text, '{value}')"
    else:
        filter_text = f"basename LIKE '%{value}%'"
    body = {'filter': filter_text, 'k': k}
    body['columns'] = {'column_names': ['node_id', 'source_version'] if kind == 'literal' else ['node_id', 'source_version', 'basename', 'kind', 'size', 'mtime_ms', 'content_status']}
    return body


samples = []
result = {'passed': False, 'engine': args.engine, 'samples': samples, 'started_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'server': args.server, 'rounds': args.rounds, 'load_rounds': args.load_rounds, 'harness_sha256': hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()}
try:
    result['status'] = wait_ready()
    rare = 'BENCH_RARE_NEEDLE'
    cases = {
        'names_exact': ('nodes', query('exact', 'doc_00007.txt'), 1),
        'names_substring': ('nodes', query('substring', '009'), 20),
        'documents_rare_ids': ('documents', query('phrase', rare), 4),
        'documents_rare_full': ('documents', query('phrase', rare, full=True), 4),
        'documents_common_ids': ('documents', query('phrase', 'BENCH_COMMON_SIGNAL', k=100), 100),
        'documents_literal_ids': ('documents', query('substring' if args.engine == 'tantivy' else 'literal', rare), 4),
    }
    expected = {}
    for case, (table, body, count) in cases.items():
        value, connection, _ = request('admin', table, body)
        connection.close()
        assert not value['dfs']['incomplete'], value['dfs']
        assert len(value['rows']) == count, (case, len(value['rows']))
        expected[case] = {row['node_id'] for row in value['rows']}
        assert len(expected[case]) == count
    result['expected_ids'] = {case: sorted(ids) for case, ids in expected.items()}
    assert expected['documents_rare_ids'] == expected['documents_literal_ids']
    manifest_bytes = (args.run / 'corpus/manifest.json').read_bytes()
    result['corpus_manifest_sha256'] = hashlib.sha256(manifest_bytes).hexdigest()
    manifest = json.loads(manifest_bytes)
    hashes = {manifest['sha256'][i] for i in [7, 997, 5003, 9991]}
    value, connection, _ = request('admin', 'documents', cases['documents_rare_full'][1])
    connection.close()
    assert {hashlib.sha256(row['text'].encode()).hexdigest() for row in value['rows']} == hashes
    value, connection, _ = request('bob', 'documents', cases['documents_rare_ids'][1])
    connection.close()
    assert not value['rows']
    randomizer = random.Random(419)
    connections = {}
    try:
        for round_number in range(args.rounds + 3):
            jobs = [(identity, case) for identity in ['admin', 'alice'] for case in cases]
            randomizer.shuffle(jobs)
            for identity, case in jobs:
                table, body, count = cases[case]
                value, connection, sample = request(identity, table, body, connections.get(identity))
                connections[identity] = connection
                ids = {row['node_id'] for row in value['rows']}
                assert len(value['rows']) == count and len(ids) == count and not value['dfs']['incomplete'], (identity, case, value['dfs'], len(ids))
                if case not in ['documents_common_ids', 'names_substring']:
                    assert ids == expected[case], (identity, case)
                if case == 'names_substring':
                    assert all('009' in row['basename'] for row in value['rows'])
                if round_number >= 3:
                    samples.append({'identity': identity, 'case': case, 'round': round_number - 3, **sample})
    finally:
        for connection in connections.values():
            connection.close()
    result['summaries'] = []
    for identity in ['admin', 'alice']:
        for case in cases:
            cell = [s for s in samples if s['identity'] == identity and s['case'] == case]
            values = sorted(s['elapsed_ms'] for s in cell)
            stages = {name: statistics.median(s['server_ms'][name] for s in cell) for name in cell[0]['server_ms']}
            result['summaries'].append({'identity': identity, 'case': case, 'median_ms': statistics.median(values), 'p95_ms': values[math.ceil(len(values)*.95)-1], 'stage_medians_ms': stages})
    result['concurrent'] = []
    def load_worker(worker):
        connection = None
        records = []
        try:
            table, body, count = cases['documents_common_ids']
            for iteration in range(args.load_rounds):
                value, connection, sample = request('alice', table, body, connection)
                assert len(value['rows']) == count and not value['dfs']['incomplete']
                assert len({row['node_id'] for row in value['rows']}) == count
                records.append({'worker': worker, 'iteration': iteration, **sample})
            return records
        finally:
            if connection:
                connection.close()
    for concurrency in [4, 8]:
        started = time.monotonic()
        with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
            records = [sample for batch in executor.map(load_worker, range(concurrency)) for sample in batch]
        elapsed_seconds = time.monotonic() - started
        values = sorted(sample['elapsed_ms'] for sample in records)
        result['concurrent'].append({'concurrency': concurrency, 'queries': len(records), 'elapsed_seconds': elapsed_seconds, 'queries_per_second': len(records) / elapsed_seconds, 'median_ms': statistics.median(values), 'p95_ms': values[math.ceil(len(values)*.95)-1], 'samples': records})
    result['checks'] = ['source/index boundaries aligned', 'unique authorized rows in all samples', 'four literal and phrase identities agree', 'full documents match corpus hashes', 'ungranted caller denied', 'inherited-grant caller sees expected corpus results']
    result['passed'] = True
finally:
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
