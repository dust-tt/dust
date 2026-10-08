import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import re
import shlex
from fleet import ROOT, ssh

parser = argparse.ArgumentParser()
parser.add_argument('iteration')
args = parser.parse_args()
assert re.fullmatch(r'[a-z0-9-]{1,64}', args.iteration)
expected = json.loads((ROOT / 'results' / (args.iteration + '-binaries.json')).read_text())
roles = [(backend if backend == 'rocks' else backend + '-a', 'dfsd-' + backend) for backend in ('rocks', 'fdb', 'tikv')]
roles += [(backend + '-client', 'mount-' + backend) for backend in ('rocks', 'fdb', 'tikv')]


def verify(item):
    role, binary = item
    code = 'import pathlib,hashlib,json,socket,subprocess; p=pathlib.Path(' + repr('/srv/dfs/bin/' + binary) + '); print(json.dumps({"host":socket.getfqdn(),"binary":str(p),"sha256":hashlib.file_digest(p.open("rb"),"sha256").hexdigest(),"ssd":json.loads(subprocess.check_output(["findmnt","-J","-T","/srv/dfs"]))}))'
    result = ssh(role, 'python3 -c ' + shlex.quote(code), capture_output=True)
    assert result.returncode == 0, (role, result.stderr.decode())
    data = json.loads(result.stdout)
    assert data['sha256'] == expected[binary], (role, 'binary mismatch')
    mount = data['ssd']['filesystems'][0]
    assert mount['source'] == '/dev/nvme0n1' and mount['target'] == '/srv/dfs', (role, mount)
    return role, data


with ThreadPoolExecutor(max_workers=6) as pool:
    evidence = dict(pool.map(verify, roles))
(ROOT / 'results' / (args.iteration + '-runtime.json')).write_text(json.dumps(evidence, indent=2) + '\n')
print('All six deployed application binaries and NVMe paths verified.')
