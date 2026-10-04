#!/usr/bin/env python3
"""Profile a bounded subset of jd's corpus under a deep, selectively granted directory."""
import argparse
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import time
from common import corpus, metadata, persistence, save, support


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path)
    parser.add_argument('--files', type=int, default=1000)
    parser.add_argument('--server', default='/target/release/dfs-server-v2')
    parser.add_argument('--profile', action='store_true')
    parser.add_argument('--indexer-unavailable', action='store_true')
    parser.add_argument('--trace-xattrs', action='store_true',
                        help='Trace tar xattr syscalls with strace; diagnostic timing only')
    parser.add_argument('--keep-fixture', action='store_true', help='Retain imported files and credentials')
    args = parser.parse_args()
    if not 1 <= args.files <= 10000:
        parser.error('--files must be 1..10000')
    work = args.work or Path(tempfile.mkdtemp(prefix='dfs-v2-untar-'))
    work.mkdir(parents=True, exist_ok=True)
    if (work / 'run.json').exists():
        raise RuntimeError('report directory already contains a run')
    data = corpus(work)
    manifest = json.loads((data / 'manifest.json').read_text())
    files = manifest['paths'][:args.files]
    with tarfile.open(work / 'corpus.tar', 'w') as archive:
        directories = {parent for file in files for parent in Path(file).parents}
        for directory in sorted(directories, key=lambda path: (len(path.parts), str(path))):
            archive.add(data / 'docs' / directory, arcname=str(Path('docs') / directory), recursive=False)
        for file in files:
            archive.add(data / 'docs' / file, arcname=str(Path('docs') / file))
    prefix, key, key_path = support.identity(work, 'bench')
    run = metadata(args.server) | {'files': args.files, 'prefix': prefix,
        'profile_timings': args.profile, 'indexer_available': not args.indexer_unavailable,
        'trace_xattrs': args.trace_xattrs,
        'outer_depth': 6, 'depth_below_grant': 6, 'corpus_selection': 'first manifest paths'}
    if args.profile:
        os.environ['RUST_LOG'] = 'info,dfs_server_v2::profile=debug'
    server = None
    success = False
    try:
        server, endpoint = support.start(work, 'untar', prefix, key_path,
            es_url='http://127.0.0.1:9' if args.indexer_unavailable else None, binary=args.server)
        workspace = support.rpc(endpoint, key, 'create-workspace',
            {'workspace_id': 'deep-untar', 'root_grants': ['owner']})
        support.secret_file(work / 'workspace.json', json.dumps(workspace))
        owner = support.session(endpoint, workspace, ['owner'])['session_key']
        parent = workspace['root_id']
        for i in range(13):
            version = support.rpc(endpoint, owner, 'stat', {'object_id': parent})['version']
            obj = support.rpc(endpoint, owner, 'create', {'parent_id': parent,
                'expected_parent_version': version, 'name': f'dir-{i}', 'directory': True,
                'mode': 493})['object']
            parent = obj['id']
            if i == 6:
                anchor = f'dir-{i}--{parent}'
                support.rpc(endpoint, workspace['workspace_key'], 'update-grants',
                    {'workspace_id': workspace['workspace_id'], 'object_id': parent,
                     'expected_version': obj['version'], 'changes': [{'grant': 'writer', 'attached': True}]})
        writer = support.session(endpoint, workspace, ['writer'])['session_key']
        mount = work / 'mount'
        with support.mounted(endpoint, writer, mount, metrics_path=work / 'client-metrics.json'):
            target = mount / 'shared' / anchor / Path(*[f'dir-{i}' for i in range(7, 13)])
            fd = os.open(target, os.O_RDONLY | os.O_DIRECTORY)
            try:
                run['started_at'] = datetime.now(timezone.utc).isoformat()
                started = time.monotonic()
                trace = ['strace', '-f', '-e',
                         'trace=getxattr,lgetxattr,fgetxattr,listxattr,llistxattr,flistxattr',
                         '-o', str(work / 'tar-xattrs.trace')] if args.trace_xattrs else []
                subprocess.run([*trace, '/usr/bin/tar', '--no-same-owner', '-xf', str(work / 'corpus.tar'),
                    '-C', str(target)], check=True)
                run['untar_seconds'] = time.monotonic() - started
                started = time.monotonic()
                support.syncfs(fd)
                run['remaining_client_writeback_seconds'] = time.monotonic() - started
                run['finished_at'] = datetime.now(timezone.utc).isoformat()
            finally:
                os.close(fd)
            run['shutdown_seconds'] = support.stop(server)
            server = None
            run['persistence'] = persistence(work / 'untar-server.log')
        mount.rmdir()
        server, endpoint = support.start(work, 'validate', prefix, key_path,
            es_url='http://127.0.0.1:9' if args.indexer_unavailable else None, binary=args.server)
        writer = support.session(endpoint, workspace, ['writer'])['session_key']
        with support.mounted(endpoint, writer, mount):
            target = mount / 'shared' / anchor / Path(*[f'dir-{i}' for i in range(7, 13)])
            for file, expected in zip(files, manifest['sha256'], strict=False):
                assert hashlib.sha256((target / 'docs' / file).read_bytes()).hexdigest() == expected
        support.stop(server)
        server = None
        run['validated_after_server_restart'] = True
        phases = defaultdict(list)
        for line in (work / 'untar-server.log').read_text().splitlines():
            row = json.loads(line)
            fields = row.get('fields', {})
            if fields.get('message') != 'filesystem phase':
                continue
            timestamp = datetime.fromisoformat(row['timestamp'].replace('Z', '+00:00'))
            if not datetime.fromisoformat(run['started_at']) <= timestamp <= datetime.fromisoformat(run['finished_at']):
                continue
            operation = row.get('span', {}).get('operation', fields.get('operation', 'background'))
            phases[(operation, fields['phase'])].append(fields['elapsed_us'])
        run['phases'] = [{'operation': operation, 'phase': phase, 'calls': len(samples),
            'total_ms': sum(samples) / 1000, 'mean_us': sum(samples) / len(samples)}
            for (operation, phase), samples in sorted(phases.items())]
        run['validated_files'] = len(files)
        success = True
    finally:
        if server is not None and server.poll() is None:
            support.stop(server)
        if success:
            run['fixture_retained'] = args.keep_fixture
            run['fixture_cleaned'] = False
            if not args.keep_fixture:
                support.cleanup(prefix)
                key_path.unlink(missing_ok=True)
                (work / 'workspace.json').unlink(missing_ok=True)
                run['fixture_cleaned'] = True
            save(work, run)
    print(f"Validated {run['validated_files']} files; untar {run['untar_seconds']:.3f}s; report: {work}")


if __name__ == '__main__':
    main()
