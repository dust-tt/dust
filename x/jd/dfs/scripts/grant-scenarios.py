#!/usr/bin/env python3
import argparse
import concurrent.futures
import hashlib
import json
import os
import pathlib
import random
import select
import signal
import ssl
import subprocess
import sys
import time
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--server', required=True)
parser.add_argument('--nfs', required=True)
parser.add_argument('--output', type=pathlib.Path, required=True)
parser.add_argument('--repeats', type=int, default=5)
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
os.chdir(root)
run = root / 'runtime/grants'
args.output = args.output.resolve()
args.output.mkdir(parents=True, exist_ok=False)
fixture_name = 'grantcases-' + args.output.name
principals = json.loads((run / 'principals.json').read_text())
uids = {'alice': 5101, 'bob': 5102, 'carol': 5103}
payload = (b'grant propagation payload\n' * 700)[:16384]
digest = hashlib.sha256(payload).hexdigest()
prefix_digest = hashlib.sha256(payload[:4096]).hexdigest()
context = ssl.create_default_context(cafile=str(run / 'server.crt'))
control_token = (run / 'control.token').read_text().strip()
records = []
workers = {}
daemons = []
seed = random.Random(70183)
ack_ns = time.monotonic_ns()
admin_elapsed_ms = 0
passed = False


