#!/usr/bin/env python3
import argparse
import json
import pathlib
import time

parser = argparse.ArgumentParser()
parser.add_argument('corpus', type=pathlib.Path)
args = parser.parse_args()
root = args.corpus.resolve()
docs = root / 'docs'
manifest = json.loads((root / 'manifest.json').read_text())
expected = dict(zip(manifest['paths'], manifest['sizes'], strict=True))
inputs = [(str(docs / path), size) for path, size in expected.items()]
samples = []
for index in range(10):
    started = time.perf_counter_ns()
    sizes = {}
    for path, size in inputs:
        sizes[pathlib.Path(path).relative_to(docs).as_posix()] = size
    elapsed = time.perf_counter_ns() - started
    assert sizes == expected
    samples.append({'run': index, 'milliseconds': elapsed / 1e6})
print(json.dumps({'description': 'Original metadata loop path conversion and size dictionary with all filesystem operations removed from the timed region', 'root': str(root), 'samples': samples}, indent=2))
