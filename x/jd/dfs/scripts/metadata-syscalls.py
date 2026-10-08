#!/usr/bin/env python3
import argparse
import json
import os
import pathlib
import stat
import time

parser = argparse.ArgumentParser()
parser.add_argument('corpus', type=pathlib.Path)
parser.add_argument('--runs', type=int, default=10)
args = parser.parse_args()
manifest = json.loads((args.corpus / 'manifest.json').read_text())
expected_sizes = dict(zip(manifest['paths'], manifest['sizes'], strict=True))
docs = args.corpus / 'docs'


def scan():
    sizes = {}
    directories = 0
    stack = [(str(docs), '')]
    while stack:
        directory, prefix = stack.pop()
        with os.scandir(directory) as entries:
            for entry in entries:
                info = entry.stat(follow_symlinks=False)
                relative = prefix + entry.name
                if stat.S_ISDIR(info.st_mode):
                    directories += 1
                    stack.append((entry.path, relative + '/'))
                else:
                    assert stat.S_ISREG(info.st_mode)
                    sizes[relative] = info.st_size
    return sizes, directories


records = []
for index in range(args.runs):
    started = time.perf_counter_ns()
    sizes, directories = scan()
    elapsed = time.perf_counter_ns() - started
    assert directories == 100 and sizes == expected_sizes
    records.append({'run': index, 'milliseconds': elapsed / 1e6, 'files': len(sizes), 'directories': directories, 'bytes': sum(sizes.values())})
print(json.dumps({'description': 'Diagnostic scandir/stat loop without pathlib relative-path bookkeeping; not the original benchmark', 'samples': records}, indent=2))
