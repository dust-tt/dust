import argparse
import hashlib
import http.client
import json
import pathlib
import socket
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--experiment', choices=['tantivy-scale', 'tantivy-optimized'], default='tantivy-scale')
parser.add_argument('--dataset', choices=['count100k', 'bytes-large'], required=True)
parser.add_argument('--action', choices=['prepare', 'fixture', 'attach', 'baseline', 'tantivy', 'lance', 'stop'], required=True)
args = parser.parse_args()
assert socket.gethostname().split('.')[0] == 'dfs-tantivy-jd-20261002-server'
experiment = pathlib.Path('/home/dfs/x/jd/dfs')
source = experiment / 'runtime/tantivy-source'
run = experiment / 'runtime/scale' / args.dataset
output = source / 'results' / args.experiment / args.dataset
index_run = run if args.experiment == 'tantivy-scale' else experiment / 'runtime/optimized' / args.dataset
credentials = experiment / 'runtime/search-cloud/credentials'
binaries = experiment / ('runtime/scale/bin' if args.experiment == 'tantivy-scale' else 'runtime/optimized/bin')
phase = output / 'phase'
identities = json.loads((credentials / 'credentials.json').read_text())
admin = next(row for row in identities if row['subject'] == 'admin')
alice = next(row for row in identities if row['subject'] == 'alice' and row['tenant'] == admin['tenant'])
token = (credentials / 'admin.token').read_text().strip()
manifest = json.loads((run / 'corpus/manifest.json').read_text())


def command(argv, **kwargs):
    return subprocess.run([str(x) for x in argv], check=True, **kwargs)


def stage(name):
    phase.write_text(name + '\n')


