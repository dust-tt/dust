#!/usr/bin/env python3
"""Exercise the actual cached Linux mount against real local FDB."""
import errno
import contextlib
import json
import os
from pathlib import Path
import tempfile
import time
import support


def denied(operation):
    try:
        operation()
    except OSError as error:
        assert error.errno == errno.EACCES, error
    else:
        raise AssertionError('Mode check allowed a forbidden operation')


def posix_modes(root):
    """Userspace checks must preserve open-handle rights and directory search permissions."""
    assert os.geteuid() != 0, 'Run mounted checks as an unprivileged user to exercise modes'
    directory = root / 'modes'
    directory.mkdir()
    file = directory / 'file'
    fd = os.open(file, os.O_CREAT | os.O_EXCL | os.O_RDWR, 0)
    try:
        assert os.write(fd, b'created with mode zero') == 22
        denied(lambda: file.open('rb'))
        denied(lambda: file.open('wb'))
        assert not os.access(file, os.R_OK | os.W_OK)
        os.chmod(file, 0o600)
        assert os.access(file, os.R_OK | os.W_OK)
        assert not os.access(file, os.X_OK)
        os.chmod(file, 0)
        os.lseek(fd, 0, os.SEEK_SET)
        assert os.read(fd, 22) == b'created with mode zero'
        os.ftruncate(fd, 7)
        os.fsync(fd)
    finally:
        os.close(fd)
        os.chmod(file, 0o600)
    os.chmod(directory, 0o600)
    assert os.listdir(directory) == ['file']
    denied(lambda: file.stat())
    denied(lambda: (directory / 'denied').touch())
    os.chmod(directory, 0o100)
    assert file.stat().st_size == 7
    denied(lambda: os.listdir(directory))
    os.chmod(directory, 0o500)
    denied(lambda: file.unlink())
    denied(lambda: file.rename(directory / 'renamed'))
    os.chmod(directory, 0o700)
    file.unlink()
    directory.rmdir()


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
            with contextlib.ExitStack() as handles:
                opened = []
                for path in files:
                    file = handles.enter_context(path.open('wb', buffering=0))
                    opened.append(file)
                    file.write(payload)
                for file in opened:
                    os.fsync(file.fileno())
            assert all(path.read_bytes() == payload for path in files)
            for path in files:
                path.unlink()
            assert all(not path.exists() for path in files)
        # TemporaryDirectory uses scandir followed by rmdir, without first draining unlinks.
        assert not Path(scratch).exists()
    assert list(parent.iterdir()) == []


def directory_reply_boundaries(root):
    """One cached page must survive many small kernel replies without missing or repeating names."""
    directory = root / 'large-directory'
    directory.mkdir()
    names = [f'entry-{index:04d}-' + 'x' * 160 for index in range(600)]
    for name in names:
        (directory / name).touch()
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
    assert sorted(os.listdir(directory)) == names
    with os.scandir(directory) as entries:
        observed = sorted((entry.name, entry.stat().st_size) for entry in entries)
    assert observed == [(name, 0) for name in names]


def main():
    work = Path(tempfile.mkdtemp(prefix='dfs-v5-mounted-'))
    prefix, key, key_path = support.identity(work)
    server, endpoint = support.start(work, 'mounted', prefix, key_path)
    peer = None
    try:
        tenant = support.rpc(endpoint, key, 'create-tenant', {'tenant_id': 'mounted', 'root_grants': ['owner']})
        owner = support.session(endpoint, tenant, ['owner'])
        support.rpc(endpoint, owner['session_key'], 'create', {'parent_id': tenant['root_id'], 'name': 'work', 'directory': True, 'mode': 493})
        metrics_path = work / 'mount-metrics.json'
        with support.mounted(endpoint, owner['session_key'], work / 'mount', metrics_path=metrics_path):
            root = work / 'mount/work'
            posix_modes(root)
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
            directory_reply_boundaries(root)
        report = json.loads(metrics_path.read_text())
        memory = report['dfs_memory_metrics']
        assert memory['accounted_peak_bytes'] <= memory['limit_bytes'] <= 512 * 1024 * 1024
        assert memory['temporary_peak_bytes'] <= memory['temporary_limit_bytes']
        metrics = report['dfs_client_metrics']
        assert metrics['fuse.inline']['calls'] > 0
        assert metrics['fuse.deferred']['calls'] > 0
        assert metrics.get('inline.wait_after_effect', {}).get('calls', 0) == 0
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
