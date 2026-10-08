import argparse
import json
import pathlib

parser = argparse.ArgumentParser()
parser.add_argument('baseline', type=pathlib.Path)
parser.add_argument('optimized', type=pathlib.Path)
args = parser.parse_args()
result = {'datasets': {}, 'validated_optimized_timed_samples': 0}
for dataset in ['count100k', 'bytes-large']:
    value = {}
    for name, root in [('baseline', args.baseline), ('optimized', args.optimized)]:
        directory = root / dataset
        fixture = json.loads((directory / 'fixture.json').read_text())
        memory = json.loads((directory / 'memory-summary.json').read_text())
        assert all(count == 0 for phase in memory['phases'] for key, count in phase['memory_events_max'].items() if key.endswith((':oom', ':oom_kill')))
        build = directory / 'tantivy-result.json'
        if not build.exists():
            build = directory / 'tantivy.json'
        build = json.loads(build.read_text())
        assert build['passed']
        measured = {key: fixture[key] for key in ['files', 'source_bytes', 'manifest_sha256']}
        for mode in ['matrix', 'load-4', 'load-8']:
            run = json.loads((directory / ('tantivy-' + mode + '.json')).read_text())
            assert run['passed'] and run['manifest_sha256'] == fixture['manifest_sha256']
            if name == 'optimized':
                result['validated_optimized_timed_samples'] += len(run['samples'])
                assert run['harness_sha256'] == value['baseline'][mode]['harness_sha256']
            measured[mode] = {key: item for key, item in run.items() if key != 'samples'}
        measured['cold_start_and_build_seconds'] = build['index_seconds']
        measured['memory'] = {phase['phase']: phase for phase in memory['phases'] if phase['phase'].startswith(('tantivy_', 'source_baseline_'))}
        measured['live'] = json.loads((directory / 'tantivy-live.json').read_text())
        assert measured['live']['passed']
        value[name] = measured
    for key in ['files', 'source_bytes', 'manifest_sha256']:
        assert value['baseline'][key] == value['optimized'][key]
    result['datasets'][dataset] = value
assert result['validated_optimized_timed_samples'] == 52_080
(args.optimized / 'comparison.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'validated_optimized_timed_samples': result['validated_optimized_timed_samples'], 'datasets': list(result['datasets'])}))
