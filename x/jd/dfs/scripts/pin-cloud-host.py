#!/usr/bin/env python3
import json
import pathlib
import re
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[1]
vm = sys.argv[1]
common = ['--project=dust-dev', '--zone=us-central1-a']
serial = subprocess.check_output(['gcloud', 'compute', 'instances', 'get-serial-port-output', vm, *common], text=True)
assert 'Cloud-init' in serial and 'finished at' in serial, 'cloud-init not finished'
keys = re.findall(r'^ssh-ed25519 (\S+) root@' + re.escape(vm) + r'\s*$', serial, re.MULTILINE)
assert len(set(keys)) == 1, 'missing or ambiguous authenticated host key'
instance = json.loads(subprocess.check_output(['gcloud', 'compute', 'instances', 'describe', vm, *common, '--format=json'], text=True))
address = instance['networkInterfaces'][0]['accessConfigs'][0]['natIP']
path = root / 'cloud/known_hosts'
lines = [line for line in path.read_text().splitlines() if not line.startswith(address + ' ')] if path.exists() else []
lines.append(f'{address} ssh-ed25519 {keys[0]}')
path.write_text('\n'.join(lines) + '\n')
print(f'Pinned {vm} at {address} using authenticated serial output')
