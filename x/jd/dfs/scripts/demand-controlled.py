#!/usr/bin/env python3
import argparse
import json
import os
import pathlib
import random
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--endpoint', required=True)
parser.add_argument('--ca', type=pathlib.Path, required=True)
parser.add_argument('--token-file', type=pathlib.Path, required=True)
parser.add_argument('--nfs', required=True)
parser.add_argument('--candidate', type=pathlib.Path, required=True)
parser.add_argument('--baseline', type=pathlib.Path, required=True)
parser.add_argument('--output', type=pathlib.Path, required=True)
parser.add_argument('--corpus', default='corpus')
parser.add_argument('--native-root', type=pathlib.Path)
parser.add_argument('--rounds', type=int, default=3)
parser.add_argument('--backends', nargs='+', default=['before', 'demand', 'adjacent', 'nfs', 'ext4'])
parser.add_argument('--workloads', nargs='+', default=['full', 'scan', 'branch', 'deep', 'tails', 'one-file', 'one-head', 'heads', 'sha'])
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
os.chdir(root)
run = root / 'runtime/controlled'
bench = run / 'bench'
mount = run / 'demand-mount'
for path in (bench, mount, args.output):
    path.mkdir(parents=True, exist_ok=True)
local = run / args.corpus
assert (local / 'manifest.json').is_file()
if 'ext4' in args.backends and {'one-head', 'heads'} & set(args.workloads):
    assert args.native_root is not None, 'prefix oracle must reside on a separate copy from native target'
def ismount(path):
    target = str(path.absolute())
    return any(line.split()[4] == target for line in pathlib.Path('/proc/self/mountinfo').read_text().splitlines())

assert not ismount(bench) and not ismount(mount)
order = [(r, w, b) for r in range(1, args.rounds + 1) for w in args.workloads for b in args.backends]
random.Random(7031).shuffle(order)
(args.output / 'order.json').write_text(json.dumps(order, indent=2))

def execute(command, **kwargs):
    return subprocess.run(command, check=True, **kwargs)

def net():
    return pathlib.Path('/proc/net/dev').read_text()

for round_number, workload, backend in order:
    prefix = args.output / f'{round_number}-{workload}-{backend}'
    assert not prefix.with_suffix('.json').exists(), f'already measured: {prefix}'
    daemon = None
    daemon_log = None
    summary = {'backend': backend, 'workload': workload, 'round': round_number, 'cache_budget_bytes': 33554432 if backend in ['before', 'demand', 'adjacent'] else None, 'cache_state': 'fresh client mount and dropped client page/dentry caches; server cache uncontrolled'}
    reference_stat = local.stat()
    execute(['sync'])
    execute(['sudo', 'sh', '-c', 'echo 3 > /proc/sys/vm/drop_caches'])
    summary['network_before'] = net()
    started = time.perf_counter()
    try:
        if backend in ['before', 'demand', 'adjacent']:
            metrics = prefix.with_suffix('.metrics.json')
            metrics.unlink(missing_ok=True)
            binary = args.baseline if backend == 'before' else args.candidate
            command = [str(binary.resolve()), '--endpoint', args.endpoint, '--ca', str(args.ca), '--token-file', str(args.token_file), '--mountpoint', str(mount), '--allow-other', '--cache-bytes', '33554432', '--prefetch-bytes', '0', '--metrics-file', str(metrics)]
            if backend != 'before':
                command += ['--read-ahead-bytes', '262144' if backend == 'adjacent' else '0']
            daemon_log = prefix.with_suffix('.mount.log').open('w')
            daemon = subprocess.Popen(command, stdout=daemon_log, stderr=subprocess.STDOUT, env={**os.environ, 'RUST_LOG': 'info'})
            deadline = time.monotonic() + 30
            while not (ismount(mount) and metrics.exists()):
                assert daemon.poll() is None, 'mount exited'
                assert time.monotonic() < deadline, 'mount deadline'
                time.sleep(0.01)
            summary['before'] = json.loads(metrics.read_text())
            assert summary['before']['cache_bytes'] == 0
            assert summary['before']['counters']['data_calls'] == 0
            execute(['sudo', 'mount', '--bind', str(mount / 'files' / args.corpus), str(bench)])
        elif backend == 'nfs':
            execute(['sudo', 'mount', '-t', 'nfs', '-o', 'vers=3,proto=tcp', f'{args.nfs}:/bench/{args.corpus}', str(bench)])
        elif backend == 'ext4':
            execute(['sudo', 'mount', '--bind', str(args.native_root / args.corpus if args.native_root else local), str(bench)])
        else:
            raise ValueError(backend)
        assert not os.path.samefile(local, bench), 'reference copy aliases mounted target'
        mounted_reference_stat = local.stat()
        assert (reference_stat.st_dev, reference_stat.st_ino) == (mounted_reference_stat.st_dev, mounted_reference_stat.st_ino), 'mount propagated over reference copy'
        summary['reference_identity'] = [reference_stat.st_dev, reference_stat.st_ino]
        summary['mount_ready_ms'] = (time.perf_counter() - started) * 1000
        if backend == 'nfs':
            summary['mountstats_before'] = pathlib.Path('/proc/self/mountstats').read_text()
        with prefix.with_suffix('.mount.txt').open('w') as output:
            execute(['findmnt', str(bench)], stdout=output)
        command = ['python3', 'vendor/benchmark.py', str(bench), '--warm-runs', '3'] if workload == 'full' else ['python3', 'scripts/demand-probe.py', str(bench), '--manifest', str(local / 'manifest.json'), '--workload', workload, '--output', str(prefix.with_suffix('.probe.json'))]
        with prefix.with_suffix('.txt').open('w') as output, prefix.with_suffix('.resources.txt').open('w') as resources:
            execute(['/usr/bin/time', '-v', *command], stdout=output, stderr=resources)
        summary['mount_and_workload_ms'] = (time.perf_counter() - started) * 1000
        if daemon:
            time.sleep(1.2)
            summary['after'] = json.loads(metrics.read_text())
            summary['daemon_status'] = pathlib.Path(f'/proc/{daemon.pid}/status').read_text()
            assert summary['after']['cache_bytes'] <= 33554432
        summary['network_after'] = net()
        if backend == 'nfs':
            summary['mountstats_after'] = pathlib.Path('/proc/self/mountstats').read_text()
        prefix.with_suffix('.json').write_text(json.dumps(summary, indent=2) + '\n')
        print(f'OK {round_number} {workload} {backend}', flush=True)
    finally:
        if ismount(bench):
            execute(['sudo', 'umount', str(bench)])
        if daemon:
            daemon.terminate()
            daemon.wait(timeout=30)
        if daemon_log:
            daemon_log.close()
        assert not ismount(bench) and not ismount(mount), 'mount leaked after cleanup'
(args.output / 'completed.txt').write_text('success\n')
