#!/usr/bin/env python3
import argparse
import json
import os
import pathlib
import ssl
import subprocess
import time
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--mode', choices=['old', 'selective'], default='selective')
parser.add_argument('--run', type=pathlib.Path, default=pathlib.Path('runtime/grants'))
parser.add_argument('--backend', choices=['dfs', 'nfs'], required=True)
parser.add_argument('--user', choices=['admin', 'alice', 'bob'], required=True)
parser.add_argument('--server', required=True)
parser.add_argument('--nfs', required=True)
parser.add_argument('--output', type=pathlib.Path, required=True)
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
os.chdir(root)
run = (root / args.run).resolve()
args.output = args.output.resolve()
args.output.mkdir(parents=True, exist_ok=False)
principals = json.loads((run / 'principals.json').read_text())
context = ssl.create_default_context(cafile=str(run / 'server.crt'))
control_token = (run / 'control.token').read_text().strip()
mount = run / 'scan-mount'
mount.mkdir(exist_ok=True)
cgroup = pathlib.Path('/sys/fs/cgroup') / next(line.split(':', 2)[2].lstrip('/') for line in pathlib.Path('/proc/self/cgroup').read_text().splitlines() if line.startswith('0::'))
assert int((cgroup / 'memory.max').read_text()) == 512 << 20
assert (cgroup / 'memory.swap.max').read_text().strip() == '0'
metrics = args.output / 'metrics.json'
daemon = None
records = []
passed = False
initial = None


