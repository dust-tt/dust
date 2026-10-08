#!/usr/bin/env python3
import hashlib
import json
import pathlib
import subprocess

root = pathlib.Path(__file__).resolve().parents[1]
files = [root / name for name in ('Cargo.toml', 'Cargo.lock', 'build.rs', 'CONTRACTS')]
files.extend(root / name for name in ('README.md', 'DESIGN.md', 'DEPLOYMENT.md') if (root / name).is_file())
for directory in ('src', 'tests', 'scripts', 'proto', 'deploy', 'vendor', 'lexical'):
    files.extend(path for path in (root / directory).rglob('*') if path.is_file() and '__pycache__' not in path.parts and not path.name.startswith('._'))
manifest = {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(files)}
print(json.dumps({'files': manifest, 'source_sha256': hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest()}, indent=2))
