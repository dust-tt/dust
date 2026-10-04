#!/usr/bin/env python3
"""Verify committed local FDB/ES data survives restarting both database processes."""
import json
import os
import pathlib
import subprocess
import time
import urllib.error
import urllib.request
import uuid

COMPOSE = ['docker', 'compose', '-f', str(pathlib.Path(__file__).with_name('compose.yaml'))]
ES = f'http://127.0.0.1:{os.environ.get("DFS_V2_ES_PORT", "19202")}'


def cli(command, service='fdb'):
    return subprocess.check_output([*COMPOSE, 'exec', '-T', service, 'fdbcli', '--timeout', '10',
                                    '--exec', command], text=True)


def es(method, path, body=None, content_type='application/json'):
    if body is not None and not isinstance(body, bytes):
        body = json.dumps(body).encode()
    request = urllib.request.Request(ES + path, data=body, method=method,
                                     headers={'Content-Type': content_type})
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def ready():
    for _ in range(60):
        try:
            if 'The database is available.' in cli('status minimal'):
                health = es('GET', '/_cluster/health?wait_for_status=yellow&timeout=1s')
                if not health['timed_out']:
                    return
        except (subprocess.CalledProcessError, urllib.error.URLError, TimeoutError, ConnectionError):
            pass
        time.sleep(1)
    raise RuntimeError('Local databases did not become ready')


def main():
    fixture = 'dfs-v2-smoke-' + uuid.uuid4().hex
    print('Fixture:', fixture, flush=True)
    ready()
    try:
        cli(f'writemode on; set {fixture} durable')
        es('PUT', '/' + fixture, {'settings': {'number_of_shards': 1, 'number_of_replicas': 0},
                                 'mappings': {'properties': {'text': {'type': 'text'}}}})
        bulk = (json.dumps({'index': {'_index': fixture, '_id': 'file'}}) + '\n' +
                json.dumps({'text': 'durable needle'}) + '\n').encode()
        result = es('POST', '/_bulk?refresh=wait_for', bulk, 'application/x-ndjson')
        assert not result['errors'], result
        subprocess.run([*COMPOSE, 'restart', 'fdb', 'es'], check=True)
        ready()
        assert '`durable\'' in cli(f'get {fixture}')
        assert '`durable\'' in cli(f'get {fixture}', service='dev')
        result = es('POST', '/' + fixture + '/_search', {'query': {'match': {'text': 'needle'}}})
        assert result['hits']['total']['value'] == 1, result
        print('FDB commit and ES bulk/refresh survive database restarts.')
    finally:
        cli(f'writemode on; clear {fixture}')
        es('DELETE', '/' + fixture)


if __name__ == '__main__':
    main()
