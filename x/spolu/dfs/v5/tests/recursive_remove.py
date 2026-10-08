#!/usr/bin/env python3
"""Check recursive deletion of wide, durable directories through the real FUSE mount."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

import support


def main():
    """@cc [owner:spolu,label:testing] durable-recursive-removal
    Fixtures MUST use a fresh tenant prefix and verify every seeded payload before deletion.
    Both rm and shutil removal MUST finish, drain durably and be verified through an independent
    RPC client. Failed cleanup or deferred writeback errors MUST fail the run.
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path)
    parser.add_argument('--files', type=int, default=5000)
    args = parser.parse_args()
    if not 1 <= args.files <= 20000:
        parser.error('--files must be between 1 and 20000')
    work = args.work or Path(tempfile.mkdtemp(prefix='dfs-v5-recursive-remove-'))
    work.mkdir(parents=True, exist_ok=True)
    prefix, key, key_path = support.identity(work)
    report = {'complete': False, 'cases': [], 'files_per_case': args.files,
              'server_sha256': hashlib.sha256(support.server_binary().read_bytes()).hexdigest(),
              'fuse_sha256': hashlib.sha256(support.fuse_binary().read_bytes()).hexdigest()}

    def save():
        (work / 'run.json').write_text(json.dumps(report, indent=2) + '\n')

    print(f'Report directory: {work}', flush=True)
    server, endpoint = support.start(work, 'remove', prefix, key_path)
    try:
        tenant = support.rpc(endpoint, key, 'create-tenant',
                             {'tenant_id': 'remove', 'root_grants': ['owner']})
        owner = support.session(endpoint, tenant, ['owner'])
        owner_key = support.secret_file(work / 'owner.key', owner['session_key'])
        for case in ('rm', 'shutil'):
            parent = support.rpc(endpoint, owner['session_key'], 'create', {
                'parent_id': tenant['root_id'], 'name': case, 'directory': True, 'mode': 493,
            })['object']['id']
            # The existing diagnostic creates durable groups and verifies every 16 KiB payload.
            seeded = subprocess.run([
                str(support.BINARY / 'examples/groups'), '--endpoint', endpoint,
                '--key-file', str(owner_key), '--parent', parent, '--directories', '1',
                '--files', str(args.files), '--requests', '4',
            ], check=True, capture_output=True, text=True)
            assert json.loads(seeded.stdout)['verified'] == args.files
            metrics_path = work / f'{case}-metrics.json'
            with support.mounted(endpoint, owner['session_key'], work / f'mount-{case}',
                                 metrics_path=metrics_path) as mount:
                target = mount / case / 'group-0'
                assert len(list(target.iterdir())) == args.files
                started = time.monotonic()
                if case == 'rm':
                    subprocess.run(['/usr/bin/rm', '-rf', '--', str(target)], check=True)
                else:
                    shutil.rmtree(target)
                elapsed = time.monotonic() - started
                descriptor = os.open(mount / case, os.O_RDONLY | os.O_DIRECTORY)
                try:
                    started = time.monotonic()
                    os.fsync(descriptor)
                    drain = time.monotonic() - started
                finally:
                    os.close(descriptor)
                assert not list((mount / case).iterdir())
                assert not support.rpc(endpoint, owner['session_key'], 'list',
                                       {'directory_id': parent, 'limit': 4096})['entries']
            metrics = json.loads(metrics_path.read_text())
            assert not metrics.get('failed', True)
            for name, value in metrics['dfs_client_metrics'].items():
                if name.startswith('writeback.error.') or name == 'inline.wait_after_effect':
                    assert value['calls'] == 0, (name, value)
            memory = metrics['dfs_memory_metrics']
            assert memory['accounted_peak_bytes'] <= memory['limit_bytes'] <= 512 * 1024 ** 2
            row = {'method': case, 'remove_seconds': elapsed, 'durable_drain_seconds': drain,
                   'metrics': metrics}
            report['cases'].append(row)
            save()
            print(json.dumps({k: v for k, v in row.items() if k != 'metrics'}), flush=True)
        report['complete'] = True
        save()
    finally:
        support.stop(server)


if __name__ == '__main__':
    main()
