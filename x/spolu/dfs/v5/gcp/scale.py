#!/usr/bin/env python3
"""Populate persistent v5 tenants and measure real FDB-to-RAM bootstrap on the existing GCP VM."""
import argparse
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time

CONTAINER = 'dfs-v5-gcp-dev-1'
FILES = {'1m': 1_000_000, '10m': 10_000_000, '100m': 100_000_000}


class ExampleFailure(RuntimeError):
    def __init__(self, example, log, code):
        super().__init__(f'{example} exited {code}; see {log}')
        self.log = log


def run(*command, **kwargs):
    return subprocess.run(list(command), check=True, **kwargs)


def state(name):
    output = run('systemctl', 'show', name, '--property=ActiveState,SubState,LoadState',
                 capture_output=True, text=True).stdout
    return dict(line.split('=', 1) for line in output.splitlines() if '=' in line)


@contextlib.contextmanager
def quiet_services(work):
    """Restore exactly the interactive service states captured before this timed bootstrap."""
    units = run('systemctl', 'list-units', '--all', '--type=service', '--plain', '--no-legend',
                capture_output=True, text=True).stdout
    names = sorted({line.split()[0] for line in units.splitlines()
                    if line.split()[0].startswith('dfs') and 'play' in line.split()[0]})
    prior = {name: state(name) for name in names}
    active = [name for name, value in prior.items() if value['ActiveState'] == 'active']
    result = {'before': prior, 'restoration_errors': []}
    try:
        for name in sorted(active, key=lambda n: ('mount' not in n, n)):
            run('systemctl', 'stop', name)
        yield
    finally:
        for name in sorted(active, key=lambda n: ('mount' in n, n)):
            restored = subprocess.run(['systemctl', 'start', name], capture_output=True, text=True)
            if restored.returncode:
                result['restoration_errors'].append({'service': name, 'error': restored.stderr})
        result['after'] = {name: state(name) for name in names}
        result['states_restored'] = all(result['after'][name]['ActiveState'] == value['ActiveState']
                                       for name, value in prior.items())
        (work / 'service-states.json').write_text(json.dumps(result, indent=2) + '\n')
        if result['restoration_errors'] or not result['states_restored']:
            raise RuntimeError('interactive service restoration failed')


def status(path):
    with path.open('w') as output:
        run('docker', 'exec', CONTAINER, 'fdbcli', '--timeout', '20', '--exec', 'status json',
            stdout=output)
    report = json.loads(path.read_text())
    if not report['client']['database_status']['available']:
        raise RuntimeError('FDB is unavailable')
    return report['cluster']['configuration']


def invoke(example, arguments, output):
    if output.exists():
        output = output.with_name(f'{output.stem}-{time.time_ns()}{output.suffix}')
    with output.open('w') as log:
        try:
            run('docker', 'exec', '-w', '/dfs/v5', CONTAINER,
                '/target/release/examples/' + example, *arguments, stdout=log, stderr=subprocess.STDOUT)
        except subprocess.CalledProcessError as error:
            raise ExampleFailure(example, output, error.returncode) from error
    result = json.loads(output.read_text().splitlines()[-1])
    result['raw_log'] = str(output)
    return result