def remote(request, expected_ok=True):
    global ack_ns, admin_elapsed_ms
    started_ns = time.monotonic_ns()
    message = urllib.request.Request(f'https://{args.server}:7445/', json.dumps(request).encode(), {'Authorization': 'Bearer ' + control_token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(message, context=context, timeout=40) as response:
        answer = json.load(response)
    ack_ns = time.monotonic_ns()
    admin_elapsed_ms = (ack_ns - started_ns) / 1e6
    assert answer['ok'] == expected_ok, answer
    return answer.get('value') if expected_ok else answer


def dfs(command, value=None, user='admin'):
    request = {'kind': 'dfs', 'command': command, 'user': user}
    if value is not None:
        request['payload'] = value
    return remote(request)


def mutate(operation, **fields):
    return dfs('mutate', {operation: fields})


def grant(node, user, verbs):
    return mutate('Grant', node=node, subject=principals.get(user, user), verbs=verbs)


def member(user, present):
    return mutate('Member', group='grant-team', principal=principals[user], present=present)


def nfs(operation, path, **fields):
    return remote({'kind': 'nfs', 'op': operation, 'path': fixture_name + '/' + path, **fields})


def create(parent, name, directory=False):
    node = mutate('Create', parent=parent, name=name, kind='Directory' if directory else 'File', mode=0o777 if directory else 0o666)['node']
    if not directory:
        node = mutate('Write', node=node['id'], base=node['version'], offset=0, data=list(payload), append=False, handle=None)['node']
    return node


def mounted(path):
    return any(line.split()[4] == str(path) for line in pathlib.Path('/proc/self/mountinfo').read_text().splitlines())


class Worker:
    def __init__(self, cohort, user, base):
        self.cohort, self.user, self.base = cohort, user, base
        self.log = (args.output / f'{cohort}-{user}-worker.log').open('w')
        groups = '6100' if user != 'carol' else ''
        self.process = subprocess.Popen([sys.executable, str(root / 'scripts/grant-worker.py'), '--uid', str(uids[user]), '--gid', str(uids[user]), '--groups', groups], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.log, text=True, bufsize=1)
        identity = self.call({'op': 'identity'})
        assert identity['uid'] == uids[user] and identity['uid'] != 0
        records.append({'kind': 'identity', 'cohort': cohort, 'user': user, **identity})

    def path(self, relative):
        return str(self.base / relative)

    def call(self, request):
        self.process.stdin.write(json.dumps(request) + '\n')
        self.process.stdin.flush()
        ready, _, _ = select.select([self.process.stdout], [], [], 80)
        assert ready, (self.cohort, self.user, request, 'worker deadline')
        line = self.process.stdout.readline()
        assert line, (self.cohort, self.user, self.process.poll(), 'worker exited')
        return json.loads(line)

    def close(self):
        if self.process.poll() is None:
            self.process.stdin.close()
            self.process.wait(timeout=10)
        self.log.close()


def actors(backend, users):
    return [worker for (cohort, user), worker in workers.items() if user in users and (cohort == 'nfs' if backend == 'nfs' else cohort.startswith('dfs'))]


def observe(case, backend, path, expected, round_number=0, operation='read'):
    action_ack_ns = ack_ns
    action_elapsed_ms = admin_elapsed_ms
    selected = actors(backend, expected)
    def check(worker):
        result = worker.call({'op': 'watch', 'probe': operation, 'path': worker.path(path), 'allowed': expected[worker.user], 'sha256': digest, 'ack_ns': action_ack_ns})
        record = {'kind': 'propagation', 'case': case, 'cohort': worker.cohort, 'user': worker.user, 'round': round_number, 'operation': operation, 'expected_allowed': expected[worker.user], 'admin_request_ms': action_elapsed_ms, **result}
        return record
    if operation == 'write' and all(expected.values()):
        results = [check(worker) for worker in selected]
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(selected)) as pool:
            results = list(pool.map(check, selected))
    records.extend(results)
    for result in results:
        assert not result.get('timeout') and result['allowed'] == result['expected_allowed'], result
    print(json.dumps({'case': case, 'backend': backend, 'round': round_number, 'max_ms': max(r['after_ack_ms'] for r in results)}), flush=True)


def assert_access(backend, path, expected, operation='read'):
    for worker in actors(backend, expected):
        result = worker.call({'op': operation, 'path': worker.path(path)})
        records.append({'kind': 'access', 'cohort': worker.cohort, 'user': worker.user, 'path': path, 'operation': operation, 'expected_allowed': expected[worker.user], **result})
        assert result['allowed'] == expected[worker.user], records[-1]
        if result['allowed'] and operation == 'read':
            assert result['sha256'] == digest
        if not result['allowed']:
            assert result['errno'] in (1, 2, 13), result


def pause():
    time.sleep(seed.uniform(0.05, 0.95))


try:
    view = dfs('view')
    tenant_root = next(n['node']['id'] for n in view['nodes'] if n['visible_name'] == 'files' and n['visible_parent'] is None)
    for path in args.output.parent.glob('*/fixture.json'):
        previous = json.loads(path.read_text())
        grant(previous['leaf']['id'], 'carol', 0)
    folder = create(tenant_root, fixture_name, True)
    files = {name: create(folder['id'], name) for name in ('direct', 'group', 'held', 'unlinked', 'isolated')}
    subtree = create(folder['id'], 'subtree', True)
    leaf = create(subtree['id'], 'leaf')
    sibling = create(subtree['id'], 'sibling')
    for user in uids:
        grant(tenant_root, user, 12)
    for user in ('alice', 'bob'):
        member(user, True)
    nfs('mkdir', '', mode=0o755)
    for name in files:
        nfs('create', name, hex=payload.hex(), uid=5101 if name != 'group' else 0, gid=6100, mode=0)
    nfs('mkdir', 'subtree', mode=0o755)
    for name in ('leaf', 'sibling'):
        nfs('create', 'subtree/' + name, hex=payload.hex(), uid=5101, gid=6100, mode=0o444)
    (args.output / 'fixture.json').write_text(json.dumps({'name': fixture_name, 'root': tenant_root, 'folder': folder, 'files': files, 'subtree': subtree, 'leaf': leaf, 'sibling': sibling, 'principals': principals, 'uids': uids, 'sha256': digest}, indent=2) + '\n')
    for cohort in ('dfs-watch', 'dfs-poll'):
        for user in uids:
            mount = run / 'mounts' / cohort / user
            mount.mkdir(parents=True, exist_ok=True)
            assert not mounted(mount)
            metrics = args.output / f'{cohort}-{user}-metrics.json'
            command = [str(run / 'bin/dfs-mount'), '--endpoint', f'https://{args.server}:7443', '--ca', str(run / 'server.crt'), '--token-file', str(run / 'credentials' / (user + '.token')), '--mountpoint', str(mount), '--allow-other', '--uid', str(uids[user]), '--gid', str(uids[user]), '--prefetch-bytes', '0', '--cache-bytes', str(32 << 20), '--metrics-file', str(metrics)]
            if cohort == 'dfs-poll':
                command.append('--drop-events')
            with (args.output / f'{cohort}-{user}-mount.log').open('w') as log:
                daemon = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, env={**os.environ, 'RUST_LOG': 'info'})
            daemons.append((daemon, mount))
            deadline_seconds = time.monotonic() + 30
            while not (mounted(mount) and metrics.exists()):
                assert daemon.poll() is None and time.monotonic() < deadline_seconds
                time.sleep(0.02)
            initial = json.loads(metrics.read_text())
            assert initial['cache_bytes'] == 0 and initial['counters']['data_calls'] == 0
            records.append({'kind': 'startup', 'cohort': cohort, 'user': user, 'metrics': initial})
            workers[(cohort, user)] = Worker(cohort, user, mount / 'files' / fixture_name)
    mount = run / 'nfs'
    assert not mounted(mount)
    subprocess.run(['/usr/bin/mount', '-t', 'nfs', '-o', 'vers=3,proto=tcp', f'{args.nfs}:/bench', str(mount)], check=True)
    for user in uids:
        workers[('nfs', user)] = Worker('nfs', user, mount / fixture_name)
    (args.output / 'mountinfo.txt').write_text(pathlib.Path('/proc/self/mountinfo').read_text())
    for backend in ('dfs', 'nfs'):
        assert_access(backend, 'direct', {user: False for user in uids})
        for round_number in range(1, args.repeats + 1):
            pause()
            if backend == 'dfs':
                grant(files['direct']['id'], 'alice', 1)
            else:
                nfs('chmod', 'direct', mode=0o400)
            observe('direct_read_gain', backend, 'direct', {'alice': True}, round_number)
            assert_access(backend, 'direct', {'bob': False, 'carol': False})
            assert_access(backend, 'direct', {'alice': False}, 'write')
            pause()
            if backend == 'dfs':
                grant(files['direct']['id'], 'alice', 0)
            else:
                nfs('chmod', 'direct', mode=0)
            observe('direct_read_revoke', backend, 'direct', {'alice': False}, round_number)
        for round_number in range(1, args.repeats + 1):
            pause()
            if backend == 'dfs':
                grant(files['group']['id'], 'grant-team', 3)
            else:
                nfs('chmod', 'group', mode=0o060)
            observe('group_read_write_gain', backend, 'group', {'alice': True, 'bob': True}, round_number)
            observe('group_write_gain', backend, 'group', {'alice': True, 'bob': True}, round_number, 'write')
            assert_access(backend, 'group', {'carol': False})
            assert_access(backend, 'group', {'alice': True, 'bob': True}, 'write')
            pause()
            if backend == 'dfs':
                grant(files['group']['id'], 'grant-team', 1)
            else:
                nfs('chmod', 'group', mode=0o040)
            observe('group_write_revoke', backend, 'group', {'alice': False, 'bob': False}, round_number, 'write')
            assert_access(backend, 'group', {'alice': True, 'bob': True})
            pause()
            if backend == 'dfs':
                grant(files['group']['id'], 'grant-team', 0)
            else:
                nfs('chmod', 'group', mode=0)
            observe('group_read_revoke', backend, 'group', {'alice': False, 'bob': False}, round_number)
        if backend == 'dfs':
            grant(files['held']['id'], 'alice', 1)
        else:
            nfs('chmod', 'held', mode=0o400)
        observe('held_setup', backend, 'held', {'alice': True})
        for worker in actors(backend, ['alice']):
            assert worker.call({'op': 'hold', 'path': worker.path('held'), 'id': 'held'})['sha256'] == prefix_digest
            assert worker.call({'op': 'map', 'path': worker.path('held'), 'id': 'held'})['allowed']
        pause()
        if backend == 'dfs':
            grant(files['held']['id'], 'alice', 0)
        else:
            nfs('chmod', 'held', mode=0)
        observe('held_new_open_revoke', backend, 'held', {'alice': False})
        for delay_seconds in (0, 1, 3):
            time.sleep(delay_seconds)
            for worker in actors(backend, ['alice']):
                result = worker.call({'op': 'held_read', 'id': 'held'})
                records.append({'kind': 'retained_descriptor', 'cohort': worker.cohort, 'user': worker.user, 'after_ack_ms': (time.monotonic_ns() - ack_ns) / 1e6, 'additional_delay_seconds': delay_seconds, **result})
                if backend == 'dfs' and delay_seconds == 3:
                    assert not result['allowed'] and result['errno'] in (13, 116, 5), result
                elif result['allowed']:
                    assert result['sha256'] == prefix_digest
        for worker in actors(backend, ['alice']):
            result = worker.call({'op': 'mapped_read', 'id': 'held'})
            records.append({'kind': 'retained_mapping', 'cohort': worker.cohort, 'user': worker.user, **result})
            assert result['returncode'] in (0, -signal.SIGBUS), result
            if backend == 'dfs':
                assert result['returncode'] == -signal.SIGBUS, result
            worker.call({'op': 'close', 'id': 'held'})
    grant(files['group']['id'], 'grant-team', 3)
    grant(files['group']['id'], 'bob', 1)
    observe('overlap_setup', 'dfs', 'group', {'alice': True, 'bob': True})
    member('bob', False)
    time.sleep(1.1)
    assert_access('dfs', 'group', {'alice': True, 'bob': True})
    assert_access('dfs', 'group', {'alice': True, 'bob': False}, 'write')
    records.append({'kind': 'scenario', 'case': 'membership_revoke_preserves_direct_read_only_grant', 'passed': True})
    member('bob', True)
    observe('membership_restore_write', 'dfs', 'group', {'bob': True}, operation='write')
    assert_access('dfs', 'group', {'bob': True}, 'write')
    records.append({'kind': 'scenario', 'case': 'membership_restore_without_file_change', 'passed': True})
    grant(subtree['id'], 'alice', 3)
    observe('inherit_existing_subtree', 'dfs', 'subtree/leaf', {'alice': True})
    assert_access('dfs', 'subtree/sibling', {'alice': True, 'bob': False, 'carol': False})
    added = create(subtree['id'], 'added')
    observe('inherit_new_child', 'dfs', 'subtree/added', {'alice': True})
    grant(subtree['id'], 'alice', 0)
    observe('revoke_subtree', 'dfs', 'subtree/leaf', {'alice': False})
    assert_access('dfs', 'subtree/added', {'alice': False})
    grant(files['unlinked']['id'], 'grant-team', 1)
    observe('unlinked_setup', 'dfs', 'unlinked', {'alice': True, 'bob': True})
    for worker in actors('dfs', ['bob']):
        assert worker.call({'op': 'hold', 'path': worker.path('unlinked'), 'id': 'unlinked'})['sha256'] == prefix_digest
    mutate('Unlink', parent=folder['id'], name='unlinked', expected=files['unlinked']['entry_token'], directory=False)
    observe('unlink_path', 'dfs', 'unlinked', {'bob': False})
    member('bob', False)
    time.sleep(1.1)
    for worker in actors('dfs', ['bob']):
        result = worker.call({'op': 'held_read', 'id': 'unlinked'})
        assert not result['allowed'] and result['errno'] in (13, 116, 5), result
        records.append({'kind': 'unlinked_revocation', 'cohort': worker.cohort, 'user': worker.user, **result})
        worker.call({'op': 'close', 'id': 'unlinked'})
    denied_read = remote({'kind': 'dfs', 'command': 'call', 'user': 'carol', 'payload': {'Read': {'node': files['isolated']['id'], 'version': None, 'offset': 0, 'size': 4096, 'handle': None}}}, expected_ok=False)
    assert '13' in denied_read['error'], denied_read
    records.append({'kind': 'scenario', 'case': 'known_node_id_does_not_bypass_read_authority', 'passed': True, 'response': denied_read})
    grant(files['isolated']['id'], 'alice', 129)
    denied_grant = remote({'kind': 'dfs', 'command': 'mutate', 'user': 'alice', 'payload': {'Grant': {'node': files['isolated']['id'], 'subject': principals['carol'], 'verbs': 2}}}, expected_ok=False)
    assert '13' in denied_grant['error'], denied_grant
    dfs('mutate', {'Grant': {'node': files['isolated']['id'], 'subject': principals['carol'], 'verbs': 1}}, user='alice')
    observe('delegated_read_gain', 'dfs', 'isolated', {'carol': True})
    assert_access('dfs', 'isolated', {'carol': False}, 'write')
    records.append({'kind': 'scenario', 'case': 'delegation_cannot_amplify_authority', 'passed': True, 'response': denied_grant})
    grant(files['isolated']['id'], 'carol', 0)
    grant(tenant_root, 'carol', 0)
    grant(leaf['id'], 'carol', 1)
    time.sleep(1.2)
    for worker in actors('dfs', ['carol']):
        mount_root = worker.base.parent.parent
        shared = worker.call({'op': 'list', 'path': str(mount_root / 'shared')})
        assert shared['names'] == ['leaf~' + leaf['id']], shared
        assert worker.call({'op': 'read', 'path': str(mount_root / 'shared' / shared['names'][0])})['sha256'] == digest
        assert worker.call({'op': 'list', 'path': str(mount_root / 'files')})['names'] == []
    records.append({'kind': 'scenario', 'case': 'direct_share_hides_ancestry_and_siblings', 'passed': True})
    passed = True
finally:
    cgroup = pathlib.Path('/sys/fs/cgroup') / next(line.split(':', 2)[2].lstrip('/') for line in pathlib.Path('/proc/self/cgroup').read_text().splitlines() if line.startswith('0::'))
    memory = {name: (cgroup / name).read_text() for name in ['memory.max', 'memory.swap.max', 'memory.current', 'memory.peak', 'memory.stat', 'memory.events']}
    (args.output / 'memory.json').write_text(json.dumps(memory, indent=2) + '\n')
    for worker in workers.values():
        worker.close()
    if mounted(run / 'nfs'):
        subprocess.run(['/usr/bin/umount', str(run / 'nfs')], check=True)
    for daemon, mount in reversed(daemons):
        daemon.terminate()
        try:
            daemon.wait(timeout=20)
        except subprocess.TimeoutExpired:
            daemon.kill()
            daemon.wait()
            subprocess.run(['/usr/bin/fusermount3', '-uz', str(mount)], check=True)
    (args.output / 'results.json').write_text(json.dumps({'passed': passed, 'repeats': args.repeats, 'poll_interval_ms': 5, 'records': records}, indent=2) + '\n')
assert passed
