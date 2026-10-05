import argparse
import collections
import gzip
import json
import pathlib
import statistics

parser = argparse.ArgumentParser()
parser.add_argument('directory', type=pathlib.Path)
args = parser.parse_args()
path = args.directory / 'memory.jsonl'
opener = open
if not path.exists():
    path = path.with_suffix('.jsonl.gz')
    opener = gzip.open
groups = collections.defaultdict(lambda: collections.defaultdict(list))
times = collections.defaultdict(list)
events = collections.defaultdict(collections.Counter)


def metrics(units):
    value = {
        'cgroup_bytes': sum(u['memory_current_bytes'] for u in units),
        'anonymous_bytes': sum(u['memory_stat'].get('anon', 0) for u in units),
        'file_cache_bytes': sum(u['memory_stat'].get('file', 0) for u in units),
        'mapped_file_bytes': sum(u['memory_stat'].get('file_mapped', 0) for u in units),
        'kernel_bytes': sum(u['memory_stat'].get('kernel', 0) for u in units),
    }
    if all('processes' in u for u in units):
        processes = [p for u in units for p in u['processes']]
        if processes:
            value.update({
                'rss_bytes': sum(p['smaps']['Rss'] for p in processes),
                'pss_bytes': sum(p['smaps']['Pss'] for p in processes),
                'private_dirty_bytes': sum(p['smaps']['Private_Dirty'] for p in processes),
            })
    return value


with opener(path, 'rt') as source:
    for line in source:
        row = json.loads(line)
        phase = row['phase']
        times[phase].append(row['monotonic'])
        units = {name: unit for name, unit in row['units'].items() if unit}
        for name, unit in units.items():
            for event, count in unit['memory_events'].items():
                events[phase][name + ':' + event] = max(events[phase][name + ':' + event], count)
        for name, selected in [*[(name, [unit]) for name, unit in units.items()], ('combined', list(units.values()))]:
            if selected:
                for field, value in metrics(selected).items():
                    groups[(phase, name)][field].append(value)

result = {'sampling_seconds': {'cgroup': .1, 'process': .5}, 'phases': []}
for phase, values in times.items():
    result['phases'].append({
        'phase': phase,
        'sampled_seconds': max(values) - min(values),
        'samples': len(values),
        'memory_events_max': dict(events[phase]),
        'units': {name: {field: {'median': statistics.median(samples), 'max': max(samples), 'samples': len(samples)} for field, samples in fields.items()} for (p, name), fields in groups.items() if p == phase},
    })
(args.directory / 'memory-summary.json').write_text(json.dumps(result, indent=2) + '\n')
