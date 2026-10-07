#!/usr/bin/env python3
"""Compare one-parent and many-parent durable gRPC throughput, separately from FUSE untar."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tests'))
import support


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path)
    parser.add_argument('--files', type=int, default=2048)
    parser.add_argument('--directories', type=int, nargs='+', default=[1, 64])
    parser.add_argument('--requests', type=int, default=4)
    args = parser.parse_args()
    work = args.work or Path(tempfile.mkdtemp(prefix='dfs-v5-groups-'))
    work.mkdir(parents=True, exist_ok=True)
    print(f'Report directory: {work}', flush=True)
    report = {'revision': os.environ.get('DFS_BENCH_REVISION', 'uncommitted'), 'cases': [],
              'profile': os.environ.get('DFS_PROFILE') == '1',
              'server_sha256': hashlib.sha256(support.server_binary().read_bytes()).hexdigest()}
    for directories in args.directories:
        case = work / f'directories-{directories}'
        case.mkdir()
        prefix, key, key_path = support.identity(case)
        server, endpoint = support.start(case, 'groups', prefix, key_path)
        try:
            tenant = support.rpc(endpoint, key, 'create-tenant',
                                 {'tenant_id': 'groups', 'root_grants': ['owner']})
            owner = support.session(endpoint, tenant, ['owner'])
            parent = tenant['root_id']
            for depth in range(13):
                parent = support.rpc(endpoint, owner['session_key'], 'create', {
                    'parent_id': parent, 'name': f'dir{depth}', 'directory': True, 'mode': 493,
                })['object']['id']
                if depth == 6:
                    support.rpc(endpoint, tenant['tenant_key'], 'update-grants', {
                        'tenant_id': tenant['tenant_id'], 'object_id': parent,
                        'changes': [{'grant': 'bench', 'attached': True}],
                    })
            user = support.session(endpoint, tenant, ['bench'])
            session_key = support.secret_file(case / 'session.key', user['session_key'])
            result = subprocess.run([
                str(support.BINARY / 'examples/groups'), '--endpoint', endpoint,
                '--key-file', str(session_key), '--parent', parent,
                '--directories', str(directories), '--files', str(args.files),
                '--requests', str(args.requests),
            ], check=True, capture_output=True, text=True)
            row = json.loads(result.stdout)
            print(json.dumps(row), flush=True)
        finally:
            support.stop(server)
        row['profile'] = support.profile(case / 'groups-server.log')
        report['cases'].append(row)
        (work / 'run.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
