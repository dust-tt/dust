#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import pathlib
import select
import signal
import subprocess
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument('--bin', type=pathlib.Path, required=True)
parser.add_argument('--run', type=pathlib.Path, required=True)
parser.add_argument('--drop-events', action='store_true')
parser.add_argument('--mode', choices=['old', 'selective'], default='selective')
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
binary = args.bin.resolve()
run = args.run.resolve()
run.mkdir(parents=True, exist_ok=False)
mount = run / 'mount'
mount.mkdir()
metrics_path = run / 'metrics.json'
subprocess.run([str(binary / 'dfsctl'), 'provision', '--directory', str(run / 'credentials')], check=True, stdout=subprocess.DEVNULL)
credentials = json.loads((run / 'credentials/credentials.json').read_text())
alice = next(c['principal'] for c in credentials if c['subject'] == 'alice')
bob = next(c['principal'] for c in credentials if c['subject'] == 'bob')
processes = []
worker = None
records = []
payload = (b'grant cache correctness\n' * 800)[:16384]
digest = hashlib.sha256(payload).hexdigest()
passed = False


def start(name, command):
    with (run / (name + '.log')).open('w') as log:
        process = subprocess.Popen([str(v) for v in command], stdout=log, stderr=subprocess.STDOUT)
    processes.append(process)
    return process


def ctl(command, payload=None):
    command = [str(binary / 'dfsctl'), '--token-file', str(run / 'credentials/admin.token'), command]
    if payload is not None:
        request = run / 'request.json'
        request.write_text(json.dumps(payload))
        command += ['--json', str(request)]
    return json.loads(subprocess.check_output(command, stderr=subprocess.PIPE))


def mutate(operation, **fields):
    return ctl('mutate', {operation: fields})


def create(parent, name, directory=False):
    node = mutate('Create', parent=parent, name=name, kind='Directory' if directory else 'File', mode=0o755 if directory else 0o644)['node']
    if not directory:
        node = mutate('Write', node=node['id'], base=node['version'], offset=0, data=list(payload), append=False, handle=None)['node']
    return node


def snapshot(head=0):
    started_ms = time.time_ns() // 1000000
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        try:
            data = json.loads(metrics_path.read_text())
        except FileNotFoundError:
            data = None
        if data and data['time_ms'] >= started_ms and data['head'] >= head:
            return data
        time.sleep(0.01)
    raise TimeoutError('completed reconciliation metrics')


def call(operation, name=None, **fields):
    request = {'op': operation, **fields}
    if name is not None:
        request['path'] = str(mount / 'files' / name)
    worker.stdin.write(json.dumps(request) + '\n')
    worker.stdin.flush()
    ready, _, _ = select.select([worker.stdout], [], [], 30)
    assert ready, request
    line = worker.stdout.readline()
    assert line, worker.poll()
    return json.loads(line)


def read(name):
    result = call('read', name)
    assert result['allowed'] and result['sha256'] == digest, (name, result)


def retention(case, names):
    before = snapshot()
    for name in names:
        read(name)
    after = snapshot()
    data_calls = after['counters']['data_calls'] - before['counters']['data_calls']
    fuse_reads = after['fuse_operations']['read'] - before['fuse_operations']['read']
    records.append({'case': case, 'paths': names, 'data_calls': data_calls, 'fuse_reads': fuse_reads, 'before': before, 'after': after})
    if args.mode == 'selective':
        assert data_calls == 0 and fuse_reads == 0, records[-1]
    else:
        assert data_calls > 0 and fuse_reads > 0, records[-1]


try:
    server = start('server', [binary / 'dfsd', '--db', run / 'db', '--credentials', run / 'credentials/credentials.json'])
    deadline = time.monotonic() + 20
    while True:
        try:
            view = ctl('view')
            break
        except subprocess.CalledProcessError:
            assert server.poll() is None and time.monotonic() < deadline
            time.sleep(0.05)
    tenant_root = view['nodes'][0]['node']['id']
    a = create(tenant_root, 'a', True)
    b = create(tenant_root, 'b', True)
    files = {name: create(parent['id'], name) for parent, name in [(a, 'overlap'), (a, 'revoked'), (a, 'unlinked'), (b, 'one'), (b, 'two')]}
    mutate('Grant', node=tenant_root, subject=alice, verbs=12)
    mutate('Grant', node=a['id'], subject='test-team', verbs=13)
    mutate('Member', group='test-team', principal=alice, present=True)
    mutate('Grant', node=b['id'], subject=alice, verbs=13)
    mutate('Grant', node=files['overlap']['id'], subject=alice, verbs=1)
    command = [binary / 'dfs-mount', '--token-file', run / 'credentials/alice.token', '--mountpoint', mount, '--allow-other', '--uid', '5101', '--gid', '5101', '--prefetch-bytes', '0', '--read-ahead-bytes', '0', '--reconcile-ms', '100', '--metrics-file', metrics_path]
    if args.drop_events:
        command.append('--drop-events')
    daemon = start('mount', command)
    initial = snapshot()
    assert initial['cache_bytes'] == 0 and initial['counters']['data_calls'] == 0
    with (run / 'worker.log').open('w') as log:
        worker = subprocess.Popen([sys.executable, str(root / 'scripts/grant-worker.py'), '--uid', '5101', '--gid', '5101', '--groups', ''], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=log, text=True, bufsize=1)
    identity = call('identity')
    assert identity['uid'] == 5101 and identity['gid'] == 5101
    records.append({'case': 'ordinary_user', **identity})
    for name in ['a/overlap', 'a/revoked', 'a/unlinked', 'b/one', 'b/two']:
        read(name)
    mutation = mutate('Grant', node=files['one']['id'], subject=bob, verbs=1)
    snapshot(mutation['head'])
    retention('unrelated_user_grant_preserves_all_content', ['a/overlap', 'a/revoked', 'a/unlinked', 'b/one', 'b/two'])
    for name in ['revoked', 'unlinked']:
        assert call('hold', 'a/' + name, id=name)['allowed']
    assert call('map', 'a/revoked', id='revoked')['allowed']
    mutation = mutate('Unlink', parent=a['id'], name='unlinked', expected=files['unlinked']['entry_token'], directory=False)
    snapshot(mutation['head'])
    assert call('held_read', id='unlinked')['allowed']
    mutation = mutate('Member', group='test-team', principal=alice, present=False)
    snapshot(mutation['head'])
    retention('membership_loss_keeps_direct_overlap_and_other_folder', ['a/overlap', 'b/one', 'b/two'])
    result = call('read', 'a/revoked')
    assert not result['allowed'] and result['errno'] in [2, 13], result
    for name in ['revoked', 'unlinked']:
        result = call('held_read', id=name)
        assert not result['allowed'] and result['errno'] in [5, 13, 116], result
        records.append({'case': 'retained_' + name + '_denied_after_reconciliation', **result})
        call('close', id=name)
    result = call('mapped_read', id='revoked')
    assert result['returncode'] == -signal.SIGBUS, result
    records.append({'case': 'mapping_revoked_after_reconciliation', **result})
    mutation = mutate('Member', group='test-team', principal=alice, present=True)
    snapshot(mutation['head'])
    retention('membership_restore_keeps_unaffected_content', ['a/overlap', 'b/one', 'b/two'])
    read('a/revoked')
    passed = True
finally:
    if worker is not None:
        worker.stdin.close()
        worker.wait(timeout=10)
    for process in reversed(processes):
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=30)
    (run / 'results.json').write_text(json.dumps({'passed': passed, 'mode': args.mode, 'drop_events': args.drop_events, 'records': records}, indent=2) + '\n')
assert passed
