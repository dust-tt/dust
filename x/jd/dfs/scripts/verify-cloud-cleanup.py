#!/usr/bin/env python3
import json
import subprocess
import time

queries = {
    'instances': ['compute', 'instances', 'list', '--filter=name=(dfs-poc-jd-20260930 dfs-poc-client-jd-20260930)'],
    'disks': ['compute', 'disks', 'list', '--filter=name=(dfs-poc-jd-20260930 dfs-poc-client-jd-20260930 dfs-poc-jd-20260930-data)'],
    'firewalls': ['compute', 'firewall-rules', 'list', '--filter=name=(dfs-poc-jd-allow-client dfs-poc-jd-deny-other)'],
    'images': ['compute', 'images', 'list', '--no-standard-images', '--filter=name=dfs-poc-ubuntu-20260926'],
    'buckets': ['storage', 'buckets', 'list', '--filter=name=dust-dev-dfs-poc-jd-20260930'],
}
result = {'project': 'dust-dev', 'checked_at_ms': time.time_ns() // 1000000, 'remaining': {}}
for kind, query in queries.items():
    raw = subprocess.run(['gcloud', *query, '--project=dust-dev', '--format=json'], check=True, capture_output=True, text=True)
    result['remaining'][kind] = json.loads(raw.stdout)
print(json.dumps(result, indent=2))
assert not any(result['remaining'].values()), 'owned cloud resources remain'
