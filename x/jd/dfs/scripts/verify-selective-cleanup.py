#!/usr/bin/env python3
import concurrent.futures
import json
import subprocess
import time

prefix = 'dfs-selective-jd-20260930'
queries = {
    'instances': ['compute', 'instances', 'list', f'--filter=name~^{prefix}'],
    'disks': ['compute', 'disks', 'list', f'--filter=name~^{prefix}'],
    'firewalls': ['compute', 'firewall-rules', 'list', f'--filter=name~^{prefix}'],
    'images': ['compute', 'images', 'list', '--no-standard-images', f'--filter=name={prefix}'],
    'buckets': ['storage', 'buckets', 'list', f'--filter=name=dust-dev-{prefix}'],
    'filestore': ['filestore', 'instances', 'list'],
    'service_accounts': ['iam', 'service-accounts', 'list', f'--filter=email~^{prefix}'],
}


def query(item):
    kind, command = item
    raw = subprocess.run(['gcloud', *command, '--project=dust-dev', '--format=json'], check=True, capture_output=True, text=True)
    resources = json.loads(raw.stdout)
    if kind == 'filestore':
        resources = [item for item in resources if item['name'].rsplit('/', 1)[-1].startswith(prefix)]
    return kind, resources


with concurrent.futures.ThreadPoolExecutor(max_workers=7) as executor:
    remaining = dict(executor.map(query, queries.items()))
print(json.dumps({'project': 'dust-dev', 'prefix': prefix, 'checked_at_ms': time.time_ns() // 1000000, 'remaining': remaining}, indent=2))
assert not any(remaining.values()), 'owned cloud resources remain'
