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
parser.add_argument('--fixture', type=pathlib.Path, required=True)
parser.add_argument('--manifest', type=pathlib.Path, required=True)
parser.add_argument('--server', required=True)
parser.add_argument('--engine', choices=['tantivy', 'lance'], required=True)
parser.add_argument('--mode', choices=['matrix', 'load'], required=True)
parser.add_argument('--concurrency', type=int, default=4)
parser.add_argument('--rounds', type=int, default=30)
parser.add_argument('--load-rounds', type=int, default=2000)
parser.add_argument('--output', type=pathlib.Path, required=True)
args = parser.parse_args()
assert socket.gethostname().split('.')[0] == 'dfs-tantivy-jd-20261002-client'
fixture = json.loads(args.fixture.read_text())
manifest = json.loads(args.manifest.read_text())
assert hashlib.sha256(args.manifest.read_bytes()).hexdigest() == fixture['manifest_sha256']
ids = {int(k): v for k, v in fixture['file_ids'].items()}
workspace = fixture['workspace']
context = ssl.create_default_context(cafile=str(args.run / 'server.crt'))
tokens = {name: (args.run / 'credentials' / (name + '.token')).read_text().strip() for name in ['admin', 'alice', 'bob']}
base = '' if args.engine == 'tantivy' else '/lance'
endpoint = 'lexical' if args.engine == 'tantivy' else 'search'
status_path = '/lexical/status' if args.engine == 'tantivy' else '/status'
node_columns = ['node_id', 'source_version', 'basename', 'kind', 'size', 'mtime_ms', 'content_status']
body_columns = ['node_id', 'source_version']
all_ids = set(ids.values())
rare_ids = {ids[i] for i in [7, 997, 5003, 9991]}
rare = 'BENCH_RARE_NEEDLE'
cases = {}


def add(name, table, query, expected, lance_filter=None, phrase=None, full=False, k=20, kind=None):
    t = {'query': query, 'k': k, 'include_text': full}
    if kind:
        t['kind'] = kind
    l = {'k': k, 'columns': {'column_names': node_columns if table == 'nodes' else body_columns + (['text'] if full else [])}}
    if lance_filter:
        l['filter'] = lance_filter
    if phrase:
        l['full_text_query'] = {'phrase': {'terms': phrase, 'column': 'basename' if table == 'nodes' else 'text'}}
    cases[name] = {'table': table, 'body': t if args.engine == 'tantivy' else l, 'expected': expected, 'count': min(k, len(expected)), 'full': full}


common_names = {ids[i] for i, path in enumerate(manifest['paths']) if '009' in pathlib.Path(path).name}
add('names_common_literal', 'nodes', {'type': 'substring', 'value': '009'}, common_names, "contains(basename, '009')")
add('names_common_like', 'nodes', {'type': 'substring', 'value': '009'}, common_names, "basename LIKE '%009%'")
add('names_literal', 'nodes', {'type': 'substring', 'value': 'doc_00007'}, {ids[7]}, "contains(basename, 'doc_00007')")
add('names_like', 'nodes', {'type': 'substring', 'value': '00007'}, {ids[7]}, "basename LIKE '%00007%'")
add('names_exact', 'nodes', {'type': 'exact', 'value': 'doc_00007.txt'}, {ids[7]}, "basename = 'doc_00007.txt'")
add('names_prefix', 'nodes', {'type': 'prefix', 'value': 'doc_0000'}, {ids[i] for i in range(10)}, "basename LIKE 'doc\\_0000%'")
add('nodes_indexed_id', 'nodes', {'type': 'node', 'id': fixture['known_node']}, {fixture['known_node']}, "node_id = '" + fixture['known_node'] + "'")
add('directories_literal', 'nodes', {'type': 'substring', 'value': 'corpus'}, {fixture['corpus_id']}, "contains(basename, 'corpus') AND kind = 'directory'", kind='directory')
add('directories_like', 'nodes', {'type': 'substring', 'value': 'orpus'}, {fixture['corpus_id']}, "basename LIKE '%orpus%' AND kind = 'directory'", kind='directory')
for full in [False, True]:
    suffix = 'full' if full else 'ids'
    add('documents_rare_' + suffix, 'documents', {'type': 'phrase', 'terms': rare}, rare_ids, phrase=rare, full=full)
    add('documents_literal_' + suffix, 'documents', {'type': 'substring', 'value': rare}, rare_ids, "contains(text, 'BENCH_RARE_NEEDLE')", full=full)
add('documents_like_ids', 'documents', {'type': 'substring', 'value': rare}, rare_ids, "text LIKE '%BENCH\\_RARE\\_NEEDLE%'")
add('documents_common_ids', 'documents', {'type': 'phrase', 'terms': 'BENCH_COMMON_SIGNAL'}, all_ids, phrase='BENCH_COMMON_SIGNAL', k=100)
add('documents_absent', 'documents', {'type': 'substring', 'value': 'SCALE_ABSENT_8721_NEEDLE'}, set(), "contains(text, 'SCALE_ABSENT_8721_NEEDLE')")
add('documents_unicode', 'documents', {'type': 'substring', 'value': 'café-δοκιμή'}, {ids[i] for i in ids if i % 257 == 0}, "contains(text, 'café-δοκιμή')")
if args.engine == 'lance':
    add('names_phrase', 'nodes', {}, {ids[7]}, phrase='doc_00007.txt')
    add('directories_phrase', 'nodes', {}, {fixture['corpus_id']}, "kind = 'directory'", phrase='corpus')


