#!/usr/bin/env python3
"""Inject transport failures around real ES operations; all source/index data uses real databases."""
import http.server
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import urllib.error
import urllib.request

spec = importlib.util.spec_from_file_location('v2_support', Path(__file__).with_name('support.py'))
support = importlib.util.module_from_spec(spec)
spec.loader.exec_module(support)


class Proxy:
    def __init__(self):
        self.available = False
        self.fail_item = True
        self.hold_bulk = False
        self.published = threading.Event()
        self.release = threading.Event()
        self.search_pages = 0
        self.fail_search = False
        self.before_second_page = None
        owner = self
        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass
            def forward(self):
                body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
                if not owner.available:
                    code, payload = 503, b'{"error":"injected outage"}'
                else:
                    if self.path == '/_search' and owner.before_second_page:
                        owner.search_pages += 1
                        if owner.search_pages == 2:
                            owner.before_second_page()
                            time.sleep(4.2)
                    req = urllib.request.Request(os.environ['DFS_ES_URL'].rstrip('/') + self.path,
                        data=body if body else None, method=self.command,
                        headers={'Content-Type': self.headers.get('Content-Type', 'application/json')})
                    try:
                        with urllib.request.urlopen(req, timeout=30) as response:
                            code, payload = response.status, response.read()
                    except urllib.error.HTTPError as error:
                        code, payload = error.code, error.read()
                    if self.path == '/_search' and code == 200 and owner.fail_search:
                        result = json.loads(payload)
                        result['_shards']['failed'] = 1
                        payload = json.dumps(result).encode()
                    if self.path.startswith('/_bulk') and code == 200:
                        if owner.fail_item:
                            result = json.loads(payload)
                            operation = next(iter(result['items'][0].values()))
                            operation['status'] = 503
                            result['errors'] = True
                            payload = json.dumps(result).encode()
                            owner.fail_item = False
                        if owner.hold_bulk:
                            owner.published.set()
                            owner.release.wait(timeout=30)
                try:
                    self.send_response(code)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Content-Length', str(len(payload)))
                    self.end_headers()
                    self.wfile.write(payload)
                except (BrokenPipeError, ConnectionResetError):
                    pass
            do_GET = do_POST = do_PUT = do_DELETE = forward
        self.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.url = f'http://127.0.0.1:{self.server.server_port}'
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
    def close(self):
        self.release.set()
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)


def wait(predicate, description):
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(.1)
    raise AssertionError(description)


def main():
    work = Path(tempfile.mkdtemp(prefix='dfs-v2-faults-'))
    prefix, key, key_path = support.identity(work)
    proxy = Proxy()
    server, endpoint = support.start(work, 'initial', prefix, key_path, proxy.url)
    success = False
    try:
        workspace = support.rpc(endpoint, key, 'create-workspace',
            {'workspace_id': 'faults', 'root_grants': ['owner']})
        owner = support.session(endpoint, workspace, ['owner'])
        reader = support.session(endpoint, workspace, ['reader'])
        def call(method, body=None):
            return support.rpc(endpoint, owner['session_key'], method, body)
        def stat(id):
            return call('stat', {'object_id': id})
        def grants(id, attached):
            support.rpc(endpoint, workspace['workspace_key'], 'update-grants', {
                'workspace_id': 'faults', 'object_id': id, 'expected_version': stat(id)['version'],
                'changes': [{'grant': 'reader', 'attached': attached}]})
        def create(parent, name, directory=False, content=None):
            file = call('create', {'parent_id': parent, 'expected_parent_version': stat(parent)['version'],
                                  'name': name, 'directory': directory, 'mode': 493})['object']
            if content:
                file = call('write', {'object_id': file['id'], 'expected_version': file['version'],
                                     'data': list(content.encode())})['object']
            return file
        def status():
            return support.rpc(endpoint, workspace['workspace_key'], 'get-index-status', {'workspace_id': 'faults'})
        def drained():
            value = status()
            return not value['backfilling'] and value['pending'] == 0
        first = create(workspace['root_id'], 'first', content='needle')
        create(workspace['root_id'], 'second', content='needle')
        call('fsync', {'object_id': first['id']})
        assert status()['pending'] == 2, 'ES outage must retain jobs without blocking writes/fsync'
        proxy.available = True
        wait(lambda: status()['failed'] == 1, 'ambiguous item must remain pending')
        assert status()['pending'] == 1, 'successful sibling must complete independently'
        wait(drained, 'retry must drain ambiguous item')
        assert len(call('search-files', {'query': 'needle'})['hits']) == 2

        # ES applies the next write, but the server dies before receiving its response/completing FDB.
        proxy.hold_bulk = True
        first = stat(first['id'])
        call('write', {'object_id': first['id'], 'expected_version': first['version'],
                       'data': list(b'newword')})
        assert proxy.published.wait(timeout=20), 'no ES publication'
        server.kill()
        server.wait(timeout=10)
        proxy.hold_bulk = False
        proxy.release.set()
        server, endpoint = support.start(work, 'replayed', prefix, key_path, proxy.url)
        owner = support.session(endpoint, workspace, ['owner'])
        reader = support.session(endpoint, workspace, ['reader'])
        wait(drained, 'restart must replay uncompleted publication')
        assert len(call('search-files', {'query': 'newword'})['hits']) == 1

        # Expire the authorization snapshot between two candidate pages and revoke its cached ancestor.
        allowed = create(workspace['root_id'], 'allowed', directory=True)
        hidden = create(workspace['root_id'], 'hidden', directory=True)
        grants(allowed['id'], True)
        create(allowed['id'], 'high', content='selective selective selective')
        for i in range(65):
            create(hidden['id'], f'hidden-{i}', content='selective filler filler filler filler')
        create(allowed['id'], 'low', content='selective ' + 'filler ' * 1000)
        wait(drained, 'candidate fixture indexing')
        proxy.before_second_page = lambda: grants(allowed['id'], False)
        response = support.rpc(endpoint, reader['session_key'], 'search-files', {'query': 'selective', 'limit': 2})
        assert proxy.search_pages >= 2, 'fixture must expand beyond its first page'
        assert not response['partial'] and not response['hits'], 'expired cached grants/hits leaked'
        proxy.before_second_page = None
        proxy.fail_search = True
        import subprocess
        try:
            call('search-files', {'query': 'selective'})
        except subprocess.CalledProcessError:
            pass
        else:
            raise AssertionError('partial ES shard failure must not become successful results')
        support.stop(server)
        success = True
        print(f'PASS: ES outage, per-item ambiguity, crash replay, expired grant snapshot; logs: {work}', flush=True)
    finally:
        if server.poll() is None:
            server.kill()
            server.wait(timeout=10)
        proxy.close()
        key_path.unlink(missing_ok=True)
        if success:
            support.cleanup(prefix)


if __name__ == '__main__':
    main()
