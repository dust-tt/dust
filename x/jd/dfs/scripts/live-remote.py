import json
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
instance = json.loads(subprocess.check_output(['gcloud', 'compute', 'instances', 'describe', 'dfs-live-build-jd-20261006', '--project', 'dust-dev', '--zone', 'us-central1-a', '--format=json']))
address = instance['networkInterfaces'][0]['accessConfigs'][0]['natIP']
raise SystemExit(subprocess.call(['ssh', '-i', str(root / 'cloud/ssh-key'), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'StrictHostKeyChecking=accept-new', '-o', f'UserKnownHostsFile={root / "cloud/known_hosts"}', f'dfs@{address}', sys.argv[1]]))
