#!/usr/bin/env python3
"""Exercise real Linux FUSE mounts against the native server."""
import argparse
import concurrent.futures
import errno
import json
import os
from pathlib import Path
import secrets
import tempfile
from support import docker, drain, mounted, rpc, secret_file, session, start_server


def expect_errno(codes, operation):
    try:
        operation()
    except OSError as error:
        assert error.errno in codes, (error.errno, codes)
    else:
        raise AssertionError('operation unexpectedly succeeded')


def inside(endpoint, work):
    workspace = json.loads((work / 'workspace.json').read_text())
    owner = session(endpoint, workspace, ['owner'])
    reader = session(endpoint, workspace, ['reader'])
    key = owner['session_key']
    with tempfile.TemporaryDirectory(prefix='dfs-v1-mounts-') as temporary:
        with mounted(endpoint, key, Path(temporary) / 'a') as a, mounted(endpoint, reader['session_key'], Path(temporary) / 'b') as b:
            root = workspace['root_id']
            private = rpc(endpoint, key, 'create', {'parent_id': root, 'expected_parent_version': 1,
                'name': 'private', 'directory': True, 'mode': 493})['object']
            conversation = a / 'private' / 'conversation'
            conversation.mkdir()
            item = rpc(endpoint, key, 'lookup', {'parent_id': private['id'], 'name': 'conversation'})
            rpc(endpoint, workspace['workspace_key'], 'update-grants', {
                'workspace_id': workspace['workspace_id'], 'object_id': item['id'],
                'expected_version': item['version'], 'changes': [{'grant': 'reader', 'attached': True}]})
            shared_name = 'conversation--' + item['id']
            assert os.listdir(b) == ['shared']
            assert os.listdir(b / 'shared') == [shared_name]
            shared = b / 'shared' / shared_name
            assert (shared / '..').resolve() == b / 'shared'
            expect_errno({errno.ENOENT}, lambda: (b / 'private').stat())
            file = conversation / 'file'
            file.write_bytes(b'initial')
            assert (shared / 'file').read_bytes() == b'initial'
            info = rpc(endpoint, key, 'lookup', {'parent_id': item['id'], 'name': 'file'})
            rpc(endpoint, key, 'write', {'object_id': info['id'], 'expected_version': info['version'], 'data': list(b'product')})
            assert file.read_bytes() == (shared / 'file').read_bytes() == b'product'
            fa = os.open(file, os.O_RDWR)
            fb = os.open(shared / 'file', os.O_RDWR)
            try:
                os.pwrite(fa, b'A', 0)
                expect_errno({errno.EAGAIN}, lambda: os.pwrite(fb, b'B', 0))
                assert os.pread(fb, 1, 0) == b'A'
                expect_errno({errno.EAGAIN}, lambda: os.fsync(fb))
                os.pwrite(fb, b'B', 0)
                os.fsync(fb)
                expect_errno({errno.EAGAIN}, lambda: os.pwrite(fa, b'C', 0))
                expect_errno({errno.EAGAIN}, lambda: os.fsync(fa))
                os.pwrite(fa, b'C', 0)
                os.fsync(fa)
            finally:
                os.close(fa)
                os.close(fb)
            assert file.read_bytes() == b'Croduct'
            os.setxattr(file, 'user.binary', b'\0\xff')
            assert os.getxattr(shared / 'file', 'user.binary') == b'\0\xff'
            expect_errno({errno.EEXIST}, lambda: os.setxattr(file, 'user.binary', b'x', os.XATTR_CREATE))
            os.removexattr(file, 'user.binary')
            file.chmod(0o640)
            assert file.stat().st_mode & 0o777 == 0o640
            os.utime(file, ns=(1_000_000_001, 2_000_000_002))
            assert file.stat().st_mtime_ns == 2_000_000_002
            with file.open('r+b', buffering=0) as stream:
                stream.write(b'x' * (65536 * 3))
                stream.truncate(65538)
                stream.truncate(65536 * 3)
                stream.seek(65536)
                assert stream.read() == b'xx' + bytes(65536 * 2 - 2)
            file.rename(conversation / 'moved')
            moved = rpc(endpoint, key, 'lookup', {'parent_id': item['id'], 'name': 'moved'})
            assert moved['id'] == info['id']
            (conversation / 'moved').unlink()
            def exercise(index):
                target = conversation / f'parallel-{index:03}'
                target.write_bytes(str(index).encode())
                assert target.read_bytes() == str(index).encode()
            with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
                list(executor.map(exercise, range(150)))
            assert len(os.listdir(conversation)) == 150
            assert sorted(os.listdir(conversation)) == sorted(os.listdir(shared))
            fd = os.open(shared / 'parallel-000', os.O_RDONLY)
            current = rpc(endpoint, key, 'stat', {'object_id': item['id']})
            rpc(endpoint, workspace['workspace_key'], 'update-grants', {
                'workspace_id': workspace['workspace_id'], 'object_id': item['id'],
                'expected_version': current['version'], 'changes': [{'grant': 'reader', 'attached': False}]})
            expect_errno({errno.ENOENT}, lambda: os.pread(fd, 1, 0))
            expect_errno({errno.ENOENT}, lambda: shared.stat())
            assert os.listdir(b / 'shared') == []
            expect_errno({errno.ENOENT}, lambda: os.close(fd))
            for child in conversation.iterdir():
                child.unlink()
            conversation.rmdir()
    print('PASS: two mounts, product visibility, conflicts, attrs, sparse blocks, paging, revocation', flush=True)


def host():
    work = Path(tempfile.mkdtemp(prefix='dfs-v1-fuse-e2e-'))
    key = secrets.token_hex(32)
    secret_file(work / 'server.key', key)
    server, endpoint, docker_endpoint = start_server(work, 'e2e',
        ['--local-store', str(work / 'remote'), '--prefix', 'e2e', '--cache-memory-mib', '32', '--cache-disk-gib', '0', '--max-unflushed-mib', '32'], work / 'server.key')
    try:
        workspace = rpc(endpoint, key, 'create-workspace', {'workspace_id': 'e2e', 'root_grants': ['owner']})
        secret_file(work / 'workspace.json', json.dumps(workspace))
        docker(work, 'tests/fuse_e2e.py', ['--inside', '--endpoint', docker_endpoint, '--work', '/run/dfs'])
        print(f'Persistence drain: {drain(server):.3f}s; logs: {work}', flush=True)
    finally:
        if server.poll() is None:
            server.kill()
            server.wait(timeout=10)
        (work / 'server.key').unlink(missing_ok=True)
        (work / 'workspace.json').unlink(missing_ok=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inside', action='store_true')
    parser.add_argument('--endpoint')
    parser.add_argument('--work', type=Path)
    args = parser.parse_args()
    if args.inside:
        inside(args.endpoint, args.work)
    else:
        host()
