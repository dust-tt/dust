#!/usr/bin/env python3
"""Spolu's untar.py procedure: untar the first manifest paths six levels below a write grant that
sits seven levels deep, then validate every file through a new server and mount."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import time

from harness import Stack, corpus, metadata, syncfs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path)
    parser.add_argument('--files', type=int, default=1000)
    args = parser.parse_args()
    if not 1 <= args.files <= 10000:
        parser.error('--files must be 1..10000')
    work = args.work or Path(tempfile.mkdtemp(prefix='dfs-henry-untar-'))
    work.mkdir(parents=True, exist_ok=True)
    data = corpus(work)
    manifest = json.loads((data / 'manifest.json').read_text())
    files = manifest['paths'][:args.files]
    with tarfile.open(work / 'corpus.tar', 'w') as archive:
        directories = {parent for file in files for parent in Path(file).parents}
        for directory in sorted(directories, key=lambda path: (len(path.parts), str(path))):
            archive.add(data / 'docs' / directory, arcname=str(Path('docs') / directory), recursive=False)
        for file in files:
            archive.add(data / 'docs' / file, arcname=str(Path('docs') / file))
    run = metadata() | {'files': args.files, 'outer_depth': 6, 'depth_below_grant': 6,
                        'corpus_selection': 'first manifest paths'}
    stack = Stack(work)
    mount = work / 'mount'
    try:
        tokens = stack.provision(['owner:write'], ['owner', 'writer'])
        stack.start('setup')
        stack.mount(mount, tokens['owner'])
        outer = mount / Path(*[f'dir-{i}' for i in range(7)])
        (outer / Path(*[f'dir-{i}' for i in range(7, 13)])).mkdir(parents=True)
        anchor = os.stat(outer).st_ino
        stack.unmount(mount)
        stack.admin_op('grant', str(anchor), 'writer', 'write')
        stack.mount(mount, tokens['writer'], root=anchor)
        target = mount / Path(*[f'dir-{i}' for i in range(7, 13)])
        fd = os.open(target, os.O_RDONLY | os.O_DIRECTORY)
        try:
            started = time.monotonic()
            subprocess.run(['/usr/bin/tar', '--no-same-owner', '-xf', str(work / 'corpus.tar'), '-C', str(target)],
                           check=True)
            run['untar_seconds'] = time.monotonic() - started
            started = time.monotonic()
            syncfs(fd)
            run['remaining_client_writeback_seconds'] = time.monotonic() - started
        finally:
            os.close(fd)
        run['mount'] = stack.unmount(mount)
        run['server'] = stack.stop()
        stack.start('validate')
        stack.mount(mount, tokens['writer'], root=anchor)
        for file, expected in zip(files, manifest['sha256'], strict=False):
            assert hashlib.sha256((target / 'docs' / file).read_bytes()).hexdigest() == expected, file
        stack.stop()
        run['validated_after_server_restart'] = True
        run['validated_files'] = len(files)
    finally:
        stack.stop()
        stack.wipe()
        (work / 'run.json').write_text(json.dumps(run, indent=2) + '\n')
    print(f"Validated {run['validated_files']} files; untar {run['untar_seconds']:.3f}s; report: {work}")


if __name__ == '__main__':
    main()
