#!/usr/bin/env python3
"""Validate acknowledged writes with each FDB host's processes stopped in turn."""
import json
from pathlib import Path
import subprocess
import time
import uuid

RUN = str(Path(__file__).with_name('run'))


def run(*args):
    return subprocess.check_output([RUN, *args], text=True, timeout=120)


def healthy():
    deadline_seconds = time.monotonic() + 180
    while time.monotonic() < deadline_seconds:
        cluster = json.loads(run('fdb', 'status json'))['cluster']
        if (cluster.get('database_available', False)
                and cluster.get('data', {}).get('state', {}).get('healthy', False)
                and cluster.get('fault_tolerance', {}).get(
                    'max_zone_failures_without_losing_availability', 0) >= 1):
            return
        time.sleep(5)
    raise RuntimeError('FDB did not recover healthy one-zone fault tolerance')


def verify(values):
    result = run('fdb', '; '.join(f'get {key}' for key in values))
    for key, value in values.items():
        if f'`{key}\' is `{value}\'' not in result:
            raise RuntimeError(f'acknowledged value missing: {key}')


def main():
    """@cc [owner:spolu,label:testing;backend] restore-one-host
    Stop at most one allowlisted host's FDB service at a time. Always attempt to restart it before
    proceeding or propagating errors. Verify normal committed values during failure and recovery;
    clear only this run's random keys after full success, preserving failed fixtures for diagnosis.
    """
    prefix = 'dfs-v2-failover-' + uuid.uuid4().hex
    values = {prefix + '-seed': uuid.uuid4().hex}
    healthy()
    run('fdb', 'writemode on; ' + '; '.join(f'set {k} {v}' for k, v in values.items()))
    verify(values)
    for node in ('a', 'b', 'f'):
        print(f'Stopping FDB service on {node}; fixture {prefix}', flush=True)
        try:
            run('ssh', node, 'sudo', 'systemctl', 'stop', 'dfs-fdb.service')
            verify(values)
            key, value = prefix + '-' + node, uuid.uuid4().hex
            run('fdb', f'writemode on; set {key} {value}')
            values[key] = value
            verify(values)
        finally:
            run('ssh', node, 'sudo', 'systemctl', 'start', 'dfs-fdb.service')
        healthy()
        verify(values)
        print(f'{node}: committed data retained; writes succeeded with host stopped; recovered', flush=True)
    run('fdb', 'writemode on; ' + '; '.join(f'clear {key}' for key in values))
    print('All three single-host failure cases passed; fixture removed.', flush=True)


if __name__ == '__main__':
    main()
