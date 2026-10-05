#!/usr/bin/env python3
import argparse
import errno
import json
import os
import pathlib
import signal
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--bin', type=pathlib.Path, required=True)
parser.add_argument('--run', type=pathlib.Path, required=True)
args = parser.parse_args()
binary = args.bin.resolve()
run = args.run.resolve()
run.mkdir(parents=True)
for name in ('a', 'b', 'credentials'):
    (run / name).mkdir()
subprocess.run([str(binary / 'dfsctl'), 'provision', '--directory', str(run / 'credentials')], check=True)
token = run / 'credentials' / 'admin.token'
processes = []
records = []


def spawn(name, argv):
    logfile = (run / (name + '.log')).open('ab')
    process = subprocess.Popen([str(item) for item in argv], stdout=logfile, stderr=subprocess.STDOUT, env={**os.environ, 'RUST_LOG': 'info'})
    logfile.close()
    processes.append(process)
    return process


def wait_for(predicate, seconds=20):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.02)
    raise AssertionError('operation deadline exceeded')


def metrics():
    result = subprocess.run([str(binary / 'dfsctl'), '--token-file', str(token), 'metrics'], capture_output=True, timeout=10)
    return json.loads(result.stdout)['Metrics'] if result.returncode == 0 else None


def start_server(quota=None):
    argv = [binary / 'dfsd', '--db', run / 'db', '--credentials', run / 'credentials' / 'credentials.json']
    if quota is not None:
        argv += ['--tenant-bytes', str(quota)]
    process = spawn('server', argv)
    wait_for(lambda: metrics() is not None)
    return process


def start_mount(name):
    process = spawn('mount-' + name, [binary / 'dfs-mount', '--token-file', token, '--mountpoint', run / name])
    wait_for(lambda: os.path.ismount(run / name))
    return process


def persisted():
    state = metrics()
    return state and state['published'] == state['persisted']


def expect_errno(operation, allowed):
    try:
        operation()
    except OSError as error:
        assert error.errno in allowed, (error.errno, allowed)
        return error.errno
    raise AssertionError('operation unexpectedly succeeded')


try:
    server = start_server()
    mount_a = start_mount('a')
    mount_b = start_mount('b')
    path = run / 'a' / 'files' / 'file'
    path.write_bytes(b'published')
    fd = os.open(path, os.O_RDWR)
    read_fd = os.open(path, os.O_RDONLY)
    assert os.pread(read_fd, 4096, 0) == b'published'
    os.fsync(fd)
    wait_for(persisted)
    server.kill()
    server.wait(timeout=10)
    started = time.monotonic()
    error = expect_errno(lambda: os.pwrite(fd, b'disconnected', 0), {errno.ETIMEDOUT, errno.EIO})
    records.append({'scenario': 'server_disconnect_write', 'errno': error, 'elapsed_ms': (time.monotonic() - started) * 1000})
    server = start_server()
    time.sleep(2.2)
    error = expect_errno(lambda: os.pwrite(fd, b'stale', 0), {errno.ESTALE})
    records.append({'scenario': 'incarnation_stale_editing_handle', 'errno': error})
    try:
        os.close(fd)
    except OSError as error:
        assert error.errno in {errno.ESTALE, errno.ETIMEDOUT, errno.EIO}
    assert path.read_bytes() == b'published'
    error = expect_errno(lambda: os.pread(read_fd, 4096, 0), {errno.ESTALE, errno.EIO})
    os.close(read_fd)
    records.append({'scenario': 'incarnation_invalidates_warm_read_handle_after_new_open', 'errno': error})
    error = expect_errno(lambda: path.write_bytes(b'new session'), {errno.ESTALE, errno.ETIMEDOUT, errno.EIO})
    records.append({'scenario': 'unknown_publication_blocks_reopen_until_remount', 'errno': error})
    mount_a.terminate()
    assert mount_a.wait(timeout=15) == 0
    wait_for(lambda: not os.path.ismount(run / 'a'))
    mount_a = start_mount('a')
    assert path.read_bytes() == b'published'
    path.write_bytes(b'new session')
    records.append({'scenario': 'fresh_mount_reconciles_recovered_content', 'passed': True})
    fd = os.open(path, os.O_RDONLY)
    mount_a.kill()
    mount_a.wait(timeout=10)
    error = expect_errno(lambda: os.read(fd, 10), {errno.ENOTCONN, errno.EIO})
    try:
        os.close(fd)
    except OSError as close_error:
        assert close_error.errno in {errno.ENOTCONN, errno.EIO}
    records.append({'scenario': 'mount_sigkill', 'errno': error})
    subprocess.run(['fusermount3', '-u', str(run / 'a')], check=False, capture_output=True)
    assert subprocess.run(['findmnt', '-M', str(run / 'a')], capture_output=True).returncode != 0
    (run / 'b' / 'files' / 'independent').write_bytes(b'other mount survives')
    mount_a = start_mount('a')
    assert (run / 'a' / 'files' / 'independent').read_bytes() == b'other mount survives'
    accepted = metrics()['published']
    server.terminate()
    assert server.wait(timeout=10) == 0
    server = start_server()
    recovered = metrics()['published']
    assert recovered == accepted
    records.append({'scenario': 'clean_redeploy', 'published': accepted, 'recovered': recovered})
    for mount in (mount_a, mount_b):
        mount.terminate()
        mount.wait(timeout=10)
    server.terminate()
    server.wait(timeout=10)
    server = start_server(quota=2 * 1024 * 1024)
    mount_a = start_mount('a')
    fd = os.open(run / 'a' / 'files' / 'quota', os.O_CREAT | os.O_RDWR, 0o600)
    payload = b'Q' * (4 * 1024 * 1024)
    count = os.write(fd, payload)
    assert 0 < count < len(payload), count
    assert os.fstat(fd).st_size == count
    error = expect_errno(lambda: os.fsync(fd), {errno.EDQUOT})
    assert os.pread(fd, 1024, count - 1024) == b'Q' * 1024
    records.append({'scenario': 'quota_short_write_and_fsync_error', 'requested': len(payload), 'written': count, 'fsync_errno': error})
    try:
        os.close(fd)
    except OSError as error:
        assert error.errno == errno.EDQUOT
    (run / 'failure.json').write_text(json.dumps({'passed': True, 'records': records}, indent=2) + '\n')
finally:
    for process in reversed(processes):
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
