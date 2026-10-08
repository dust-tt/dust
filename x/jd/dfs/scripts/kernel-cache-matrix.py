#!/usr/bin/env python3
import argparse
import json
import pathlib
import random
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--endpoint', required=True)
parser.add_argument('--nfs', required=True)
parser.add_argument('--output', type=pathlib.Path, required=True)
parser.add_argument('--rounds', type=int, default=3)
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
args.output = args.output.resolve()
args.output.mkdir(parents=True, exist_ok=False)
cases = [('corpus', 'full', 512, backend) for backend in ('direct', 'kernel', 'nfs', 'ext4')]
cases += [(corpus, workload, memory_mib, backend)
          for corpus, workload, memory_mib in (
              ('corpus', 'scan', 512), ('corpus', 'search', 512), ('corpus', 'scan', 192),
              ('large', 'scan', 512), ('large', 'scan', 4096), ('large', 'heads', 512),
              ('large', 'sha', 512))
          for backend in ('direct', 'kernel', 'nfs')]
order = [(round_number, *case) for round_number in range(1, args.rounds + 1) for case in cases]
random.Random(30191).shuffle(order)
(args.output / 'order.json').write_text(json.dumps(order, indent=2) + '\n')
for round_number, corpus, workload, memory_mib, backend in order:
    name = f'{round_number}-{corpus}-{workload}-{memory_mib}-{backend}'
    print(name, flush=True)
    subprocess.run(['sync'], check=True)
    subprocess.run(['sudo', 'sh', '-c', 'echo 3 > /proc/sys/vm/drop_caches'], check=True)
    command = ['sudo', 'systemd-run', '--quiet', '--wait', '--pipe', '--collect',
               f'--unit=dfs-kcache-{name}', '--uid=dfs', f'--working-directory={root}',
               f'--property=MemoryMax={memory_mib}M', '--property=MemorySwapMax=0',
               '--property=MemoryAccounting=yes',
               'python3', 'scripts/kernel-cache-run.py', '--backend', backend, '--workload', workload,
               '--corpus', corpus, '--round', str(round_number), '--memory-bytes', str(memory_mib << 20), '--cold-client',
               '--endpoint', args.endpoint, '--nfs', args.nfs,
               '--ca', 'runtime/kernel-cache-client/server.crt',
               '--token-file', 'runtime/kernel-cache-client/admin.token' if corpus == 'corpus' else 'runtime/kernel-cache-client/admin-1.token',
               '--reference', f'runtime/kernel-cache-client/{corpus}',
               '--native', 'runtime/kernel-cache-client/native', '--output', str(args.output / name)]
    with (args.output / f'{name}.log').open('w') as output:
        subprocess.run(command, cwd=root, stdout=output, stderr=subprocess.STDOUT, check=True)
    result = json.loads((args.output / name / 'result.json').read_text())
    assert result['passed'] and not result['sampling_errors']
(args.output / 'completed.json').write_text(json.dumps({'runs': len(order), 'passed': True}) + '\n')
