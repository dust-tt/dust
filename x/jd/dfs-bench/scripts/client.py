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

resume = sys.argv[1:] == ['--resume-after-untar']
iteration = os.environ.get('DFS_BENCH_ITERATION')
untar_only = os.environ.get('DFS_BENCH_UNTAR_ONLY') == '1'
assert iteration is None or re.fullmatch(r'[a-z0-9-]{1,64}', iteration)
base = Path('/srv/dfs')
out = base / ('evidence/iterations/' + iteration + '/client' if iteration else 'evidence/client')
out.mkdir(parents=True, exist_ok=resume)
settings = json.loads((base / 'config/client.json').read_text())
backend = settings['backend']
token = (base / 'config/admin.token').read_text().strip()
mount = base / 'mount'
mount.mkdir(exist_ok=True)
control = base / ('control/iterations/' + iteration if iteration else 'control')
control.mkdir(parents=True, exist_ok=True)
env = os.environ | {'LD_LIBRARY_PATH': str(base / 'lib')}
result = json.loads((out / 'result.json').read_text()) if resume else {'backend': backend, 'passed': False, 'phases': {}, 'settings': settings}
if resume:
    assert result['untar']['all_hashes_verified']
    manifest = json.loads((base / 'corpus/manifest.json').read_text())
    destination = mount / 'files/corpus'
    result['resumed_after_untar'] = {'time': time.time(), 'reason': 'Extend index catch-up deadline; backend code and recorded extraction unchanged'}
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


def index_ready(name):
    started = time.monotonic()
    last = None
    while time.monotonic() - started < 7200:
        c = connection()
        try:
            reply = query(c, 'documents', {'query': {'type': 'substring', 'value': 'BENCH_RARE_NEEDLE'}, 'k': 10, 'include_text': True})
            if not reply['dfs']['incomplete'] and len(reply['rows']) == 4:
                assert all('BENCH_RARE_NEEDLE' in row['text'] for row in reply['rows'])
                result[name] = {'wait_ms': (time.monotonic() - started) * 1000, 'response': reply['dfs']}
                return
            last = reply['dfs']
        except Exception as error:
            last = repr(error)
        finally:
            c.close()
        time.sleep(1)
    raise RuntimeError('index readiness deadline: ' + repr(last))


