import argparse
import pathlib
import shlex
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--experiment', choices=['tantivy-scale', 'tantivy-optimized'], default='tantivy-scale')
parser.add_argument('--dataset', choices=['count100k', 'bytes-large'], required=True)
parser.add_argument('--engine', choices=['tantivy', 'lance'], required=True)
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
server = 'dfs@136.113.155.199'
client = 'dfs@34.59.229.83'
options = ['-i', str(root / 'cloud/ssh-key'), '-o', 'UserKnownHostsFile=' + str(root / 'cloud/known_hosts')]
remote = '/home/dfs/x/jd/dfs'
source = remote + '/runtime/tantivy-source'
output = source + '/results/' + args.experiment + '/' + args.dataset
client_output = remote + '/results/' + args.experiment + '/' + args.dataset


def ssh(host, command):
    return subprocess.run(['ssh', *options, host, command], check=True)


deadline = time.monotonic() + 3600
while True:
    phase = subprocess.check_output(['ssh', *options, server, 'cat ' + shlex.quote(output + '/phase')], text=True).strip()
    if phase == args.engine + '_ready':
        break
    if time.monotonic() > deadline:
        raise TimeoutError(phase)
    time.sleep(5)

for mode, concurrency in [('matrix', 1), ('load', 4), ('load', 8)]:
    name = args.engine + '-' + mode + (('-' + str(concurrency)) if mode == 'load' else '')
    print(args.dataset, name, flush=True)
    phase = args.engine + '_' + mode + ('_' + str(concurrency) if mode == 'load' else '')
    ssh(server, 'python3 -c ' + shlex.quote('from pathlib import Path; Path(' + repr(output + '/phase') + ').write_text(' + repr(phase + '\n') + ')'))
    command = ['python3', remote + '/lexical/scale-bench.py', '--run', remote + '/runtime/search-cloud', '--fixture', client_output + '/fixture.json', '--manifest', client_output + '/manifest.json', '--server', '10.128.0.23', '--engine', args.engine, '--mode', mode, '--concurrency', str(concurrency), '--output', client_output + '/' + name + '.json']
    ssh(client, shlex.join(command) + ' > ' + shlex.quote(client_output + '/' + name + '.log') + ' 2>&1')
    subprocess.run(['scp', *options, client + ':' + client_output + '/' + name + '.json', str(root / 'results' / args.experiment / args.dataset / (name + '.json'))], check=True)
ssh(server, 'python3 -c ' + shlex.quote('from pathlib import Path; Path(' + repr(output + '/phase') + ').write_text(' + repr(args.engine + '_measured\n') + ')'))
