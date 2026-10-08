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
cases = [(round_number, backend, user, mode) for round_number in range(1, 4) for backend, user, mode in [(backend, user, mode) for backend, mode in [('dfs', 'old'), ('dfs', 'selective')] for user in ['admin', 'alice', 'bob']] + [('nfs', 'alice', 'selective')]]
random.Random(40271).shuffle(cases)
(args.output / 'order.json').write_text(json.dumps(cases, indent=2) + '\n')
for round_number, backend, user, mode in cases:
    name = f'{round_number}-{backend}-{user}-{mode}'
    print(name, flush=True)
    subprocess.run(['sync'], check=True)
    pathlib.Path('/proc/sys/vm/drop_caches').write_text('3\n')
    with (args.output / (name + '.log')).open('w') as log:
        subprocess.run(['systemd-run', '--quiet', '--wait', '--pipe', '--collect', '--unit=dfs-selective-scan-' + name, '-p', 'MemoryMax=512M', '-p', 'MemorySwapMax=0', '--working-directory=' + str(root), '/usr/bin/python3', 'scripts/selective-scan.py', '--mode', mode, '--backend', backend, '--user', user, '--server', args.server, '--nfs', args.nfs, '--output', str(args.output / name)], stdout=log, stderr=subprocess.STDOUT, check=True)
    assert json.loads((args.output / name / 'results.json').read_text())['passed']
(args.output / 'completed.json').write_text(json.dumps({'passed': True, 'runs': len(cases)}) + '\n')
