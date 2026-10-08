#!/usr/bin/env python3
import argparse
import hashlib
import json
import pathlib

parser = argparse.ArgumentParser()
parser.add_argument('--verify', action='store_true')
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
excluded = {'target', 'runtime', 'cloud', '__pycache__'}
source_path = root / 'results/SOURCE_MANIFEST.json'
artifact_path = root / 'results/ARTIFACT_MANIFEST.json'


def paths():
    return sorted(path for path in root.rglob('*') if path.is_file() and not excluded.intersection(path.relative_to(root).parts) and not path.name.startswith('._'))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


if args.verify:
    manifest = json.loads(artifact_path.read_text())
    actual = {str(path.relative_to(root)): digest(path) for path in paths() if path != artifact_path}
    assert actual == manifest['files'], 'artifact content or file inventory changed'
    source = json.loads(source_path.read_text())
    assert all(digest(root / path) == expected for path, expected in source['files'].items())
    print(f"Verified {len(actual)} artifact files and {len(source['files'])} source/document files")
else:
    files = paths()
    secret_names = [str(path.relative_to(root)) for path in files if path.suffix in ('.token', '.key', '.pem') or path.name == 'credentials.json']
    assert not secret_names, secret_names
    source = {str(path.relative_to(root)): digest(path) for path in files if 'results' not in path.relative_to(root).parts}
    source_path.write_text(json.dumps({'algorithm': 'sha256', 'files': source}, indent=2) + '\n')
    artifacts = {str(path.relative_to(root)): digest(path) for path in paths() if path != artifact_path}
    artifact_path.write_text(json.dumps({'algorithm': 'sha256', 'files': artifacts}, indent=2) + '\n')
    print(f"Recorded {len(artifacts)} artifact files and {len(source)} source/document files")
