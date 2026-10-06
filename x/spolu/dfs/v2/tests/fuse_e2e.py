#!/usr/bin/env python3
"""Run v1's real two-mount workload against FDB, then check v2's duplicate shared aliases."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import sys

# Use a distinct module name so the unchanged v1 script can import its own support module.
spec = importlib.util.spec_from_file_location('v2_support', Path(__file__).with_name('support.py'))
support = importlib.util.module_from_spec(spec)
spec.loader.exec_module(support)
sys.path.insert(0, str(support.ROOT.parent / 'v1/tests'))
import fuse_e2e as v1


def main():
    # This compatibility fixture checks the original strict durable-acknowledgment mode.
    os.environ['DFS_WRITEBACK_MIB'] = '0'
    work = Path(tempfile.mkdtemp(prefix='dfs-v2-fuse-'))
    prefix, key, key_path = support.identity(work)
    server, endpoint = support.start(work, 'e2e', prefix, key_path)
    success = False
    try:
        workspace = support.rpc(endpoint, key, 'create-workspace',
                                {'workspace_id': 'e2e', 'root_grants': ['owner']})
        support.secret_file(work / 'workspace.json', json.dumps(workspace))
        v1.inside(endpoint, work)
        owner = support.session(endpoint, workspace, ['owner'])
        root = support.rpc(endpoint, owner['session_key'], 'stat', {'object_id': workspace['root_id']})
        file = support.rpc(endpoint, owner['session_key'], 'create', {
            'parent_id': root['id'], 'expected_parent_version': root['version'], 'name': 'alias',
            'mode': 420})['object']
        support.rpc(endpoint, workspace['workspace_key'], 'update-grants', {
            'workspace_id': 'e2e', 'object_id': file['id'], 'expected_version': file['version'],
            'changes': [{'grant': 'owner', 'attached': True}]})
        with support.mounted(endpoint, owner['session_key'], work / 'aliases') as mount:
            shared = mount / 'shared' / ('alias--' + file['id'])
            with (mount / 'alias').open('wb', buffering=0) as out:
                out.write(b'visible through both paths')
                os.fsync(out.fileno())
            assert shared.read_bytes() == b'visible through both paths'
        # A process loss must retain committed data and discard process-local sessions.
        server.kill()
        server.wait(timeout=10)
        server, endpoint = support.start(work, 'reopened', prefix, key_path)
        try:
            support.rpc(endpoint, owner['session_key'], 'current-session')
        except subprocess.CalledProcessError:
            pass
        else:
            raise AssertionError('old session survived process loss')
        fresh = support.session(endpoint, workspace, ['owner'])
        content = support.rpc(endpoint, fresh['session_key'], 'read', {'object_id': file['id'], 'length': 100})
        assert bytes(content['data']) == b'visible through both paths'
        support.stop(server)
        success = True
        print(f'PASS: v2 duplicate aliases and restart recovery; logs: {work}', flush=True)
    finally:
        if server.poll() is None:
            server.kill()
            server.wait(timeout=10)
        key_path.unlink(missing_ok=True)
        (work / 'workspace.json').unlink(missing_ok=True)
        if success:
            support.cleanup(prefix)


if __name__ == '__main__':
    main()
