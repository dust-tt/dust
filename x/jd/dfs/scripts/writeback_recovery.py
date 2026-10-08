#!/usr/bin/env python3
import argparse
import ctypes
import errno
import json
import os
import pathlib
import select
import shutil
import signal
import socket
import subprocess
import tempfile
import time
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--bin', type=pathlib.Path, required=True)
parser.add_argument('--output', type=pathlib.Path, required=True)
args = parser.parse_args()
request = urllib.request.Request('http://metadata.google.internal/computeMetadata/v1/project/project-id',
                                 headers={'Metadata-Flavor': 'Google'})
assert urllib.request.urlopen(request, timeout=5).read() == b'dust-dev'
args.bin = args.bin.resolve()
args.output.mkdir(parents=True, exist_ok=False)
run = pathlib.Path(tempfile.mkdtemp(prefix='writeback-recovery-', dir='runtime')).resolve()
with socket.socket() as listener:
    listener.bind(('127.0.0.1', 0))
    port = listener.getsockname()[1]
endpoint = f'http://127.0.0.1:{port}'
subprocess.run([args.bin / 'dfsctl', 'provision', '--directory', run / 'credentials'], check=True)
token = run / 'credentials/admin.token'
processes = []
mounts = []
records = {'run': str(run), 'endpoint': endpoint, 'fault': 'restore an older persisted database after publication without fsync', 'passed': False}


def wait_for(predicate, timeout=15):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            if predicate():
                return
        except (OSError, subprocess.CalledProcessError, json.JSONDecodeError):
            pass
        time.sleep(0.02)
    raise AssertionError('recovery observation deadline')


def ctl(command, payload=None):
    argv = [args.bin / 'dfsctl', '--endpoint', endpoint, '--token-file', token, command]
    if payload is not None:
        request_path = run / 'request.json'
        request_path.write_text(json.dumps(payload))
        argv += ['--json', request_path]
    return json.loads(subprocess.check_output(argv, stderr=subprocess.DEVNULL))


def start_server(label):
    with (args.output / f'{label}.log').open('w') as log:
        process = subprocess.Popen([args.bin / 'dfsd', '--db', run / 'db', '--credentials', run / 'credentials/credentials.json',
                                    '--listen', f'127.0.0.1:{port}', '--sync-ms', '600000'], stdout=log, stderr=subprocess.STDOUT,
                                   env={**os.environ, 'RUST_LOG': 'info'})
    processes.append(process)
    wait_for(lambda: process.poll() is None and bool(ctl('metrics')))
    return process


def start_mount(label, writeback):
    path = run / label
    path.mkdir()
    metrics = args.output.resolve() / f'{label}-metrics.json'
    command = [args.bin / 'dfs-mount', '--endpoint', endpoint, '--token-file', token, '--mountpoint', path,
               '--durable-sync', '--cache-bytes', '0', '--read-ahead-bytes', '0', '--metrics-file', metrics, '--reconcile-ms', '100']
    if writeback:
        command += ['--experimental-kernel-writeback']
    with (args.output / f'{label}.log').open('w') as log:
        process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, env={**os.environ, 'RUST_LOG': 'info'})
    processes.append(process)
    mounts.append(path)
    wait_for(lambda: process.poll() is None and metrics.exists() and (path / 'files').is_dir())
    return process, path, metrics


def stop(process, kill=False):
    if process.poll() is None:
        if kill:
            process.kill()
        else:
            process.send_signal(signal.SIGCONT)
            process.terminate()
        process.wait(timeout=20)


