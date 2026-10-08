import argparse
import hashlib
import http.client
import json
import pathlib
import socket
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=pathlib.Path, required=True)
args = parser.parse_args()
assert socket.gethostname().split('.')[0] == 'dfs-tantivy-jd-20261002-server'
run = pathlib.Path('/home/dfs/x/jd/dfs/runtime/search-cloud')
identities = json.loads((run / 'identities.json').read_text())
workspace = next(row['tenant'] for row in identities if row['subject'] == 'admin')
token = (run / 'credentials/admin.token').read_text().strip()


def request(query=False):
    connection = http.client.HTTPConnection('127.0.0.1', 7447, timeout=20)
    try:
        path = f'/v1/workspaces/{workspace}/lexical/documents/query' if query else '/lexical/status'
        body = json.dumps({'query': {'type': 'phrase', 'terms': 'BENCH_RARE_NEEDLE'}, 'k': 20, 'include_text': True}) if query else None
        connection.request('POST' if query else 'GET', path, body=body, headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'})
        response = connection.getresponse()
        return response.status, json.loads(response.read())
    finally:
        connection.close()


def identities_and_hashes(value):
    assert not value['dfs']['incomplete']
    assert len(value['rows']) == 4
    return {row['node_id']: hashlib.sha256(row['text'].encode()).hexdigest() for row in value['rows']}


result = {'passed': False, 'fault': 'SIGKILL of DFS/Tantivy process; not power loss'}
try:
    code, before = request()
    assert code == 200
    code, hits = request(True)
    assert code == 200
    expected = identities_and_hashes(hits)
    result['before'] = before
    started = time.monotonic()
    subprocess.run(['sudo', 'systemctl', 'kill', '--kill-whom=main', '--signal=KILL', 'dfs-search-tantivy'], check=True)
    deadline = started + 900
    unavailable = 0
    while time.monotonic() < deadline:
        try:
            code, after = request()
            cursor = after.get('indexed_through')
            head = after.get('source', {}).get('Head')
            if code == 200 and cursor and head and cursor['incarnation'] != before['indexed_through']['incarnation'] and cursor['incarnation'] == head['incarnation'] and cursor['head'] == head['head'] and not after['indexing_failed']:
                break
            if code == 200 and head and head['incarnation'] != before['indexed_through']['incarnation']:
                query_code, value = request(True)
                assert query_code in [200, 503], query_code
                if query_code == 200:
                    assert value['dfs']['indexed_through']['incarnation'] == head['incarnation']
                    if value['rows']:
                        assert identities_and_hashes(value) == expected
        except (OSError, http.client.HTTPException):
            unavailable += 1
        time.sleep(.1)
    else:
        raise AssertionError('recovery did not converge')
    result['recovery_ms'] = (time.monotonic() - started) * 1000
    result['unavailable_observations'] = unavailable
    result['after'] = after
    code, hits = request(True)
    assert code == 200 and identities_and_hashes(hits) == expected
    assert after['documents'] == before['documents'] == 10000
    result['checks'] = ['new source incarnation reconciled', 'four persisted identities and full text hashes preserved', '10000 documents restored']
    result['passed'] = True
finally:
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
