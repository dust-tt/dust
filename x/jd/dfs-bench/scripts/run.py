from concurrent.futures import ThreadPoolExecutor
import json
import sys
import time
from fleet import ROOT, ssh

backends = ['rocks', 'fdb', 'tikv']
resume = sys.argv[1:] == ['--resume-after-untar']
events = [event for event in json.loads((ROOT / 'results/default-barriers.json').read_text()) if event['phase'] == 'untar'] if resume else []


def start(backend):
    role = backend + '-client'
    p = ssh(role, 'cat > /srv/dfs/scripts/client.py', input=(ROOT / 'scripts/client.py').read_bytes(), capture_output=True)
    assert p.returncode == 0, p.stderr.decode()
    p = ssh(role, 'sudo systemd-run --unit dfs-benchmark --uid dfs --property=MemoryMax=6G --property=MemorySwapMax=0 --setenv=LD_LIBRARY_PATH=/srv/dfs/lib python3 /srv/dfs/scripts/client.py' + (' --resume-after-untar' if resume else ''), capture_output=True)
    (ROOT / ('results/client-start-' + backend + '.log')).write_bytes(p.stdout + p.stderr)
    assert p.returncode == 0


with ThreadPoolExecutor(max_workers=3) as pool:
    list(pool.map(start, backends))


def observe(backend, phase):
    text = 'python3 -c ' + "'import pathlib,json; p=pathlib.Path(\"/srv/dfs/control\"); print(json.dumps({\"ready\":(p/\"ready-" + phase + ".json\").exists(),\"finished\":json.loads((p/\"finished.json\").read_text()) if (p/\"finished.json\").exists() else None}))'"
    p = ssh(backend + '-client', text, capture_output=True)
    assert p.returncode == 0, p.stderr.decode()
    return backend, json.loads(p.stdout)


for phase in (['filesystem', 'search', 'finished'] if resume else ['untar', 'filesystem', 'search', 'finished']):
    deadline = time.monotonic() + 10800
    while True:
        with ThreadPoolExecutor(max_workers=3) as pool:
            states = dict(pool.map(lambda backend: observe(backend, phase), backends))
        assert not any(v['finished'] and not v['finished']['passed'] for v in states.values()), states
        if all(v['finished'] and v['finished']['passed'] for v in states.values()):
            break
        if all(v['ready'] for v in states.values()):
            break
        assert time.monotonic() < deadline, (phase, states)
        print(json.dumps({'waiting': phase, 'states': states, 'time': time.time()}), flush=True)
        time.sleep(10)
    if phase == 'finished':
        events.append({'phase': phase, 'time': time.time(), 'states': states})
        break
    target = time.time() + 15
    payload = json.dumps({'start_time': target}).encode()

    def release(backend):
        p = ssh(backend + '-client', 'cat > /srv/dfs/control/go-' + phase + '.tmp && mv /srv/dfs/control/go-' + phase + '.tmp /srv/dfs/control/go-' + phase + '.json', input=payload, capture_output=True)
        assert p.returncode == 0, p.stderr.decode()

    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(release, backends))
    events.append({'phase': phase, 'start_time': target, 'states': states})
    (ROOT / 'results/barriers.json').write_text(json.dumps(events, indent=2) + '\n')
    print(json.dumps(events[-1]), flush=True)
(ROOT / 'results/barriers.json').write_text(json.dumps(events, indent=2) + '\n')
print('All three clean benchmark suites passed', flush=True)
