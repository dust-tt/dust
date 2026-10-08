import json
import time
from fleet import ROOT, ssh

role = 'fdb-client'
deadline = time.monotonic() + 7200
while True:
    command = 'python3 -c ' + "'import pathlib,json; b=pathlib.Path(\"/srv/dfs\"); x=json.loads((b/\"evidence/client/result.json\").read_text()); print(json.dumps({\"untar\":x.get(\"untar\"),\"error\":x.get(\"error\"),\"ready\":(b/\"control/ready-filesystem.json\").exists()}))'"
    p = ssh(role, command, capture_output=True)
    assert p.returncode == 0, p.stderr.decode()
    state = json.loads(p.stdout)
    assert not state['error'], state
    if state['ready']:
        print('FDB became ready without extending its wait', flush=True)
        break
    if state['untar'] and state['untar']['all_hashes_verified']:
        p = ssh(role, 'sudo systemctl stop dfs-benchmark; cp /srv/dfs/scripts/client.py /srv/dfs/evidence/untar-driver.py; if mountpoint -q /srv/dfs/mount; then exit 1; fi', capture_output=True)
        assert p.returncode == 0, p.stderr.decode()
        p = ssh(role, 'cat > /srv/dfs/scripts/client.py', input=(ROOT / 'scripts/client.py').read_bytes(), capture_output=True)
        assert p.returncode == 0, p.stderr.decode()
        p = ssh(role, 'sudo systemd-run --unit dfs-benchmark --uid dfs --property=MemoryMax=6G --property=MemorySwapMax=0 --setenv=LD_LIBRARY_PATH=/srv/dfs/lib python3 /srv/dfs/scripts/client.py --resume-after-untar', capture_output=True)
        (ROOT / 'results/resume-fdb.log').write_bytes(p.stdout + p.stderr)
        assert p.returncode == 0, p.stderr.decode()
        print('FDB resumed after verified extraction with extended index deadline', flush=True)
        break
    assert time.monotonic() < deadline
    time.sleep(30)
