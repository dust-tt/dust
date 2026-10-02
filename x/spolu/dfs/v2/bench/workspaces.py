#!/usr/bin/env python3
"""Measure shared discovery and independent workspaces on one FDB/ES backend."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
from common import fields, metadata, save, support


def main():
    work = Path(tempfile.mkdtemp(prefix='dfs-v2-workspaces-'))
    prefix, key, key_path = support.identity(work, 'bench')
    os.environ['RUST_LOG'] = 'dfs_server_v2=debug'
    server, endpoint = support.start(work, 'workspaces', prefix, key_path)
    success = False
    run = metadata() | {'prefix': prefix, 'files': 64}
    run.pop('manifest_sha256', None)
    save(work, run)
    try:
        result = subprocess.run(['/target/release/examples/workspace_bench', '--endpoint', endpoint,
            '--key-file', str(key_path)], capture_output=True, text=True, check=True)
        run.update(json.loads(result.stdout))
        run['shutdown_seconds'] = support.stop(server)
        run['fdb_commits'] = fields(work / 'workspaces-server.log', 'FDB transaction committed')
        support.cleanup(prefix)
        run['fixture_cleaned'] = True
        save(work, run)
        success = True
        print(json.dumps(run, indent=2), flush=True)
        print(f'Validated report: {work}', flush=True)
    finally:
        if server.poll() is None:
            server.kill()
            server.wait(timeout=10)
        key_path.unlink(missing_ok=True)
        if not success:
            print(f'Incomplete fixture retained: {work}', flush=True)


if __name__ == '__main__':
    main()
