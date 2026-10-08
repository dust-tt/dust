#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys
import threading
import time
from sampled_result import write_sampled_result

parser = argparse.ArgumentParser()
parser.add_argument('--backend', choices=['direct', 'kernel', 'nfs', 'ext4'], required=True)
parser.add_argument('--workload', choices=['full', 'scan', 'search', 'sha', 'heads', 'pressure'], required=True)
parser.add_argument('--corpus', default='corpus')
parser.add_argument('--round', type=int, default=1)
parser.add_argument('--memory-bytes', type=int, required=True)
parser.add_argument('--cache-bytes', type=int, default=33554432)
parser.add_argument('--read-ahead-bytes', type=int, default=262144)
parser.add_argument('--daemon-prefetch', action='store_true')
parser.add_argument('--experimental-kernel-writeback', action='store_true')
parser.add_argument('--durable-sync', action='store_true')
parser.add_argument('--pressure-bytes', type=int, default=512 << 20)
parser.add_argument('--cold-client', action='store_true')
parser.add_argument('--endpoint', default='http://127.0.0.1:7443')
parser.add_argument('--ca', type=pathlib.Path)
parser.add_argument('--token-file', type=pathlib.Path, required=True)
parser.add_argument('--nfs')
parser.add_argument('--bin', type=pathlib.Path, default=pathlib.Path('target/release'))
parser.add_argument('--reference', type=pathlib.Path, required=True)
parser.add_argument('--native', type=pathlib.Path)
parser.add_argument('--output', type=pathlib.Path, required=True)
parser.add_argument('--run-directory', type=pathlib.Path)
parser.add_argument('--phase-metrics', action='store_true')
parser.add_argument('--phase-barrier', type=pathlib.Path)
parser.add_argument('--client-index', type=int, default=0)
parser.add_argument('--clients', type=int, default=1)
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
os.chdir(root)
sys.path.insert(0, str(root / 'vendor'))
import benchmark

args.output.mkdir(parents=True, exist_ok=False)
run = args.run_directory.resolve() if args.run_directory else root / 'runtime/kernel-cache-client'
mount = run / 'mount'
bench = run / 'bench'
for path in (mount, bench):
    path.mkdir(parents=True, exist_ok=True)
cgroup_name = next(line.split(':', 2)[2] for line in pathlib.Path('/proc/self/cgroup').read_text().splitlines() if line.startswith('0::'))
cgroup = pathlib.Path('/sys/fs/cgroup') / cgroup_name.lstrip('/')
assert int((cgroup / 'memory.max').read_text()) == args.memory_bytes
assert (cgroup / 'memory.swap.max').read_text().strip() == '0'
daemon = None
metrics = args.output / 'metrics.json'
stopped = threading.Event()
samples_path = args.output / 'memory-samples.jsonl'
sampling_errors = []
summary = {**vars(args), 'cgroup': cgroup_name, 'startup_content_preload_bytes': 0,
           'daemon_cache_budget_bytes': args.cache_bytes if args.backend in ['direct', 'kernel'] else None,
           'daemon_prefetch': args.daemon_prefetch,
           'client_cache_state': 'new mount; client caches dropped by driver before scope; server cache uncontrolled' if args.cold_client else 'new mount; host caches not dropped; diagnostic only'}
summary = json.loads(json.dumps(summary, default=str))


def execute(command, **kwargs):
    if command[0] == 'sudo' and os.geteuid() == 0:
        command = command[1:]
    return subprocess.run([str(item) for item in command], check=True, **kwargs)


def mounted(path):
    return any(line.split()[4] == str(path) for line in pathlib.Path('/proc/self/mountinfo').read_text().splitlines())


def memory():
    sample = {'time_ns': time.time_ns(), 'current_bytes': int((cgroup / 'memory.current').read_text())}
    for name in ('memory.stat', 'memory.events'):
        sample[name] = {key: int(value) for key, value in (line.split() for line in (cgroup / name).read_text().splitlines())}
    if (cgroup / 'memory.peak').exists():
        sample['peak_bytes'] = int((cgroup / 'memory.peak').read_text())
    if daemon is not None and daemon.poll() is None:
        status = pathlib.Path(f'/proc/{daemon.pid}/status').read_text()
        sample['daemon_rss_bytes'] = int(next(line.split()[1] for line in status.splitlines() if line.startswith('VmRSS:'))) * 1024
    return sample