def populate(arguments, output, concurrency, failed_attempt):
    """@cc [owner:spolu,label:testing;operations] checkpointed-population-retries
    Retry MUST follow a terminal seed process and a typed FDB 1031/1037 failure in its retained log.
    Each retry MUST resume the same atomic fixture cursors, reduce concurrency, and back off within
    a finite attempt limit. Other failures MUST propagate. Observation timeouts MUST NOT trigger
    restarts, and a completed warmup MUST NOT be repeated as part of a population retry.
    """
    for attempt in range(8):
        try:
            return invoke('seed_tree', [*arguments, '--concurrency', str(concurrency)], output)
        except ExampleFailure as error:
            failure = error.log.read_text().splitlines()[-12:]
            last_error = next((line for line in reversed(failure) if line.startswith('Error:')), '')
            known = re.search(r'FdbError\s*\{\s*error_code:\s*(1031|1037)\s*\}',
                              last_error)
            if not known or attempt == 7:
                raise
            delay = min(30 * (attempt + 1), 60)
            next_concurrency = max(1, concurrency // 2)
            failed_attempt({'log': str(error.log), 'fdb_error': int(known.group(1)),
                            'concurrency': concurrency, 'next_concurrency': next_concurrency,
                            'backoff_seconds': delay})
            time.sleep(delay)
            concurrency = next_concurrency
    raise RuntimeError('population retry attempts exhausted')


def main():
    """@cc [owner:spolu,label:testing;operations] durable-scale-fixture
    This driver MUST verify the existing workload VM and preserve other prefixes and resources.
    Every warmup MUST follow completed population, run in a new process, verify its exact node count,
    and retain raw output and binary identity. Builds/tests/ingestion MUST NOT overlap warmup timing.
    Private tenant manifests MUST remain outside Git and MUST NOT appear in logs or reports.
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path, required=True)
    parser.add_argument('--prefix', required=True)
    parser.add_argument('--workers', type=int, default=16)
    parser.add_argument('--concurrency', type=int, default=4)
    parser.add_argument('--sizes', nargs='+', choices=FILES, default=['1m', '10m'])
    args = parser.parse_args()
    run('bash', '/opt/dfs/v2/gcp/verify-host.sh')
    root = Path('/var/log/dfs-bench/v5').resolve()
    work = args.work.resolve()
    if not work.is_relative_to(root) or not args.prefix.startswith('dfs-v5-scale-'):
        raise ValueError('isolated v5 report path and scale prefix required')
    if not 1 <= args.workers <= 64 or not 1 <= args.concurrency <= 64:
        raise ValueError('invalid worker count')
    if len(set(args.sizes)) != len(args.sizes):
        raise ValueError('duplicate fixture size')
    work.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(work, 0o700)
    config_before = status(work / 'fdb-before.json')
    identities = {name: hashlib.sha256(Path('/target/v5/release/examples', name).read_bytes()).hexdigest()
                  for name in ['seed_tree', 'tree_warmup']}
    report_path = work / 'run.json'
    if report_path.exists():
        report = json.loads(report_path.read_text())
        if report['prefix'] != args.prefix or report['binaries'] != identities:
            raise RuntimeError('resume identity changed; retain the old reports and use a new measurement directory')
    else:
        report = {'prefix': args.prefix, 'binaries': identities,
                  'cold_scope': 'empty process and permission RAM; FDB and OS caches retained', 'tenants': []}
    selected = {label: files for label, files in FILES.items() if label in args.sizes}
    report['targets'] = {'scale-' + label: files for label, files in selected.items()}
    report['complete'] = False
    report_path.write_text(json.dumps(report, indent=2) + '\n')
    for label, files in selected.items():
        tenant = 'scale-' + label
        existing = next((r for r in report['tenants'] if r['tenant'] == tenant), None)
        if existing and existing.get('complete'):
            continue
        case = work / label
        case.mkdir(exist_ok=True, mode=0o700)
        container_case = Path('/reports') / case.relative_to(root)
        def failed_attempt(value):
            report.setdefault('population_retries', []).append({'tenant': tenant, **value})
            report_path.write_text(json.dumps(report, indent=2) + '\n')
            print(json.dumps({'population_retry': {'tenant': tenant, **value}}), flush=True)

        seed = populate(['--fdb-prefix', args.prefix, '--tenant', tenant,
            '--files', str(files), '--workers', str(args.workers), '--batch', '256',
            '--manifest', str(container_case / 'tenant.json')], case / 'seed.log',
            min(args.concurrency, args.workers), failed_attempt)
        if seed['files'] != files or seed['nodes'] != files + seed['directories'] + 1:
            raise RuntimeError('population count mismatch')
        row = {'tenant': tenant, 'seed': seed, 'complete': False}
        if existing:
            report['tenants'].remove(existing)
        report['tenants'].append(row)
        report_path.write_text(json.dumps(report, indent=2) + '\n')
        with quiet_services(case):
            before = status(case / 'fdb-before-warmup.json')
            warmup = invoke('tree_warmup', ['--fdb-prefix', args.prefix, '--tenant', tenant,
                '--expected-nodes', str(seed['nodes']), '--peak-bytes', str(24 * 1024**3),
                '--page-nodes', '4096'], case / 'warmup.log')
            after = status(case / 'fdb-after-warmup.json')
            if before != after or after != config_before:
                raise RuntimeError('FDB configuration changed during measurement')
        row.update(warmup=warmup, complete=True)
        report_path.write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(row), flush=True)
    report['fdb_configuration_unchanged'] = status(work / 'fdb-after.json') == config_before
    completed = {row['tenant']: row['seed']['files'] for row in report['tenants']
                 if row['complete'] and row['tenant'] in report['targets']}
    report['complete'] = completed == report['targets']
    report_path.write_text(json.dumps(report, indent=2) + '\n')
    if not report['fdb_configuration_unchanged']:
        raise RuntimeError('FDB configuration changed')


if __name__ == '__main__':
    main()
