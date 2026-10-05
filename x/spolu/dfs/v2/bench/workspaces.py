#!/usr/bin/env python3
"""Measure shared discovery and independent workspaces on one FDB/ES backend."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
from common import fields, metadata, save, support


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path)
    args = parser.parse_args()
    work = args.work or Path(tempfile.mkdtemp(prefix='dfs-v2-workspaces-'))
    work.mkdir(parents=True, exist_ok=True)
    if (work / 'run.json').exists():
        raise RuntimeError('report directory already contains a run')
    prefix, key, key_path = support.identity(work, 'bench')
    os.environ['RUST_LOG'] = 'dfs_server_v2=debug'
    server, endpoint = support.start(work, 'workspaces', prefix, key_path)
    success = False
    second_server = None
    run = metadata() | {'prefix': prefix, 'files': 64}
    run.pop('manifest_sha256', None)
    save(work, run)
    try:
        second_server, second_endpoint = support.start(work, 'second', prefix, key_path)
        result = subprocess.run(['/target/release/examples/workspace_bench', '--endpoint', endpoint,
            '--second-endpoint', second_endpoint, '--key-file', str(key_path)],
            capture_output=True, text=True, check=True)
        run.update(json.loads(result.stdout))
        run['shutdown_seconds'] = support.stop(server)
        run['second_shutdown_seconds'] = support.stop(second_server)
        run['fdb_commits'] = fields(work / 'workspaces-server.log', 'FDB transaction committed')
        run['second_fdb_commits'] = fields(work / 'second-server.log', 'FDB transaction committed')
        support.cleanup(prefix)
        run['fixture_cleaned'] = True
        save(work, run)
        success = True
        print(json.dumps(run, indent=2), flush=True)
        print(f'Validated report: {work}', flush=True)
    finally:
        if second_server is not None and second_server.poll() is None:
            second_server.kill()
            second_server.wait(timeout=10)
        if server.poll() is None:
            server.kill()
            server.wait(timeout=10)
        key_path.unlink(missing_ok=True)
        if not success:
            print(f'Incomplete fixture retained: {work}', flush=True)


if __name__ == '__main__':
    main()
