#!/usr/bin/env python3
"""`git clone` from GitHub then `git status` (first and repeated), natively and into a new mount
root. Validates through a new server and mount: clean status, and every tracked file's content
(re-hashed through the mount) equal to its blob at HEAD; when both clones got the same HEAD, also
every work-tree file identical to the native clone."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

from harness import Stack, metadata, peak_rss_mib, syncfs

URL = 'https://github.com/dust-tt/dust'


def timed(*command, cwd=None):
    started = time.monotonic()
    out = subprocess.run(command, cwd=cwd, check=True, capture_output=True, text=True).stdout
    return time.monotonic() - started, out


def drain(directory):
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        started = time.monotonic()
        syncfs(fd)
        return time.monotonic() - started
    finally:
        os.close(fd)


def tree(root):
    return {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(root.rglob('*'))
            if '.git' not in path.relative_to(root).parts and path.is_file() and not path.is_symlink()}


def blobs_match(repo):
    """Every tracked regular file, read back and hashed, matches the blob its index entry names."""
    staged = [line.split(None, 3) for line in timed('git', 'ls-files', '-s', '-z', cwd=repo)[1].split('\0') if line]
    files = [(path, blob) for mode, blob, _, path in staged if mode in ('100644', '100755')]
    hashed = subprocess.run(['git', 'hash-object', '--no-filters', '--stdin-paths'], cwd=repo, check=True,
                            capture_output=True, text=True, input='\n'.join(path for path, _ in files)).stdout.split()
    return len(files) > 0 and hashed == [blob for _, blob in files]


def clone(parent, url):
    run = {}
    run['clone_seconds'], _ = timed('git', 'clone', '--quiet', url, str(parent / 'dust'))
    run['status_first_seconds'], first = timed('git', 'status', '--porcelain', cwd=parent / 'dust')
    run['status_warm_seconds'], warm = timed('git', 'status', '--porcelain', cwd=parent / 'dust')
    run['clean'] = first == '' and warm == ''
    run['head'] = timed('git', 'rev-parse', 'HEAD', cwd=parent / 'dust')[1].strip()
    return run


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path)
    parser.add_argument('--url', default=URL)
    args = parser.parse_args()
    work = args.work or Path(tempfile.mkdtemp(prefix='dfs-henry-git-'))
    work.mkdir(parents=True, exist_ok=True)
    run = metadata() | {'url': args.url, 'git': timed('git', '--version')[1].strip()}
    native = work / 'native'
    shutil.rmtree(native, ignore_errors=True)
    native.mkdir()
    stack = Stack(work)
    mount = work / 'mount'
    try:
        run['native'] = clone(native, args.url)
        run['native']['sync_seconds'] = drain(native)
        token = stack.provision(['owner:write'], ['owner'])['owner']
        stack.start('clone')
        stack.mount(mount, token)
        (mount / 'work').mkdir()
        run['dfs'] = clone(mount / 'work', args.url)
        run['dfs']['remaining_client_writeback_seconds'] = drain(mount / 'work')
        run['dfs']['mount_peak_rss_mib'] = peak_rss_mib(stack.mounts[mount].pid)
        run['mount'] = stack.unmount(mount)
        run['server'] = stack.stop()
        stack.start('validate')
        stack.mount(mount, token)
        repo = mount / 'work' / 'dust'
        run['dfs']['status_after_remount_seconds'], status = timed('git', 'status', '--porcelain', cwd=repo)
        head = timed('git', 'rev-parse', 'HEAD', cwd=repo)[1].strip()
        expected = tree(native / 'dust')
        run['files'] = len(expected)
        run['same_head'] = head == run['native']['head'] == run['dfs']['head']
        run['blobs_match'] = blobs_match(repo)
        run['dfs']['validate_mount_peak_rss_mib'] = peak_rss_mib(stack.mounts[mount].pid)
        run['validated'] = (status == '' and head == run['dfs']['head'] and run['native']['clean'] and run['dfs']['clean']
                            and run['blobs_match'] and (not run['same_head'] or tree(repo) == expected))
        stack.stop()
    finally:
        stack.stop()
        stack.wipe()
        shutil.rmtree(native, ignore_errors=True)
        (work / 'run.json').write_text(json.dumps(run, indent=2) + '\n')
    for side in ('native', 'dfs'):
        r = run[side]
        print(f"{side:6} clone {r['clone_seconds']:7.2f}s  status first {r['status_first_seconds']:6.3f}s  "
              f"warm {r['status_warm_seconds']:6.3f}s")
    print(f"dfs status after remount {run['dfs']['status_after_remount_seconds']:.3f}s")
    print(f"mount peak RSS: clone + status {run['dfs']['mount_peak_rss_mib']:.0f} MiB, "
          f"remount + status + re-hash {run['dfs']['validate_mount_peak_rss_mib']:.0f} MiB")
    print(f"{'Validated' if run['validated'] else 'FAILED'} {run['files']} work-tree files; report: {work}")
    return 0 if run['validated'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
