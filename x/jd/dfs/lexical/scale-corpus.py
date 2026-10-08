import argparse
import hashlib
import json
import pathlib
import random
import socket
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'vendor'))
from generate import document

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=pathlib.Path, required=True)
parser.add_argument('--files', type=int, required=True)
parser.add_argument('--filler-lines', type=int, required=True)
parser.add_argument('--seed', type=int, default=42)
args = parser.parse_args()
assert socket.gethostname().split('.')[0] == 'dfs-tantivy-jd-20261002-server'
assert args.files >= 10000 and args.files % 10000 == 0
assert args.filler_lines >= 0
args.output.mkdir(parents=True, exist_ok=False)
rng = random.Random(args.seed)
branches = args.files // 1000
counts = []
for _ in range(branches * 5):
    delta = rng.randint(1, 40)
    counts.extend([100 - delta, 100 + delta])
rng.shuffle(counts)
manifest = {'version': 2, 'seed': args.seed, 'filler_lines': args.filler_lines, 'paths': [], 'sizes': [], 'sha256': []}
for branch in range(branches):
    for depth in range(1, 11):
        directory = pathlib.Path(*[f'node_{level:02d}_{branch:02d}' for level in range(1, depth + 1)])
        (args.output / 'docs' / directory).mkdir(parents=True, exist_ok=True)
        for _ in range(counts[branch * 10 + depth - 1]):
            index = len(manifest['paths'])
            relative = directory / f'doc_{index:05d}.txt'
            data = document(index, rng, args.filler_lines).encode()
            (args.output / 'docs' / relative).write_bytes(data)
            manifest['paths'].append(str(relative))
            manifest['sizes'].append(len(data))
            manifest['sha256'].append(hashlib.sha256(data).hexdigest())
assert len(manifest['paths']) == args.files
(args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'files': args.files, 'bytes': sum(manifest['sizes']), 'largest_file_bytes': max(manifest['sizes']), 'manifest_sha256': hashlib.sha256((args.output / 'manifest.json').read_bytes()).hexdigest()}))