try:
    if not resume:
        if not (base / 'corpus/manifest.json').exists():
            run(['python3', base / 'vendor/generate.py', base / 'corpus', '--seed', '42'])
        manifest = json.loads((base / 'corpus/manifest.json').read_text())
        result['manifest_sha256'] = hashlib.sha256((base / 'corpus/manifest.json').read_bytes()).hexdigest()
        result['files'] = len(manifest['paths'])
        result['document_bytes'] = sum(manifest['sizes'])
        for relative, size, digest in zip(manifest['paths'], manifest['sizes'], manifest['sha256'], strict=True):
            data = (base / 'corpus/docs' / relative).read_bytes()
            assert len(data) == size and hashlib.sha256(data).hexdigest() == digest
        run(['tar', '-cf', base / 'corpus.tar', '-C', base / 'corpus', '.'])
        start_mount('untar')
        destination = mount / 'files/corpus'
        destination.mkdir(exist_ok=True)
        assert not list(destination.iterdir()), "untar destination must be empty"
        ready('untar')
        started = time.perf_counter_ns()
        with (out / 'untar.log').open('wb') as log:
            run(['tar', '--no-same-owner', '-xf', base / 'corpus.tar', '-C', destination], stdout=log, stderr=log, timeout=7200)
        extraction_ms = (time.perf_counter_ns() - started) / 1e6
        result['untar'] = {'extraction_ms': extraction_ms, 'all_hashes_verified': False}
        save(out / 'result.json', result)
        paths = [destination / 'manifest.json', *[destination / 'docs' / p for p in manifest['paths']]]
        started = time.perf_counter_ns()
        for path in paths:
            descriptor = os.open(path, os.O_RDONLY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
        fsync_ms = (time.perf_counter_ns() - started) / 1e6
        result['untar'].update({'open_fsync_close_all_files_ms': fsync_ms, 'extraction_plus_sync_ms': extraction_ms + fsync_ms})
        save(out / 'result.json', result)
        for relative, size, digest in zip(manifest['paths'], manifest['sizes'], manifest['sha256'], strict=True):
            data = (destination / 'docs' / relative).read_bytes()
            assert len(data) == size and hashlib.sha256(data).hexdigest() == digest, relative
        result['untar'] = {'extraction_ms': extraction_ms, 'extraction_plus_sync_ms': extraction_ms + fsync_ms, 'open_fsync_close_all_files_ms': fsync_ms, 'file_count_including_manifest': len(paths), 'all_hashes_verified': True}
        result['phases']['untar']['end_time'] = time.time()
        stop_mount()
        save(out / 'result.json', result)
    if untar_only:
        start_mount('read-admission-check')
        check = subprocess.run(['rg', '--threads', '32', '-F', 'NEVER_PRESENT_ZQJX_82649', str(destination / 'docs')], env=env, capture_output=True, timeout=600)
        (out / 'read-admission-check.stderr').write_bytes(check.stderr)
        assert check.returncode == 1 and not check.stdout and not check.stderr, 'concurrent read regression failed'
        stop_mount()
        result['read_admission_check'] = {'passed': True, 'threads': 32, 'outside_timed_extraction': True}
        save(out / 'result.json', result)
    index_ready('index_after_untar')
    if not untar_only:
        start_mount('filesystem')
        ready('filesystem')
        with (out / 'workloads.log').open('wb') as log:
            run(['python3', base / 'scripts/workloads.py', '--vendor', base / 'vendor', '--root', destination, '--output', out / 'workloads.json', '--backend', backend, '--warm-runs', str(settings['warm_runs'])], stdout=log, stderr=log, timeout=3600)
        found = {str(p.relative_to(destination / 'docs')): p.stat().st_size for p in (destination / 'docs').rglob('*') if p.is_file()}
        assert found == dict(zip(manifest['paths'], manifest['sizes'], strict=True))
        assert not list(destination.rglob('.vfs-benchmark-*'))
        result['phases']['filesystem']['end_time'] = time.time()
        stop_mount()
        save(out / 'result.json', result)
        index_ready('index_after_filesystem')
        ready('search')
        cases = [
            ('exact basename', 'nodes', {'type': 'exact', 'value': 'doc_00007.txt'}, 1),
            ('basename prefix', 'nodes', {'type': 'prefix', 'value': 'doc_0000'}, 10),
            ('rare literal', 'documents', {'type': 'substring', 'value': 'BENCH_RARE_NEEDLE'}, 4),
            ('absent literal', 'documents', {'type': 'substring', 'value': 'NEVER_PRESENT_ZQJX_82649'}, 0),
            ('rare terms', 'documents', {'type': 'match', 'terms': 'BENCH_RARE_NEEDLE'}, 4),
            ('common phrase top 10', 'documents', {'type': 'phrase', 'terms': 'Lorem ipsum'}, 10),
        ]
        rows = []
        c = connection()
        try:
            for label, table, q, expected in cases:
                samples = []
                for repeat in range(settings['search_repeats'] + 1):
                    request = {'query': q, 'k': 10, 'kind': 'file', 'include_text': table == 'documents'}
                    started = time.perf_counter_ns()
                    reply = query(c, table, request)
                    samples.append((time.perf_counter_ns() - started) / 1e6)
                    assert not reply['dfs']['incomplete'], (label, reply['dfs'])
                    assert len(reply['rows']) == expected, (label, len(reply['rows']))
                    if label == 'rare literal':
                        assert {re.search(r'ticket: (TKT-\d+)', r['text']).group(1) for r in reply['rows']} == {'TKT-00007', 'TKT-00997', 'TKT-05003', 'TKT-09991'}
                        assert all('BENCH_RARE_NEEDLE' in r['text'] for r in reply['rows'])
                rows.append({'workload': label, 'first_ms': samples[0], 'warm_median_ms': statistics.median(samples[1:]), 'samples_ms': samples, 'expected_hits': expected})
                save(out / 'search.json', {'passed': False, 'rows': rows})
        finally:
            c.close()
        save(out / 'search.json', {'passed': True, 'rows': rows})
        result['phases']['search']['end_time'] = time.time()
    group = next(line.split(':', 2)[2] for line in Path('/proc/self/cgroup').read_text().splitlines() if line.startswith('0::'))
    cg = Path('/sys/fs/cgroup') / group.lstrip('/')
    result['resources_scope'] = 'post-untar resumed phases' if resume else 'all phases'
    result['resources'] = {name: (cg / name).read_text() for name in ['memory.current', 'memory.peak', 'memory.max', 'memory.swap.max', 'cpu.stat', 'cpuset.cpus.effective']}
    result['scope'] = 'untar, durability, hashes, index catch-up' if untar_only else 'untar, filesystem, search'
    result['iteration'] = iteration
    result['passed'] = True
except BaseException as error:
    result['error'] = repr(error)
    raise
finally:
    stop_mount(strict=False)
    save(out / 'result.json', result)
    save(control / 'finished.json', {'passed': result['passed'], 'time': time.time()})
