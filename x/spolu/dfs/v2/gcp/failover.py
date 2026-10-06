#!/usr/bin/env python3
"""Validate acknowledged writes with one FDB host or one zone's services stopped in turn."""
import argparse
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


def restore(nodes):
    """@cc [owner:spolu,label:operations;error-handling] attempt-every-restart
    Every host whose stop was attempted MUST receive a restart attempt, even when another restart
    fails. Restoration failures MUST propagate after all attempts, including interrupted commands.
    """
    errors = []
    for node in reversed(nodes):
        try:
            run('ssh', node, 'sudo', 'systemctl', 'start', 'dfs-fdb.service')
        except BaseException as error:
            errors.append(error)
    if errors:
        raise BaseExceptionGroup('FDB service restoration failed', errors)


def main():
    """@cc [owner:spolu,label:testing;backend] restore-one-failure-domain
    Stop services only within one allowlisted failure group at a time; a multi-host group MUST belong
    to one zone. Always attempt to restart every affected host before proceeding or propagating
    errors. Verify normal committed values during failure and recovery; clear only this run's random
    keys after full success, preserving failed fixtures for diagnosis.
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--transaction-node', action='store_true',
                        help='Also test the preferred transaction host and complete zone-a loss.')
    args = parser.parse_args()
    groups = [('a', ('a',)), ('b', ('b',)), ('f', ('f',))]
    if args.transaction_node:
        groups.extend([('tx', ('tx',)), ('zone-a', ('a', 'tx'))])
    prefix = 'dfs-v2-failover-' + uuid.uuid4().hex
    values = {prefix + '-seed': uuid.uuid4().hex}
    healthy()
    run('fdb', 'writemode on; ' + '; '.join(f'set {k} {v}' for k, v in values.items()))
    verify(values)
    for name, nodes in groups:
        print(f'Stopping FDB services on {", ".join(nodes)}; fixture {prefix}', flush=True)
        attempted = []
        try:
            for node in nodes:
                attempted.append(node)
                run('ssh', node, 'sudo', 'systemctl', 'stop', 'dfs-fdb.service')
            verify(values)
            key, value = prefix + '-' + name, uuid.uuid4().hex
            run('fdb', f'writemode on; set {key} {value}')
            values[key] = value
            verify(values)
        finally:
            restore(attempted)
        healthy()
        verify(values)
        print(f'{name}: committed data retained; writes succeeded during failure; recovered', flush=True)
    run('fdb', 'writemode on; ' + '; '.join(f'clear {key}' for key in values))
    print(f'All {len(groups)} failure cases passed; fixture removed.', flush=True)


if __name__ == '__main__':
    main()
