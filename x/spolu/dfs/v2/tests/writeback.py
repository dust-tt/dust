#!/usr/bin/env python3
"""Exercise server RAM acceptance, durable fsync, crashes, and overwrites through Linux FUSE."""
import errno
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile

spec = importlib.util.spec_from_file_location('v2_support', Path(__file__).with_name('support.py'))
support = importlib.util.module_from_spec(spec)
spec.loader.exec_module(support)


def main():
    # Delay background publication so the test controls each durability boundary explicitly.
    os.environ['DFS_WRITEBACK_MIB'] = '256'
    os.environ['DFS_WRITEBACK_DEBOUNCE_MS'] = '60000'
    os.environ['DFS_WRITEBACK_MAX_AGE_MS'] = '60000'
    work = Path(tempfile.mkdtemp(prefix='dfs-v2-writeback-fuse-'))
    prefix, key, key_path = support.identity(work)
    a, endpoint_a = support.start(work, 'a', prefix, key_path)
    b, endpoint_b = support.start(work, 'b', prefix, key_path)
    success = False
    try:
        workspace = support.rpc(endpoint_a, key, 'create-workspace',
                                {'workspace_id': 'writeback', 'root_grants': ['owner']})
        session_a = support.session(endpoint_a, workspace, ['owner'])
        session_b = support.session(endpoint_b, workspace, ['owner'])

        def rpc_a(method, body):
            return support.rpc(endpoint_a, session_a['session_key'], method, body)

        def rpc_b(method, body):
            return support.rpc(endpoint_b, session_b['session_key'], method, body)

        def create(name):
            root = rpc_a('stat', {'object_id': workspace['root_id']})
            return rpc_a('create', {'parent_id': root['id'], 'expected_parent_version': root['version'],
                                     'name': name, 'mode': 420})['object']

        def read_b(file):
            return bytes(rpc_b('read', {'object_id': file['id'], 'length': 100})['data'])

        memory, durable = create('memory'), create('durable')
        support.rpc(endpoint_a, workspace['workspace_key'], 'update-grants', {
            'workspace_id': workspace['workspace_id'], 'object_id': memory['id'],
            'expected_version': memory['version'], 'changes': [{'grant': 'owner', 'attached': True}]})
        with support.mounted(endpoint_a, session_a['session_key'], work / 'mount-a') as mount:
            with (mount / 'memory').open('wb', buffering=0) as file:
                file.write(b'memory only')
            assert rpc_a('stat', {'object_id': memory['id']})['size'] == 11
            assert (mount / 'shared' / ('memory--' + memory['id'])).read_bytes() == b'memory only'
            assert read_b(memory) == b'', 'ordinary close unexpectedly published to FDB'
            with (mount / 'durable').open('wb', buffering=0) as file:
                file.write(b'survives fsync')
                os.fsync(file.fileno())
            assert read_b(durable) == b'survives fsync'
            assert read_b(memory) == b'', 'file fsync unexpectedly drained another file'
        assert read_b(memory) == b'', 'unmount unexpectedly added a server durability barrier'
        a.kill()
        a.wait(timeout=10)
        a, endpoint_a = support.start(work, 'reopened', prefix, key_path)
        session_a = support.session(endpoint_a, workspace, ['owner'])
        assert bytes(rpc_a('read', {'object_id': memory['id'], 'length': 100})['data']) == b''
        assert bytes(rpc_a('read', {'object_id': durable['id'], 'length': 100})['data']) == b'survives fsync'

        competing, victim = create('competing'), create('victim')
        for file in (competing, victim):
            rpc_a('write', {'object_id': file['id'], 'expected_version': file['version'], 'data': list(b'abcdef')})
            rpc_a('fsync', {'object_id': file['id']})
        with support.mounted(endpoint_a, session_a['session_key'], work / 'new-a') as mount_a:
            with support.mounted(endpoint_b, session_b['session_key'], work / 'mount-b') as mount_b:
                # Both mounts deliberately retain the old content version before either write.
                assert (mount_a / 'competing').read_bytes() == b'abcdef'
                assert (mount_b / 'competing').read_bytes() == b'abcdef'
                with (mount_a / 'competing').open('r+b', buffering=0) as file:
                    file.write(b'aaaaaa')
                    os.fsync(file.fileno())
                with (mount_b / 'competing').open('r+b', buffering=0) as file:
                    file.write(b'bbbbbb')
                    os.fsync(file.fileno())
                assert read_b(competing) == b'bbbbbb', 'stale expected version did not permit overwrite'
                file = (mount_a / 'victim').open('r+b', buffering=0)
                current = rpc_b('stat', {'object_id': victim['id']})
                root = rpc_b('stat', {'object_id': workspace['root_id']})
                rpc_b('remove', {'object_id': victim['id'], 'directory': False, 'expected': [
                    {'id': current['id'], 'version': current['version']},
                    {'id': root['id'], 'version': root['version']}]})
                try:
                    file.write(b'late')
                    os.fsync(file.fileno())
                except OSError as error:
                    assert error.errno in (errno.ENOENT, errno.EIO), error
                else:
                    raise AssertionError('writeback to an unlinked file succeeded')
                finally:
                    try:
                        file.close()
                    except OSError as error:
                        assert error.errno in (errno.ENOENT, errno.EIO), error
                try:
                    rpc_b('stat', {'object_id': victim['id']})
                except subprocess.CalledProcessError:
                    pass
                else:
                    raise AssertionError('deleted file was resurrected')
        support.stop(a)
        support.stop(b)
        support.cleanup(prefix)
        success = True
        print(f'PASS: server RAM visibility, cheap close, shared alias, fsync/crash recovery, '
              f'independent FUSE overwrites, unlink errors; logs: {work}', flush=True)
    finally:
        for process in (a, b):
            if process.poll() is None:
                process.kill()
                process.wait(timeout=10)
        key_path.unlink(missing_ok=True)
        if not success:
            print(f'Incomplete fixture retained: {work}', flush=True)


if __name__ == '__main__':
    main()