def remote(value):
    request = urllib.request.Request(f'https://{args.server}:7445/', json.dumps(value).encode(), {'Authorization': 'Bearer ' + control_token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, context=context, timeout=40) as response:
        result = json.load(response)
    assert result['ok'], result
    return result.get('value')


def mutate(value):
    return remote({'kind': 'dfs', 'command': 'mutate', 'payload': value})


def memory():
    return {name: (cgroup / name).read_text() for name in ['memory.current', 'memory.peak', 'memory.events', 'memory.stat']}


def snapshot():
    if daemon is None:
        return {'memory': memory()}
    start = time.time_ns() // 1_000_000
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        try:
            data = json.loads(metrics.read_text())
        except FileNotFoundError:
            data = None
        if data and data['time_ms'] >= start:
            assert data['cache_bytes'] <= 32 << 20
            return {'memory': memory(), 'dfs': data}
        time.sleep(0.02)
    raise TimeoutError('metrics snapshot')


def drop_identity():
    uid = 5102 if args.user == 'bob' else 5101
    os.setgroups([6100])
    os.setgid(uid)
    os.setuid(uid)


def rg(*options):
    return subprocess.run(['/usr/bin/rg', '--no-config', '--no-ignore', '--color', 'never', *options, '.'], cwd=docs, capture_output=True, text=True, preexec_fn=drop_identity)


try:
    view = remote({'kind': 'dfs', 'command': 'view'})
    tenant_root = next(n['node']['id'] for n in view['nodes'] if n['visible_name'] == 'files' and n['visible_parent'] is None)
    corpus = next(n['node']['id'] for n in view['nodes'] if n['visible_name'] == 'corpus' and n['visible_parent'] == tenant_root)
    for user in ['alice', 'bob']:
        mutate({'Grant': {'node': tenant_root, 'subject': principals[user], 'verbs': 12}})
    mutate({'Grant': {'node': corpus, 'subject': principals['alice'], 'verbs': 13}})
    for index in range(32):
        group = f'scan-group-{index}'
        mutate({'Member': {'group': group, 'principal': principals['bob'], 'present': True}})
        mutate({'Grant': {'node': corpus, 'subject': group, 'verbs': 13}})
    isolated_name = 'scan-' + args.output.parent.name + '-' + args.output.name
    isolated = mutate({'Create': {'parent': tenant_root, 'name': isolated_name, 'kind': 'File', 'mode': 420}})['node']['id']
    if args.backend == 'dfs':
        command = [str(run / ('bin-old' if args.mode == 'old' else 'bin') / 'dfs-mount'), '--endpoint', f'https://{args.server}:7443', '--ca', str(run / 'server.crt'), '--token-file', str(run / 'credentials' / (args.user + '.token')), '--mountpoint', str(mount), '--allow-other', '--uid', '5102' if args.user == 'bob' else '5101', '--gid', '6100', '--prefetch-bytes', '0', '--cache-bytes', str(32 << 20), '--metrics-file', str(metrics)]
        with (args.output / 'mount.log').open('w') as log:
            daemon = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT)
        deadline = time.monotonic() + 30
        while not metrics.exists():
            assert daemon.poll() is None and time.monotonic() < deadline
            time.sleep(0.02)
        initial = snapshot()
        assert initial['dfs']['cache_bytes'] == 0 and initial['dfs']['counters']['data_calls'] == 0
        docs = mount / 'files/corpus/docs'
    else:
        subprocess.run(['mount', '-t', 'nfs', '-o', 'vers=3,proto=tcp', f'{args.nfs}:/bench', str(mount)], check=True)
        remote({'kind': 'nfs', 'op': 'create', 'path': isolated_name, 'hex': '67', 'uid': 5103, 'gid': 5103, 'mode': 0})
        initial = snapshot()
        docs = mount / 'corpus/docs'
    listing = rg('--files')
    assert listing.returncode == 0 and len(listing.stdout.splitlines()) == 10000
    for phase in ['first', 'warm', 'after_unrelated_grant', 'rewarm']:
        if phase == 'after_unrelated_grant':
            if args.backend == 'dfs':
                mutation = mutate({'Grant': {'node': isolated, 'subject': principals['carol'], 'verbs': 1}})
                deadline = time.monotonic() + 15
                while snapshot()['dfs']['head'] < mutation['head']:
                    assert time.monotonic() < deadline
            else:
                remote({'kind': 'nfs', 'op': 'chmod', 'path': isolated_name, 'mode': 0o400})
            time.sleep(2)
        before = snapshot()
        start = time.perf_counter_ns()
        result = rg('-l', '-F', 'BENCH_ABSENT_TOKEN')
        elapsed_ms = (time.perf_counter_ns() - start) / 1e6
        assert result.returncode == 1 and not result.stdout and not result.stderr, result
        record = {'phase': phase, 'time_ms': elapsed_ms, 'before': before, 'after': snapshot()}
        records.append(record)
        if args.backend == 'dfs':
            rpc_delta = record['after']['dfs']['counters']['data_calls'] - before['dfs']['counters']['data_calls']
            record['content_rpcs'] = rpc_delta
            record['fuse_reads'] = record['after']['dfs']['fuse_operations']['read'] - before['dfs']['fuse_operations']['read']
            record['expected_resident'] = phase != 'first' and (args.mode == 'selective' or phase != 'after_unrelated_grant')
            assert rpc_delta >= 0
        print(json.dumps({'phase': phase, 'time_ms': elapsed_ms}), flush=True)
    rare = rg('-l', '-F', 'BENCH_RARE_NEEDLE')
    assert rare.returncode == 0 and len(rare.stdout.splitlines()) == 4 and not rare.stderr
    passed = True
finally:
    final_memory = memory()
    if daemon is not None:
        daemon.terminate()
        daemon.wait(timeout=30)
    elif args.backend == 'nfs':
        subprocess.run(['umount', str(mount)], check=False)
    (args.output / 'results.json').write_text(json.dumps({'passed': passed, 'backend': args.backend, 'mode': args.mode, 'user': args.user, 'memory_limit_bytes': 512 << 20, 'daemon_cache_budget_bytes': 32 << 20 if args.backend == 'dfs' else None, 'initial': initial, 'final_memory': final_memory, 'records': records}, indent=2) + '\n')
