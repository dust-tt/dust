from concurrent.futures import ThreadPoolExecutor
import json
import time
from fleet import ROOT, ssh


def bootstrap(role):
    for attempt in range(60):
        p = ssh(role, 'true', capture_output=True)
        if p.returncode == 0:
            break
        time.sleep(5)
    else:
        raise RuntimeError(role + ' SSH unavailable')
    with (ROOT / f'results/bootstrap-{role}.log').open('wb') as log:
        p = ssh(role, 'bash -s', input=(ROOT / 'scripts/bootstrap.sh').read_bytes(), stdout=log, stderr=log)
    print(role, p.returncode, flush=True)
    return {'role': role, 'exit_code': p.returncode}


hosts = json.loads((ROOT / 'results/hosts.json').read_text())
with ThreadPoolExecutor(max_workers=16) as pool:
    results = list(pool.map(bootstrap, hosts))
(ROOT / 'results/bootstrap.json').write_text(json.dumps(results, indent=2) + '\n')
assert all(r['exit_code'] == 0 for r in results)
