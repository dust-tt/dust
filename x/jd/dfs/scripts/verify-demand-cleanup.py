#!/usr/bin/env python3
import json
import subprocess
import time

queries = {
    'instances': ['compute', 'instances', 'list', '--filter=name=(dfs-opt-jd-20260930 dfs-opt-client-jd-20260930)'],
    'disks': ['compute', 'disks', 'list', '--filter=name=(dfs-opt-jd-20260930 dfs-opt-client-jd-20260930 dfs-opt-jd-20260930-data dfs-opt-client-jd-20260930-data)'],
    'firewalls': ['compute', 'firewall-rules', 'list', '--filter=name=(dfs-opt-jd-allow-client dfs-opt-jd-deny-other)'],
    'images': ['compute', 'images', 'list', '--no-standard-images', '--filter=name=dfs-opt-ubuntu-20260926'],
    'buckets': ['storage', 'buckets', 'list', '--filter=name=(dust-dev-dfs-opt-corpus-jd-20260930 dust-dev-dfs-opt-image-jd-20260930)'],
    'filestore': ['filestore', 'instances', 'list'],
    'service_accounts': ['iam', 'service-accounts', 'list', '--filter=email=dfs-opt-jd-20260930@dust-dev.iam.gserviceaccount.com'],
}
result = {'project': 'dust-dev', 'checked_at_ms': time.time_ns() // 1000000, 'remaining': {}}
for kind, query in queries.items():
    raw = subprocess.run(['gcloud', *query, '--project=dust-dev', '--format=json'], check=True, capture_output=True, text=True)
    result['remaining'][kind] = json.loads(raw.stdout)
    if kind == 'filestore':
        result['remaining'][kind] = [item for item in result['remaining'][kind] if item['name'].rsplit('/', 1)[-1] in {'dfs-opt-zonal-jd-20260930', 'dfs-opt-jd-20260930'}]
print(json.dumps(result, indent=2))
assert not any(result['remaining'].values()), 'owned cloud resources remain'
