#!/usr/bin/env python3
import argparse
import json
import os
import pathlib
import random
import shutil
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'vendor'))
import benchmark

parser = argparse.ArgumentParser()
parser.add_argument('root', type=pathlib.Path)
parser.add_argument('--manifest', type=pathlib.Path, required=True)
parser.add_argument('--workload', choices=['scan', 'branch', 'deep', 'tails', 'one-file', 'one-head', 'heads', 'sha'], required=True)
parser.add_argument('--output', type=pathlib.Path, required=True)
args = parser.parse_args()
assert not os.path.samefile(args.root, args.manifest.parent), 'oracle aliases measured tree'
manifest = json.loads(args.manifest.read_text())
b = object.__new__(benchmark.Benchmark)
b.docs = args.root / 'docs'
b.rg_path = shutil.which('rg')
b.paths = manifest['paths']
b.expected_sizes = dict(zip(b.paths, manifest['sizes'], strict=True))
b.expected_hashes = dict(zip(b.paths, manifest['sha256'], strict=True))
b.expected_tails = {p: benchmark.base64.b64decode(v, validate=True) for p, v in manifest['tails'].items()}
b.expected = set(b.paths)
selected = [b.paths[i] for i in sorted(benchmark.SAMPLE_INDICES)]
random.Random(8127).shuffle(selected)
branch = {f'./{p}' for p in b.paths if p.startswith('node_01_00/')}
prefix = '/'.join(f'node_{level:02d}_00' for level in range(1, 11))
deep = {p for p in b.paths if p.startswith(prefix + '/')}
if args.workload == 'scan':
    action = lambda: b.rg('-l', '-F', 'BENCH_ABSENT_TOKEN')
    validate = lambda r: b.check_rg(r, set(), code=1)
elif args.workload == 'branch':
    action = lambda: b.rg('-l', '-F', 'BENCH_COMMON_SIGNAL', '-g', 'node_01_00/**')
    validate = lambda r: b.check_rg(r, branch)
elif args.workload == 'deep':
    action = lambda: b.rg('-l', '-F', 'BENCH_COMMON_SIGNAL', target=prefix)
    validate = lambda r: b.check_rg(r, deep)
elif args.workload in ('one-head', 'heads'):
    if args.workload == 'one-head':
        selected = selected[:1]
    expected = {}
    for path in selected:
        with (args.manifest.parent / 'docs' / path).open('rb') as file:
            expected[path] = file.read(4096)

    def action():
        found = {}
        for path in selected:
            with (b.docs / path).open('rb') as file:
                found[path] = file.read(4096)
        return found

    validate = lambda r: benchmark.check(r == expected, 'incorrect prefix bytes')
elif args.workload in ('tails', 'one-file'):
    if args.workload == 'one-file':
        selected = selected[:1]
    action = lambda: b.pread_sample(selected)
    validate = lambda r: b.verify_pread(r, selected)
else:
    action = b.read_all
    validate = lambda r: b.verify_contents(r, sum(manifest['sizes']))
rows = []
for phase in ['first', 'repeat-1', 'repeat-2']:
    started = time.perf_counter()
    result = action()
    elapsed_ms = (time.perf_counter() - started) * 1000
    validate(result)
    rows.append({'phase': phase, 'time_ms': elapsed_ms, 'result': 'OK'})
b.check_rg(b.rg('--files'), {f'./{p}' for p in b.expected})
args.output.write_text(json.dumps({'workload': args.workload, 'document_bytes': sum(manifest['sizes']), 'rows': rows}, indent=2) + '\n')
print(json.dumps(rows))
