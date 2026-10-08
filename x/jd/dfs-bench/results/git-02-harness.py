import hashlib
import http.client
import json
import os
import re
from pathlib import Path
import signal
import sys
import ssl
import statistics
import subprocess
import time

iteration = os.environ.get('DFS_BENCH_ITERATION')
git_mode = os.environ.get('DFS_GIT_MODE', 'full')
target_commit = os.environ.get('DFS_GIT_COMMIT', '')
assert git_mode in ('full', 'external-gitdir')
assert not target_commit or re.fullmatch('[0-9a-f]{40}', target_commit)
assert iteration is None or re.fullmatch(r'[a-z0-9-]{1,64}', iteration)
base = Path('/srv/dfs')
out = base / ('evidence/iterations/' + iteration + '/client' if iteration else 'evidence/client')
out.mkdir(parents=True, exist_ok=False)
settings = json.loads((base / 'config/client.json').read_text())
backend = settings['backend']
token = (base / 'config/admin.token').read_text().strip()
mount = base / 'mount'
mount.mkdir(exist_ok=True)
control = base / ('control/iterations/' + iteration if iteration else 'control')
control.mkdir(parents=True, exist_ok=True)
env = os.environ | {'LD_LIBRARY_PATH': str(base / 'lib')}
result = {'backend': backend, 'passed': False, 'phases': {}, 'settings': settings, 'git_mode': git_mode}
process = None
mount_log = None
current_mount = None


def interrupted(signum, frame):
    raise SystemExit('benchmark interrupted by signal ' + str(signum))


signal.signal(signal.SIGTERM, interrupted)


