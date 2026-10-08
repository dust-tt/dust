#!/usr/bin/env python3
import json
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[1]
out = root / 'results/demand'
checks = {}
for corpus, groups, runs in [('corpus', 36, 108), ('large', 21, 63)]:
    directory = out / f'final-{corpus}'
    recorded = json.loads((out / f'final-{corpus}-summary.json').read_text())
    recomputed = json.loads(subprocess.check_output([sys.executable, str(root / 'scripts/analyze-demand.py'), str(directory)], text=True))
    checks[f'{corpus}_export_matches_summary'] = recorded == recomputed
    checks[f'{corpus}_three_complete_rounds'] = len(recorded) == groups and all(row['runs'] == 3 for row in recorded) and sum(row['runs'] for row in recorded) == runs
    checks[f'{corpus}_completed'] = (directory / 'completed.txt').read_text().strip() == 'success'
    checks[f'{corpus}_zero_sparse_speculation'] = all(sample['reads']['prefetch_bytes'] == 0 for row in recorded if row['backend'] == 'adjacent' and row['workload'] in ('heads', 'one-head', 'tails', 'one-file') for sample in row['samples'])
checks['selected_mount_correctness_completed'] = (out / 'correctness-cloud-final/completed.txt').read_text().strip() == 'success'
lines = (out / 'benchmark.txt').read_text().splitlines()
checks['ascii_table_alignment'] = len({len(line) for line in lines}) == 1 and all(line.isascii() for line in lines) and len({tuple(i for i, c in enumerate(line) if c == '|') for line in lines if line.startswith('|')}) == 1
print(json.dumps({'measured_runs': 171, 'checks': checks}, indent=2))
assert all(checks.values()), checks
