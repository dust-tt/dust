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
    deferred = {errno.EAGAIN, errno.EIO, errno.ENOENT}

    def stat(object_id):
        return rpc(endpoint, key, 'stat', {'object_id': object_id})

    def create(parent, name, directory=False):
        return rpc(endpoint, key, 'create', {'parent_id': parent,
            'expected_parent_version': stat(parent)['version'], 'name': name,
            'directory': directory, 'mode': 493 if directory else 420})['object']

    def contents(object_id):
        return bytes(rpc(endpoint, key, 'read', {'object_id': object_id, 'length': 1048576})['data'])

    def lookup(parent, name):
        return rpc(endpoint, key, 'lookup', {'parent_id': parent, 'name': name})

    def write_sync(path, data):
        with path.open('wb', buffering=0) as stream:
            stream.write(data)
            os.fsync(stream.fileno())

    def close_failed(fd):
        try:
            os.close(fd)
        except OSError as error:
            assert error.errno in deferred, error

    private = create(workspace['root_id'], 'private', True)
    item = create(private['id'], 'conversation', True)
    rpc(endpoint, workspace['workspace_key'], 'update-grants', {
        'workspace_id': workspace['workspace_id'], 'object_id': item['id'],
        'expected_version': item['version'], 'changes': [{'grant': 'reader', 'attached': True}]})
    partial = create(item['id'], 'partial')
    original = b'x' * (65536 * 3)
    rpc(endpoint, key, 'write', {'object_id': partial['id'], 'expected_version': 1, 'data': list(original)})
    shared_name = 'conversation--' + item['id']
    with tempfile.TemporaryDirectory(prefix='dfs-v1-mounts-') as temporary:
        with mounted(endpoint, key, Path(temporary) / 'a') as a, mounted(endpoint, reader['session_key'], Path(temporary) / 'b') as b:
            conversation = a / 'private' / 'conversation'
            shared = b / 'shared' / shared_name
            assert os.listdir(b) == ['shared']
            assert os.listdir(b / 'shared') == [shared_name]
            assert (shared / '..').resolve() == b / 'shared'
            expect_errno({errno.ENOENT}, lambda: (b / 'private').stat())

            # A cold partial-page write requires a kernel READ on an O_WRONLY handle.
            fd = os.open(conversation / 'partial', os.O_WRONLY)
            try:
                os.pwrite(fd, b'Y', 7)
                os.fsync(fd)
            finally:
                os.close(fd)
            assert contents(partial['id']) == original[:7] + b'Y' + original[8:]

            file = conversation / 'file'
            write_sync(file, b'initial')
            assert (shared / 'file').read_bytes() == b'initial'
            info = lookup(item['id'], 'file')
            fa = os.open(file, os.O_RDWR)
            fb = os.open(shared / 'file', os.O_RDWR)
            fb_other = os.open(shared / 'file', os.O_RDWR)
            try:
                os.pwrite(fa, b'A', 0)
                os.fsync(fa)
                os.pwrite(fb, b'B', 0)
                expect_errno(deferred, lambda: os.fsync(fb))
                # Neither another fsync nor reopening may refresh/replay rejected dirty data.
                expect_errno(deferred, lambda: os.fsync(fb))
                expect_errno(deferred, lambda: os.fsync(fb_other))
                assert contents(info['id']) == b'Anitial'
                expect_errno(deferred, lambda: os.open(shared / 'file', os.O_RDWR))
            finally:
                os.close(fa)
                close_failed(fb)
                close_failed(fb_other)

            # Retained pages are allowed to stay stale, but they cannot overwrite a new server version.
            current = stat(info['id'])
            rpc(endpoint, key, 'write', {'object_id': info['id'], 'expected_version': current['version'],
                                       'data': list(b'product')})
            assert file.read_bytes() == b'Anitial'
            fd = os.open(file, os.O_RDWR)
            try:
                os.pwrite(fd, b'C', 0)
                expect_errno(deferred, lambda: os.fsync(fd))
                assert contents(info['id']) == b'product'
            finally:
                close_failed(fd)

            attrs = conversation / 'attrs'
            write_sync(attrs, b'prefix')
            attr_info = lookup(item['id'], 'attrs')
            os.setxattr(attrs, 'user.binary', b'\0\xff')
            assert os.getxattr(attrs, 'user.binary') == b'\0\xff'
            expect_errno({errno.EEXIST}, lambda: os.setxattr(attrs, 'user.binary', b'x', os.XATTR_CREATE))
            os.removexattr(attrs, 'user.binary')
            attrs.chmod(0o640)
            assert attrs.stat().st_mode & 0o777 == 0o640
            fd = os.open(attrs, os.O_WRONLY | os.O_APPEND)
            try:
                os.write(fd, b'-append')
                os.fsync(fd)
            finally:
                os.close(fd)
            assert contents(attr_info['id']) == b'prefix-append'
            with attrs.open('r+b', buffering=0) as stream:
                stream.write(b'x' * (65536 * 3))
                stream.truncate(65538)
                stream.truncate(65536 * 3)
                os.fsync(stream.fileno())
            assert contents(attr_info['id']) == b'x' * 65538 + bytes(65536 * 2 - 2)
            os.utime(attrs, ns=(1_000_000_001, 2_000_000_002))
            assert attrs.stat().st_mtime_ns == 2_000_000_002
            attrs.rename(conversation / 'moved')
            assert lookup(item['id'], 'moved')['id'] == attr_info['id']
            (conversation / 'moved').unlink()
            expect_errno({errno.ENOENT}, lambda: (conversation / 'moved').stat())

            # Unlink has no server handle retention; buffered writes must fail at publication.
            removed = conversation / 'removed'
            write_sync(removed, b'old')
            gone = lookup(item['id'], 'removed')
            fd = os.open(removed, os.O_RDWR)
            try:
                rpc(endpoint, key, 'remove', {'object_id': gone['id'], 'expected': [
                    {'id': gone['id'], 'version': gone['version']},
                    {'id': item['id'], 'version': stat(item['id'])['version']} ]})
                os.pwrite(fd, b'lost', 0)
                expect_errno(deferred, lambda: os.fsync(fd))
            finally:
                close_failed(fd)

            # Refresh the stale parent with an explicit failed namespace operation, without retrying it.
            expect_errno({errno.EAGAIN}, lambda: (conversation / 'probe').mkdir())
            (conversation / 'probe').mkdir()
            (conversation / 'probe').rmdir()
            expect_errno({errno.ENOENT}, lambda: (conversation / 'missing').stat())
            write_sync(conversation / 'missing', b'created after negative lookup')
            assert (conversation / 'missing').read_bytes() == b'created after negative lookup'
            def exercise(index):
                target = conversation / f'parallel-{index:03}'
                write_sync(target, str(index).encode())
                assert target.read_bytes() == str(index).encode()
            with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
                list(executor.map(exercise, range(150)))
            expected = {f'parallel-{i:03}' for i in range(150)}
            assert expected.issubset(set(os.listdir(conversation)))
            assert expected.issubset(set(os.listdir(conversation)))

            fd = os.open(shared / 'parallel-000', os.O_RDONLY)
            assert os.pread(fd, 1, 0) == b'0'
            rpc(endpoint, workspace['workspace_key'], 'update-grants', {
                'workspace_id': workspace['workspace_id'], 'object_id': item['id'],
                'expected_version': stat(item['id'])['version'], 'changes': [{'grant': 'reader', 'attached': False}]})
            assert os.pread(fd, 1, 0) == b'0', 'cached reads survive revocation'
            expect_errno({errno.ENOENT}, lambda: (shared / 'never-cached').stat())
            expect_errno({errno.ENOENT, errno.EIO}, lambda: os.fsync(fd))
            os.close(fd)
    print('PASS: kernel caching/writeback, deferred conflicts/unlink, partial writes, append/truncate, paging, cached revocation', flush=True)


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
