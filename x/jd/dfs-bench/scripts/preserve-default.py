from concurrent.futures import ThreadPoolExecutor
import json
import shutil
from fleet import ROOT, ssh

backends = ['rocks', 'fdb', 'tikv']


def preserve(backend):
    role = backend + '-client'
    p = ssh(role, 'cat /srv/dfs/evidence/client/result.json', capture_output=True)
    assert p.returncode == 0, p.stderr.decode()
    result = json.loads(p.stdout)
    assert result['untar']['all_hashes_verified']
    if backend == 'rocks':
        assert result.get('error') and result['filesystem_unmount']['unmounted']
    else:
        assert result['filesystem_unmount']['unmounted'] and 'end_time' in result['phases']['filesystem']
    p = ssh(role, 'sudo systemctl stop dfs-benchmark', capture_output=True)
    assert p.returncode == 0, p.stderr.decode()
    script = r'''python3 - <<'REMOTE'
import json,os,shutil
from pathlib import Path
b=Path('/srv/dfs')
assert not os.path.ismount(b/'mount')
assert not (b/'control/go-search.json').exists()
shutil.copytree(b/'control',b/'evidence/default-control')
shutil.copyfile(b/'scripts/client.py',b/'evidence/default-client.py')
(b/'evidence/client').rename(b/'evidence/default-read-limit')
(b/'evidence/client').mkdir()
x=json.loads((b/'evidence/default-read-limit/result.json').read_text())
for key in list(x):
    if key.startswith('filesystem_') or key in ('error','resources','resources_scope','index_after_filesystem'):
        del x[key]
x['phases']={'untar':x['phases']['untar']}
x['passed']=False
x['comparison_profile']='filesystem/search rerun with 16 admitted reads; original untar used 8'
settings=json.loads((b/'config/client.json').read_text())
settings['read_concurrency']=16
(b/'config/client.json').write_text(json.dumps(settings,indent=2)+'\n')
x['settings']=settings
(b/'evidence/client/result.json').write_text(json.dumps(x,indent=2)+'\n')
for name in ('ready-filesystem.json','go-filesystem.json','ready-search.json','go-search.json','finished.json'):
    (b/'control'/name).unlink(missing_ok=True)
shutil.copyfile(b/'evidence/default-read-limit/untar-mount-metrics.json',b/'evidence/client/untar-mount-metrics.json')
shutil.copyfile(b/'evidence/default-read-limit/untar-mount.log',b/'evidence/client/untar-mount.log')
REMOTE'''
    p = ssh(role, script, capture_output=True)
    assert p.returncode == 0, p.stderr.decode()
    print(backend, 'default attempt preserved', flush=True)


shutil.copyfile(ROOT / 'results/run.log', ROOT / 'results/default-run.log')
shutil.copyfile(ROOT / 'results/barriers.json', ROOT / 'results/default-barriers.json')
with ThreadPoolExecutor(max_workers=3) as pool:
    list(pool.map(preserve, backends))
