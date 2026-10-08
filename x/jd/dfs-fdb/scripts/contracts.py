import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument("--output", type=Path, default=Path("results"))
args = parser.parse_args()
base = Path(__file__).resolve().parents[1]
output_root = base / args.output
output_root.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='dfs-fdb-contracts-') as temporary:
    root = Path(temporary)
    for name in ['src', 'tests', 'proto', 'search']:
        shutil.copytree(base / name, root / name)
    for name in ['CONTRACTS', 'Cargo.toml', 'Cargo.lock', 'build.rs', '.gitignore']:
        shutil.copy(base / name, root / name)
    hashes = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file()}
    for name, digest in hashes.items():
        assert hashlib.sha256((base / name).read_bytes()).hexdigest() == digest
    subprocess.run(['git', 'init', '-q'], cwd=root, check=True)
    for arguments, filename in [(['format'], 'contracts-format.log'), (['list', 'src/backend.rs'], 'contracts-list.txt'), (['list', 'src/mount_cache.rs'], 'contracts-client-list.txt'), (['list', 'src/mount_publication.rs'], 'contracts-publication-list.txt')]:
        with (output_root / filename).open('w') as output:
            subprocess.run(['npx', '--yes', '--package=node@22', '--package=@spolu/cc-check', 'cc-check', *arguments], cwd=root, stdout=output, stderr=subprocess.STDOUT, check=True)
    (output_root / 'contracts-scope.json').write_text(json.dumps(dict(passed=True, source_sha256=hashes), indent=2) + '\n')