def request(identity, case=None, connection=None):
    started = time.monotonic()
    connection = connection or http.client.HTTPSConnection(args.server, 7444, context=context, timeout=20)
    connect_started = time.monotonic()
    if connection.sock is None:
        connection.connect()
    connect_ms = (time.monotonic() - connect_started) * 1000
    path = status_path if case is None else f'/v1/workspaces/{workspace}/{endpoint}/{case["table"]}/query'
    connection.request('GET' if case is None else 'POST', base + path, body=json.dumps(case['body']) if case else None, headers={'Authorization': 'Bearer ' + tokens[identity], 'Content-Type': 'application/json'})
    response = connection.getresponse()
    raw = response.read()
    value = json.loads(raw)
    elapsed = (time.monotonic() - started) * 1000
    assert response.status == 200, (response.status, value)
    stages = {}
    for part in response.getheader('Server-Timing', '').split(','):
        if ';dur=' in part:
            name, duration = part.strip().split(';dur=')
            stages[name] = float(duration)
    return value, connection, {'elapsed_ms': elapsed, 'connect_ms': connect_ms, 'response_bytes': len(raw), 'server_ms': stages}


hashes = {ids[i]: manifest['sha256'][i] for i in [7, 997, 5003, 9991]}


def validate(case, value, denied=False):
    assert not value['dfs']['incomplete']
    actual = [row['node_id'] for row in value['rows']]
    assert len(actual) == (0 if denied else case['count']), (len(actual), case['count'])
    assert len(set(actual)) == len(actual)
    assert set(actual) <= case['expected']
    scores = [row['_score'] for row in value['rows'] if '_score' in row]
    assert all(math.isfinite(score) for score in scores) and scores == sorted(scores, reverse=True)
    if case['full']:
        for row in value['rows']:
            assert hashlib.sha256(row['text'].encode()).hexdigest() == hashes[row['node_id']]


def summarize(records):
    values = sorted(row['elapsed_ms'] for row in records)
    return {'count': len(values), 'median_ms': statistics.median(values), 'p95_ms': values[math.ceil(.95 * len(values)) - 1], 'p99_ms': values[math.ceil(.99 * len(values)) - 1], 'stage_medians_ms': {name: statistics.median(row['server_ms'][name] for row in records) for name in records[0]['server_ms']}}


result = {'passed': False, 'engine': args.engine, 'mode': args.mode, 'concurrency': args.concurrency, 'started_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'files': fixture['files'], 'source_bytes': fixture['source_bytes'], 'manifest_sha256': fixture['manifest_sha256'], 'harness_sha256': hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(), 'samples': []}
try:
    status, connection, _ = request('admin')
    connection.close()
    assert not status['indexing_failed']
    assert status['indexed_through']['head'] == status['source']['Head']['head']
    assert status['indexed_through']['incarnation'] == status['source']['Head']['incarnation']
    result['status'] = status
    for case in cases.values():
        value, connection, _ = request('alice', case)
        connection.close()
        validate(case, value)
    value, connection, _ = request('bob', cases['documents_rare_ids'])
    connection.close()
    validate(cases['documents_rare_ids'], value, denied=True)
    if args.engine == 'tantivy':
        result['unsupported'] = ['names_phrase', 'directories_phrase']
    if args.mode == 'matrix':
        randomizer = random.Random(417)
        for mode in ['fresh', 'keepalive']:
            connections = {}
            try:
                for round_number in range(args.rounds + 2):
                    jobs = [(identity, name) for identity in ['admin', 'alice'] for name in cases]
                    randomizer.shuffle(jobs)
                    for identity, name in jobs:
                        case = cases[name]
                        value, connection, sample = request(identity, case, connections.get(identity))
                        if mode == 'keepalive':
                            connections[identity] = connection
                        else:
                            connection.close()
                        validate(case, value)
                        if round_number >= 2:
                            result['samples'].append({'identity': identity, 'case': name, 'connection': mode, 'round': round_number - 2, **sample})
            finally:
                for connection in connections.values():
                    connection.close()
        result['summaries'] = []
        for identity in ['admin', 'alice']:
            for mode in ['fresh', 'keepalive']:
                for name in cases:
                    records = [r for r in result['samples'] if r['identity'] == identity and r['connection'] == mode and r['case'] == name]
                    result['summaries'].append({'identity': identity, 'connection': mode, 'case': name, **summarize(records)})
    else:
        def worker(number):
            connection = None
            rows = []
            try:
                case = cases['documents_common_ids']
                for iteration in range(args.load_rounds + 2):
                    value, connection, sample = request('alice', case, connection)
                    validate(case, value)
                    if iteration >= 2:
                        rows.append({'worker': number, 'iteration': iteration - 2, **sample})
                return rows
            finally:
                if connection:
                    connection.close()
        started = time.monotonic()
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as executor:
            result['samples'] = [row for batch in executor.map(worker, range(args.concurrency)) for row in batch]
        seconds = time.monotonic() - started
        result['load'] = {**summarize(result['samples']), 'elapsed_seconds': seconds, 'queries_per_second': len(result['samples']) / seconds}
    result['passed'] = True
except Exception as error:
    result['error'] = repr(error)
    raise
finally:
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
