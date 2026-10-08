#!/usr/bin/env python3
import argparse
import gzip
import pathlib
import shutil

parser = argparse.ArgumentParser()
parser.add_argument('source', type=pathlib.Path)
parser.add_argument('destination', type=pathlib.Path)
args = parser.parse_args()
args.destination.mkdir(parents=True, exist_ok=True)
for path in args.source.iterdir():
    if not path.is_file() or path.suffix in ('.token', '.key', '.pem') or path.name in ('request.json', 'credentials.json'):
        continue
    if path.suffix == '.jsonl' and path.with_suffix('.jsonl.gz').exists():
        continue
    destination = args.destination / path.name
    if path.suffix == '.log' and path.stat().st_size > 1024 * 1024:
        with path.open('rb') as source, gzip.open(str(destination) + '.gz', 'wb') as target:
            shutil.copyfileobj(source, target)
    else:
        shutil.copyfile(path, destination)
manifest = args.source / 'corpus' / 'manifest.json'
if manifest.exists():
    with manifest.open('rb') as source, gzip.open(args.destination / 'manifest.json.gz', 'wb') as target:
        shutil.copyfileobj(source, target)