fd = None
try:
    server = start_server('server-baseline')
    mount, path, metrics = start_mount('writer', True)
    target = path / 'files/persisted'
    fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_RDWR, 0o600)
    os.write(fd, b'x' * 4096)
    os.fsync(fd)
    os.close(fd)
    fd = None
    directory = os.open(path / 'files', os.O_RDONLY | os.O_DIRECTORY)
    os.fsync(directory)
    os.close(directory)
    wait_for(lambda: json.loads(metrics.read_text())['fuse_operations']['writeback_inodes'] == 0)
    records['baseline_metrics'] = ctl('metrics')['Metrics']
    stop(server)
    shutil.copytree(run / 'db', run / 'persisted-baseline')
    server = start_server('server-before-loss')
    root = next(item['node']['id'] for item in ctl('view')['nodes'] if item['visible_name'] == 'files')
    ctl('mutate', {'Create': {'parent': root, 'name': 'before-rollback', 'kind': 'Directory', 'mode': 493}})
    wait_for(lambda: (path / 'files/before-rollback').is_dir())
    fd = os.open(target, os.O_RDWR)
    os.pwrite(fd, b'y' * 4096, 0)
    libc = ctypes.CDLL(None, use_errno=True)
    libc.sync_file_range.argtypes = [ctypes.c_int, ctypes.c_longlong, ctypes.c_longlong, ctypes.c_uint]
    libc.sync_file_range.restype = ctypes.c_int
    assert libc.sync_file_range(fd, 0, 4096, 7) == 0, ctypes.get_errno()
    published = ctl('metrics')['Metrics']
    assert published['pending_bytes'] > 0
    assert published['published'] > published['persisted']
    records['published_without_persistence'] = published
    stop(server, kill=True)
    shutil.move(run / 'db', run / 'discarded-unpersisted-suffix')
    shutil.copytree(run / 'persisted-baseline', run / 'db')
    server = start_server('server-after-loss')
    wait_for(lambda: mount.poll() is not None or not (path / 'files/before-rollback').exists())
    try:
        os.fsync(fd)
        raise AssertionError('old writeback handle synchronized across lost lineage')
    except OSError as error:
        assert error.errno in (errno.ESTALE, errno.EIO, errno.ENOTCONN), error
        records['old_handle_fsync_errno'] = error.errno
    try:
        os.close(fd)
        records['old_handle_close_errno'] = 0
    except OSError as error:
        assert error.errno in (errno.ESTALE, errno.EIO, errno.ENOTCONN), error
        records['old_handle_close_errno'] = error.errno
    fd = None
    observer, fresh, _ = start_mount('observer', False)
    assert (fresh / 'files/persisted').read_bytes() == b'x' * 4096
    records['recovered_prefix_verified'] = True
    stop(mount)
    replacement, recovered, _ = start_mount('replacement-writer', True)
    new_fd = os.open(recovered / 'files/persisted', os.O_RDWR)
    try:
        os.pwrite(new_fd, b'z' * 4096, 0)
        os.fsync(new_fd)
    finally:
        os.close(new_fd)
    wait_for(lambda: (fresh / 'files/persisted').read_bytes() == b'z' * 4096)
    records['fresh_mount_write_verified'] = True
    records['after'] = ctl('metrics')['Metrics']
    fd = os.open(recovered / 'files/persisted', os.O_RDWR)
    assert os.pread(fd, 4096, 0) == b'z' * 4096
    replacement.send_signal(signal.SIGSTOP)
    wait_for(lambda: any(line.startswith('State:') and line.split()[1] == 'T'
                         for line in pathlib.Path(f'/proc/{replacement.pid}/status').read_text().splitlines()))
    child_source = '''
import errno, os, sys
fd = int(sys.argv[1])
assert os.pwrite(fd, b'l' * 4096, 0) == 4096
print('dirty accepted', flush=True)
try:
    os.fsync(fd)
    raise AssertionError('synchronization succeeded after mount daemon failure')
except OSError as error:
    assert error.errno in (errno.EIO, errno.ENOTCONN, errno.ECONNABORTED), error
    print(error.errno, flush=True)
'''
    with subprocess.Popen(['python3', '-c', child_source, str(fd)], pass_fds=(fd,), stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, text=True) as child:
        ready, _, _ = select.select([child.stdout], [], [], 5)
        if not ready:
            stop(replacement, kill=True)
            child.kill()
            raise AssertionError('buffered dirtying did not complete while daemon was stopped')
        accepted = child.stdout.readline().strip()
        stop(replacement, kill=True)
        assert accepted == 'dirty accepted'
        stdout, stderr = child.communicate(timeout=10)
        assert child.returncode == 0, (stdout, stderr)
        records['daemon_failure_fsync_errno'] = int(stdout.strip())
    try:
        os.close(fd)
    except OSError as error:
        assert error.errno in (errno.EIO, errno.ENOTCONN, errno.ECONNABORTED), error
    fd = None
    node = next(item['node']['id'] for item in ctl('view')['nodes'] if item['visible_name'] == 'persisted')
    data = ctl('call', {'Read': {'node': node, 'version': None, 'offset': 0, 'size': 4096, 'handle': None}})
    assert bytes(data['Data']) == b'z' * 4096
    records['daemon_failure_unpublished_dirty_bytes_lost'] = True
    records['passed'] = True
finally:
    if fd is not None:
        try:
            os.close(fd)
        except OSError:
            pass
    for process in reversed(processes):
        stop(process)
    for path in mounts:
        subprocess.run(['fusermount3', '-uz', path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    (args.output / 'result.json').write_text(json.dumps(records, indent=2) + '\n')
print(json.dumps(records))
