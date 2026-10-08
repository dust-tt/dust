import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parent
PREFIX = 'dfs-clean-jd-20261006-'
PROJECT = 'dust-dev'
ROLES = {'rocks': 'a'}
for backend in ('fdb', 'tikv'):
    for zone in 'abc':
        ROLES[f'{backend}-{zone}'] = zone
        ROLES[f'{backend}-es-{zone}'] = zone
for backend in ('rocks', 'fdb', 'tikv'):
    ROLES[f'{backend}-client'] = 'a'


def cloud(*args):
    return subprocess.check_output(['gcloud', 'compute', *args, '--project', PROJECT, '--format=json'])


def inventory():
    rows = json.loads(cloud('instances', 'list', '--filter', f'name~"^{PREFIX}"'))
    return {r['name'].removeprefix(PREFIX): r for r in rows}


def ssh(role, command, **kwargs):
    hosts = json.loads((ROOT / 'results/hosts.json').read_text())
    host = hosts[role]
    ip = host['networkInterfaces'][0]['accessConfigs'][0]['natIP']
    return subprocess.run(['ssh', '-i', str(WORKSPACE / 'dfs/cloud/ssh-key'), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'StrictHostKeyChecking=accept-new', '-o', f'UserKnownHostsFile={ROOT / "results/known_hosts"}', f'dfs@{ip}', command], **kwargs)


def provision():
    existing = inventory()

    def create(item):
        role, zone = item
        if role in existing:
            assert existing[role]['machineType'].endswith('/c4-standard-8-lssd')
            assert existing[role]['zone'].endswith('/us-east4-' + zone)
            return dict(role=role, existing=True, exit_code=0)
        cmd = ['gcloud', 'compute', 'instances', 'create', PREFIX + role, '--project', PROJECT, '--zone', 'us-east4-' + zone, '--machine-type', 'c4-standard-8-lssd', '--image-family', 'ubuntu-2404-lts-amd64', '--image-project', 'ubuntu-os-cloud', '--boot-disk-size', '50GB', '--boot-disk-type', 'hyperdisk-balanced', '--no-service-account', '--no-scopes', '--metadata-from-file=user-data=' + str(WORKSPACE / 'dfs/cloud/user-data.yaml'), '--metadata=enable-oslogin=FALSE', '--labels=owner=jd,purpose=dfs-clean-bench', '--tags=dfs-clean-bench', '--format=json']
        p = subprocess.run(cmd, capture_output=True, text=True)
        result = dict(role=role, command=cmd, exit_code=p.returncode, stdout=p.stdout, stderr=p.stderr)
        (ROOT / f'results/provision-{role}.json').write_text(json.dumps(result, indent=2) + '\n')
        print(role, p.returncode, flush=True)
        return result

    with ThreadPoolExecutor(max_workers=16) as pool:
        results = list(pool.map(create, ROLES.items()))
    hosts = inventory()
    (ROOT / 'results/hosts.json').write_text(json.dumps(hosts, indent=2) + '\n')
    assert all(r['exit_code'] == 0 for r in results)
    assert set(hosts) == set(ROLES)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['provision', 'ssh'])
    parser.add_argument('role', nargs='?')
    parser.add_argument('command', nargs='?')
    args = parser.parse_args()
    if args.action == 'provision':
        provision()
    else:
        raise SystemExit(ssh(args.role, args.command).returncode)
