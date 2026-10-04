#!/usr/bin/env python3
"""Validate Linux xattr filtering, cache coherence, and retained write versions against real FDB."""
import errno
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time

spec = importlib.util.spec_from_file_location('v2_support', Path(__file__).with_name('support.py'))
support = importlib.util.module_from_spec(spec)
spec.loader.exec_module(support)


def fails(codes, operation):
    try:
        operation()
    except OSError as error:
        assert error.errno in codes, (error.errno, codes)
    else:
        raise AssertionError('operation unexpectedly succeeded')


def main():
    work = Path(tempfile.mkdtemp(prefix='dfs-v2-xattrs-'))
    prefix, key, key_path = support.identity(work)
    server, endpoint = support.start(work, 'xattrs', prefix, key_path)
    success = False
    try:
        workspace = support.rpc(endpoint, key, 'create-workspace',
                                {'workspace_id': 'xattrs', 'root_grants': ['owner']})
        owner = support.session(endpoint, workspace, ['owner'])['session_key']

        def call(method, body):
            return support.rpc(endpoint, owner, method, body)

        def stat(object_id):
            return call('stat', {'object_id': object_id})

        directory = call('create', {'parent_id': workspace['root_id'],
            'expected_parent_version': stat(workspace['root_id'])['version'],
            'name': 'work', 'directory': True, 'mode': 493})['object']

        def create(name):
            return call('create', {'parent_id': directory['id'],
                'expected_parent_version': stat(directory['id'])['version'], 'name': name,
                'mode': 420, 'xattrs': {'user.binary': [0, 255], 'user.empty': []}})['object']

        file = create('file')
        versioned = create('versioned')
        call('write', {'object_id': versioned['id'], 'expected_version': versioned['version'],
                       'data': list(b'original')})
        support.rpc(endpoint, workspace['workspace_key'], 'update-grants', {
            'workspace_id': workspace['workspace_id'], 'object_id': file['id'],
            'expected_version': file['version'], 'changes': [{'grant': 'owner', 'attached': True}]})

        # A read-only workload isolates exactly the cache-fill RPCs from mutation RPCs.
        samples = 200
        with support.mounted(endpoint, owner, work / 'reads',
                             metrics_path=work / 'reads-metrics.json') as mount:
            path = mount / 'work' / 'file'
            alias = mount / 'shared' / ('file--' + file['id'])
            started = time.monotonic()
            for _ in range(samples):
                fails({errno.EOPNOTSUPP}, lambda: os.getxattr(path, 'security.capability'))
                assert os.getxattr(path, 'user.binary') == b'\x00\xff'
                assert os.getxattr(alias, 'user.empty') == b''
                fails({errno.ENODATA}, lambda: os.getxattr(alias, 'user.absent'))
                assert set(os.listxattr(path)) == {'user.binary', 'user.empty'}
            seconds = time.monotonic() - started
        metrics = json.loads((work / 'reads-metrics.json').read_text())['dfs_client_metrics']
        stats = metrics['rpc.stat']['calls']
        enabled = int(os.environ.get('DFS_XATTR_CACHE_MIB', '16')) > 0
        assert (stats == 2 if enabled else stats >= 1 + 4 * samples), stats

        with support.mounted(endpoint, owner, work / 'edits') as mount:
            path = mount / 'work' / 'file'
            alias = mount / 'shared' / ('file--' + file['id'])
            assert os.getxattr(alias, 'user.binary') == b'\x00\xff'
            os.setxattr(path, 'user.binary', b'new')
            assert os.getxattr(alias, 'user.binary') == b'new'
            os.removexattr(alias, 'user.empty')
            fails({errno.ENODATA}, lambda: os.getxattr(path, 'user.empty'))
            assert os.listxattr(path) == ['user.binary']
            fails({errno.EEXIST}, lambda: os.setxattr(path, 'user.binary', b'x', os.XATTR_CREATE))
            assert os.getxattr(alias, 'user.binary') == b'new'
            path.rename(mount / 'work' / 'moved')
            moved_alias = mount / 'shared' / ('moved--' + file['id'])
            assert os.getxattr(moved_alias, 'user.binary') == b'new'
            fd = os.open(mount / 'work' / 'moved', os.O_RDONLY)
            try:
                assert os.getxattr(fd, 'user.binary') == b'new'
                (mount / 'work' / 'moved').unlink()
                fails({errno.ENOENT}, lambda: os.getxattr(fd, 'user.binary'))
            finally:
                try:
                    os.close(fd)
                except OSError as error:
                    assert error.errno == errno.ENOENT, error

            # A fresh xattr response must not advance the version of retained kernel pages.
            path = mount / 'work' / 'versioned'
            assert path.read_bytes() == b'original'
            fd = os.open(path, os.O_RDWR)
            try:
                call('update', {'object_id': versioned['id'],
                    'expected_version': stat(versioned['id'])['version'],
                    'xattrs': [{'name': 'user.remote', 'value': [42]}]})
                assert os.getxattr(path, 'user.remote') == b'*'
                os.pwrite(fd, b'X', 0)
                fails({errno.EAGAIN, errno.EIO}, lambda: os.fsync(fd))
                content = call('read', {'object_id': versioned['id'], 'length': 8})
                assert bytes(content['data']) == b'original'
            finally:
                try:
                    os.close(fd)
                except OSError as error:
                    assert error.errno in {errno.EAGAIN, errno.EIO}, error

        support.stop(server)
        success = True
        print(f'PASS: xattrs cache={enabled}; {samples} read rounds in {seconds:.6f}s; '
              f'{stats} Stat RPCs; logs: {work}', flush=True)
    finally:
        if server.poll() is None:
            server.kill()
            server.wait(timeout=10)
        key_path.unlink(missing_ok=True)
        if success:
            support.cleanup(prefix)


if __name__ == '__main__':
    main()
