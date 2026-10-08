#!/usr/bin/env python3
import argparse
import json
import pathlib
import statistics

parser = argparse.ArgumentParser()
parser.add_argument('directory', type=pathlib.Path)
args = parser.parse_args()
groups = {}
for path in sorted(args.directory.glob('*.json')):
    run = json.loads(path.read_text())
    if not isinstance(run, dict) or not {'backend', 'workload', 'round', 'mount_ready_ms'} <= run.keys():
        continue
    key = (run['workload'], run['backend'])
    sample = {'round': run['round'], 'mount_ready_ms': run['mount_ready_ms'], 'mount_and_workload_ms': run['mount_and_workload_ms']}
    if run['workload'] == 'full':
        sample['rows'] = []
        for line in path.with_suffix('.txt').read_text().splitlines():
            cells = [c.strip() for c in line.split('|')[1:-1]]
            if len(cells) == 5 and cells[2] in ['first', 'warm', 'once']:
                assert cells[4] == 'OK'
                sample['rows'].append({'feature': cells[0], 'workload': cells[1], 'phase': cells[2], 'time_ms': float(cells[3].replace(',', ''))})
        assert len(sample['rows']) == 24
    else:
        probe = json.loads(path.with_suffix('.probe.json').read_text())
        sample['rows'] = probe['rows']
        sample['startup_plus_first_ms'] = run['mount_ready_ms'] + probe['rows'][0]['time_ms']
    if 'after' in run:
        assert run['before']['cache_bytes'] == 0
        assert run['before']['counters']['data_calls'] == 0
        assert run['after']['cache_bytes'] <= run['cache_budget_bytes']
        sample['startup_received_bytes'] = run['before']['counters']['received_bytes']
        sample['total_received_bytes'] = run['after']['counters']['received_bytes']
        sample['data_calls'] = run['after']['counters']['data_calls']
        sample['cache_bytes'] = run['after']['cache_bytes']
        sample['reads'] = run['after'].get('reads')
        sample['daemon_peak_rss_kib'] = int(next(line for line in run['daemon_status'].splitlines() if line.startswith('VmHWM:')).split()[1])
    groups.setdefault(key, []).append(sample)
output = []
for (workload, backend), samples in sorted(groups.items()):
    rows = []
    for index, row in enumerate(samples[0]['rows']):
        times = [s['rows'][index]['time_ms'] for s in samples]
        rows.append({**{k: v for k, v in row.items() if k != 'time_ms'}, 'median_ms': statistics.median(times), 'min_ms': min(times), 'max_ms': max(times)})
    output.append({'workload': workload, 'backend': backend, 'runs': len(samples), 'mount_ready_median_ms': statistics.median(s['mount_ready_ms'] for s in samples), 'rows': rows, 'samples': samples})
print(json.dumps(output, indent=2))
