import argparse
import collections
import json
import math
from pathlib import Path
import re
import statistics

parser = argparse.ArgumentParser()
parser.add_argument('root', type=Path)
parser.add_argument('--before-subtree', choices=['all', 'deeper'], default='all')
parser.add_argument('--after-subtree', choices=['deeper', 'none'], default='deeper')
args = parser.parse_args()
root = args.root
groups = collections.defaultdict(list)
totals = collections.Counter()
cells = []

def quantile(values, fraction):
    return sorted(values)[math.ceil((len(values) - 1) * fraction)]

for cell in sorted((root / 'cells').iterdir()):
    match = re.fullmatch(r'(rocks|slate)-(before|after)-(lateral|deeper)-round-([123])', cell.name)
    if not match:
        continue
    backend, variant, shape, round_number = match.groups()
    assert (cell / 'complete').is_file(), cell.name
    summary = json.loads((cell / 'summary.json').read_text())
    report = json.loads((cell / 'samples.json').read_text())
    assert summary['passed'] and report['complete'], cell.name
    assert report['args']['repetitions'] == 30 and report['args']['rounds'] == 1
    for sample in report['samples']:
        totals[sample['role']] += 1
    rows = list(summary['rows'])
    if shape == 'deeper':
        timings = {}
        for line in (cell / 'benchmark-server.log').read_text().splitlines():
            record = json.loads(line)
            if record.get('target') == 'dfs_rename_bench':
                timings[record['fields']['request_id']] = record['fields']
        for condition in ['solo', 'with_writer']:
            samples = [sample for sample in report['samples'] if sample['case'] == 'directory-10000-files-cross-parent' and sample['role'] == 'rename' and sample['condition'] == condition]
            assert len(samples) == 30
            for parity, direction in [(0, 'deeper'), (1, 'shallower')]:
                selected = samples[parity::2]
                row = {'case': f'directory-10000-files-move-{direction}', 'condition': condition, 'role': 'rename', 'samples': len(selected)}
                for metric, fraction in [('p50_ms', .5), ('p99_ms', .99), ('max_ms', 1)]:
                    row[metric] = quantile([sample['latency_us'] for sample in selected], fraction) / 1000
                row['absolute_max_ms'] = row['max_ms']
                for field in ['writer_wait_us', 'writer_held_us', 'subtree_check_us', 'publish_us', 'subtree_nodes']:
                    row[field] = statistics.median(timings[sample['request_id']][field] for sample in selected)
                traversal = args.before_subtree if variant == 'before' else args.after_subtree
                expected_nodes = 10001 if traversal == 'all' or (traversal == 'deeper' and direction == 'deeper') else 0
                assert all(timings[sample['request_id']]['subtree_nodes'] == expected_nodes for sample in selected)
                row['subtree_share_of_lock_percent'] = statistics.median(100 * timings[sample['request_id']]['subtree_check_us'] / max(1, timings[sample['request_id']]['writer_held_us']) for sample in selected)
                rows.append(row)
    for row in rows:
        key = backend, variant, shape, row['case'], row['condition'], row['role']
        groups[key].append((int(round_number), row))
    cells.append({'name': cell.name, 'recovery_nodes': summary['recovery_nodes']})

assert len(cells) == 24, len(cells)
rows = []
for key, batches in sorted(groups.items()):
    assert sorted(round_number for round_number, _ in batches) == [1, 2, 3], key
    row = dict(zip(['backend', 'variant', 'shape', 'case', 'condition', 'role'], key))
    row['samples'] = sum(batch['samples'] for _, batch in batches)
    for metric in ['p50_ms', 'p99_ms', 'max_ms', 'writer_wait_us', 'writer_held_us', 'subtree_check_us', 'publish_us', 'subtree_nodes', 'subtree_share_of_lock_percent']:
        if metric in batches[0][1]:
            row[metric] = statistics.median(batch[metric] for _, batch in batches)
    row['absolute_max_ms'] = max(batch['absolute_max_ms'] for _, batch in batches)
    rows.append(row)

result = {'passed': True, 'expected_subtree_traversal': {'before': args.before_subtree, 'after': args.after_subtree}, 'aggregation': 'Median of three paired-run quantiles, with before/after order reversed in round two; deeper-move directions split by alternating request order', 'totals_all_retained_samples': dict(totals), 'cells': cells, 'rows': rows}
(root / 'comparison.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'passed': True, 'cells': len(cells), 'rows': len(rows), 'samples': dict(totals)}, indent=2))
