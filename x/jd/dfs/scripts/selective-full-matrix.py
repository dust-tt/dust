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
cases = [(round_number, mode) for round_number in range(1, 4) for mode in ['old', 'selective', 'nfs']]
random.Random(30761).shuffle(cases)
(args.output / 'order.json').write_text(json.dumps(cases, indent=2) + '\n')
for round_number, mode in cases:
    name = f'{round_number}-{mode}'
    print(name, flush=True)
    subprocess.run(['sync'], check=True)
    pathlib.Path('/proc/sys/vm/drop_caches').write_text('3\n')
    command = ['systemd-run', '--quiet', '--wait', '--pipe', '--collect', '--unit=dfs-selective-full-' + name, '-p', 'MemoryMax=512M', '-p', 'MemorySwapMax=0', '--working-directory=' + str(root), '/usr/bin/python3', 'scripts/kernel-cache-run.py', '--backend', 'nfs' if mode == 'nfs' else 'kernel', '--workload', 'full', '--round', str(round_number), '--memory-bytes', str(512 << 20), '--cold-client', '--endpoint', f'https://{args.server}:7443', '--ca', 'runtime/grants/server.crt', '--token-file', 'runtime/grants/credentials/admin.token', '--bin', 'runtime/grants/bin-old' if mode == 'old' else 'runtime/grants/bin', '--nfs', args.nfs, '--reference', 'runtime/grants/reference/corpus', '--output', str(args.output / name)]
    with (args.output / (name + '.log')).open('w') as log:
        subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True)
    assert json.loads((args.output / name / 'result.json').read_text())['passed']
(args.output / 'completed.json').write_text(json.dumps({'passed': True, 'runs': len(cases), 'credential': 'DFS tenant-admin full-suite control; measured Unix process UID 0; ordinary-principal measurements are in the separate scan matrix'}) + '\n')
