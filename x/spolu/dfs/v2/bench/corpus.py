#!/usr/bin/env python3
"""Generate jd's standard corpus or a denser 100,000-file corpus with the same document format."""
import argparse
import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import random
import subprocess
import sys


def generate(output, files):
    """@cc [owner:spolu,label:testing] scaled-corpus-integrity
    Generation MUST refuse an existing output path and preserve the original 10,000-file corpus.
    The 100,000-file variant MUST multiply each directory's allocation by ten while preserving
    document generation, seed 42, and the 100-directory topology. Record every file's size/hash and
    256 deterministic sampled tails. Neither generation nor validation may enter timed workloads.
    """
    if files == 10000:
        subprocess.run([sys.executable, '/benchmark/generate.py', str(output), '--seed', '42'],
                       check=True)
        return
    if files != 100000:
        raise ValueError('files must be 10000 or 100000')
    spec = importlib.util.spec_from_file_location('jd_generate', '/benchmark/generate.py')
    jd = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(jd)
    rng = random.Random(42)
    allocation = [count * 10 for count in jd.counts(rng)]
    sampled = frozenset(random.Random(42).sample(range(files), 256))
    paths, sizes, hashes, tails = [], [], [], {}
    output.mkdir(parents=True, exist_ok=False)
    for directory, count in zip(jd.directories(), allocation, strict=True):
        (output / 'docs' / directory).mkdir(parents=True)
        for _ in range(count):
            index = len(paths)
            path = (directory / f'doc_{index:05d}.txt').as_posix()
            data = jd.document(index, rng, jd.DEFAULT_FILLER_LINES).encode('utf-8')
            (output / 'docs' / path).write_bytes(data)
            paths.append(path)
            sizes.append(len(data))
            hashes.append(hashlib.sha256(data).hexdigest())
            if index in sampled:
                tails[path] = base64.b64encode(data[-4096:]).decode('ascii')
    assert len(paths) == files
    manifest = {'version': 1, 'seed': 42, 'filler_lines': jd.DEFAULT_FILLER_LINES,
                'paths': paths, 'sizes': sizes, 'sha256': hashes, 'tails': tails}
    (output / 'manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Created {files:,} documents in {output / "docs"} (seed=42)', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--files', type=int, choices=[10000, 100000], default=10000)
    args = parser.parse_args()
    generate(args.output, args.files)
