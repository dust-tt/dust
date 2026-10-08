#!/usr/bin/env python3
import argparse
import json
import pathlib
import random
import subprocess

root = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=pathlib.Path, required=True)
args = parser.parse_args()
output = (root / args.output).resolve()
relative_output = output.relative_to(root)
output.mkdir(parents=True, exist_ok=False)
cases = [(round_number, user, mode) for round_number in range(1, 4) for user in ['admin', 'alice', 'bob'] for mode in ['old', 'selective']]
random.Random(50193).shuffle(cases)
(output / 'order.json').write_text(json.dumps(cases, indent=2) + '\n')
for round_number, user, mode in cases:
    name = f'{round_number}-{user}-{mode}'
    print(name, flush=True)
    with (output / (name + '.log')).open('w') as log:
        subprocess.run(['docker', 'run', '--rm', '--name', 'dfs-selective-local-client', '--network', 'dfs-selective-local', '--device', '/dev/fuse', '--cap-add', 'SYS_ADMIN', '--security-opt', 'apparmor=unconfined', '--memory=512m', '--memory-swap=512m', '-v', str(root) + ':/dfs', 'dfs-poc-build', 'python3', 'scripts/selective-scan.py', '--run', 'runtime/selective-local', '--backend', 'dfs', '--mode', mode, '--user', user, '--server', 'dfs-selective-local-server', '--nfs', 'unused', '--output', str(relative_output / name)], stdout=log, stderr=subprocess.STDOUT, check=True)
    result = json.loads((output / name / 'results.json').read_text())
    assert result['passed']
(output / 'completed.json').write_text(json.dumps({'passed': True, 'runs': len(cases), 'deployment': 'Linux ARM64 containers; separate server/client containers; fresh FUSE mounts; no host cache drop; no NFS comparison'}) + '\n')
