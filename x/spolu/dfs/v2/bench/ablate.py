#!/usr/bin/env python3
"""Run on the host: repeat isolated FDB tuning comparisons with unchanged local workloads."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import random
import shlex
import subprocess
import time
import uuid

from common import KNOBS, ROOT

COMPOSE = ['docker', 'compose', '-f', str(ROOT / 'local/compose.yaml')]
SERVER_KNOBS = ('commit_min', 'commit_idle', 'server_busy')


def compose(*args, **kwargs):
    return subprocess.run([*COMPOSE, *args], check=True, text=True, **kwargs)


def server_arguments():
    rows = compose('exec', '-T', 'fdb', 'ps', '-eo', 'args', '-ww', capture_output=True).stdout
    servers = [shlex.split(row) for row in rows.splitlines() if row.startswith('/usr/bin/fdbserver ')]
    if len(servers) != 1:
        raise RuntimeError('expected exactly one local fdbserver')
    return servers[0]


def server_values(arguments):
    return {name: float(arguments[arguments.index('--knob-' + KNOBS[name][1]) + 1])
            for name in SERVER_KNOBS}


def restart(values, log):
    env = os.environ | {KNOBS[name][0]: str(value) for name, value in values.items()}
    compose('up', '-d', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '120',
            'fdb', env=env, stdout=log, stderr=subprocess.STDOUT)
    arguments = server_arguments()
    assert server_values(arguments) == {name: values[name] for name in SERVER_KNOBS}
    return arguments


def cpu_seconds(service):
    data = compose('exec', '-T', service, 'cat', '/sys/fs/cgroup/cpu.stat',
                   capture_output=True).stdout
    return int(dict(line.split() for line in data.splitlines())['usage_usec']) / 1e6


def write(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def main():
    """@cc [owner:spolu,label:testing;performance] isolated-tuning-ablation
    Change only the five documented FDB knobs between comparisons. Run cases sequentially with the
    same binary/client/workload and validate every result. Record every run and actual server
    arguments; restore the original server knobs on exit. CPU counters cover the whole fixture.
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path, required=True)
    parser.add_argument('--files', type=int, default=1000)
    parser.add_argument('--repeats', type=int, default=3)
    parser.add_argument('--workload', choices=['untar', 'workspaces'], default='untar')
    args = parser.parse_args()
    if not 1 <= args.files <= 10000 or args.repeats < 1:
        parser.error('files must be 1..10000 and repeats must be positive')
    args.work.mkdir(parents=True, exist_ok=False)
    defaults = {name: spec[2] for name, spec in KNOBS.items()}
    tuned = {name: spec[3] for name, spec in KNOBS.items()}
    profiles = {'defaults': defaults, 'tuned': tuned}
    for name in KNOBS:
        profiles['only_' + name] = defaults | {name: tuned[name]}
        profiles['without_' + name] = tuned | {name: defaults[name]}
    original = server_values(server_arguments())
    report = {'started_at': datetime.now(timezone.utc).isoformat(),
        'revision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'workload': args.workload, 'files': args.files if args.workload == 'untar' else 64,
        'repeats': args.repeats, 'seed': 42,
        'profiles_seconds': profiles, 'original_server_seconds': original,
        'cpu_scope': 'entire fixture including generation, setup, workload, validation, and cleanup',
        'server_restarted_each_run': True, 'backend_cold_scope': 'FDB process restarted; OS cache retained; ES retained',
        'runs': [], 'restored': False}
    write(args.work / 'summary.json', report)
    token = uuid.uuid4().hex[:12]
    rng = random.Random(42)
    expected_binary = None
    try:
        for repeat in range(args.repeats):
            order = list(profiles)
            rng.shuffle(order)
            if repeat == 0:
                order.remove('tuned')
                order.insert(0, 'tuned')
            for profile in order:
                name = f'{repeat + 1}-{profile}'
                work = f'/tmp/dfs-v2-ablate-{token}-{name}'
                values = profiles[profile]
                print(f'Starting {name}: {values}', flush=True)
                with (args.work / f'{name}.log').open('w') as log:
                    arguments = restart(values, log)
                    before = {service: cpu_seconds(service) for service in ('fdb', 'dev')}
                    started = time.monotonic()
                    compose('exec', '-T', 'dev', 'env', 'RUST_LOG=info',
                        *[f'{KNOBS[key][0]}={value}' for key, value in values.items()],
                        'python3', f'/dfs/v2/bench/{args.workload}.py',
                        *(['--files', str(args.files)] if args.workload == 'untar' else []),
                        '--work', work, stdout=log, stderr=subprocess.STDOUT)
                    wall_seconds = time.monotonic() - started
                    cpu = {service: cpu_seconds(service) - before[service] for service in before}
                run = json.loads(compose('exec', '-T', 'dev', 'cat', work + '/run.json',
                                         capture_output=True).stdout)
                assert run['fixture_cleaned'] and run['fdb_tuning_seconds'] == values
                if args.workload == 'untar':
                    assert run['validated_files'] == args.files and not run['profile_timings']
                    metric = 'untar_seconds'
                else:
                    assert run['writer_servers'] == 2 and run['writer_workspaces'] == 1
                    assert run['concurrent_writes'] == 100
                    metric = 'concurrent_wall_seconds'
                expected_binary = expected_binary or run['server_binary_sha256']
                assert run['server_binary_sha256'] == expected_binary
                result = {'profile': profile, 'repeat': repeat + 1, 'server_arguments': arguments,
                    'fixture_wall_seconds': wall_seconds, 'fixture_cpu_seconds': cpu,
                    'run': run}
                if args.workload == 'untar':
                    result['client_metrics'] = json.loads(compose('exec', '-T', 'dev', 'cat',
                        work + '/client-metrics.json', capture_output=True).stdout)
                write(args.work / f'{name}.json', result)
                report['runs'].append({'file': f'{name}.json', 'profile': profile,
                    'repeat': repeat + 1, metric: run[metric],
                    'fixture_wall_seconds': wall_seconds, 'fixture_cpu_seconds': cpu})
                write(args.work / 'summary.json', report)
                print(f'Completed {name}: {run[metric]:.3f}s; fixture CPU {cpu}', flush=True)
    finally:
        with (args.work / 'restore.log').open('w') as log:
            restart(original, log)
        report['restored'] = True
        report['finished_at'] = datetime.now(timezone.utc).isoformat()
        write(args.work / 'summary.json', report)
    assert len(report['runs']) == len(profiles) * args.repeats
    print(f'Validated {len(report["runs"])} runs; restored original FDB settings.', flush=True)


if __name__ == '__main__':
    main()
