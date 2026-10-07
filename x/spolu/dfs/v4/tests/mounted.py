#!/usr/bin/env python3
"""Exercise the actual cached Linux mount against real local FDB."""
import errno
import os
from pathlib import Path
import tempfile
import time
import support


def cleanup_pending_unlinks(root):
    """Recursive cleanup must tolerate its own successful background unlink completions."""
    parent = root
    for depth in range(13):
        parent /= f'cleanup-{depth}'
        parent.mkdir()
    payload = b'x' * 32768
    for _ in range(5):
        with tempfile.TemporaryDirectory(dir=parent) as scratch:
            files = [Path(scratch) / f'write-{i:03d}' for i in range(32)]
            opened = []
            try:
                for path in files:
                    file = path.open('wb', buffering=0)
                    opened.append(file)
                    file.write(payload)
                for file in opened:
                    os.fsync(file.fileno())
            finally:
                for file in opened:
                    file.close()
            assert all(path.read_bytes() == payload for path in files)
            for path in files:
                path.unlink()
            assert all(not path.exists() for path in files)
        # TemporaryDirectory uses scandir followed by rmdir, without first draining unlinks.
        assert not Path(scratch).exists()
    assert list(parent.iterdir()) == []


def main():
    work = Path(tempfile.mkdtemp(prefix='dfs-v4-mounted-'))
    prefix, key, key_path = support.identity(work)
    server, endpoint = support.start(work, 'mounted', prefix, key_path)
    peer = None
    try:
        tenant = support.rpc(endpoint, key, 'create-tenant', {'tenant_id': 'mounted', 'root_grants': ['owner']})
        owner = support.session(endpoint, tenant, ['owner'])
        support.rpc(endpoint, owner['session_key'], 'create', {'parent_id': tenant['root_id'], 'name': 'work', 'directory': True, 'mode': 493})
        with support.mounted(endpoint, owner['session_key'], work / 'mount'):
            root = work / 'mount/work'
            # Create initializes its handle from the response, including read-only access flags.
            created = root / 'created-readonly'
            fd = os.open(created, os.O_CREAT | os.O_EXCL | os.O_RDONLY, 0o600)
            try:
                assert os.read(fd, 1) == b''
                try:
                    os.write(fd, b'x')
                except OSError as error:
                    assert error.errno == errno.EBADF, error
                else:
                    raise AssertionError('Read-only created handle allowed a write')
            finally:
                os.close(fd)
            with created.open('wb') as f:
                f.write(b'existing open still works')
            assert created.read_bytes() == b'existing open still works'
            created.unlink()
            (root / 'dir').mkdir()
            target = root / 'dir/file'
            content = b'abc' * 500_000
            with target.open('wb') as f:
                f.write(content)
                f.flush()
                os.fsync(f.fileno())
            assert target.read_bytes() == content
            with target.open('r+b') as f:
                f.truncate(3)
                f.truncate(65537)
                os.fsync(f.fileno())
            assert target.read_bytes() == b'abc' + bytes(65534)
            os.setxattr(target, 'user.test', b'value')
            assert os.getxattr(target, 'user.test') == b'value'
            assert 'user.test' in os.listxattr(target)
            os.removexattr(target, 'user.test')
            target.rename(root / 'moved')
            (root / 'dir').rmdir()
            target = root / 'moved'
            with target.open('ab') as f:
                f.write(b'end')
            assert target.read_bytes().endswith(b'end')
            assert sorted(p.name for p in root.iterdir()) == ['moved']
            (root / 'new').write_bytes(b'new')
            assert sorted(p.name for p in root.iterdir()) == ['moved', 'new']
            # Refresh an already open descriptor after another server replaces its contents.
            time.sleep(.1)
            peer, peer_endpoint = support.start(work, 'peer', prefix, key_path)
            peer_owner = support.session(peer_endpoint, tenant, ['owner'])
            folder = support.rpc(peer_endpoint, peer_owner['session_key'], 'lookup', {'parent_id': tenant['root_id'], 'name': 'work'})
            obj = support.rpc(peer_endpoint, peer_owner['session_key'], 'lookup', {'parent_id': folder['id'], 'name': 'moved'})
            with target.open('rb', buffering=0) as f:
                assert f.read(3) == b'abc'
                support.rpc(peer_endpoint, peer_owner['session_key'], 'write', {'object_id': obj['id'], 'offset': 0, 'data': list(b'XYZ')})
                time.sleep(int(os.environ.get("MAX_EVENTUAL_CONSISTENCY_DELAY_MS", "1000")) / 1000 + .05)
                f.seek(0)
                assert f.read(3) == b'XYZ'
            support.stop(peer)
            peer = None
            target.unlink()
            assert not target.exists()
            cleanup_pending_unlinks(root)
        support.stop(server)
        server = None
        support.shutdown(work / 'mounted-server.log')
        print(f'Mounted filesystem checks passed. Logs: {work}')
    finally:
        if peer is not None and peer.poll() is None:
            support.stop(peer)
        if server is not None and server.poll() is None:
            support.stop(server)


if __name__ == '__main__':
    main()
