#!/usr/bin/env python3
"""Run a local demo server and mount, retaining its private fixture for the next start."""
import argparse
import json
from pathlib import Path
import signal
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tests'))
import support


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path, default=Path('/tmp/dfs-v3-demo'))
    args = parser.parse_args()
    work = args.work
    work.mkdir(parents=True, exist_ok=True)
    saved = work / 'fixture.json'
    if saved.exists():
        fixture = json.loads(saved.read_text())
        prefix = fixture['prefix']
        key_path = work / 'server.key'
        key = key_path.read_text()
    else:
        prefix, key, key_path = support.identity(work)
        fixture = None
    server, endpoint = support.start(work, 'demo', prefix, key_path)
    stopped = False
    def stop(_signal, _frame):
        nonlocal stopped
        stopped = True
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    mount = work / 'mount'
    try:
        if fixture is None:
            tenant = support.rpc(endpoint, key, 'create-tenant', {'tenant_id': 'demo', 'root_grants': ['owner']})
            fixture = {'prefix': prefix, 'tenant': tenant}
            support.secret_file(saved, json.dumps(fixture))
        owner = support.session(endpoint, fixture['tenant'], ['owner'])
        if mount.exists():
            mount.rmdir()
        with support.mounted(endpoint, owner['session_key'], mount):
            print(f'Server: {endpoint}\nMount: {mount}\nInterrupt to unmount and drain.', flush=True)
            while not stopped and server.poll() is None:
                time.sleep(.1)
    finally:
        if server.poll() is None:
            support.stop(server)


if __name__ == '__main__':
    main()
