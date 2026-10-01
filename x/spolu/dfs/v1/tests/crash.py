#!/usr/bin/env python3
"""Kill the real server after acknowledged block writes and recover with empty caches."""
import json
from pathlib import Path
import secrets
import tempfile
from support import drain, rpc, secret_file, session, start_server


def main():
    with tempfile.TemporaryDirectory(prefix='dfs-v1-crash-') as temporary:
        work = Path(temporary)
        server_key = secrets.token_hex(32)
        key_file = secret_file(work / 'server.key', server_key)
        arguments = ['--local-store', str(work / 'remote'), '--prefix', 'crash',
                     '--cache-memory-mib', '16', '--cache-disk-gib', '1', '--max-unflushed-mib', '16']
        server, endpoint, _ = start_server(work, 'baseline', arguments, key_file)
        try:
            workspace = rpc(endpoint, server_key, 'create-workspace', {'workspace_id': 'crash', 'root_grants': ['owner']})
            owner = session(endpoint, workspace, ['owner'])
            key = owner['session_key']
            file = rpc(endpoint, key, 'create', {'parent_id': workspace['root_id'], 'expected_parent_version': 1,
                                               'name': 'file', 'mode': 384})['object']
            file = rpc(endpoint, key, 'write', {'object_id': file['id'], 'expected_version': file['version'],
                'data': [2] * (65536 + 14)})['object']
            drain(server)
            server, endpoint, _ = start_server(work, 'writer', arguments, key_file)
            owner = session(endpoint, workspace, ['owner'])
            for version in range(3, 23):
                file = rpc(endpoint, owner['session_key'], 'write', {'object_id': file['id'],
                    'expected_version': file['version'], 'data': [version] * (65536 + version * 7)})['object']
                assert file['version'] == version
            last_acknowledged = file['version']
            server.kill()
            server.wait(timeout=10)
            cache_directories = list((work / 'cache').iterdir())
            assert len(cache_directories) == 1
            sentinel = cache_directories[0] / 'must-not-survive-restart'
            sentinel.write_text('old cache')
            server, endpoint, _ = start_server(work, 'recovery', arguments, key_file)
            assert not sentinel.exists(), 'restart reused an old cache directory'
            owner = session(endpoint, workspace, ['owner'])
            recovered = rpc(endpoint, owner['session_key'], 'lookup', {'parent_id': workspace['root_id'], 'name': 'file'})
            assert recovered['id'] == file['id']
            assert 2 <= recovered['version'] <= last_acknowledged
            assert recovered['size'] == 65536 + recovered['version'] * 7
            data = rpc(endpoint, owner['session_key'], 'read', {'object_id': file['id'], 'length': recovered['size'], 'version': recovered['version']})
            assert data['data'] == [recovered['version']] * recovered['size'], 'partial batch recovered'
            drain(server)
            print(json.dumps({'crash_recovery': 'passed', 'last_acknowledged_version': last_acknowledged,
                              'recovered_version': recovered['version'], 'old_cache_discarded': True}))
        finally:
            if server.poll() is None:
                server.kill()
                server.wait(timeout=10)


if __name__ == '__main__':
    main()