def save(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.replace(path)


def run(command, **kwargs):
    return subprocess.run(list(map(str, command)), env=env, check=True, **kwargs)


def ready(phase):
    save(control / ('ready-' + phase + '.json'), {'time': time.time(), 'backend': backend})
    path = control / ('go-' + phase + '.json')
    deadline = time.monotonic() + 7200
    while not path.exists():
        assert time.monotonic() < deadline, 'phase barrier deadline: ' + phase
        time.sleep(.2)
    target = json.loads(path.read_text())['start_time']
    while time.time() < target:
        time.sleep(max(0, min(.05, target - time.time())))
    result['phases'][phase] = {'target_start_time': target, 'actual_start_time': time.time()}
    save(out / 'result.json', result)


def start_mount(name):
    global process, mount_log, current_mount
    current_mount = name
    mount_log = (out / (name + '-mount.log')).open('wb')
    command = [base / ('bin/mount-' + backend), '--endpoint', settings['endpoint'], '--token-file', base / 'config/admin.token', '--ca', base / 'config/ca.crt', '--mountpoint', mount, '--content-cache-bytes', str(settings['content_cache_bytes']), '--metrics-file', out / (name + '-mount-metrics.json')]
    if backend == 'rocks':
        command += ['--read-concurrency', str(settings.get('read_concurrency', 8))]
    else:
        assert settings.get('read_concurrency', 8) == 8, 'distributed mounts use their default eight admitted reads'
    result[name + '_mount_command'] = list(map(str, command))
    started = time.monotonic()
    process = subprocess.Popen(list(map(str, command)), env=env, stdout=mount_log, stderr=mount_log)
    while not os.path.ismount(mount):
        assert process.poll() is None, 'mount exited'
        assert time.monotonic() - started < 600, 'mount readiness deadline'
        time.sleep(.05)
    result[name + '_mount_startup_ms'] = (time.monotonic() - started) * 1000


def stop_mount(strict=True):
    global process, mount_log
    if process is None:
        return
    if process.poll() is None:
        process.send_signal(signal.SIGTERM)
    try:
        code = process.wait(timeout=60)
    except subprocess.TimeoutExpired:
        process.kill()
        code = process.wait()
    if os.path.ismount(mount):
        run(['fusermount3', '-uz', mount])
    result[current_mount + '_unmount'] = {'exit_code': code, 'unmounted': not os.path.ismount(mount)}
    process = None
    mount_log.close()
    if strict:
        assert code == 0


def query(connection, table, request):
    connection.request('POST', '/v1/workspaces/bench/lexical/' + table + '/query', body=json.dumps(request), headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    response = connection.getresponse()
    body = response.read()
    assert response.status == 200, (response.status, body[:500])
    return json.loads(body)


def connection():
    return http.client.HTTPSConnection(settings['search_host'], settings['search_port'], context=ssl.create_default_context(cafile=str(base / 'config/ca.crt')), timeout=60)


def timed_process(command, cwd, label, timeout_seconds=1800):
    started_ns = time.perf_counter_ns()
    with (out / (label + '.stdout')).open('wb') as stdout, (out / (label + '.stderr')).open('wb') as stderr:
        child = subprocess.Popen(list(map(str, command)), cwd=cwd, env=env, stdout=stdout, stderr=stderr, start_new_session=True)
        try:
            code = child.wait(timeout=timeout_seconds)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGTERM)
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait()
            code = 124
    return {'command': list(map(str, command)), 'exit_code': code, 'elapsed_ms': (time.perf_counter_ns() - started_ns) / 1e6}


def scan(command, cwd):
    started_ns = time.perf_counter_ns()
    completed = subprocess.run(command, cwd=cwd, env=env, capture_output=True, timeout=600)
    elapsed_ms = (time.perf_counter_ns() - started_ns) / 1e6
    assert completed.returncode in (0, 1) and not completed.stderr, (command, completed.returncode, completed.stderr[:500])
    lines = sorted(completed.stdout.splitlines())
    return elapsed_ms, {'exit_code': completed.returncode, 'lines': len(lines), 'sha256': hashlib.sha256(b'\n'.join(lines)).hexdigest()}


def index_caught_up():
    started_seconds = time.monotonic()
    last = None
    while time.monotonic() - started_seconds < 1800:
        c = connection()
        try:
            reply = query(c, 'documents', {'query': {'type': 'substring', 'value': 'useEffect'}, 'k': 10, 'include_text': True})
            last = reply['dfs']
            if not last['incomplete'] and last['indexed_through'] == last.get('source_head', last['indexed_through']) and len(reply['rows']) == 10:
                assert all('useEffect' in row['text'] for row in reply['rows'])
                return {'wait_ms': (time.monotonic() - started_seconds) * 1000, 'checkpoint': last}
        except Exception as error:
            last = repr(error)
        finally:
            c.close()
        time.sleep(1)
    raise RuntimeError('index catch-up deadline: ' + repr(last))


try:
    result['scope'] = 'full GitHub clone attempt, validated checkout search when successful' if git_mode == 'full' else 'full GitHub clone with native-SSD Git database, FUSE working tree and symlink placeholders'
    result['source_url_requested'] = 'git@github.com:dust-tt/dust'
    result['source_url_used'] = 'https://github.com/dust-tt/dust.git'
    result['transport_reason'] = 'Benchmark hosts have no GitHub SSH identity; public HTTPS reaches the same repository without copying credentials.'
    result['git_version'] = subprocess.check_output(['git', '--version'], text=True).strip()
    env = env | {'GIT_TERMINAL_PROMPT': '0', 'GIT_TRACE2_EVENT': str(out / 'git-trace.jsonl')}
    start_mount('clone')
    destination = mount / 'files/dust'
    assert not destination.exists()
    clone_command = ['git', 'clone']
    if git_mode == 'external-gitdir':
        clone_command += ['--separate-git-dir', str(base / ('git-metadata-' + iteration)), '-c', 'core.symlinks=false']
    if target_commit:
        clone_command += ['--no-checkout']
    clone_command += [result['source_url_used'], str(destination)]
    ready('clone')
    clone_started_ns = time.perf_counter_ns()
    result['clone'] = timed_process(clone_command, base, 'clone')
    if target_commit and result['clone']['exit_code'] == 0:
        result['transfer'] = result['clone'].copy()
        result['checkout'] = timed_process(['git', '-C', destination, 'checkout', '--detach', target_commit], base, 'checkout')
        result['clone']['exit_code'] = result['checkout']['exit_code']
        result['clone']['elapsed_ms'] = (time.perf_counter_ns() - clone_started_ns) / 1e6
        result['clone']['checkout_command'] = result['checkout']['command']
    result['clone']['successful'] = result['clone']['exit_code'] == 0
    result['phases']['clone']['end_time'] = time.time()
    save(out / 'result.json', result)
    if not result['clone']['successful']:
        stop_mount()
        ready('search')
        result['search'] = {'skipped': True, 'reason': 'Clone failed; an incomplete checkout is not a valid search corpus.'}
    else:
        commit = subprocess.check_output(['git', '-C', destination, 'rev-parse', 'HEAD'], env=env, text=True).strip()
        assert re.fullmatch('[0-9a-f]{40}', commit)
        assert not target_commit or commit == target_commit
        result['commit'] = commit
        started_ns = time.perf_counter_ns()
        synced = 0
        for directory, dirs, files in os.walk(destination):
            for name in files:
                path = Path(directory) / name
                if path.is_symlink():
                    continue
                fd = os.open(path, os.O_RDONLY)
                try:
                    os.fsync(fd)
                finally:
                    os.close(fd)
                synced += 1
        result['durability'] = {'open_fsync_close_ms': (time.perf_counter_ns() - started_ns) / 1e6, 'files': synced}
        result['git_status'] = timed_process(['git', 'status', '--porcelain'], destination, 'git-status', 600)
        assert result['git_status']['exit_code'] == 0 and not (out / 'git-status.stdout').read_bytes()
        stop_mount()
        reference = base / ('git-reference-' + iteration)
        run(['git', 'init', reference], stdout=subprocess.DEVNULL)
        if git_mode == 'external-gitdir':
            run(['git', '-C', reference, 'config', 'core.symlinks', 'false'])
        run(['git', '-C', reference, 'fetch', '--depth=1', result['source_url_used'], commit], stdout=subprocess.DEVNULL, stderr=(out / 'reference-fetch.log').open('wb'), timeout=1200)
        run(['git', '-C', reference, 'checkout', '--detach', 'FETCH_HEAD'], stdout=subprocess.DEVNULL, stderr=(out / 'reference-checkout.log').open('wb'))
        commands = [
            ('rg --files', ['rg', '--files']),
            ('rg absent literal', ['rg', '-l', '-F', 'DFS_ABSENT_40b5c32e5ff649f18005']),
            ('rg useEffect', ['rg', '-l', '-F', 'useEffect']),
            ('rg repository literal', ['rg', '-l', '-F', 'dust-tt/dust']),
            ('rg TSX useEffect', ['rg', '-l', '-F', '-g', '*.tsx', 'useEffect']),
            ('rg front subtree', ['rg', '-l', '-F', 'useEffect', 'front']),
        ]
        expected = {label: scan(command, reference)[1] for label, command in commands}
        assert expected['rg useEffect']['lines'] >= 10 and expected['rg repository literal']['lines'] >= 10
        result['index_readiness'] = index_caught_up()
        start_mount('search')
        ready('search')
        rows = []
        for label, command in commands:
            samples = []
            for repeat in range(4):
                elapsed_ms, actual = scan(command, destination)
                assert actual == expected[label], (label, actual, expected[label])
                samples.append(elapsed_ms)
            rows.append({'workload': label, 'first_ms': samples[0], 'warm_median_ms': statistics.median(samples[1:]), 'samples_ms': samples, 'validated': expected[label]})
        result['search'] = {'passed': True, 'rows': rows}
        indexed_rows = []
        c = connection()
        try:
            for literal, expected_hits in [('useEffect', 10), ('dust-tt/dust', 10), ('DFS_ABSENT_40b5c32e5ff649f18005', 0)]:
                samples = []
                for repeat in range(11):
                    started_ns = time.perf_counter_ns()
                    reply = query(c, 'documents', {'query': {'type': 'substring', 'value': literal}, 'k': 10, 'include_text': True})
                    samples.append((time.perf_counter_ns() - started_ns) / 1e6)
                    assert not reply['dfs']['incomplete'] and len(reply['rows']) == expected_hits, (literal, reply['dfs'], len(reply['rows']))
                    assert all(literal in row['text'] for row in reply['rows'])
                indexed_rows.append({'literal': literal, 'expected_hits': expected_hits, 'first_ms': samples[0], 'warm_median_ms': statistics.median(samples[1:]), 'samples_ms': samples})
        finally:
            c.close()
        result['indexed_search'] = {'passed': True, 'rows': indexed_rows}
        tracked = subprocess.check_output(['git', '-C', reference, 'ls-files', '-z']).split(b'\x00')
        digest = hashlib.sha256()
        count = 0
        total_bytes = 0
        for raw in tracked:
            if not raw:
                continue
            relative = os.fsdecode(raw)
            source, target = reference / relative, destination / relative
            if source.is_symlink():
                assert target.is_symlink() and os.readlink(source) == os.readlink(target), relative
                continue
            if not source.is_file():
                continue
            content = source.read_bytes()
            expected_digest = hashlib.sha256(content).digest()
            assert hashlib.sha256(target.read_bytes()).digest() == expected_digest, relative
            digest.update(raw + b'\x00' + expected_digest)
            count += 1
            total_bytes += len(content)
        result['checkout_validation'] = {'regular_files': count, 'bytes': total_bytes, 'manifest_sha256': digest.hexdigest(), 'passed': True}
        stop_mount()
    result['phases']['search']['end_time'] = time.time()
    result['iteration'] = iteration
    result['passed'] = True
except BaseException as error:
    result['error'] = repr(error)
    raise
finally:
    stop_mount(strict=False)
    save(out / 'result.json', result)
    save(control / 'finished.json', {'passed': result['passed'], 'time': time.time()})
