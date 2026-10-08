import argparse
from pathlib import Path
import json
import subprocess
import tarfile

parser = argparse.ArgumentParser()
parser.add_argument('node', choices=['a', 'b', 'f', 'client'])
parser.add_argument('--fleet', choices=['original', 'isolated', 'smart-cache'], default='smart-cache')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
archive = root / f'runtime/source-{args.node}.tar.gz'
with tarfile.open(archive, 'w:gz') as tar:
    for name in ['src', 'tests', 'proto', 'search', 'scripts', 'benchmarks', 'docs', 'Cargo.toml', 'build.rs', 'CONTRACTS', 'Cargo.lock', '.gitignore', 'README.md']:
        if (root / name).exists():
            tar.add(root / name, arcname=name)
prefix = {'original': 'dfs-rawkv-jd-20261005', 'isolated': 'dfs-fdb-independent-20261006', 'smart-cache': 'dfs-fdb-cache-20261006'}[args.fleet]
machine = json.loads(subprocess.check_output(['gcloud', 'compute', 'instances', 'describe', f'{prefix}-{args.node}', '--project', 'dust-dev', '--zone', 'us-central1-' + ('a' if args.node == 'client' else args.node), '--format=json']))
address = machine['networkInterfaces'][0]['accessConfigs'][0]['natIP']
with archive.open('rb') as stream:
    subprocess.run(['ssh', '-i', str(root.parent / 'dfs/cloud/ssh-key'), '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', f'UserKnownHostsFile={root / "runtime/known_hosts"}', f'dfs@{address}', 'mkdir -p /home/dfs/dfs-fdb && tar -xz -C /home/dfs/dfs-fdb'], stdin=stream, check=True)
