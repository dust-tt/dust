import argparse
import json
import pathlib

parser = argparse.ArgumentParser()
parser.add_argument('directory', type=pathlib.Path)
args = parser.parse_args()
result = {'datasets': {}, 'validated_timed_samples': 0}
for dataset in ['count100k', 'bytes-large']:
    directory = args.directory / dataset
    fixture = json.loads((directory / 'fixture.json').read_text())
    memory = json.loads((directory / 'memory-summary.json').read_text())
    assert all(count == 0 for phase in memory['phases'] for key, count in phase['memory_events_max'].items() if key.endswith((':oom', ':oom_kill')))
    value = {'files': fixture['files'], 'source_bytes': fixture['source_bytes'], 'manifest_sha256': fixture['manifest_sha256'], 'engines': {}}
    for engine in ['tantivy', 'lance']:
        build = directory / (engine + '-result.json')
        if not build.exists():
            build = directory / (engine + '.json')
        build = json.loads(build.read_text())
        assert build['passed']
        measured = {}
        for name in ['matrix', 'load-4', 'load-8']:
            run = json.loads((directory / (engine + '-' + name + '.json')).read_text())
            assert run['passed'] and run['manifest_sha256'] == fixture['manifest_sha256']
            result['validated_timed_samples'] += len(run['samples'])
            measured[name] = {k: v for k, v in run.items() if k != 'samples'}
        measured['cold_start_and_build_seconds'] = build['index_seconds']
        measured['memory'] = {phase['phase']: phase for phase in memory['phases'] if phase['phase'].startswith(engine + '_')}
        value['engines'][engine] = measured
    value['dfs_baseline_memory'] = next(p for p in memory['phases'] if p['phase'] == 'source_baseline_idle')
    value['tantivy_live'] = json.loads((directory / 'tantivy-live.json').read_text())
    assert value['tantivy_live']['passed']
    result['datasets'][dataset] = value
(args.directory / 'comparison.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'validated_timed_samples': result['validated_timed_samples'], 'datasets': list(result['datasets'])}))
