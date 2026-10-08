import argparse
import http.client
import json
import pathlib
import socket
import statistics
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=pathlib.Path, required=True)
args = parser.parse_args()
assert socket.gethostname().split('.')[0] == 'dfs-tantivy-jd-20261002-server'
run = pathlib.Path('/home/dfs/x/jd/dfs/runtime/search-cloud')
identities = json.loads((run / 'identities.json').read_text())
workspace = next(x['tenant'] for x in identities if x['subject'] == 'admin')
alice = next(x['principal'] for x in identities if x['subject'] == 'alice' and x['tenant'] == workspace)
tokens = {name: (run / f'credentials/{name}.token').read_text().strip() for name in ['admin', 'alice', 'bob', 'admin-1']}
checks = []
result = {'passed': False, 'checks': checks}


def dfs(command, value=None):
    invocation = [str(run / 'bin/dfsctl'), '--endpoint', 'http://127.0.0.1:7453', '--token-file', str(run / 'credentials/admin.token'), command]
    if value is not None:
        path = run / 'tantivy-live-call.json'
        path.write_text(json.dumps(value))
        invocation += ['--json', str(path)]
    return json.loads(subprocess.check_output(invocation, text=True))


def query(identity, table, query, k=20, expected=200, **extra):
    connection = http.client.HTTPConnection('127.0.0.1', 7447, timeout=20)
    connection.request('POST', f'/v1/workspaces/{workspace}/lexical/{table}/query', body=json.dumps({'query': query, 'k': k, **extra}), headers={'Authorization': f'Bearer {tokens[identity]}', 'Content-Type': 'application/json'})
    response = connection.getresponse()
    value = json.loads(response.read())
    connection.close()
    assert response.status == expected, (response.status, value)
    return value


def status():
    connection = http.client.HTTPConnection('127.0.0.1', 7447, timeout=20)
    connection.request('GET', '/lexical/status', headers={'Authorization': f'Bearer {tokens["admin"]}'})
    response = connection.getresponse()
    value = json.loads(response.read())
    connection.close()
    assert response.status == 200
    return value


def ready():
    deadline = time.monotonic() + 900
    while time.monotonic() < deadline:
        value = status()
        cursor = value['indexed_through']
        source = value['source']['Head']
        if cursor and cursor['head'] == source['head'] and cursor['incarnation'] == source['incarnation'] and not value['indexing_failed']:
            return value
        time.sleep(.1)
    raise AssertionError('index did not catch up')


try:
    ready()
    view = dfs('view')
    root = next(row['node']['id'] for row in view['nodes'] if row['visible_parent'] is None and row['visible_name'] == 'files')
    corpus = next(row['node']['id'] for row in view['nodes'] if row['node']['parent'] == root and row['node']['name'] == 'corpus')
    dfs('mutate', {'Member': {'group': 'tantivy-benchmark', 'principal': alice, 'present': True}})
    dfs('mutate', {'Grant': {'node': corpus, 'subject': 'tantivy-benchmark', 'verbs': 13}})
    phrase = {'type': 'phrase', 'terms': 'BENCH_RARE_NEEDLE'}
    assert len(query('alice', 'documents', phrase)['rows']) == 4
    checks.append('new inherited group grant authorizes existing text immediately')
    dfs('mutate', {'Grant': {'node': corpus, 'subject': 'tantivy-benchmark', 'verbs': 0}})
    assert not query('alice', 'documents', phrase)['rows']
    dfs('mutate', {'Grant': {'node': corpus, 'subject': 'tantivy-benchmark', 'verbs': 13}})
    assert len(query('alice', 'documents', phrase)['rows']) == 4
    checks.append('revocation and restoration apply without waiting for indexing')
    assert not query('bob', 'documents', phrase)['rows']
    query('admin-1', 'documents', phrase, expected=404)
    query('admin', 'documents', phrase, k=101, expected=400)
    query('admin', 'documents', {'type': 'phrase', 'terms': '!!!'}, expected=400)
    query('admin', 'nodes', {'type': 'match', 'terms': 'text'}, expected=400)
    query('admin', 'documents', {'type': 'phrase', 'terms': 'a' * 17000}, expected=413)
    checks.append('tenant, permission, tokenization and request bounds enforced over HTTP')
    node = dfs('mutate', {'Create': {'parent': root, 'name': f'tantivy-live-{time.time_ns()}.txt', 'kind': 'File', 'mode': 384}})['node']
    node = dfs('mutate', {'Write': {'node': node['id'], 'base': node['version'], 'offset': 0, 'data': list(b'tantivy original beacon'), 'append': False, 'handle': None}})['node']
    started = time.monotonic()
    ready()
    result['initial_visibility_ms'] = (time.monotonic() - started) * 1000
    original = {'type': 'phrase', 'terms': 'tantivy original beacon'}
    assert len(query('admin', 'documents', original)['rows']) == 1
    node = dfs('mutate', {'Write': {'node': node['id'], 'base': node['version'], 'offset': 0, 'data': list(b'tantivy replacement beacon extended'), 'append': False, 'handle': None}})['node']
    assert not query('admin', 'documents', original)['rows']
    started = time.monotonic()
    ready()
    result['update_visibility_ms'] = (time.monotonic() - started) * 1000
    replacement = {'type': 'phrase', 'terms': 'tantivy replacement beacon extended'}
    assert query('admin', 'documents', replacement, include_text=True)['rows'][0]['text'] == 'tantivy replacement beacon extended'
    checks.append('content replacement suppresses stale versions and publishes one complete body')
    result['freshness_samples_ms'] = []
    for iteration in range(20):
        text = f'tantivy freshness beacon iteration {iteration:02d} ' + 'x' * iteration
        started = time.monotonic()
        node = dfs('mutate', {'Write': {'node': node['id'], 'base': node['version'], 'offset': 0, 'data': list(text.encode()), 'append': False, 'handle': None}})['node']
        ready()
        replacement = {'type': 'phrase', 'terms': f'tantivy freshness beacon iteration {iteration:02d}'}
        assert query('admin', 'documents', replacement, include_text=True)['rows'][0]['text'] == text
        result['freshness_samples_ms'].append((time.monotonic() - started) * 1000)
    result['freshness_median_ms'] = statistics.median(result['freshness_samples_ms'])
    result['freshness_p95_ms'] = sorted(result['freshness_samples_ms'])[18]
    checks.append('twenty sequential content updates become searchable with exact body validation')
    renamed = dfs('mutate', {'Rename': {'parent': root, 'name': node['name'], 'expected': node['entry_token'], 'new_parent': root, 'new_name': node['name'] + '.renamed', 'destination': None}})['node']
    ready()
    assert query('admin', 'nodes', {'type': 'exact', 'value': renamed['name']})['rows'][0]['node_id'] == node['id']
    assert len(query('admin', 'documents', replacement)['rows']) == 1
    dfs('mutate', {'Unlink': {'parent': root, 'name': renamed['name'], 'expected': renamed['entry_token'], 'directory': False}})
    assert not query('admin', 'documents', replacement)['rows']
    ready()
    checks.append('rename preserves body identity and unlink removes results')
    result['status'] = ready()
    result['passed'] = True
finally:
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