def stop(unit):
    subprocess.run(['sudo', 'systemctl', 'stop', unit], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def launch(unit, memory, argv):
    command(['sudo', 'systemd-run', '--collect', '--unit=' + unit, '--uid=dfs', '--property=MemoryMax=' + memory, '--property=MemorySwapMax=0', '--property=TimeoutStopSec=90', '--setenv=RUST_LOG=info,tantivy=warn,dfs_search=warn', '--working-directory=' + str(source), *argv])


def dfs(action, value=None):
    argv = [binaries / 'dfsctl', '--endpoint', 'http://127.0.0.1:7453', '--token-file', credentials / 'admin.token', '--max-nodes', '200000', action]
    if value is not None:
        path = run / 'mutation.json'
        path.write_text(json.dumps(value))
        argv.extend(['--json', path])
    return json.loads(subprocess.check_output([str(x) for x in argv], text=True, timeout=60))


def start_source(search=False):
    stop('dfs-scale-source')
    command(['sudo', 'python3', '-c', "import os; os.sync(); open('/proc/sys/vm/drop_caches', 'w').write('3')"])
    argv = [binaries / 'dfsd', '--db', run / 'db', '--credentials', credentials / 'credentials.json', '--listen', '127.0.0.1:7453', '--max-nodes', '200000', '--tenant-bytes', str(32 << 30)]
    if search:
        argv.extend(['--search-index', index_run / 'tantivy-index', '--search-token-file', credentials / 'admin.token', '--search-listen', '127.0.0.1:7447'])
    launch('dfs-scale-source', '16G', argv)
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        try:
            return dfs('metrics')
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            time.sleep(.2)
    raise AssertionError('source did not start')


def ready(engine, timeout=1800):
    port, path = (7447, '/lexical/status') if engine == 'tantivy' else (7448, '/status')
    deadline = time.monotonic() + timeout
    observations = []
    while time.monotonic() < deadline:
        try:
            c = http.client.HTTPConnection('127.0.0.1', port, timeout=10)
            c.request('GET', path, headers={'Authorization': 'Bearer ' + token})
            r = c.getresponse()
            d = json.loads(r.read())
            c.close()
            cursor = d.get('indexed_through')
            head = d.get('source', {}).get('Head')
            observations.append({'time_ns': time.time_ns(), 'status': r.status, 'indexing_failed': d.get('indexing_failed'), 'indexed_head': cursor.get('head') if cursor else None})
            if r.status == 200 and cursor and head and cursor['head'] == head['head'] and cursor['incarnation'] == head['incarnation'] and not d['indexing_failed']:
                (output / (engine + '-readiness.json')).write_text(json.dumps(observations, indent=2) + '\n')
                return d
        except (OSError, http.client.HTTPException, ValueError):
            pass
        state = subprocess.check_output(['systemctl', 'show', 'dfs-scale-source' if engine == 'tantivy' else 'dfs-scale-lance', '-p', 'ActiveState', '--value'], text=True).strip()
        if state not in ['active', 'activating']:
            raise AssertionError(engine + ' service stopped: ' + state)
        time.sleep(1)
    (output / (engine + '-readiness.json')).write_text(json.dumps(observations, indent=2) + '\n')
    raise AssertionError(engine + ' indexing timed out')


output.mkdir(parents=True, exist_ok=True)
result = {'passed': False, 'dataset': args.dataset, 'action': args.action, 'files': len(manifest['paths']), 'source_bytes': sum(manifest['sizes'])}
try:
    if args.action == 'prepare':
        assert not (run / 'db').exists(), 'existing dataset database'
        binaries.mkdir(exist_ok=True)
        for name, target in [('dfsd', 'tantivy-target'), ('dfsctl', 'tantivy-target'), ('dfs-search', 'lance-target')]:
            command(['install', '-m', '755', experiment / 'runtime/data' / target / 'release' / name, binaries / name])
        stage('source_import')
        command(['sudo', 'systemd-run', '--collect', '--unit=dfs-scale-memory', '--working-directory=' + str(source), '/usr/bin/python3', source / 'lexical/scale-memory.py', '--phase-file', phase, '--output', output / 'memory.jsonl'])
        start_source()
        started = time.monotonic()
        with (output / 'import.json').open('w') as stream:
            command([binaries / 'dfsctl', '--endpoint', 'http://127.0.0.1:7453', '--token-file', credentials / 'admin.token', 'import', '--source', run / 'corpus/docs', '--name', 'corpus'], stdout=stream, timeout=1800)
        result['import_seconds'] = time.monotonic() - started
    if args.action in ['prepare', 'fixture']:
        stage('permission_setup')
        view = dfs('view')['nodes']
        corpus = next(row['node'] for row in view if row['node']['name'] == 'corpus')
        known = next(row['node'] for row in view if row['node']['name'] == 'doc_00007.txt')
        dfs('mutate', {'Member': {'group': 'scale-corpus', 'principal': alice['principal'], 'present': True}})
        dfs('mutate', {'Grant': {'node': corpus['id'], 'subject': 'scale-corpus', 'verbs': 13}})
        file_ids = {int(row['node']['name'][4:-4]): row['node']['id'] for row in view if row['node']['kind'] == 'File' and row['node']['name'].startswith('doc_') and row['node']['name'].endswith('.txt')}
        assert len(file_ids) == len(manifest['paths'])
        fixture = {'file_ids': file_ids, 'workspace': admin['tenant'], 'corpus_id': corpus['id'], 'known_node': known['id'], 'files': len(manifest['paths']), 'source_bytes': sum(manifest['sizes']), 'manifest_sha256': hashlib.sha256((run / 'corpus/manifest.json').read_bytes()).hexdigest()}
        (output / 'fixture.json').write_text(json.dumps(fixture, indent=2) + '\n')
        if args.action == 'prepare':
            stage('source_post_import_idle')
            time.sleep(20)
            stage('source_restart')
            start_source()
            stage('source_idle')
            time.sleep(20)
            result['metrics'] = dfs('metrics')
            stage('prepared')
    elif args.action == 'attach':
        assert args.experiment == 'tantivy-optimized'
        assert not (output / 'memory.jsonl').exists()
        binaries.mkdir(parents=True, exist_ok=True)
        for name in ['dfsd', 'dfsctl']:
            command(['install', '-m', '755', experiment / 'runtime/data/tantivy-target/release' / name, binaries / name])
        (output / 'fixture.json').write_bytes((source / 'results/tantivy-scale' / args.dataset / 'fixture.json').read_bytes())
        stage('source_cold_start')
        command(['sudo', 'systemd-run', '--collect', '--unit=dfs-scale-memory', '--working-directory=' + str(source), '/usr/bin/python3', source / 'lexical/scale-memory.py', '--phase-file', phase, '--output', output / 'memory.jsonl'])
        start_source()
        stage('source_baseline_idle')
        time.sleep(20)
        result['metrics'] = dfs('metrics')
        stage('prepared')
    elif args.action == 'baseline':
        stage('source_cold_start')
        start_source()
        stage('source_baseline_idle')
        time.sleep(20)
        result['metrics'] = dfs('metrics')
        stage('prepared')
    elif args.action in ['tantivy', 'lance']:
        engine = args.action
        assert not (index_run / (engine + '-index')).exists(), 'existing search index'
        stage(engine + '_index')
        started = time.monotonic()
        if engine == 'tantivy':
            start_source(search=True)
        else:
            start_source()
            launch('dfs-scale-lance', '40G', [binaries / 'dfs-search', '--dfs', 'http://127.0.0.1:7453', '--token-file', credentials / 'admin.token', '--index', index_run / 'lance-index', '--listen', '127.0.0.1:7448', '--poll-ms', '250'])
        status = ready(engine)
        result['index_seconds'] = time.monotonic() - started
        result['status'] = status
        if engine == 'tantivy':
            assert status['documents'] == len(manifest['paths'])
        else:
            published = json.loads((run / 'lance-index/manifest.json').read_text())
            assert sum(v == 'indexed' for v in published['content_status'].values()) == len(manifest['paths'])
        stage(engine + '_idle')
        time.sleep(20)
        stage(engine + '_ready')
    else:
        stage('complete')
        stop('dfs-scale-lance')
        stop('dfs-scale-source')
        stop('dfs-scale-memory')
    result['passed'] = True
finally:
    (output / (args.action + '-result.json')).write_text(json.dumps(result, indent=2) + '\n')
