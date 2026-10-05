#!/usr/bin/env python3
import argparse
import json
import pathlib
import random
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--server', required=True)
parser.add_argument('--nfs', required=True)
parser.add_argument('--output', type=pathlib.Path, required=True)
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
args.output = args.output.resolve()
args.output.mkdir(parents=True, exist_ok=False)
cases = [(round_number, backend, user) for round_number in range(1, 4) for backend, user in [('dfs', 'admin'), ('dfs', 'alice'), ('dfs', 'bob'), ('nfs', 'alice')]]
random.Random(13719).shuffle(cases)
(args.output / 'order.json').write_text(json.dumps(cases, indent=2) + '\n')
for round_number, backend, user in cases:
    name = f'{round_number}-{backend}-{user}'
    print(name, flush=True)
    subprocess.run(['sync'], check=True)
    pathlib.Path('/proc/sys/vm/drop_caches').write_text('3\n')
    with (args.output / (name + '.log')).open('w') as log:
        subprocess.run(['systemd-run', '--quiet', '--wait', '--pipe', '--collect', '--unit=dfs-grants-scan-' + name, '-p', 'MemoryMax=512M', '-p', 'MemorySwapMax=0', '--working-directory=' + str(root), '/usr/bin/python3', 'scripts/grant-scan.py', '--backend', backend, '--user', user, '--server', args.server, '--nfs', args.nfs, '--output', str(args.output / name)], stdout=log, stderr=subprocess.STDOUT, check=True)
    assert json.loads((args.output / name / 'results.json').read_text())['passed']
(args.output / 'completed.json').write_text(json.dumps({'passed': True, 'runs': len(cases)}) + '\n')