def sample_memory():
    try:
        with samples_path.open('w') as output:
            while not stopped.wait(0.05):
                output.write(json.dumps(memory()) + '\n')
                output.flush()
    except Exception as error:
        sampling_errors.append(repr(error))


def snapshot():
    if daemon is not None:
        started_ms = time.time_ns() // 1_000_000
        deadline = time.monotonic() + 10
        while True:
            assert daemon.poll() is None, 'mount exited'
            try:
                data = json.loads(metrics.read_text())
            except FileNotFoundError:
                data = None
            if data is not None:
                if data['time_ms'] >= started_ms:
                    assert data['cache_bytes'] <= args.cache_bytes
                    return {'dfs': data, 'memory': memory()}
            assert time.monotonic() < deadline, 'metrics deadline'
            time.sleep(0.02)
    data = {'memory': memory()}
    if args.backend == 'nfs':
        data['mountstats'] = pathlib.Path('/proc/self/mountstats').read_text()
    return data


assert not mounted(mount) and not mounted(bench)
thread = threading.Thread(target=sample_memory)
thread.start()
try:
    started = time.perf_counter()
    if args.backend in ['direct', 'kernel']:
        command = [args.bin / 'dfs-mount', '--endpoint', args.endpoint,
                   '--token-file', args.token_file, '--mountpoint', mount, '--allow-other',
                   '--cache-bytes', str(args.cache_bytes), '--read-ahead-bytes', str(args.read_ahead_bytes),
                   '--prefetch-bytes', '0', '--metrics-file', metrics]
        if args.daemon_prefetch:
            command += ['--daemon-prefetch']
        if args.experimental_kernel_writeback:
            command += ['--experimental-kernel-writeback']
        if args.durable_sync:
            command += ['--durable-sync']
        if args.phase_metrics:
            command += ['--reconcile-ms', '100']
        if args.ca:
            command += ['--ca', args.ca]
        if args.backend == 'direct':
            command += ['--direct-io']
        with (args.output / 'mount.log').open('w') as log:
            daemon = subprocess.Popen([str(item) for item in command], stdout=log, stderr=subprocess.STDOUT,
                                      env={**os.environ, 'RUST_LOG': 'info'})
        deadline = time.monotonic() + 30
        while not (mounted(mount) and metrics.exists()):
            assert daemon.poll() is None and time.monotonic() < deadline, 'mount readiness failed'
            time.sleep(0.01)
        initial = json.loads(metrics.read_text())
        assert initial['cache_bytes'] == 0 and initial['counters']['data_calls'] == 0
        summary['startup'] = initial
        execute(['sudo', 'mount', '--bind', mount / 'files' / args.corpus, bench])
    elif args.backend == 'nfs':
        execute(['sudo', 'mount', '-t', 'nfs', '-o', 'vers=3,proto=tcp', f'{args.nfs}:/bench/{args.corpus}', bench])
    else:
        assert args.native
        execute(['sudo', 'mount', '--bind', args.native / args.corpus, bench])
    summary['mount_ready_ms'] = (time.perf_counter() - started) * 1000
    assert not os.path.samefile(args.reference, bench), 'oracle aliases measured tree'
    summary['mountinfo'] = pathlib.Path('/proc/self/mountinfo').read_text()
    summary['manifest_sha256'] = hashlib.sha256((args.reference / 'manifest.json').read_bytes()).hexdigest()
    summary['before'] = snapshot()
    if args.workload == 'pressure':
        from writeback_pressure import run_pressure
        summary['pressure'] = run_pressure(args, bench, snapshot, mounted, execute)
    elif args.workload == 'full':
        observations = []
        if args.phase_metrics or args.phase_barrier is not None:
            from contextlib import redirect_stdout

            def server_metrics():
                command = [args.bin / 'dfsctl', '--endpoint', args.endpoint, '--token-file', args.token_file]
                if args.ca:
                    command += ['--ca', args.ca]
                return json.loads(execute(command + ['metrics'], capture_output=True).stdout)['Metrics']

            class ObservedBenchmark(benchmark.Benchmark):
                def barrier(self, stage):
                    if args.phase_barrier is None or args.clients == 1:
                        return
                    args.phase_barrier.mkdir(parents=True, exist_ok=True)
                    name = f'{len(observations):02d}-{stage}'
                    (args.phase_barrier / f'{name}-{args.client_index}').touch()
                    deadline = time.monotonic() + 120
                    while not all((args.phase_barrier / f'{name}-{index}').exists() for index in range(args.clients)):
                        assert time.monotonic() < deadline, f'client phase barrier: {name}'
                        time.sleep(0.005)

                def measure(self, feature, workload, phase, action, validate, runs=1):
                    self.barrier('start')
                    before = snapshot() if args.phase_metrics else None
                    if before is not None:
                        before['server'] = server_metrics()
                    timings = []

                    def observed_action():
                        started = time.perf_counter()
                        result = action()
                        timings.append((time.perf_counter() - started) * 1000)
                        return result

                    result = super().measure(feature, workload, phase, observed_action, validate, runs)
                    self.barrier('finish')
                    after = snapshot() if args.phase_metrics else None
                    observation = {'samples_ms': timings}
                    if after is not None:
                        after['server'] = server_metrics()
                        observation.update(before=before, after=after)
                    observations.append(observation)
                    return result

            measured = ObservedBenchmark(args.reference, 3, shutil.which('rg'))
            measured.docs = bench / 'docs'
            with (args.output / 'table.txt').open('w') as output, redirect_stdout(output):
                benchmark.render_table(('Tool', 'Version', 'Executable'), benchmark.tool_versions(shutil.which('rg')))
                measured.run(False)
                benchmark.render(measured.rows)
        else:
            with (args.output / 'table.txt').open('w') as output:
                execute(['python3', 'vendor/benchmark.py', bench, '--warm-runs', '3'], stdout=output)
        rows = []
        for line in (args.output / 'table.txt').read_text().splitlines():
            cells = [cell.strip() for cell in line.split('|')[1:-1]]
            if len(cells) == 5 and cells[2] in ('first', 'warm', 'once'):
                assert cells[4] == 'OK'
                rows.append(dict(feature=cells[0], workload=cells[1], phase=cells[2], time_ms=float(cells[3].replace(',', '')), result=cells[4]))
        assert len(rows) == 24
        if observations:
            assert len(observations) == len(rows)
            for row, observation in zip(rows, observations, strict=True):
                row.update(observation)
        summary['rows'] = rows
    else:
        b = benchmark.Benchmark(args.reference, 3, shutil.which('rg'))
        b.docs = bench / 'docs'
        summary['document_bytes'] = sum(b.expected_sizes.values())
        if args.workload == 'scan':
            action = lambda: b.rg('-l', '-F', 'BENCH_ABSENT_TOKEN')
            validate = lambda result: b.check_rg(result, set(), code=1)
        elif args.workload == 'search':
            action = lambda: b.rg('-l', '-F', 'BENCH_RARE_NEEDLE')
            expected = {f'./{b.paths[index]}' for index in benchmark.RARE_DOCUMENTS}
            validate = lambda result: b.check_rg(result, expected)
        elif args.workload == 'sha':
            action = b.read_all
            validate = lambda result: b.verify_contents(result, summary['document_bytes'])
        else:
            selected = [b.paths[index] for index in sorted(benchmark.SAMPLE_INDICES)]
            expected = {}
            for path in selected:
                with (args.reference / 'docs' / path).open('rb') as file:
                    expected[path] = file.read(4096)

            def action():
                found = {}
                for path in selected:
                    with (b.docs / path).open('rb') as file:
                        found[path] = file.read(4096)
                return found

            validate = lambda result: benchmark.check(result == expected, 'prefix mismatch')
        rows = []
        for phase in ('first', 'repeat-1', 'repeat-2'):
            before = snapshot()
            started = time.perf_counter()
            result = action()
            elapsed_ms = (time.perf_counter() - started) * 1000
            validate(result)
            rows.append(dict(phase=phase, time_ms=elapsed_ms, result='OK', before=before, after=snapshot()))
        summary['rows'] = rows
    summary['after'] = snapshot()
    assert summary['after']['memory']['memory.events']['oom_kill'] == summary['before']['memory']['memory.events']['oom_kill']
    summary['passed'] = True
finally:
    stopped.set()
    thread.join()
    summary['sampling_errors'] = sampling_errors
    if sampling_errors:
        summary['passed'] = False
    write_sampled_result(args.output / 'result.json', summary, samples_path)
    if mounted(bench):
        execute(['sudo', 'umount', bench])
    if daemon is not None:
        daemon.terminate()
        try:
            daemon.wait(timeout=20)
        except subprocess.TimeoutExpired:
            daemon.kill()
            daemon.wait()
            execute(['fusermount3', '-uz', mount])
    assert not mounted(mount) and not mounted(bench)
assert not sampling_errors
print(json.dumps({key: summary[key] for key in ('backend', 'workload', 'round', 'passed', 'mount_ready_ms')}))
