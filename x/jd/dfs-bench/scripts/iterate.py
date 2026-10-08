import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re
import shlex
import time
from fleet import ROOT, ssh

parser = argparse.ArgumentParser()
parser.add_argument('iteration')
parser.add_argument('--full', action='store_true')
parser.add_argument('--git', action='store_true')
parser.add_argument('--git-mode', choices=['full', 'external-gitdir'], default='full')
parser.add_argument('--git-commit')
args = parser.parse_args()
assert re.fullmatch(r'[a-z0-9-]{1,64}', args.iteration)
assert args.git_commit is None or re.fullmatch(r'[0-9a-f]{40}', args.git_commit)
backends = ['rocks', 'fdb', 'tikv']
out = ROOT / 'results/iterations' / args.iteration
out.mkdir(parents=True, exist_ok=False)
control = '/srv/dfs/control/iterations/' + args.iteration
remote_out = '/srv/dfs/evidence/iterations/' + args.iteration + '/client'
events = []


def command(role, command, **kwargs):
    result = ssh(role, command, capture_output=True, **kwargs)
    assert result.returncode == 0, (role, result.stderr.decode(), result.stdout.decode())
    return result.stdout


def start(backend):
    role = backend + '-client'
    command(role, 'test ! -e ' + shlex.quote(remote_out) + ' && ! mountpoint -q /srv/dfs/mount')
    script = 'git-client.py' if args.git else 'client.py'
    command(role, 'cat > /srv/dfs/scripts/client.py', input=(ROOT / 'scripts' / script).read_bytes())
    output = command(role, 'sudo systemd-run --unit dfs-benchmark-' + args.iteration + ' --uid dfs --property=MemoryMax=6G --property=MemorySwapMax=0 --setenv=LD_LIBRARY_PATH=/srv/dfs/lib --setenv=DFS_BENCH_ITERATION=' + args.iteration + ' --setenv=DFS_GIT_MODE=' + args.git_mode + ' --setenv=DFS_GIT_COMMIT=' + (args.git_commit or '') + ' --setenv=DFS_BENCH_UNTAR_ONLY=' + ('0' if args.full else '1') + ' python3 /srv/dfs/scripts/client.py')
    (out / (backend + '-start.log')).write_bytes(output)


def observe(backend, phase):
    code = 'import pathlib,json; p=pathlib.Path(' + repr(control) + '); print(json.dumps({"ready":(p/' + repr('ready-' + phase + '.json') + ').exists(),"finished":json.loads((p/"finished.json").read_text()) if (p/"finished.json").exists() else None}))'
    value = command(backend + '-client', 'python3 -c ' + shlex.quote(code))
    return backend, json.loads(value)


with ThreadPoolExecutor(max_workers=3) as pool:
    list(pool.map(start, backends))

try:
    for phase in (['clone', 'search', 'finished'] if args.git else ['untar', 'filesystem', 'search', 'finished'] if args.full else ['untar', 'finished']):
        deadline = time.monotonic() + 3600
        while True:
            with ThreadPoolExecutor(max_workers=3) as pool:
                states = dict(pool.map(lambda backend: observe(backend, phase), backends))
            assert not any(v['finished'] and not v['finished']['passed'] for v in states.values()), states
            if all(v['finished'] and v['finished']['passed'] for v in states.values()):
                break
            if phase != 'finished' and all(v['ready'] for v in states.values()):
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
            path = control + '/go-' + phase
            command(backend + '-client', 'cat > ' + path + '.tmp && mv ' + path + '.tmp ' + path + '.json', input=payload)

        with ThreadPoolExecutor(max_workers=3) as pool:
            list(pool.map(release, backends))
        events.append({'phase': phase, 'start_time': target, 'states': states})
        (out / 'barriers.json').write_text(json.dumps(events, indent=2) + '\n')
        print(json.dumps(events[-1]), flush=True)
except BaseException:
    def stop(backend):
        result = ssh(backend + '-client', 'sudo systemctl stop dfs-benchmark-' + args.iteration, capture_output=True)
        (out / (backend + '-stop.log')).write_bytes(result.stdout + result.stderr)
    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(stop, backends))
    raise
finally:
    (out / 'barriers.json').write_text(json.dumps(events, indent=2) + '\n')
    for backend in backends:
        result = ssh(backend + '-client', 'tar -czf - -C ' + remote_out + ' .', capture_output=True)
        (out / (backend + '.tar.gz')).write_bytes(result.stdout)
        (out / (backend + '-collection.log')).write_bytes(result.stderr)
        value = ssh(backend + '-client', 'cat ' + remote_out + '/result.json', capture_output=True)
        if value.returncode == 0:
            (out / (backend + '.json')).write_bytes(value.stdout)
            print(backend, value.stdout.decode(), flush=True)
