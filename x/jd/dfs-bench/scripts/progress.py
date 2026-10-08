from concurrent.futures import ThreadPoolExecutor
import json
from fleet import ssh

probe = '''python3 - <<'REMOTE'
import json,time
from pathlib import Path
b=Path('/srv/dfs')
x=json.loads((b/'evidence/client/result.json').read_text())
result={'time':time.time(),'backend':x['backend'],'passed':x['passed'],'error':x.get('error'),'untar':x.get('untar'),'phases':x['phases']}
archive=b/'corpus.tar'
for proc in Path('/proc').glob('[0-9]*'):
    try:
        if (proc/'comm').read_text().strip() != 'tar': continue
        for fd in (proc/'fd').iterdir():
            if fd.resolve() == archive:
                info=dict(line.split(':',1) for line in (proc/'fdinfo'/fd.name).read_text().splitlines())
                result['archive_percent']=100*int(info['pos'])/archive.stat().st_size
    except (FileNotFoundError,PermissionError): pass
result['ready']=[p.stem.removeprefix('ready-') for p in (b/'control').glob('ready-*.json')]
print(json.dumps(result))
REMOTE'''


def progress(backend):
    response = ssh(backend + '-client', probe, capture_output=True)
    assert response.returncode == 0, response.stderr.decode()
    return json.loads(response.stdout)


with ThreadPoolExecutor(max_workers=3) as pool:
    print(json.dumps(list(pool.map(progress, ['rocks', 'fdb', 'tikv'])), indent=2))
