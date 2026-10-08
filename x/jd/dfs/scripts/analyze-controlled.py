#!/usr/bin/env python3
import json
import pathlib
import statistics

root = pathlib.Path(__file__).resolve().parents[1] / 'results' / 'optimization'


def rows(path):
    result = {}
    for line in path.read_text().splitlines():
        cells = [cell.strip() for cell in line.split('|')[1:-1]]
        if len(cells) != 5 or cells[2] not in ('first', 'warm', 'once'):
            continue
        feature, workload, phase, milliseconds, status = cells
        assert status == 'OK', (path, cells)
        result[(feature, workload, phase)] = float(milliseconds.replace(',', ''))
    assert len(result) == 24, (path, len(result))
    return result


def matrix(directory, backends):
    assert (directory / 'completed.txt').read_text().strip() == 'success'
    result = {}
    for backend in backends:
        samples = [rows(directory / f'{number}-{backend}.txt') for number in range(1, 4)]
        assert all(sample.keys() == samples[0].keys() for sample in samples)
        result[backend] = [
            {'feature': feature, 'workload': workload, 'phase': phase,
             'milliseconds': [sample[(feature, workload, phase)] for sample in samples],
             'median_ms': statistics.median(sample[(feature, workload, phase)] for sample in samples)}
            for feature, workload, phase in samples[0]
        ]
        if backend == 'dfs':
            for number in range(1, 4):
                observation = json.loads((directory / f'{number}-dfs-rpcs.json').read_text())
                assert not any(observation['per_file_rpc_delta'].values())
    return result


report = {
    'aggregation': 'Median of three full benchmark runs; each warm cell is itself the median of three repeats. First means first measured invocation within that run, not cold storage.',
    'metadata_cache': matrix(root / 'equal-path', ['dfs', 'nfs', 'ext4', 'gcs-default', 'gcs-cached']),
    'read_path': matrix(root / 'read-path', ['dfs', 'nfs', 'ext4']),
    'adaptive': matrix(root / 'adaptive', ['dfs', 'nfs', 'ext4']),
    'directory_cache': matrix(root / 'directory-cache', ['dfs', 'nfs', 'ext4']),
    'diagnostics': {},
}
for directory in ('equal-path', 'read-path', 'adaptive', 'directory-cache'):
    for path in sorted((root / directory).glob('*-metadata-*.json')):
        data = json.loads(path.read_text())
        report['diagnostics'][str(path.relative_to(root))] = {
            'description': data['description'],
            'median_ms': statistics.median(sample['milliseconds'] for sample in data['samples']),
            'samples_ms': [sample['milliseconds'] for sample in data['samples']],
        }
print(json.dumps(report, indent=2))
