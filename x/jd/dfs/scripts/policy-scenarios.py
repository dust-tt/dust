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
parser.add_argument('run', type=pathlib.Path)
parser.add_argument('--bin', type=pathlib.Path, required=True)
args = parser.parse_args()
run = args.run.resolve()
binary = args.bin.resolve() / 'dfsctl'
a = run / 'a' / 'files'
b = run / 'b'
credentials = json.loads((run / 'credentials' / 'credentials.json').read_text())
alice = next(c['principal'] for c in credentials if c['subject'] == 'alice')
records = []


def ctl(command, payload=None):
    argv = [str(binary), '--token-file', str(run / 'credentials' / 'admin.token'), command]
    if payload is not None:
        request = run / 'request.json'
        request.write_text(json.dumps(payload))
        argv += ['--json', str(request)]
    return json.loads(subprocess.check_output(argv))


def mutation(kind, **fields):
    return ctl('mutate', {kind: fields})


def observe(name, predicate):
    started = time.perf_counter_ns()
    deadline = time.monotonic() + 5
    while not predicate():
        if time.monotonic() >= deadline:
            raise AssertionError(name + ' visibility timeout')
        time.sleep(0.01)
    elapsed_ms = (time.perf_counter_ns() - started) / 1e6
    records.append({'scenario': name, 'latency_ms': elapsed_ms})


hidden = a / 'hidden'
hidden.mkdir()
(hidden / 'file').write_bytes(b'shared content')
(hidden / 'sibling').write_bytes(b'hidden sibling')
(a / 'file').write_bytes(b'duplicate name')
view = ctl('view')
nodes = {n['node']['id']: n for n in view['nodes']}
parent = next(n['node']['id'] for n in view['nodes'] if n['visible_name'] == 'hidden')
file = next(n['node']['id'] for n in view['nodes'] if n['visible_name'] == 'file' and n['visible_parent'] == parent)
second = next(n['node']['id'] for n in view['nodes'] if n['visible_name'] == 'file' and n['visible_parent'] != parent)
mutation('Grant', node=file, subject=alice, verbs=3)
mutation('Grant', node=second, subject=alice, verbs=1)
projected = b / 'shared' / ('file~' + file)
observe('direct_files_with_notifications_dropped', lambda: projected.exists() and len(list((b / 'shared').iterdir())) == 2)
assert not list((b / 'files').iterdir())
assert projected.read_bytes() == b'shared content'
projected.write_bytes(b'updated through share')
observe('shared_write_updates_original', lambda: (hidden / 'file').read_bytes() == b'updated through share')
try:
    projected.unlink()
    raise AssertionError('projected root unlink succeeded')
except PermissionError as error:
    assert error.errno == errno.EACCES
mutation('Grant', node=parent, subject='experiment-group', verbs=255)
mutation('Member', group='experiment-group', principal=alice, present=True)
directory = b / 'shared' / ('hidden~' + parent)
observe('grant_unchanged_populated_subtree', lambda: directory.is_dir() and (directory / 'sibling').exists())
assert not projected.exists()
(directory / 'created').write_bytes(b'allowed child create')
os.rename(directory / 'created', directory / 'renamed')
(directory / 'renamed').unlink()
unlinked_fd = os.open(directory / 'sibling', os.O_RDONLY)
assert os.pread(unlinked_fd, 4096, 0) == b'hidden sibling'
(hidden / 'sibling').unlink()
observe('shared_unlink', lambda: not (directory / 'sibling').exists())
try:
    os.rename(directory, b / 'shared' / 'new-name')
    raise AssertionError('projected root rename succeeded')
except PermissionError as error:
    assert error.errno == errno.EACCES
mutation('Member', group='experiment-group', principal=alice, present=False)
observe('group_revocation_keeps_overlapping_file_grant', lambda: not directory.exists() and projected.exists())
try:
    os.pread(unlinked_fd, 4096, 0)
    raise AssertionError('revoked unlinked cached descriptor still readable')
except OSError as error:
    assert error.errno in {errno.EACCES, errno.ESTALE, errno.EIO}, error
finally:
    os.close(unlinked_fd)
records.append({'scenario': 'revocation_invalidates_unlinked_cached_descriptor', 'passed': True})
held = os.open(projected, os.O_RDONLY)
assert os.pread(held, 4096, 0) == b'updated through share'
mapped = subprocess.Popen([
    'python3', '-c',
    'import mmap,sys; f=open(sys.argv[1],"rb"); m=mmap.mmap(f.fileno(),0,access=mmap.ACCESS_READ); assert m[:]==b"updated through share"; print("ready",flush=True); sys.stdin.readline(); print(m[:],flush=True)',
    str(projected),
], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
assert mapped.stdout.readline().strip() == 'ready'
mutation('Grant', node=file, subject=alice, verbs=0)
mutation('Grant', node=second, subject=alice, verbs=0)
observe('last_revocation_with_notifications_dropped', lambda: not list((b / 'shared').iterdir()))
try:
    os.pread(held, 4096, 0)
    raise AssertionError('revoked cached descriptor still readable')
except OSError as error:
    assert error.errno in {errno.EACCES, errno.ESTALE, errno.EIO}, error
finally:
    os.close(held)
mapped.communicate('\n', timeout=5)
assert mapped.returncode == -signal.SIGBUS, mapped.returncode
records.append({'scenario': 'revocation_invalidates_warm_descriptor_and_mapping', 'passed': True})
assert (hidden / 'file').read_bytes() == b'updated through share'
(run / 'policy.json').write_text(json.dumps({'passed': True, 'records': records}, indent=2) + '\n')
